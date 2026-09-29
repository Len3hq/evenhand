/**
 * The hand-written SQL constraints (prisma/migrations/*_hand_written_constraints) fire at the
 * database level, whatever the application code does. Each attempt below fails inside
 * Postgres, so nothing is changed.
 */
import { createTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('audit_log is append-only', () => {
  it('rejects UPDATE', async () => {
    const row = await t.prisma.auditLog.findFirstOrThrow();
    await expect(
      t.prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects DELETE', async () => {
    const row = await t.prisma.auditLog.findFirstOrThrow();
    await expect(t.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('rejects TRUNCATE', async () => {
    await expect(t.prisma.$executeRawUnsafe('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });
});

describe('one live submission per team per event', () => {
  it('rejects a second live submission for a team', async () => {
    const first = await t.prisma.submission.findFirstOrThrow({ where: { externalId: 'prj_01' } });
    await expect(
      t.prisma.submission.create({
        data: { eventId: first.eventId, teamId: first.teamId, title: 'Second entry' },
      }),
    ).rejects.toThrow(/Unique constraint|unique/i);
  });

  it('allows the imported duplicate while the older copy is on hold (Dry Harbour)', async () => {
    const copies = await t.prisma.submission.findMany({
      where: { title: 'Dry Harbour' },
      orderBy: { submittedAt: 'asc' },
      select: { externalId: true, duplicateHold: true, supersededById: true },
    });
    expect(copies).toEqual([
      { externalId: 'prj_07', duplicateHold: true, supersededById: null },
      { externalId: 'prj_41', duplicateHold: false, supersededById: null },
    ]);
    const flags = await t.prisma.duplicateFlag.findMany();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ reason: 'SAME_TEAM', status: 'PENDING' });
  });
});

describe('rubric and score ranges', () => {
  it('rejects a score outside its criterion range', async () => {
    const score = await t.prisma.criterionScore.findFirstOrThrow();
    await expect(
      t.prisma.criterionScore.update({
        where: {
          reviewId_criterionId: { reviewId: score.reviewId, criterionId: score.criterionId },
        },
        data: { value: 9 },
      }),
    ).rejects.toThrow(/outside \[1, 5\]/);
  });

  it('rejects a criterion whose min is above its max', async () => {
    const c = await t.prisma.criterion.findFirstOrThrow();
    await expect(
      t.prisma.criterion.update({ where: { id: c.id }, data: { min: 6 } }),
    ).rejects.toThrow(/criteria_range_valid/);
  });

  it('rejects a negative weight', async () => {
    const c = await t.prisma.criterion.findFirstOrThrow();
    await expect(
      t.prisma.criterion.update({ where: { id: c.id }, data: { weight: -1 } }),
    ).rejects.toThrow(/criteria_weight_non_negative/);
  });
});

describe('custom questions and answers', () => {
  async function questionIn(eventId: string, prompt: string) {
    return t.prisma.customQuestion.create({ data: { eventId, prompt } });
  }

  it('rejects a blank prompt', async () => {
    const event = await t.prisma.event.findFirstOrThrow({ where: { externalId: 'evt_01' } });
    await expect(questionIn(event.id, '   ')).rejects.toThrow(/custom_questions_prompt_valid/);
  });

  it("rejects an answer to another event's question", async () => {
    const [fixture, demo] = await Promise.all([
      t.prisma.event.findFirstOrThrow({ where: { externalId: 'evt_01' } }),
      t.prisma.event.findFirstOrThrow({ where: { slug: 'evenhand-demo' } }),
    ]);
    const q = await questionIn(demo.id, `Constraint probe ${Date.now()}`);
    const submission = await t.prisma.submission.findFirstOrThrow({
      where: { eventId: fixture.id },
    });
    try {
      await expect(
        t.prisma.answer.create({
          data: { submissionId: submission.id, questionId: q.id, value: 'x' },
        }),
      ).rejects.toThrow(/is not for the event of submission/);
    } finally {
      await t.prisma.customQuestion.delete({ where: { id: q.id } });
    }
  });

  it('rejects a blank answer', async () => {
    const fixture = await t.prisma.event.findFirstOrThrow({ where: { externalId: 'evt_01' } });
    const q = await questionIn(fixture.id, `Constraint probe ${Date.now()}`);
    const submission = await t.prisma.submission.findFirstOrThrow({
      where: { eventId: fixture.id },
    });
    try {
      await expect(
        t.prisma.answer.create({
          data: { submissionId: submission.id, questionId: q.id, value: ' ' },
        }),
      ).rejects.toThrow(/answers_value_valid/);
    } finally {
      await t.prisma.customQuestion.delete({ where: { id: q.id } });
    }
  });
});

describe('submission_images', () => {
  it('rejects an image size the API never stores, and a negative order', async () => {
    const s = await t.prisma.submission.findFirstOrThrow();
    const row = (width: number, height: number, order = 0) =>
      t.prisma.submissionImage.create({
        data: { submissionId: s.id, url: '/api/images/x', width, height, order },
      });
    await expect(row(0, 10)).rejects.toThrow(/submission_images_size_valid/);
    await expect(row(1601, 10)).rejects.toThrow(/submission_images_size_valid/);
    await expect(row(10, 10, -1)).rejects.toThrow(/submission_images_order_valid/);
  });
});

describe('comments', () => {
  it('rejects a blank or overlong comment, and a hider on a visible comment', async () => {
    const s = await t.prisma.submission.findFirstOrThrow();
    const u = await t.prisma.user.findFirstOrThrow();
    const row = (body: string, extra = {}) =>
      t.prisma.comment.create({ data: { submissionId: s.id, authorId: u.id, body, ...extra } });
    await expect(row('   ')).rejects.toThrow(/comments_body_valid/);
    await expect(row('x'.repeat(2001))).rejects.toThrow(/comments_body_valid/);
    await expect(row('Fine', { hiddenById: u.id })).rejects.toThrow(/comments_hidden_consistent/);
  });
});
