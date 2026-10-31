const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BENCH = __dirname;
const LOG = path.join(os.tmpdir(), 'hermes-same-audio.log');
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
async function poll(check, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check().catch(() => null);
    if (value) return { at: Date.now(), value };
    await sleep(50);
  }
  return null;
}
function firstAudio(after, threshold = 0.004, count = 3) {
  const hits = samples().filter((s) => s.t >= after && s.p >= threshold);
  return hits.length >= count ? hits[0].t : null;
}
function firstSilence(after, count = 3) {
  const all = samples().filter((s) => s.t >= after);
  for (let index = 0; index + count <= all.length; index += 1) {
    if (all.slice(index, index + count).every((s) => s.p <= 0.002)) return all[index].t;
  }
  return null;
}

(async () => {
  fs.rmSync(LOG, { force: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];

  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  await clickSelector(page, 'a[aria-label="Library"]');
  await sleep(1800);
  const rowMarked = await page.evaluate(() => {
    const row = document.querySelector('[aria-label="Play One of Your Girls by nzv7h"]');
    if (!row) return false;
    row.setAttribute('data-bench', 'target');
    return true;
  });
  if (!rowMarked) throw new Error('Recent row not found');

  const meter = spawn(
    'powershell.exe',
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(BENCH, 'audio-log.ps1'),
      '-Out', LOG, '-Seconds', '120', '-IntervalMs', '25',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i += 1) {
    if (fs.existsSync(LOG) && fs.readFileSync(LOG, 'utf8').includes('READY')) break;
    await sleep(100);
  }
  await sleep(700);
  const baseline = Math.max(0, ...samples().slice(-30).map((s) => s.p));

  const clickAt = await clickSelector(page, '[data-bench="target"]');
  const ui = await poll(async () => {
    const state = await page.evaluate(() => ({
      body: (document.body.innerText || '').includes('One of Your Girls'),
      wave: [...document.querySelectorAll('[data-testid="siri-wave"]')].some((e) => e.getAttribute('data-playing') === 'true'),
    }));
    return state.body && state.wave ? true : null;
  }, 25000);
  let audioAt = null;
  for (let i = 0; i < 400; i += 1) {
    audioAt = firstAudio(clickAt);
    if (audioAt) break;
    await sleep(40);
  }
  await sleep(1200);

  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  const homeVisible = await page.evaluate(() => {
    const siri = [...document.querySelectorAll('[data-testid="siri-play"]')]
      .find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    if (!siri) return null;
    siri.setAttribute('data-bench', 'siri');
    return siri.getAttribute('aria-label');
  });
  let pauseClick = null;
  let pausedAt = null;
  let silenceAt = null;
  if (homeVisible && /pause/i.test(homeVisible)) {
    pauseClick = await clickSelector(page, '[data-bench="siri"]');
    const paused = await poll(async () => {
      const label = await page.evaluate(() => document.querySelector('[data-bench="siri"]')?.getAttribute('aria-label'));
      return label && /play/i.test(label) ? true : null;
    }, 8000);
    pausedAt = paused ? paused.at : null;
    for (let i = 0; i < 200; i += 1) {
      silenceAt = firstSilence(pauseClick);
      if (silenceAt) break;
      await sleep(40);
    }
  }
  const resumeClick = await clickSelector(page, '[data-bench="siri"]');
  const resumed = await poll(async () => {
    const label = await page.evaluate(() => document.querySelector('[data-bench="siri"]')?.getAttribute('aria-label'));
    return label && /pause/i.test(label) ? true : null;
  }, 8000);
  let resumeAudio = null;
  for (let i = 0; i < 250; i += 1) {
    resumeAudio = firstAudio(resumeClick);
    if (resumeAudio) break;
    await sleep(40);
  }

  const fullClick = await clickSelector(page, '[aria-label="Open full player"]');
  const full = await poll(async () => page.evaluate(() => Boolean(document.querySelector('[data-testid="spotify-full-player"]'))), 10000);
  let lyrics = null;
  if (full) {
    lyrics = await poll(async () => {
      const state = await page.evaluate(() => {
        const lines = document.querySelectorAll('.lyrics-line');
        const active = document.querySelector('.lyrics-line[data-active="true"]');
        const text = document.body.innerText || '';
        if (lines.length > 0) {
          return { count: lines.length, active: (active?.textContent || '').trim(), label: text.includes('Unsynced') ? 'unsynced' : 'synced' };
        }
        if (/Lyrics unavailable|No lyrics found|Instrumental/.test(text)) {
          return { count: 0, active: '', label: (text.match(/Lyrics unavailable|No lyrics found|Instrumental/) || [''])[0] };
        }
        return null;
      });
      return state;
    }, 12000);
  }
  let queue = null;
  if (full) {
    const queueButton = page.locator('[data-testid="spotify-full-player"] [aria-label="Show queue"]');
    if (await queueButton.count()) {
      const queueClick = await clickSelector(page, '[data-testid="spotify-full-player"] [aria-label="Show queue"]');
      await sleep(800);
      queue = await page.evaluate(() => {
        const region = document.querySelector('[role="region"][aria-label="Queue"]');
        return {
          text: (region?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
          rows: region ? region.querySelectorAll('button[aria-label^="Play "]').length : 0,
        };
      });
      queue.clickAt = queueClick;
    }
  }
  if ((await page.locator('[data-testid="siri-play"]').first().getAttribute('aria-label').catch(() => ''))?.match(/pause/i)) {
    await page.locator('[data-testid="siri-play"]:visible').first().click().catch(() => null);
  }

  const result = {
    app: 'Hermes',
    track: 'One of Your Girls (nzv7h)',
    baseline,
    clickAt,
    clickToUiMs: ui ? ui.at - clickAt : null,
    clickToAudioMs: audioAt ? audioAt - clickAt : null,
    homeControl: homeVisible,
    pauseClick,
    pausedAt,
    pauseSilenceAt: silenceAt,
    resumeClick,
    resumedAt: resumed ? resumed.at : null,
    resumeAudioAt: resumeAudio,
    fullPlayerAt: full ? full.at : null,
    lyrics: lyrics ? { at: lyrics.at, ...lyrics.value } : null,
    queue,
  };
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(os.tmpdir(), 'hermes-sametrack.json'), JSON.stringify(result, null, 2));
  meter.kill();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
