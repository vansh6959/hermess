const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BENCH = __dirname;
const LOG = path.join(os.tmpdir(), 'hermes-soak-audio.log');
const minutesArg = process.argv.find((arg) => arg.startsWith('--minutes='));
const MINUTES = minutesArg ? Number(minutesArg.split('=')[1]) : 10;
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
function samples() {
  if (!fs.existsSync(LOG)) return [];
  return fs
    .readFileSync(LOG, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^(\d+) ([\d.]+)$/);
      return match ? [{ t: Number(match[1]), p: Number(match[2]) }] : [];
    });
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
const stats = () => JSON.parse(ps('process-stats.ps1', ['-ProcessName', 'Hermes']).trim().split(/\r?\n/).pop());

(async () => {
  fs.rmSync(LOG, { force: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Escape');
    await sleep(250);
  }
  await clickSelector(page, 'a[aria-label="Library"]');
  await sleep(1400);
  // Setup uses the app's own controls; the soak itself is resource/audio measured.
  const row = page.getByText('3am', { exact: true }).first();
  await row.click();
  await sleep(1200);
  const playButton = page.locator('[role="dialog"] button[aria-label="Play 3am"]').first();
  await playButton.waitFor({ state: 'visible', timeout: 5000 });
  const playMarked = true;

  const meter = spawn(
    'powershell.exe',
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(BENCH, 'audio-log.ps1'),
      '-Out', LOG, '-Seconds', String(MINUTES * 60 + 30), '-IntervalMs', '40',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i += 1) {
    if (fs.existsSync(LOG) && fs.readFileSync(LOG, 'utf8').includes('READY')) break;
    await sleep(100);
  }
  await sleep(700);
  const baseline = Math.max(0, ...samples().slice(-25).map((s) => s.p));
  const playClick = Date.now();
  await playButton.click();
  await sleep(2500);
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  const initial = stats();
  const timeline = [];
  const actions = [];
  const startedAt = Date.now();
  let tick = 0;
  while (Date.now() - startedAt < MINUTES * 60_000) {
    await sleep(30_000);
    tick += 1;
    const at = Date.now();
    const currentStats = stats();
    timeline.push({ at, ...currentStats });
    if (tick % 3 === 0) {
      // Advance the playlist with a real click.
      try {
        const nextClick = await clickSelector(page, '[aria-label="Next track"]');
        actions.push({ type: 'next', at: nextClick, ok: true });
      } catch (error) {
        actions.push({ type: 'next', at: Date.now(), ok: false, error: String(error.message) });
      }
    }
    if (tick === 10) {
      try {
        const pause = await clickSelector(page, '[data-testid="siri-play"]');
        await sleep(1000);
        const resume = await clickSelector(page, '[data-testid="siri-play"]');
        actions.push({ type: 'pause-resume', pauseAt: pause, resumeAt: resume, ok: true });
      } catch (error) {
        actions.push({ type: 'pause-resume', at: Date.now(), ok: false, error: String(error.message) });
      }
    }
  }
  const finalStats = stats();
  const body = await page.evaluate(() => (document.body.innerText || '').slice(0, 500));
  const allSamples = samples();
  const audible = allSamples.filter((s) => s.p >= 0.004).length;
  const result = {
    app: 'Hermes',
    startedAt,
    durationMinutes: MINUTES,
    baseline,
    playClick,
    initial,
    finalStats,
    timeline,
    actions,
    body,
    samples: allSamples.length,
    audibleSamples: audible,
    maxPeak: Math.max(0, ...allSamples.map((s) => s.p)),
  };
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(os.tmpdir(), 'hermes-soak.json'), JSON.stringify(result, null, 2));
  meter.kill();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
