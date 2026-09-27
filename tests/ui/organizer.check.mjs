// Clicks through the organiser pages in a real browser against the running stack.
// Run with `npm run test:ui` (tests/ui/run.sh). Creates one event named "Browser Check <time>".
/* global console, process, document -- Node script; `document` is used inside page callbacks */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`);
  }
};

const browser = await chromium.launch({
  // The browser talks to "localhost:8080" (so Origin checks see the real portal address),
  // which this container reaches on the Docker host.
  args: ['--host-resolver-rules=MAP localhost host.docker.internal'],
});
const page = await browser.newPage();
page.on('dialog', (d) => d.accept());
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
  await page.click('li button:has-text("Remove") >> nth=-1');
  await page.getByText('No prizes yet').waitFor();
});

await step('remove the track', async () => {
  await page.locator('li:has(input[id^="track-"]) button:has-text("Remove")').first().click();
  await page.getByText('No tracks yet').waitFor();
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
  ]) {
    if (!text.includes(s)) throw new Error(`missing: ${s}`);
  }
});

await step('filter the trail to tracks only', async () => {
  await page.selectOption('#action', 'track.');
  await page.click('button:has-text("Filter")');
  await page.waitForURL(/action=track\./);
  const items = await page.locator('ol > li').count();
  if (items !== 3) throw new Error(`expected 3 track entries, got ${items}`);
});

await browser.close();
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
