const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BENCH = __dirname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ps = (script, args = []) =>
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(BENCH, script), ...args],
    { encoding: 'utf8' },
  );
function windowInfo(processName) {
  const text = ps('window-info.ps1', ['-ProcessName', processName]);
  const match = text.match(/CLIENT=(-?\d+),(-?\d+),(\d+),(\d+)/);
  return { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) };
}
async function clickSelector(page, selector, processName) {
  const geometry = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { iw: innerWidth, ih: innerHeight, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }, selector);
  if (!geometry) throw new Error('Missing selector: ' + selector);
  const win = windowInfo(processName);
  const x = win.x + (geometry.x + geometry.w / 2) * (win.w / geometry.iw);
  const y = win.y + (geometry.y + geometry.h / 2) * (win.h / geometry.ih);
  const output = ps('os-click.ps1', [
    '-ProcessName', processName, '-X', String(Math.round(x)), '-Y', String(Math.round(y)),
  ]);
  const match = output.match(/CLICKAT=(\d+)/);
  return match ? Number(match[1]) : Date.now();
}
async function poll(check, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check().catch(() => null);
    if (value) return { at: Date.now(), value };
    await sleep(60);
  }
  return null;
}
async function markByText(page, text) {
  return page.evaluate((label) => {
    const candidates = [...document.querySelectorAll('button,a,[role="button"]')].filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const aria = element.getAttribute('aria-label') || '';
      return aria === label || (element.textContent || '').trim() === label;
    });
    const target = candidates[0];
    if (!target) return false;
    target.setAttribute('data-bench', 'target');
    return true;
  }, text);
}

(async () => {
  const results = { hermes: {}, spotify: {} };
  const hb = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const hp = hb.contexts()[0].pages()[0];
  // Leave the full player without stopping the paused track.
  const dock = await hp.evaluate(() => {
    const button = document.querySelector('[data-testid="spotify-full-player"] [aria-label="Dock player"]');
    if (!button) return false;
    button.setAttribute('data-bench', 'dock');
    return true;
  });
  if (dock) {
    await clickSelector(hp, '[data-bench="dock"]', 'Hermes');
    await sleep(600);
  }
  for (const [label, content] of [
    ['Home', 'One of Your Girls'],
    ['Library', 'Your Library'],
    ['Stats', 'Stats'],
    ['Settings', 'Settings'],
  ]) {
    const selector = `a[aria-label="${label}"]`;
    const exists = await hp.locator(selector).count();
    if (!exists) { results.hermes[label] = { error: 'nav missing' }; continue; }
    const clicked = await clickSelector(hp, selector, 'Hermes');
    const shown = await poll(async () => {
      const text = await hp.evaluate(() => document.body.innerText || '');
      return text.includes(content) ? text.slice(0, 300) : null;
    }, 12000);
    results.hermes[label] = {
      clickAt: clicked,
      contentAt: shown ? shown.at : null,
      ms: shown ? shown.at - clicked : null,
      body: shown ? shown.value : null,
    };
    await hp.keyboard.press('Escape').catch(() => {});
    await sleep(250);
  }

  const sb = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const sp = sb.contexts()[0].pages()[0];
  const homeSelector = '[data-testid="home-button"]';
  if (await sp.locator(homeSelector).count()) {
    const clicked = await clickSelector(sp, homeSelector, 'Spotify');
    const shown = await poll(() => sp.evaluate(() => {
      const home = document.querySelector('[data-testid="home-page"]');
      if (!home) return null;
      const rect = home.getBoundingClientRect();
      return rect.width > 200 ? true : null;
    }), 15000);
    results.spotify.Home = { clickAt: clicked, contentAt: shown ? shown.at : null, ms: shown ? shown.at - clicked : null };
  }
  const search = sp.getByTestId('search-input');
  if (await search.count()) {
    const clicked = await clickSelector(sp, '[data-testid="search-input"]', 'Spotify');
    ps('os-key.ps1', ['-Text', 'One of Your Girls', '-SelectAll', '-Enter']);
    const shown = await poll(() => sp.evaluate(() =>
      Boolean([...document.querySelectorAll('button[aria-label]')].find((b) => /^play one of your girls/i.test(b.getAttribute('aria-label') || ''))),
    ), 15000);
    results.spotify.Search = { clickAt: clicked, contentAt: shown ? shown.at : null, ms: shown ? shown.at - clicked : null };
  }
  if (await markByText(sp, 'Your Library')) {
    const clicked = await clickSelector(sp, '[data-bench="target"]', 'Spotify');
    const shown = await poll(() => sp.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes('Your Library') && text.includes('Liked Songs') ? true : null;
    }), 10000);
    results.spotify.Library = { clickAt: clicked, contentAt: shown ? shown.at : null, ms: shown ? shown.at - clicked : null };
  }
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(os.tmpdir(), 'pages-benchmark.json'), JSON.stringify(results, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
