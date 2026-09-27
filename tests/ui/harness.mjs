/* global console, process -- Node script */
// Shared by the browser checks: one Chromium, named steps, a PASS/FAIL line per step.
import { chromium } from 'playwright';

export const BASE = 'http://localhost:8080';

/** A fresh browser page (its own cookies). Confirm dialogs are accepted. */
export async function openBrowser() {
  // The browser uses "localhost:8080" (so the API's Origin check sees the real portal
  // address) and this container reaches it on the Docker host. The offline drill runs inside
  // the web container's network instead, where localhost already is the portal (UI_HOST_MAP=off).
  const map = process.env.UI_HOST_MAP ?? 'host.docker.internal';
  const browser = await chromium.launch({
    args: map === 'off' ? [] : [`--host-resolver-rules=MAP localhost ${map}`],
  });
  const newPage = async () => {
    const page = await (await browser.newContext()).newPage();
    page.on('dialog', (d) => d.accept());
    // Any Content-Security-Policy violation fails the run: the policy must never block the app.
    page.on('console', (msg) => {
      if (/Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text());
    });
    return page;
  };
  return { browser, newPage };
}

const results = [];
const cspViolations = [];

export async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${String(e.message).split('\n')[0]}`);
  }
}

/** Prints the results and exits non-zero if any step failed. */
export function finish(title) {
  if (cspViolations.length) {
    results.push(`FAIL no Content-Security-Policy violations: ${cspViolations[0].slice(0, 200)}`);
    cspViolations.length = 0;
  }
  console.log(`${title}\n${results.map((r) => `  ${r}`).join('\n')}`);
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
  results.length = 0;
}

export async function logIn(page, email, password = 'evenhand-demo') {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
