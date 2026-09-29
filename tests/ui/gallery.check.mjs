// The public gallery in a real browser, logged out: search, then filter by event and track.
// Run with `npm run test:ui`.
/* global document -- used inside page callbacks, which run in the browser */
import { BASE, finish, openBrowser, step } from './harness.mjs';

const { browser, newPage } = await openBrowser();
const page = await newPage();

await step('pages carry a strict Content-Security-Policy with a fresh nonce', async () => {
  const policy = async () =>
    (await page.goto(`${BASE}/projects`)).headers()['content-security-policy'];
  const a = await policy();
  const b = await policy();
  if (!/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(a)) throw new Error(a);
  if (/script-src[^;]*'unsafe-inline'/.test(a)) throw new Error('inline scripts allowed');
  if (!a.includes("frame-ancestors 'none'")) throw new Error('framing allowed');
  if (a === b) throw new Error('the nonce did not change between requests');
});

await step('a visitor sees fixture projects without logging in', async () => {
  await page.goto(`${BASE}/projects`);
  await page.getByText('Glass Signal').first().waitFor();
});

await step('filter by event, then by one of its tracks', async () => {
  await page.selectOption('#event', { label: 'Sample Hack 2026' });
  await page.click('button:has-text("Search")');
  await page.waitForURL(/event=sample-hack-2026/);
  // The track list belongs to the chosen event.
  await page.selectOption('#track', { label: 'Developer tools' });
  await page.click('button:has-text("Search")');
  await page.waitForURL(/track=/);
  await page.getByText('6 projects', { exact: true }).waitFor();
});

await step('search within the filters, then clear them', async () => {
  await page.fill('#q', 'no project is called this');
  await page.click('button:has-text("Search")');
  await page.getByText('No projects found').waitFor();
  await page.click('text=Clear the search and filters');
  await page.waitForURL(`${BASE}/projects`);
  await page.getByText('Glass Signal').first().waitFor();
});

await step('results follow as you type, without pressing Search', async () => {
  await page.goto(`${BASE}/projects`);
  await page.locator('#q').pressSequentially('Glass Sig', { delay: 40 });
  await page.waitForURL(/[?&]q=Glass(\+|%20)Sig/);
  await page.getByText('Glass Signal').first().waitFor();
  if (await page.getByText('Small Meadow').count()) throw new Error('the search did not filter');
  // The box keeps its focus and what was typed while the results change.
  if ((await page.locator('#q').inputValue()) !== 'Glass Sig') throw new Error('typing was lost');
  if (!(await page.locator('#q').evaluate((el) => el === document.activeElement))) {
    throw new Error('the search box lost focus');
  }
  await page.locator('#q').fill('');
  await page.waitForURL(`${BASE}/projects`);
});

await step('a project page says how it is judged', async () => {
  await page.click('text=Glass Signal >> nth=0');
  await page.getByText('Judged on').waitFor();
  await page.getByText('Functionality: 33% of the score, marked 1–5').waitFor();
});

await browser.close();
finish('Gallery');
