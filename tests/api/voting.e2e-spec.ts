/**
 * Community voting (T3): organisers set up a vote with a window, an access mode and a number of
 * votes per voter; voters vote only inside the window, never for their own project and never
 * over their limit; tallies stay private until the vote has closed and is published; every
 * change is audited.
 */
import { FixedClock } from '../../src/api/src/core/clock.js';
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';
import { judgedEvent, organizer, person } from './scenario.js';

const BEFORE = new Date('2030-06-01T00:00:00Z');
const OPENS = '2030-06-02T00:00:00Z';
const DURING = new Date('2030-06-02T12:00:00Z');
const CLOSES = '2030-06-03T00:00:00Z';
const AFTER = new Date('2030-06-04T00:00:00Z');

const clock = new FixedClock(BEFORE);
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ clock });
});
afterAll(() => t.close());

type Scenario = Awaited<ReturnType<typeof judgedEvent>>;
type Ballot = {
  open: boolean;
  votesLeft: number;
  projects: { id: string; voted: boolean; own: boolean }[];
};

const configure = (slug: string, body: object) =>
  t.http().put(`/api/events/${slug}/voting`).set(organizer).send(body);
const settings = (mode: string, votesPerVoter = 2) => ({
  mode,
  opensAt: OPENS,
  closesAt: CLOSES,
  votesPerVoter,
});

describe('setting up a vote', () => {
  let s: Scenario;
  beforeAll(async () => {
    clock.set(BEFORE);
    s = await judgedEvent(t);
  });

  it('is for the event’s organisers, and refused before the lookup for everyone else', async () => {
    for (const headers of [bearer(TOKENS.participant), bearer(TOKENS.judge_a)]) {
      for (const ref of [s.ev.slug, 'no-such-event']) {
        expect((await t.http().get(`/api/events/${ref}/voting`).set(headers)).status).toBe(403);
        const put = await t
          .http()
          .put(`/api/events/${ref}/voting`)
          .set(headers)
          .send(settings('ACCOUNTS'));
        expect(put.status).toBe(403);
      }
    }
    const none = await t.http().get(`/api/events/${s.ev.slug}/voting`).set(organizer);
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ round: null, tallies: [] });
  });

  it('refuses a window that closes before it opens, and more than 10 votes each', async () => {
    const backwards = await configure(s.ev.slug, { ...settings('ACCOUNTS'), closesAt: OPENS });
    expect(backwards.status).toBe(400);
    expect((await configure(s.ev.slug, settings('ACCOUNTS', 11))).status).toBe(400);
    expect((await configure(s.ev.slug, { ...settings('ACCOUNTS'), mode: 'LOTTERY' })).status).toBe(
      400,
    );
  });

  it('saves the settings and lists every public project with no votes', async () => {
    expect((await t.http().get(`/api/events/${s.ev.slug}/votes`)).status).toBe(404);
    const res = await configure(s.ev.slug, settings('ACCOUNTS'));
    expect(res.status).toBe(200);
    expect(res.body.round).toMatchObject({
      mode: 'ACCOUNTS',
      votesPerVoter: 2,
      open: false,
      resultsPublishedAt: null,
    });
    // Four Games projects and one Tools project; the draft is not in the vote.
    expect(res.body.tallies).toHaveLength(5);
    expect(res.body.tallies.every((r: { votes: number }) => r.votes === 0)).toBe(true);

    // Anyone can see that there is a vote and when, but not the tally.
    const status = await t.http().get(`/api/events/${s.ev.slug}/votes`);
    expect(status.body).toEqual({
      mode: 'ACCOUNTS',
      opensAt: '2030-06-02T00:00:00.000Z',
      closesAt: '2030-06-03T00:00:00.000Z',
      open: false,
      resultsPublished: false,
    });
  });
});

