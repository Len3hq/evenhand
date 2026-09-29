// Clicks through the organiser pages in a real browser against the running stack.
// Run with `npm run test:ui` (tests/ui/run.sh). Creates one event named "Browser Check <time>".
/* global document, fetch -- used inside page callbacks, which run in the browser */
import { BASE, finish, openBrowser, step } from './harness.mjs';

const { browser, newPage } = await openBrowser();
const page = await newPage();
const name = `Browser Check ${Date.now()}`;
const slug = name.toLowerCase().replace(/ /g, '-');

await step('logged out, /organizer sends you to login and back', async () => {
  await page.goto(`${BASE}/organizer`);
  if (!page.url().includes('/login?next=%2Forganizer')) throw new Error(page.url());
  await page.fill('#email', 'organizer@evenhand.local');
  await page.fill('#password', 'evenhand-demo');
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/organizer`);
  await page.getByRole('heading', { name: 'Your events' }).waitFor();
});

await step('create an event with UTC dates', async () => {
  await page.click('text=New event');
  await page.waitForURL(`${BASE}/organizer/events/new`);
  await page.fill('#name', name);
  await page.fill('#submissionsClose', '2031-06-01T18:00');
  await page.fill('#judgingClose', '2031-06-15T18:00');
  await page.click('button:has-text("Create event")');
  await page.waitForURL(`${BASE}/organizer/events/${slug}`);
  await page.getByRole('heading', { name }).waitFor();
  const text = await page.textContent('main');
  if (!text.includes('closes 2031-06-01 18:00 UTC')) throw new Error('close date not shown in UTC');
});

await step('a bad date order shows the API message', async () => {
  await page.fill('#opensAt', '2031-07-01T00:00');
  await page.click('button:has-text("Save changes")');
  await page.getByText('opensAt must be before submissionsClose').waitFor();
  await page.fill('#opensAt', '');
});

await step('extend the deadline', async () => {
  await page.fill('#submissionsClose', '2031-06-08T18:00');
  await page.click('button:has-text("Save changes")');
  await page.getByText('Saved.').waitFor();
  await page.getByText('closes 2031-06-08 18:00 UTC').waitFor();
});

await step('add and rename a track', async () => {
  await page.fill('#new-track', 'Climate');
  await page.click('button:has-text("Add track")');
  const input = page.locator('input[id^="track-"]').first();
  await input.waitFor();
  await input.fill('Climate and energy');
  await page.click('button:has-text("Rename")');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('input[id^="track-"]')].some(
      (i) => i.defaultValue === 'Climate and energy',
    ),
  );
});

await step('a duplicate track name shows the API message', async () => {
  await page.fill('#new-track', 'Climate and energy');
  await page.click('button:has-text("Add track")');
  await page.getByText('A track called "Climate and energy" exists.').waitFor();
});

await step('add a prize for the track, then remove it', async () => {
  await page.fill('#new-prize-name', 'Best climate tool');
  await page.fill('#new-prize-description', '$300');
  await page.selectOption('#new-prize-track', { label: 'Climate and energy' });
  await page.click('button:has-text("Add prize")');
  await page.locator('input[id$="-name"][value="Best climate tool"]').waitFor();
  await page.locator('li:has(input[value="Best climate tool"]) button:has-text("Remove")').click();
  await page.getByText('No prizes yet').waitFor();
});

await step('remove the track', async () => {
  await page.locator('li:has(input[id^="track-"]) button:has-text("Remove")').first().click();
  await page.getByText('No tracks yet').waitFor();
});

await step('set a weighted rubric; shares follow the weights', async () => {
  await page.click('button:has-text("Add criterion")');
  await page.click('button:has-text("Add criterion")');
  await page.fill('#criterion-0-label', 'Impact');
  await page.fill('#criterion-0-weight', '2');
  await page.fill('#criterion-1-label', 'Polish');
  const text = await page.locator('table').innerText();
  if (!text.includes('67%') || !text.includes('33%')) throw new Error(`shares: ${text}`);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/criteria') && r.request().method() === 'PUT' && r.ok(),
  );
  await page.click('button:has-text("Save rubric")');
  await saved;
  // Saved for real: it is still there after a reload.
  await page.reload();
  if ((await page.locator('#criterion-0-label').inputValue()) !== 'Impact') {
    throw new Error('the rubric did not persist');
  }
});

await step('ask two questions, reorder them, and they persist', async () => {
  await page.click('button:has-text("Add question")');
  await page.click('button:has-text("Add question")');
  await page.fill('#question-0-prompt', 'Phone number for the finals');
  await page.fill('#question-1-prompt', 'What did you build this weekend?');
  await page.check('li:has(#question-1-prompt) >> text=Required to submit');
  await page.check('li:has(#question-1-prompt) >> text=Show answers in the public gallery');
  await page.click('button[aria-label="Move question 2 up"]');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/questions') && r.request().method() === 'PUT' && r.ok(),
  );
  await page.click('button:has-text("Save questions")');
  await saved;
  await page.reload();
  if (
    (await page.locator('#question-0-prompt').inputValue()) !== 'What did you build this weekend?'
  ) {
    throw new Error('the questions did not persist in order');
  }
  if (
    !(await page.locator('li:has(#question-0-prompt) input[type=checkbox]').first().isChecked())
  ) {
    throw new Error('"required" did not persist');
  }
});

await step('a locked rubric (judging started) only offers weights and names', async () => {
  const back = page.url();
  await page.goto(`${BASE}/organizer/events/evt_01`);
  await page.getByText('Judging has started').waitFor();
  if (await page.locator('button:has-text("Add criterion")').count()) {
    throw new Error('"Add criterion" offered on a locked rubric');
  }
  if (!(await page.locator('#criterion-0-min').isDisabled())) throw new Error('range editable');
  await page.goto(back);
});

await step('create a judge invite link for a track', async () => {
  await page.fill('#new-track', 'Judged track');
  await page.click('button:has-text("Add track")');
  await page.locator('input[id^="track-"]').first().waitFor();
  await page.getByText('No judges yet').waitFor();
  await page.check('label:has-text("Judged track") >> input[name="invite-tracks"]');
  await page.click('button:has-text("Create judge invite link")');
  const url = await page.locator('#judge-invite-url').inputValue();
  if (!url.startsWith(`${BASE}/judge-invites/`)) throw new Error(url);
});

await step('run assignment on the fixture event and read what it did', async () => {
  const back = page.url();
  await page.goto(`${BASE}/organizer/events/evt_01`);
  await page.click('button:has-text("Run assignment")');
  // 41 fixture projects minus the held copy of the Dry Harbour duplicate.
  await page.getByText(/across 40 projects \(target 3, seed \d+\)/).waitFor();
  await page.goto(back);
});

await step('the live progress dashboard flags the flat judge and refreshes by itself', async () => {
  const back = page.url();
  await page.goto(`${BASE}/organizer/events/evt_01`);
  await page.click('text=Judging progress');
  await page.getByRole('heading', { name: 'Judging progress' }).waitFor();
  // jdg_07 gave every project 4/4/4 in fixtures.json.
  await page
    .locator('tr:has-text("Iva Petrova")')
    .getByText('same marks for every project')
    .waitFor();
  const before = await page.locator('#progress-updated').innerText();
  // It polls every 10 s: the time it shows (to the second) must change without a reload.
  await page.waitForFunction(
    (prev) => document.querySelector('#progress-updated')?.textContent !== prev,
    before,
    { timeout: 15000 },
  );
  await page.goto(back);
});

await step('rank the fixture event, publish it, and a visitor sees the results', async () => {
  const back = page.url();
  await page.goto(`${BASE}/organizer/events/evt_01`);
  await page.click('main >> text=Results');
  await page.getByRole('heading', { name: 'Ranking and results' }).waitFor();
  await page.click('button:has-text("Run ranking")');
  // As in docs/proof/normalization.md: 40 projects, 2 tie groups.
  await page.getByText(/40 projects ranked in 2 tie groups/).waitFor();
  await page.click('button:has-text("Publish these results")');
  await page.getByText(/^Published /).waitFor();

  const visitor = await newPage();
  await visitor.goto(`${BASE}/events/evt_01/results`);
  await visitor.getByRole('heading', { name: 'Sample Hack 2026: results' }).waitFor();
  await visitor.getByText('Salt Ledger').waitFor();
  await page.goto(back);
});

/** Status of a public API call made by the page itself (same origin as a visitor). */
const statusOf = (path) => page.evaluate((p) => fetch(p).then((r) => r.status), path);

await step('hide a comment with a reason, then restore it', async () => {
  const text = `Moderation check ${Date.now()}`;
  await page.goto(`${BASE}/projects/prj_01`);
  await page.fill('#comment-body', text);
  await page.click('button:has-text("Post comment")');
  const item = page.locator('li', { hasText: text });
  await item.waitFor();
  await item.locator('button:has-text("Hide…")').click();
  await item.locator('input').fill('Off topic');
  await item.getByRole('button', { name: 'Hide', exact: true }).click();
  await item.getByText('Hidden: Off topic').waitFor();
  const visitor = await newPage();
  await visitor.goto(`${BASE}/projects/prj_01`);
  await visitor.getByRole('heading', { name: /Comments/ }).waitFor();
  if (await visitor.getByText(text).count())
    throw new Error('a visitor still sees the hidden comment');
  await item.locator('button:has-text("Restore")').click();
  await item.getByText('Hidden: Off topic').waitFor({ state: 'detached' });
  await visitor.reload();
  await visitor.getByText(text).waitFor();
});

await step('run a community vote: vote, close it, publish it, and a visitor sees it', async () => {
  const back = page.url();
  await page.goto(`${BASE}/organizer/events/evt_01`);
  await page.getByRole('link', { name: /Community vote/ }).click();
  await page.getByRole('heading', { name: 'Community vote' }).waitFor();
  // The gallery's event filter takes the slug, which this page's address carries.
  const eventSlug = page.url().match(/\/organizer\/events\/([^/]+)\/voting/)[1];
  // A UTC minute for a datetime-local input, `ms` from now.
  const utc = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 16);
  // A rerun on the same stack finds this vote published, which makes it final; the drill and a
  // fresh `docker compose up` always start without one.
  if (!(await page.getByText('this vote is final').count())) {
    await page.getByLabel('Anyone with an account').check();
    await page.fill('#opensAt', utc(-60 * 60_000));
    await page.fill('#closesAt', utc(60 * 60_000));
    await page.fill('#votesPerVoter', '3');
    await page.getByRole('button', { name: /Set up the vote|Save vote settings/ }).click();
    await page.getByText('Open now').waitFor();

    await page.goto(`${BASE}/events/evt_01/vote`);
    const vote = page.getByRole('button', { name: /^Vote for / }).first();
    const title = (await vote.getAttribute('aria-label')).replace(/^Vote for /, '');
    await vote.click();
    await page.getByRole('button', { name: `Withdraw your vote for ${title}` }).waitFor();

    await page.goto(`${BASE}/organizer/events/evt_01/voting`);
    const votes = await page.locator('tr', { hasText: title }).locator('td').last().innerText();
    if (Number(votes) < 1) throw new Error(`the tally shows ${votes} votes for ${title}`);
    // Close the window (dates can move until publishing), then publish.
    await page.fill('#opensAt', utc(-2 * 60 * 60_000));
    await page.fill('#closesAt', utc(-60_000));
    await page.getByRole('button', { name: 'Save vote settings' }).click();
    await page.getByText('Closed', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Publish the vote' }).click();
    await page.getByRole('link', { name: 'the public page' }).waitFor();
  }
  const visitor = await newPage();
  await visitor.goto(`${BASE}/projects?event=${eventSlug}`);
  await visitor.getByRole('link', { name: /Community vote/ }).click();
  await visitor.waitForURL(/\/events\/[^/]+\/vote\/results$/);
  await visitor.locator('tbody tr').first().waitFor();
  await page.goto(back);
});

await step('confirm the planted duplicate, see where its reviews went, then undo it', async () => {
  await page.goto(`${BASE}/organizer/events/evt_01/entries`);
  await page.getByRole('heading', { name: 'Entries and duplicates' }).waitFor();
  // Found by role and name, not by styling, so a redesign cannot break the check.
  const card = page.getByRole('article', { name: 'Dry Harbour' });
  await card.getByText('Waiting for your decision').waitFor();
  // jdg_01 and jdg_12 reviewed only the older copy; their reviews move across.
  await card.getByText(/Reviews that move to the newer copy.*: .+, .+\./).waitFor();
  if (await card.locator('button:has-text("Not a duplicate")').count()) {
    throw new Error('one team’s two entries must not offer "Not a duplicate"');
  }
  await card.locator('button:has-text("Confirm: keep the newer copy")').click();
  await card.getByText(/Confirmed by Demo Organizer/).waitFor();
  if ((await statusOf('/api/projects/prj_07')) !== 404) throw new Error('prj_07 still public');
  await page.locator('tr', { hasText: 'Replaced by a newer copy' }).waitFor();

  await card.locator('button:has-text("Undo")').click();
  await card.getByText('Waiting for your decision').waitFor();
  if ((await statusOf('/api/projects/prj_07')) !== 200) throw new Error('prj_07 not restored');
});

await step('disqualify an entry with a reason, then reinstate it', async () => {
  const row = page.locator('tr', { hasText: 'Glass Signal' });
  await row.locator('button:has-text("Disqualify…")').click();
  await row.locator('input').fill('Browser check: rules breach');
  await row.getByRole('button', { name: 'Disqualify', exact: true }).click();
  await row.getByText('Reason: Browser check: rules breach').waitFor();
  if ((await statusOf('/api/projects/prj_01')) !== 404) throw new Error('prj_01 still public');

  await row.locator('button:has-text("Reinstate")').click();
  await row.getByText('In judging').waitFor();
  if ((await statusOf('/api/projects/prj_01')) !== 200) throw new Error('prj_01 not restored');
  await page.goto(`${BASE}/organizer/events/${slug}`);
});

await step('appoint an organiser, then remove them', async () => {
  // priya1 is the demo participant; she competes in the demo event, not in this one.
  await page.fill('#new-organizer', 'priya1@example.org');
  await page.click('button:has-text("Add organiser")');
  await page.getByText('priya1@example.org').waitFor();
  await page.locator('li:has-text("priya1@example.org") button:has-text("Remove")').click();
  await page.getByText('priya1@example.org').waitFor({ state: 'detached' });
});

await step('an unknown email and the last organiser are refused with the API message', async () => {
  await page.fill('#new-organizer', 'nobody@nowhere.test');
  await page.click('button:has-text("Add organiser")');
  await page
    .getByText('No account uses nobody@nowhere.test. Ask them to register first.')
    .waitFor();
  await page.locator('li:has-text("(you)") button:has-text("Remove")').click();
  await page.getByText('An event needs at least one organiser.').waitFor();
});

await step('the audit trail tells the story in sentences', async () => {
  await page.click('text=Audit trail');
  await page.waitForURL(`${BASE}/organizer/events/${slug}/audit`);
  const text = await page.textContent('main');
  for (const s of [
    `Demo Organizer created the event "${name}"`,
    'Demo Organizer changed the event: submissionsClose: 2031-06-01 18:00 UTC → 2031-06-08 18:00 UTC',
    'Demo Organizer added the track "Climate"',
    'Demo Organizer renamed a track: name: "Climate" → "Climate and energy"',
    'Demo Organizer added the prize "Best climate tool"',
    'Demo Organizer removed the prize "Best climate tool"',
    'Demo Organizer removed the track "Climate and energy"',
    'Demo Organizer changed the rubric: added "Impact" (weight 2, 1–5); added "Polish" (weight 1, 1–5)',
    'Demo Organizer changed the submission questions: added "What did you build this weekend?" (required, public); added "Phone number for the finals" (optional, private)',
    'Demo Organizer made "priya1@example.org" an organiser',
    'Demo Organizer removed "priya1@example.org" as an organiser',
  ]) {
    if (!text.includes(s)) throw new Error(`missing: ${s}`);
  }
});

await step('filter the trail to tracks only', async () => {
  await page.selectOption('#action', 'track.');
  await page.click('button:has-text("Filter")');
  await page.waitForURL(/action=track\./);
  const items = await page.locator('ol > li').count();
  // Climate added, renamed, removed; "Judged track" added for the judge invite.
  if (items !== 4) throw new Error(`expected 4 track entries, got ${items}`);
});

await browser.close();
finish('Organiser pages');
