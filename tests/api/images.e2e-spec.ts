/**
 * Image uploads: an untrusted file becomes an image the portal made itself, only the team can
 * add one (refused before the upload is read), and an image is exactly as visible as its project.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { FixedClock } from '../../src/api/src/core/clock.js';
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';
import { organizer, person } from './scenario.js';

const uploads = process.env.UPLOADS_DIR!;

let t: TestApp;
let maker: Awaited<ReturnType<typeof person>>;
let stranger: Awaited<ReturnType<typeof person>>;
let eventSlug: string;
let submissionId: string;
// Unique per run: the test database keeps earlier runs' projects.
const title = `Picture Perfect ${Date.now()}`;

/** A picture made on the spot. */
const picture = (width = 800, height = 600, colour = '#3a7') =>
  sharp({ create: { width, height, channels: 3, background: colour } });

beforeAll(async () => {
  t = await createTestApp();
  maker = await person(t, 'imager');
  stranger = await person(t, 'stranger');
  const ev = await t
    .http()
    .post('/api/events')
    .set(organizer)
    .send({ name: `Images ${Date.now()}`, submissionsClose: '2031-06-01T18:00:00Z' });
  eventSlug = ev.body.slug;
  await t.http().post(`/api/events/${eventSlug}/teams`).set(maker.headers).send({ name: 'Pixels' });
  const sub = await t
    .http()
    .post(`/api/events/${eventSlug}/submissions`)
    .set(maker.headers)
    .send({ title, summary: 'Has images' });
  submissionId = sub.body.id;
});
afterAll(() => t.close());

const upload = (
  headers: Record<string, string>,
  data: Buffer,
  name = 'photo.jpg',
  ref = submissionId,
) => t.http().post(`/api/submissions/${ref}/images`).set(headers).attach('file', data, name);

describe('who may upload', () => {
  it('refuses visitors (401) and anyone not on the team (403), before reading the upload', async () => {
    const photo = await picture().jpeg().toBuffer();
    expect((await upload({}, photo)).status).toBe(401);
    const res = await upload(stranger.headers, photo);
    expect(res.status).toBe(403);
    // A body over the size limit still gets 403, not 413: the guard ran before it was read.
    const huge = Buffer.alloc(9 * 1024 * 1024, 1);
    expect((await upload(stranger.headers, huge)).status).toBe(403);
    // Organisers do not edit teams' entries either.
    expect((await upload(organizer, photo)).status).toBe(403);
  });

  it('refuses the team after the deadline, with the deadline error', async () => {
    const late = await createTestApp({ clock: new FixedClock(new Date('2031-06-01T18:00:00Z')) });
    try {
      const res = await late
        .http()
        .post(`/api/submissions/${submissionId}/images`)
        .set(maker.headers)
        .attach('file', await picture().png().toBuffer(), 'late.png');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('submissions_closed');
    } finally {
      await late.close();
    }
  });
});

