// Accounts in a real browser: register, the header knows you, log out, log back in to
// where you were going. Run with `npm run test:ui`.
import { BASE, finish, logIn, openBrowser, step } from './harness.mjs';

const { browser, newPage } = await openBrowser();
const page = await newPage();
const stamp = Date.now();
const email = `browser-${stamp}@accounts.test`;
const password = 'a long enough password';
const header = () => page.locator('header').innerText();

await step('register from the home page and arrive logged in', async () => {
  await page.goto(BASE);
  await page.click('main >> text=Create an account');
  await page.waitForURL(`${BASE}/register`);
  await page.fill('#name', 'Browser Person');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/`);
  const text = await header();
  if (!text.includes('Browser Person') || !text.includes('Log out')) throw new Error(text);
  if (text.includes('Organise')) throw new Error('a participant sees "Organise"');
});

await step('the same email cannot register twice', async () => {
  const other = await newPage();
  await other.goto(`${BASE}/register`);
  await other.fill('#name', 'Copy');
  await other.fill('#email', email.toUpperCase());
  await other.fill('#password', password);
  await other.click('button[type=submit]');
  await other.getByText('An account with this email already exists.').waitFor();
});

await step('log out', async () => {
  await page.click('header >> text=Log out');
  await page.waitForURL(`${BASE}/`);
  await page.locator('header >> text=Log in').waitFor();
  if ((await header()).includes('Browser Person')) throw new Error('still shown as logged in');
});

await step('a wrong password is refused with the API message', async () => {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', 'not the password');
  await page.click('button[type=submit]');
  await page.getByText('Wrong email or password.').waitFor();
});

await step('log in from a protected page and come back to it', async () => {
  await page.goto(`${BASE}/organizer`);
  await page.waitForURL(/\/login\?next=%2Forganizer$/);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/organizer`);
  await page.getByText('You do not organise any events').waitFor();
});

await step('the login page will not send you to another site', async () => {
  const other = await newPage();
  await other.goto(`${BASE}/login?next=//evil.test/steal`);
  await other.fill('#email', email);
  await other.fill('#password', password);
  await other.click('button[type=submit]');
  await other.waitForURL(`${BASE}/projects`);
});

await step('an organiser sees "Organise"', async () => {
  const org = await newPage();
  await logIn(org, 'organizer@evenhand.local');
  if (!(await org.locator('header').innerText()).includes('Organise')) throw new Error('missing');
});

await browser.close();
finish('Accounts');