describe('voting with an account', () => {
  let s: Scenario;
  let voter: Awaited<ReturnType<typeof person>>;
  const ballot = (headers: Record<string, string>) =>
    t.http().get(`/api/events/${s.ev.slug}/ballot`).set(headers);
  const vote = (headers: Record<string, string>, project: string) =>
    t.http().post(`/api/events/${s.ev.slug}/ballot/votes`).set(headers).send({ project });
  const withdraw = (headers: Record<string, string>, project: string) =>
    t.http().delete(`/api/events/${s.ev.slug}/ballot/votes/${project}`).set(headers);

  beforeAll(async () => {
    clock.set(BEFORE);
    s = await judgedEvent(t);
    expect((await configure(s.ev.slug, settings('ACCOUNTS'))).status).toBe(200);
    voter = await person(t, 'voter');
  });

  it('shows the ballot before the vote opens, but counts no votes yet', async () => {
    const res = await ballot(voter.headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ open: false, closed: false, votesPerVoter: 2, votesLeft: 2 });
    const early = await vote(voter.headers, s.gamesProjects[0]!.id);
    expect(early.status).toBe(403);
    expect(early.body.error).toBe('voting_not_open');
    expect((await ballot({})).status).toBe(401);
  });

  it('counts votes inside the window, once per project, up to the limit', async () => {
    clock.set(DURING);
    const [a, b, c] = s.gamesProjects;
    const first = await vote(voter.headers, a!.id);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ open: true, votesLeft: 1 });
    expect(first.body.projects.find((p: { id: string }) => p.id === a!.id).voted).toBe(true);

    // Voting again for the same project changes nothing.
    expect((await vote(voter.headers, a!.id)).body.votesLeft).toBe(1);
    expect((await vote(voter.headers, b!.id)).body.votesLeft).toBe(0);

    const over = await vote(voter.headers, c!.id);
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('votes_used_up');

    // Withdrawing frees a vote for another project.
    const back = await withdraw(voter.headers, b!.id);
    expect(back.status).toBe(200);
    expect(back.body.votesLeft).toBe(1);
    expect((await vote(voter.headers, c!.id)).status).toBe(200);
  });

  it('never counts a vote for a draft, or for a project of another event', async () => {
    expect((await vote(voter.headers, s.draft.id)).status).toBe(404);
    expect((await vote(voter.headers, 'prj_01')).status).toBe(404);
  });

  it('refuses a vote for your own team’s project, and marks it on your ballot', async () => {
    const own = s.gamesProjects[3]!;
    const res = await vote(own.maker.headers, own.id);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('own_project');
    const mine = (await ballot(own.maker.headers)).body as Ballot;
    expect(mine.projects.find((p) => p.id === own.id)!.own).toBe(true);
    expect((await vote(own.maker.headers, s.toolsProject.id)).status).toBe(200);
  });

  it('gives each voter an order of their own, the same each time they look', async () => {
    const order = async (headers: Record<string, string>) =>
      ((await ballot(headers)).body as Ballot).projects.map((p) => p.id);
    const mine = await order(voter.headers);
    expect(await order(voter.headers)).toEqual(mine);
    expect([...mine].sort()).toEqual(
      [...s.gamesProjects.map((p) => p.id), s.toolsProject.id].sort(),
    );
    const others: string[][] = [];
    for (let i = 0; i < 3; i++) others.push(await order((await person(t, 'orderly')).headers));
    // Five projects have 120 orders; four voters all drawing the same one would be a bug.
    expect(new Set([mine, ...others].map((o) => o.join())).size).toBeGreaterThan(1);
  });

  it('keeps the rules fixed once votes are cast; dates can still move', async () => {
    const mode = await configure(s.ev.slug, settings('OPEN_LINK'));
    expect(mode.status).toBe(409);
    expect(mode.body.error).toBe('voting_started');
    expect((await configure(s.ev.slug, settings('ACCOUNTS', 3))).status).toBe(409);
    const later = await configure(s.ev.slug, {
      ...settings('ACCOUNTS'),
      closesAt: '2030-06-03T06:00:00Z',
    });
    expect(later.status).toBe(200);
    await configure(s.ev.slug, settings('ACCOUNTS'));
  });

  it('keeps the tally from everyone but organisers until results are published', async () => {
    const admin = await t.http().get(`/api/events/${s.ev.slug}/voting`).set(organizer);
    expect(admin.body).toMatchObject({ ballots: 2, votes: 3 });
    const [a, , c] = s.gamesProjects;
    const votes = Object.fromEntries(
      admin.body.tallies.map((r: { projectId: string; votes: number }) => [r.projectId, r.votes]),
    );
    expect(votes[a!.id]).toBe(1);
    expect(votes[c!.id]).toBe(1);
    expect(votes[s.toolsProject.id]).toBe(1);

    const hidden = await t.http().get(`/api/events/${s.ev.slug}/votes/results`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toBe('results_not_published');

    const early = await t.http().post(`/api/events/${s.ev.slug}/voting/publish`).set(organizer);
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('voting_not_closed');
    const voterTries = await t
      .http()
      .post(`/api/events/${s.ev.slug}/voting/publish`)
      .set(voter.headers);
    expect(voterTries.status).toBe(403);
  });

  it('stops counting when the vote closes, then publishes the results', async () => {
    clock.set(AFTER);
    const late = await vote(voter.headers, s.gamesProjects[1]!.id);
    expect(late.status).toBe(403);
    expect(late.body.error).toBe('voting_closed');
    expect((await withdraw(voter.headers, s.gamesProjects[0]!.id)).status).toBe(403);

    const pub = await t.http().post(`/api/events/${s.ev.slug}/voting/publish`).set(organizer);
    expect(pub.status).toBe(200);
    expect(pub.body.round).toMatchObject({
      open: false,
      closed: true,
      resultsPublishedAt: AFTER.toISOString(),
    });

    // Published results are final: the window cannot be reopened.
    const reopen = await configure(s.ev.slug, {
      ...settings('ACCOUNTS'),
      closesAt: '2030-06-05T00:00:00Z',
    });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error).toBe('voting_published');

    const res = await t.http().get(`/api/events/${s.ev.slug}/votes/results`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ballots: 2, closedAt: CLOSES.replace('Z', '.000Z') });
    const counts = res.body.rows.map((r: { votes: number }) => r.votes);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    expect(counts.reduce((x: number, y: number) => x + y, 0)).toBe(3);
    expect(res.body.rows[0]).not.toHaveProperty('repeatVotes');
    // Who voted for what is never public.
    expect(JSON.stringify(res.body)).not.toContain(voter.email);
    expect(JSON.stringify(res.body)).not.toContain(voter.name);
  });

  it('writes every vote and withdrawal to the audit trail', async () => {
    const res = await t
      .http()
      .get(`/api/events/${s.ev.slug}/audit`)
      .query({ action: 'vote.', actor: voter.email })
      .set(organizer);
    const sentences = res.body.items.map((i: { summary: string }) => i.summary);
    // Three votes (the repeated one is not counted twice) and one withdrawal.
    expect(sentences.filter((x: string) => x.startsWith(`${voter.name} voted for "`))).toHaveLength(
      3,
    );
    expect(
      sentences.filter((x: string) => x.startsWith(`${voter.name} withdrew their vote for "`)),
    ).toHaveLength(1);
    const set = await t
      .http()
      .get(`/api/events/${s.ev.slug}/audit`)
      .query({ action: 'voting.' })
      .set(organizer);
    const setSentences = set.body.items.map((i: { summary: string }) => i.summary);
    expect(setSentences).toContain('Demo Organizer published the community vote results');
    expect(
      setSentences.some((x: string) => x.startsWith('Demo Organizer set up the community vote')),
    ).toBe(true);
  });
});

