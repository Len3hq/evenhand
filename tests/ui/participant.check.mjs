// A team's path in a real browser: register, start a team, invite a teammate by link, draft,
// submit, appear in the gallery, keep editing. Uses the open demo event. Run with
// `npm run test:ui`.
/* global fetch -- used inside page callbacks, which run in the browser */
import { BASE, finish, openBrowser, step } from './harness.mjs';

const { browser, newPage } = await openBrowser();
const stamp = Date.now();
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
  await ann.click('button:has-text("Save and submit")');
  await ann.getByText('Submitted. It is in the gallery').waitFor();
  await ann.getByText('Submitted', { exact: true }).waitFor();
});

await step('the project is in the public gallery', async () => {
  const visitor = await newPage();
  await visitor.goto(`${BASE}/projects?q=${encodeURIComponent(title)}`);
  await visitor.getByText(`1 project matching “${title}”`).waitFor();
  await visitor.getByText(title).first().waitFor();
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
  // Sent from Ben's page so it reaches the portal the same way; the bearer token, not his
  // cookie, decides who is calling.
  const asOrganizer = (path, data) =>
    ben.evaluate(
      async ([p, d]) =>
        (
          await fetch(p, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer dev-organizer-7f2a',
            },
            body: JSON.stringify(d),
          })
        ).json(),
      [path, data],
    );
  const event = await asOrganizer('/api/events', {
    name: `Judged by Ben ${stamp}`,
    submissionsClose: '2031-06-01T18:00:00Z',
  });
  const track = await asOrganizer(`/api/events/${event.slug}/tracks`, { name: 'Games' });
  const invite = await asOrganizer(`/api/events/${event.slug}/judge-invites`, {
    tracks: [track.id],
  });

  await ben.goto(`${BASE}${invite.path}`);
  await ben.getByText('Tracks: Games').waitFor();
  await ben.click(`button:has-text("Judge Judged by Ben ${stamp}")`);
  await ben.waitForURL(`${BASE}/judging`);
  await ben.getByText(`Judged by Ben ${stamp}`).waitFor();
  await ben.locator('header >> text=Judging').waitFor();
});

await step('a judge cannot also join a team in that event', async () => {
  await ben.goto(`${BASE}/teams`);
  const options = await ben.locator('#event option').allInnerTexts();
  if (options.some((o) => o.startsWith('Judged by Ben'))) throw new Error('offered a team there');
});

await step('a broken invite link says so', async () => {
  await ben.goto(`${BASE}/invites/not-a-real-token`);
  await ben.getByText('This invite link is not valid.').waitFor();
});

await browser.close();
finish('Participant pages');
