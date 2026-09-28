// A team's path in a real browser: register, start a team, invite a teammate by link, draft,
// submit, appear in the gallery, keep editing. Uses the open demo event. Run with
// `npm run test:ui`.
/* global fetch, document -- used inside page callbacks, which run in the browser */
/* global Buffer -- Node */
import { crc32, deflateSync } from 'node:zlib';
import { BASE, finish, openBrowser, step } from './harness.mjs';

const { browser, newPage } = await openBrowser();

/** The demo bearer tokens (DEMO_MODE): API calls without logging anyone else in. */
const TOKENS = { organizer: 'dev-organizer-7f2a', participant: 'dev-participant-2e88' };
let judged = null;

/**
 * Calls the API from `page` with a bearer token. Sent from the page so it reaches the portal the
 * same way the browser does; the token, not the page's cookie, decides who is calling.
 */
const api = (page, token, path, data, method = 'POST') =>
  page.evaluate(
    async ([p, d, m, t]) => {
      const res = await fetch(p, {
        method: m,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: d === undefined ? undefined : JSON.stringify(d),
      });
      return res.json();
    },
    [path, data, method, token],
  );
const stamp = Date.now();

/** A small solid-colour PNG, built here so the check needs no image file. */
function png(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([15, 118, 110], 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** True once the image matching `selector` on `page` has loaded (the CSP let it through). */
const imageLoaded = (page, selector) =>
  page.waitForFunction((sel) => {
    const img = document.querySelector(sel);
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }, selector);
const teamName = `Browser Team ${stamp}`;
const title = `Browser Project ${stamp}`;
const password = 'a long enough password';
const ann = await newPage();
const ben = await newPage();
let inviteUrl = '';
let teamUrl = '';

async function register(page, name, email) {
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
}

/** A two-criterion rubric (impact twice as heavy as polish) for Ben's event. */
const asOrganizerRubric = (slug) =>
  api(
    ben,
    TOKENS.organizer,
    `/api/events/${slug}/criteria`,
    {
      criteria: [
        { key: 'impact', label: 'Impact', weight: 2, min: 1, max: 5 },
        { key: 'polish', label: 'Polish', weight: 1, min: 1, max: 5 },
      ],
    },
    'PUT',
  );

await step('Ann registers and sees she has no team yet', async () => {
  await ann.goto(`${BASE}/register`);
  await register(ann, 'Ann Browser', `ann-${stamp}@participant.test`);
  await ann.waitForURL(`${BASE}/`);
  await ann.click('header >> text=My teams');
  await ann.getByText('You are not on a team yet').waitFor();
});

await step('she starts a team in the open demo event', async () => {
  await ann.selectOption('#event', 'evenhand-demo');
  await ann.fill('#team-name', teamName);
  await ann.click('button:has-text("Create team")');
  await ann.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
  teamUrl = ann.url();
  await ann.getByRole('heading', { name: teamName }).waitFor();
  // In the members list (the header shows her name too).
  await ann.locator('main').getByText('Ann Browser').waitFor();
});

await step('she makes an invite link', async () => {
  await ann.click('button:has-text("Create an invite link")');
  const box = ann.locator('#invite-url');
  await box.waitFor();
  inviteUrl = await box.inputValue();
  if (!inviteUrl.startsWith(`${BASE}/invites/`)) throw new Error(inviteUrl);
});

await step('Ben opens the link logged out, registers, and comes back to join', async () => {
  await ben.goto(inviteUrl);
  await ben.getByRole('heading', { name: teamName }).waitFor();
  await ben.click('text=Create an account to join');
  await register(ben, 'Ben Browser', `ben-${stamp}@participant.test`);
  await ben.waitForURL(inviteUrl);
  await ben.click(`button:has-text("Join ${teamName}")`);
  await ben.waitForURL(teamUrl);
  await ben.locator('main').getByText('Ann Browser').waitFor();
  await ben.getByText('(you)').waitFor();
});

await step('Ann starts the submission', async () => {
  await ann.reload();
  await ann.fill('#project-title', title);
  await ann.click('button:has-text("Start the submission")');
  await ann.waitForURL(/\/submissions\/[0-9a-f-]{36}$/);
  await ann.getByText('Draft', { exact: true }).waitFor();
});

await step('submitting without a summary shows the API message', async () => {
  await ann.click('button:has-text("Save and submit")');
  await ann.getByText('Add summary before submitting.').waitFor();
});

await step('with a summary it submits', async () => {
  await ann.fill('#summary', 'Finds the quiet hours in a noisy calendar.');
  await ann.fill('#repoUrl', 'https://example.org/quiet');
  await ann.fill('#techTags', 'typescript, postgres');
  // The demo event asks two questions: one public, one for organisers and judges only.
  await ann
    .getByLabel('What did you build during the event')
    .fill('The calendar parser, all of it.');
  await ann.getByLabel('Anything the judges should know').fill('We are night owls.');
  await ann.click('button:has-text("Save and submit")');
  await ann.getByText('Submitted. It is in the gallery').waitFor();
  await ann.getByText('Submitted', { exact: true }).waitFor();
});

await step('add an image: re-encoded by the API, it becomes the cover', async () => {
  await ann.setInputFiles('#image-upload', {
    name: 'screenshot.png',
    mimeType: 'image/png',
    buffer: png(320, 200),
  });
  await ann.getByText('Cover', { exact: true }).waitFor();
  await imageLoaded(ann, 'img[alt="Image 1 of 1"]');
  // Not an image: the API's answer is shown, and nothing is added.
  await ann.setInputFiles('#image-upload', {
    name: 'notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<html>not an image</html>'),
  });
  await ann.getByText('Upload a JPEG, PNG or WebP image.').waitFor();
  if ((await ann.locator('img[alt^="Image "]').count()) !== 1) {
    throw new Error('a refused upload was added');
  }
});

await step('the project is in the public gallery', async () => {
  const visitor = await newPage();
  await visitor.goto(`${BASE}/projects?q=${encodeURIComponent(title)}`);
  await visitor.getByText(`1 project matching “${title}”`).waitFor();
  await visitor.getByText(title).first().waitFor();
  // The card shows the cover's thumbnail, served by the portal itself.
  await imageLoaded(visitor, 'main li img[src*="/api/images/"][src$="/thumb"]');
  await visitor.getByRole('link', { name: title }).click();
  await imageLoaded(visitor, `img[alt="${title}: image 1 of 1"]`);
  await visitor.getByText('The calendar parser, all of it.').waitFor();
  if (await visitor.getByText('We are night owls.').count()) {
    throw new Error('a private answer is shown in the public gallery');
  }
});

await step('Ben improves it after submitting; it stays submitted', async () => {
  await ben.goto(ann.url());
  await ben.fill('#tagline', 'Calendar calm');
  await ben.click('button:has-text("Save")');
  await ben.getByText('Saved.').waitFor();
  await ben.reload();
  if ((await ben.locator('#tagline').inputValue()) !== 'Calendar calm') throw new Error('lost');
  await ben.getByText('Submitted', { exact: true }).waitFor();
});

await step('My teams shows the team and its submitted project', async () => {
  await ann.goto(`${BASE}/teams`);
  await ann.getByText(`“${title}” (submitted)`).waitFor();
});

await step('Ben accepts a judge invitation for another event', async () => {
  // The organiser sets it up through the API with the demo bearer token (no extra login).
  const asOrganizer = (path, data, method) => api(ben, TOKENS.organizer, path, data, method);
  const event = await asOrganizer('/api/events', {
    name: `Judged by Ben ${stamp}`,
    submissionsClose: '2031-06-01T18:00:00Z',
  });
  const track = await asOrganizer(`/api/events/${event.slug}/tracks`, { name: 'Games' });
  const invite = await asOrganizer(`/api/events/${event.slug}/judge-invites`, {
    tracks: [track.id],
  });

  judged = { event, track };
  await ben.goto(`${BASE}${invite.path}`);
  await ben.getByText('Tracks: Games').waitFor();
  await ben.click(`button:has-text("Judge Judged by Ben ${stamp}")`);
  await ben.waitForURL(`${BASE}/judging`);
  // A judge now, with nothing assigned until the organiser runs assignment.
  await ben.getByText('Nothing assigned to you yet').waitFor();
  await ben.locator('header >> text=Judging').waitFor();
});

await step('Ben judges the project assigned to him, with autosave and a final submit', async () => {
  const { event, track } = judged;
  await asOrganizerRubric(event.slug);
  // The demo participant enters a project there; the organiser assigns it.
  await api(ben, TOKENS.participant, `/api/events/${event.slug}/teams`, {
    name: `Entrants ${stamp}`,
  });
  const sub = await api(ben, TOKENS.participant, `/api/events/${event.slug}/submissions`, {
    title: `Judged Project ${stamp}`,
    summary: 'Ready for Ben',
    track: track.id,
  });
  await api(ben, TOKENS.participant, `/api/submissions/${sub.id}/submit`);
  await api(ben, TOKENS.organizer, `/api/events/${event.slug}/assignments/run`, { target: 1 });

  await ben.goto(`${BASE}/judging`);
  await ben.getByText('0 of 1 submitted').waitFor();
  await ben.click('text=Start');
  await ben.getByRole('heading', { name: `Judged Project ${stamp}` }).waitFor();
  await ben.click('label:has(input[name="mark-impact"][value="4"])');
  await ben.getByText('Draft saved').waitFor();
  await ben.reload();
  if (!(await ben.locator('input[name="mark-impact"][value="4"]').isChecked())) {
    throw new Error('the draft mark did not persist');
  }
  await ben.click('button:has-text("Submit review")');
  await ben.getByText('Mark every criterion before submitting: Polish.').waitFor();
  // Keyboard scoring: focus is still in the scoring panel, and Polish, the only criterion
  // without a mark, is the highlighted one, so typing 3 marks it.
  await ben.keyboard.press('3');
  if (!(await ben.locator('input[name="mark-polish"][value="3"]').isChecked())) {
    throw new Error('typing a digit did not mark the highlighted criterion');
  }
  await ben.getByText('Draft saved').waitFor();
  await ben.fill('#review-comment', 'Clear and useful.');
  await ben.click('button:has-text("Submit review")');
  await ben.waitForURL(`${BASE}/judging`);
  await ben.getByText('1 of 1 submitted').waitFor();
});

await step('a judge cannot also join a team in that event', async () => {
  await ben.goto(`${BASE}/teams`);
  const options = await ben.locator('#event option').allInnerTexts();
  // This run's event only: earlier runs left events judged by other people named Ben.
  if (options.includes(`Judged by Ben ${stamp}`)) throw new Error('offered a team there');
});

await step('a broken invite link says so', async () => {
  await ben.goto(`${BASE}/invites/not-a-real-token`);
  await ben.getByText('This invite link is not valid.').waitFor();
});

await browser.close();
finish('Participant pages');
