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
function windowInfo() {
  const text = ps('window-info.ps1', ['-ProcessName', 'Hermes']);
  const match = text.match(/CLIENT=(-?\d+),(-?\d+),(\d+),(\d+)/);
  return { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) };
}
async function clickSelector(page, selector) {
  const geometry = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { iw: innerWidth, ih: innerHeight, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }, selector);
  if (!geometry) throw new Error('Missing selector: ' + selector);
  const win = windowInfo();
  const x = win.x + (geometry.x + geometry.w / 2) * (win.w / geometry.iw);
  const y = win.y + (geometry.y + geometry.h / 2) * (win.h / geometry.ih);
  const output = ps('os-click.ps1', [
    '-ProcessName', 'Hermes', '-X', String(Math.round(x)), '-Y', String(Math.round(y)),
  ]);
  const match = output.match(/CLICKAT=(\d+)/);
  return match ? Number(match[1]) : Date.now();
}
async function poll(check, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check().catch(() => null);
    if (value) return { at: Date.now(), value };
    await sleep(100);
  }
  return null;
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  await clickSelector(page, 'a[aria-label="Library"]');
  await sleep(1800);
  const marked = await page.evaluate(() => {
    const row = document.querySelector('[aria-label="Play One of Your Girls by nzv7h"]');
    if (!row) return false;
    row.setAttribute('data-bench', 'recent');
    return true;
  });
  if (!marked) throw new Error('Recent row missing');
  const playClick = await clickSelector(page, '[data-bench="recent"]');
  await sleep(1800);
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  const openMarked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button[aria-label="Open full player"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      });
    const target = buttons[0];
    if (!target) return false;
    target.setAttribute('data-bench', 'open');
    return true;
  });
  if (!openMarked) throw new Error('Full player button missing');
  const fullClick = await clickSelector(page, '[data-bench="open"]');
  const full = await poll(
    async () => page.evaluate(() => Boolean(document.querySelector('[data-testid="spotify-full-player"]'))),
    10000,
  );
  const lyric = await poll(async () => {
    const state = await page.evaluate(() => {
      const sections = [...document.querySelectorAll('[aria-label="Lyrics"]')];
      const section = sections[0];
      if (!section) return null;
      const lines = section.querySelectorAll('.lyrics-line');
      const paragraphs = [...section.querySelectorAll('p')].map((p) => (p.textContent || '').trim()).filter(Boolean);
      const active = section.querySelector('.lyrics-line[data-active="true"]');
      const text = (section.innerText || '').trim();
      if (lines.length > 0) {
        return { kind: 'synced', count: lines.length, active: (active?.textContent || '').trim(), text: text.slice(0, 400) };
      }
      if (paragraphs.length > 0) {
        return { kind: 'plain', count: paragraphs.length, first: paragraphs[0], text: text.slice(0, 400) };
      }
      if (/Lyrics unavailable|No lyrics found|Instrumental/.test(text)) {
        return { kind: 'unavailable', text: text.slice(0, 200) };
      }
      return null;
    });
    return state;
  }, 12000);
  const body = await page.evaluate(() => (document.querySelector('[data-testid="spotify-full-player"]')?.innerText || '').slice(0, 900));
  const siri = page.locator('[data-testid="siri-play"]:visible');
  if (await siri.count()) {
    const label = await siri.first().getAttribute('aria-label');
    if (/pause/i.test(label || '')) await siri.first().click();
  }
  const result = {
    app: 'Hermes',
    track: 'One of Your Girls (nzv7h)',
    playClick,
    fullClick,
    fullPlayerAt: full ? full.at : null,
    lyricsAt: lyric ? lyric.at : null,
    lyricsDelayMs: lyric && full ? lyric.at - full.at : null,
    lyrics: lyric ? lyric.value : null,
    body,
  };
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(os.tmpdir(), 'hermes-lyrics.json'), JSON.stringify(result, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