describe('what is stored', () => {
  let firstId: string;

  it('keeps only the pixels: metadata and anything hidden after the image are gone', async () => {
    const photo = await picture(3200, 2400)
      .jpeg()
      .withExif({ IFD0: { Artist: 'home address', Copyright: 'secret' } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const withTail = Buffer.concat([photo, Buffer.from('<script>alert(1)</script>')]);

    const res = await upload(maker.headers, withTail);
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    const image = res.body[0];
    firstId = image.id;
    // Fits in 1600 px, aspect kept.
    expect(image).toMatchObject({ width: 1600, height: 1200 });
    expect(image.url).toBe(`/api/images/${image.id}`);
    expect(image.thumbUrl).toBe(`/api/images/${image.id}/thumb`);

    for (const file of [`${image.id}.webp`, `${image.id}-thumb.webp`]) {
      const stored = await readFile(join(uploads, file));
      const meta = await sharp(stored).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(stored.includes('<script>')).toBe(false);
      expect(stored.includes('home address')).toBe(false);
    }
    const thumb = await sharp(await readFile(join(uploads, `${image.id}-thumb.webp`))).metadata();
    expect({ width: thumb.width, height: thumb.height }).toEqual({ width: 640, height: 400 });
  });

  it('refuses what is not a JPEG, PNG or WebP, whatever the file is called', async () => {
    const cases: [Buffer, string][] = [
      [Buffer.from('<html><script>alert(1)</script></html>'), 'innocent.png'],
      [
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
        ),
        'logo.svg',
      ],
      [await picture(20, 20).gif().toBuffer(), 'anim.gif'],
      [(await picture().jpeg().toBuffer()).subarray(0, 400), 'truncated.jpg'],
    ];
    for (const [data, name] of cases) {
      const res = await upload(maker.headers, data, name);
      expect(res.status, name).toBe(400);
      expect(res.body.error, name).toBe('unsupported_image');
    }
  });

  it('refuses files over 8 MB and pictures over 40 megapixels', async () => {
    const big = await upload(maker.headers, Buffer.alloc(9 * 1024 * 1024, 1), 'big.jpg');
    expect(big.status, 'a 9 MB upload').toBe(413);
    expect(big.body.error).toBe('payload_too_large');

    // 144 megapixels in a file of a few hundred kilobytes: refused before it is decoded.
    const bomb = await picture(12000, 12000, '#fff').png().toBuffer();
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    const res = await upload(maker.headers, bomb, 'bomb.png');
    expect(res.status, 'a 144 megapixel picture').toBe(413);
    expect(res.body.error).toBe('payload_too_large');
  });

  it('needs exactly one file in the "file" field', async () => {
    const none = await t.http().post(`/api/submissions/${submissionId}/images`).set(maker.headers);
    expect(none.status).toBe(400);
    const png = await picture().png().toBuffer();
    const two = await t
      .http()
      .post(`/api/submissions/${submissionId}/images`)
      .set(maker.headers)
      .attach('file', png, 'a.png')
      .attach('file', png, 'b.png');
    expect(two.status).toBe(400);
    const wrongField = await t
      .http()
      .post(`/api/submissions/${submissionId}/images`)
      .set(maker.headers)
      .attach('picture', png, 'a.png');
    expect(wrongField.status).toBe(400);
  });

  it('refused uploads leave no file behind', async () => {
    const files = await readdir(uploads);
    expect(files.filter((f) => f.endsWith('.part'))).toEqual([]);
    const mine = await t.prisma.submissionImage.findMany({ where: { submissionId } });
    expect(mine.map((i) => i.id)).toEqual([firstId]);
  });
});

describe('who may see an image', () => {
  let imageId: string;
  beforeAll(async () => {
    imageId = (await t.prisma.submissionImage.findFirstOrThrow({ where: { submissionId } })).id;
  });

  const get = (headers: Record<string, string>, path = `/api/images/${imageId}`) =>
    t.http().get(path).set(headers);

  it('keeps a draft’s images private: its team and the event’s organisers only', async () => {
    expect((await get({})).status).toBe(401);
    expect((await get(stranger.headers)).status).toBe(403);
    expect((await get(bearer(TOKENS.judge_a))).status).toBe(403);

    const mine = await get(maker.headers);
    expect(mine.status).toBe(200);
    expect(mine.headers['content-type']).toBe('image/webp');
    expect(mine.headers['cache-control']).toBe('private, no-store');
    expect(mine.headers['x-content-type-options']).toBe('nosniff');
    expect(mine.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect((await get(organizer)).status).toBe(200);
    expect((await get(maker.headers, `/api/images/${imageId}/thumb`)).status).toBe(200);
  });

  it('answers 404 for an image that does not exist', async () => {
    expect((await get({}, '/api/images/not-an-id')).status).toBe(404);
    expect((await get({}, '/api/images/0190a1b2-0000-7000-8000-000000000000')).status).toBe(404);
  });

  it('makes them public with the project, and the gallery shows the cover', async () => {
    await t.http().post(`/api/submissions/${submissionId}/submit`).set(maker.headers);
    const res = await get({});
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');

    const gallery = await t.http().get('/api/projects').query({ q: title });
    expect(gallery.body.items[0].thumbnailUrl).toBe(`/api/images/${imageId}/thumb`);
    const detail = await t.http().get(`/api/projects/${submissionId}`);
    expect(detail.body.images.map((i: { id: string }) => i.id)).toEqual([imageId]);
  });

  it('takes them out of public view when the project is disqualified', async () => {
    await t
      .http()
      .post(`/api/submissions/${submissionId}/disqualify`)
      .set(organizer)
      .send({ reason: 'Image test' });
    expect((await get({})).status).toBe(401);
    expect((await get(maker.headers)).status).toBe(200);
    await t.http().post(`/api/submissions/${submissionId}/reinstate`).set(organizer);
    expect((await get({})).status).toBe(200);
  });
});

describe('managing the images', () => {
  it('holds at most 6, and refuses a seventh without keeping its files', async () => {
    const before = (await readdir(uploads)).length;
    for (let i = 0; i < 5; i++) {
      const res = await upload(
        maker.headers,
        await picture(400, 300, `#${i}${i}${i}`).png().toBuffer(),
        `p${i}.png`,
      );
      expect(res.status).toBe(201);
    }
    const res = await upload(maker.headers, await picture().png().toBuffer(), 'seventh.png');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('too_many_images');
    // Five images added, two files each; nothing from the refused one.
    expect((await readdir(uploads)).length).toBe(before + 10);
  });

  it('reorders them; the first becomes the cover', async () => {
    const images = await t.prisma.submissionImage.findMany({
      where: { submissionId },
      orderBy: { order: 'asc' },
    });
    const reversed = images.map((i) => i.id).reverse();
    const res = await t
      .http()
      .put(`/api/submissions/${submissionId}/images/order`)
      .set(maker.headers)
      .send({ order: reversed });
    expect(res.status).toBe(200);
    expect(res.body.map((i: { id: string }) => i.id)).toEqual(reversed);
    const gallery = await t.http().get('/api/projects').query({ q: title });
    expect(gallery.body.items[0].thumbnailUrl).toBe(`/api/images/${reversed[0]}/thumb`);

    const partial = await t
      .http()
      .put(`/api/submissions/${submissionId}/images/order`)
      .set(maker.headers)
      .send({ order: reversed.slice(1) });
    expect(partial.status).toBe(400);
  });

  it('removes one, with its files, and closes the gap in the order', async () => {
    const images = await t.prisma.submissionImage.findMany({
      where: { submissionId },
      orderBy: { order: 'asc' },
    });
    const gone = images[1]!.id;
    const res = await t
      .http()
      .delete(`/api/submissions/${submissionId}/images/${gone}`)
      .set(maker.headers);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    const files = await readdir(uploads);
    expect(files.some((f) => f.startsWith(gone))).toBe(false);
    const orders = (
      await t.prisma.submissionImage.findMany({
        where: { submissionId },
        orderBy: { order: 'asc' },
      })
    ).map((i) => i.order);
    expect(orders).toEqual([0, 1, 2, 3, 4]);

    expect(
      (await t.http().delete(`/api/submissions/${submissionId}/images/${gone}`).set(maker.headers))
        .status,
    ).toBe(404);
    expect(
      (
        await t
          .http()
          .delete(`/api/submissions/${submissionId}/images/${images[0]!.id}`)
          .set(stranger.headers)
      ).status,
    ).toBe(403);
  });

  it('writes each change to the audit trail as a sentence', async () => {
    const res = await t
      .http()
      .get(`/api/events/${eventSlug}/audit`)
      .query({ action: 'submission.' })
      .set(organizer);
    const sentences = res.body.items.map((i: { summary: string }) => i.summary as string);
    expect(sentences).toContainEqual(
      expect.stringMatching(new RegExp(`added an image to "${title}"`)),
    );
    expect(sentences).toContainEqual(
      expect.stringMatching(new RegExp(`reordered the images of "${title}"`)),
    );
    expect(sentences).toContainEqual(
      expect.stringMatching(new RegExp(`removed an image from "${title}"`)),
    );
  });
});

describe('the upload rate limit', () => {
  it('refuses uploads over RATE_LIMIT_UPLOAD_PER_MIN with 429', async () => {
    const limited = await createTestApp({ config: { rateLimitUploadPerMin: 1 } });
    try {
      const png = await picture(50, 50).png().toBuffer();
      const send = () =>
        limited
          .http()
          .post(`/api/submissions/${submissionId}/images`)
          .set(maker.headers)
          .attach('file', png, 'r.png');
      // Five images are left after the removal above: the first upload fills the sixth slot,
      // the second is refused by the limit before the rules are even checked.
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
