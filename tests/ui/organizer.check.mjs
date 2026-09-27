// Clicks through the organiser pages in a real browser against the running stack.
// Run with `npm run test:ui` (tests/ui/run.sh). Creates one event named "Browser Check <time>".
/* global document -- used inside page callbacks, which run in the browser */
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