describe('voting with personal links for listed emails', () => {
  let s: Scenario;
  let token: string;
  const passVote = (tok: string, project: string) =>
    t.http().post(`/api/voting/passes/${tok}/votes`).send({ project });

  beforeAll(async () => {
    clock.set(BEFORE);
    s = await judgedEvent(t);
  });

  it('needs a vote in this mode first', async () => {
    const res = await t
      .http()
      .post(`/api/events/${s.ev.slug}/voting/passes`)
      .set(organizer)
      .send({ emails: ['x@example.org'] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('wrong_voting_mode');
    expect((await configure(s.ev.slug, settings('EMAIL_LIST', 1))).status).toBe(200);
    const link = await t.http().post(`/api/events/${s.ev.slug}/voting/link`).set(organizer);
    expect(link.status).toBe(409);
    expect(link.body.error).toBe('wrong_voting_mode');
  });

  it('makes one link per email, once, and skips what is not an email', async () => {
    const res = await t
      .http()
      .post(`/api/events/${s.ev.slug}/voting/passes`)
      .set(organizer)
      .send({ emails: [' Voter@Example.org ', 'voter@example.org', 'not an email'] });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0].email).toBe('voter@example.org');
    expect(res.body.skipped).toEqual(['not an email']);
    token = res.body.created[0].token;

    const again = await t
      .http()
      .post(`/api/events/${s.ev.slug}/voting/passes`)
      .set(organizer)
      .send({ emails: ['voter@example.org'] });
    expect(again.body).toEqual({ created: [], skipped: ['voter@example.org'] });
    // Only the hash is stored.
    expect(await t.prisma.voterPass.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('lets the link holder vote without an account, inside the window', async () => {
    const ballot = await t.http().get(`/api/voting/passes/${token}/ballot`);
    expect(ballot.status).toBe(200);
    expect(ballot.body).toMatchObject({ mode: 'EMAIL_LIST', votesLeft: 1, open: false });
    expect((await passVote(token, s.gamesProjects[0]!.id)).status).toBe(403);

    clock.set(DURING);
    const res = await passVote(token, s.gamesProjects[0]!.id);
    expect(res.status).toBe(200);
    expect(res.body.votesLeft).toBe(0);
    expect((await passVote(token, s.gamesProjects[1]!.id)).body.error).toBe('votes_used_up');
    expect((await passVote('not-a-real-token', s.gamesProjects[1]!.id)).status).toBe(404);
    expect((await t.http().get('/api/voting/passes/not-a-real-token/ballot')).status).toBe(404);
  });

  it('does not take account votes in this mode', async () => {
    const res = await t
      .http()
      .post(`/api/events/${s.ev.slug}/ballot/votes`)
      .set(bearer(TOKENS.participant))
      .send({ project: s.gamesProjects[1]!.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('wrong_voting_mode');
  });

  it('audits link votes without naming the voter', async () => {
    const res = await t
      .http()
      .get(`/api/events/${s.ev.slug}/audit`)
      .query({ action: 'vote.cast' })
      .set(organizer);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].summary).toMatch(/^A voter voted for "/);
    expect(JSON.stringify(res.body)).not.toContain('voter@example.org');
  });
});

describe('voting through a shared link', () => {
  let s: Scenario;
  let shared: string;

  beforeAll(async () => {
    clock.set(BEFORE);
    s = await judgedEvent(t);
    expect((await configure(s.ev.slug, settings('OPEN_LINK', 1))).status).toBe(200);
  });

  it('hands out personal links only while the vote is open', async () => {
    const link = await t.http().post(`/api/events/${s.ev.slug}/voting/link`).set(organizer);
    expect(link.status).toBe(201);
    shared = link.body.token;
    const early = await t.http().post(`/api/voting/links/${shared}/passes`);
    expect(early.status).toBe(403);
    expect(early.body.error).toBe('voting_not_open');

    clock.set(DURING);
    const pass = await t.http().post(`/api/voting/links/${shared}/passes`);
    expect(pass.status).toBe(201);
    const voted = await t
      .http()
      .post(`/api/voting/passes/${pass.body.token}/votes`)
      .send({ project: s.toolsProject.id });
    expect(voted.status).toBe(200);
  });

  it('retires the old link when a new one is made', async () => {
    const next = await t.http().post(`/api/events/${s.ev.slug}/voting/link`).set(organizer);
    expect((await t.http().post(`/api/voting/links/${shared}/passes`)).status).toBe(404);
    expect((await t.http().post(`/api/voting/links/${next.body.token}/passes`)).status).toBe(201);
    const admin = await t.http().get(`/api/events/${s.ev.slug}/voting`).set(organizer);
    expect(admin.body).toMatchObject({ passes: 2, ballots: 1, votes: 1 });
    // Both ballots came from this test's one address: flagged, with the vote counted apart.
    expect(admin.body).toMatchObject({ repeatAddresses: 1, repeatBallots: 2 });
    const tools = admin.body.tallies.find(
      (r: { projectId: string }) => r.projectId === s.toolsProject.id,
    );
    expect(tools).toMatchObject({ votes: 1, repeatVotes: 1 });
    // Addresses never leave the API, and the public results carry no such detail.
    expect(JSON.stringify(admin.body)).not.toMatch(/127\.0\.0\.1|::1/);
    expect(admin.body.round.hasLink).toBe(true);
  });
});

describe('the vote rate limit', () => {
  it('refuses votes over RATE_LIMIT_VOTE_PER_MIN with 429', async () => {
    const limited = await createTestApp({ clock, config: { rateLimitVotePerMin: 1 } });
    try {
      const send = () => limited.http().post('/api/voting/links/nothing/passes');
      expect((await send()).status).toBe(404);
      expect((await send()).status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
