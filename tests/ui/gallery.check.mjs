// The public gallery in a real browser, logged out: search, then filter by event and track.
// Run with `npm run test:ui`.
import { BASE, finish, openBrowser, step } from './harness.mjs';

const { browser, newPage } = await openBrowser();
const page = await newPage();

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

await step('a project page says how it is judged', async () => {
  await page.click('text=Glass Signal >> nth=0');
  await page.getByText('Judged on').waitFor();
  await page.getByText('Functionality: 33% of the score, marked 1–5').waitFor();
});

await browser.close();
finish('Gallery');
