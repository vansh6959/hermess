const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
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
  return ps('os-click.ps1', [
    '-ProcessName', 'Hermes', '-X', String(Math.round(x)), '-Y', String(Math.round(y)),
  ]);
}
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];
  await clickSelector(page, 'a[aria-label="Library"]');
  await sleep(2000);
  const info = await page.evaluate(() => ({
    text: (document.body.innerText || '').slice(-1800),
    buttons: [...document.querySelectorAll('button[aria-label]')]
      .filter((button) => /play one of your girls/i.test(button.getAttribute('aria-label') || ''))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return { aria: button.getAttribute('aria-label'), rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
      }),
    recent: (document.body.innerText || '').includes('Recent'),
  }));
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
