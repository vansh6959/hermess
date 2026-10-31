const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BENCH = path.join('C:\\Users\\Vansh\\OneDrive\\Desktop\\hermes', 'benchmarks');
const LOG = path.join(os.tmpdir(), 'spotify-seq-audio.log');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function powershell(script, args = []) {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(BENCH, script), ...args],
    { encoding: 'utf8' },
  );
}
function windowInfo() {
  const text = powershell('window-info.ps1', ['-ProcessName', 'Spotify']);
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
  const output = powershell('os-click.ps1', [
    '-ProcessName', 'Spotify', '-X', String(Math.round(x)), '-Y', String(Math.round(y)),
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
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];
  const playLabel = () =>
    page.evaluate(
      () => document.querySelector('[data-testid="control-button-playpause"]')?.getAttribute('aria-label') || '',
    );
  if ((await playLabel()) === 'Pause') {
    await clickSelector(page, '[data-testid="control-button-playpause"]');
    await sleep(900);
  }
  const marked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button[aria-label="Play One of Your Girls"]')];
    const target = buttons.find((button) => {
      let node = button;
      for (let depth = 0; depth < 7 && node; depth += 1) {
        node = node.parentElement;
        if (node && /nzv7h/i.test(node.textContent || '')) return true;
      }
      return false;
    });
    if (!target) return false;
    target.setAttribute('data-bench', 'target');
    return true;
  });
  if (!marked) throw new Error('Exact Spotify track result not found');

  const meter = spawn(
    'powershell.exe',
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(BENCH, 'audio-log.ps1'),
      '-Out', LOG, '-Seconds', '150', '-IntervalMs', '25',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i += 1) {
    if (fs.existsSync(LOG) && fs.readFileSync(LOG, 'utf8').includes('READY')) break;
    await sleep(100);
  }
  await sleep(800);
  const baseline = Math.max(0, ...samples().slice(-30).map((s) => s.p));

  const clickAt = await clickSelector(page, '[data-bench="target"]');
  const playing = await poll(async () => {
    const state = await page.evaluate(() => ({
      pp: document.querySelector('[data-testid="control-button-playpause"]')?.getAttribute('aria-label') || '',
      np: (document.querySelector('[data-testid="now-playing-widget-v2"]')?.textContent || '').trim(),
      pos: document.querySelector('[data-testid="playback-position"]')?.textContent || '',
    }));
    return state.pp === 'Pause' && /One of Your Girls/i.test(state.np) ? state : null;
  }, 20000);
  let audioAt = null;
  for (let i = 0; i < 300; i += 1) {
    audioAt = firstAudio(clickAt);
    if (audioAt) break;
    await sleep(40);
  }
  await sleep(1400);
  const positionAfterPlay = await page.evaluate(
    () => document.querySelector('[data-testid="playback-position"]')?.textContent || '',
  );

  const pauseClick = (await playLabel()) === 'Pause'
    ? await clickSelector(page, '[data-testid="control-button-playpause"]')
    : null;
  const paused = await poll(async () => ((await playLabel()) === 'Play' ? true : null), 8000);
  let silenceAt = null;
  if (pauseClick) {
    for (let i = 0; i < 200; i += 1) {
      silenceAt = firstSilence(pauseClick);
      if (silenceAt) break;
      await sleep(40);
    }
  }

  const resumeClick = await clickSelector(page, '[data-testid="control-button-playpause"]');
  const resumed = await poll(async () => ((await playLabel()) === 'Pause' ? true : null), 8000);
  let resumeAudio = null;
  for (let i = 0; i < 250; i += 1) {
    resumeAudio = firstAudio(resumeClick);
    if (resumeAudio) break;
    await sleep(40);
  }

  const npBefore = await page.evaluate(
    () => document.querySelector('[data-testid="now-playing-widget-v2"]')?.textContent || '',
  );
  const nextClick = await clickSelector(page, '[data-testid="control-button-skip-forward"]');
  const nextUi = await poll(async () => {
    const text = await page.evaluate(
      () => document.querySelector('[data-testid="now-playing-widget-v2"]')?.textContent || '',
    );
    return text && text !== npBefore ? text : null;
  }, 15000);
  await sleep(800);
  const prevClick = await clickSelector(page, '[data-testid="control-button-skip-back"]');
  const prevUi = await poll(async () => {
    const text = await page.evaluate(
      () => document.querySelector('[data-testid="now-playing-widget-v2"]')?.textContent || '',
    );
    return text && text !== nextUi?.value ? text : null;
  }, 15000);

  const seekBefore = await page.evaluate(
    () => document.querySelector('[data-testid="playback-position"]')?.textContent || '',
  );
  const seekGeometry = await page.evaluate(() => {
    const element = document.querySelector('[data-testid="playback-progressbar"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { iw: innerWidth, ih: innerHeight, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  });
  if (seekGeometry) {
    const win = windowInfo();
    const x = win.x + (seekGeometry.x + seekGeometry.w * 0.7) * (win.w / seekGeometry.iw);
    const y = win.y + (seekGeometry.y + seekGeometry.h / 2) * (win.h / seekGeometry.ih);
    powershell('os-click.ps1', ['-ProcessName', 'Spotify', '-X', String(Math.round(x)), '-Y', String(Math.round(y))]);
  }
  await sleep(1200);
  const seekAfter = await page.evaluate(
    () => document.querySelector('[data-testid="playback-position"]')?.textContent || '',
  );

  const lyricsClick = await clickSelector(page, '[data-testid="lyrics-button"]');
  await sleep(2500);
  const lyricsState = await page.evaluate(() => ({
    body: (document.body.innerText || '').slice(0, 700),
    elements: [...document.querySelectorAll('[data-testid*="lyric" i],[class*="lyric" i]')]
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName,
        testid: element.getAttribute('data-testid'),
        text: (element.textContent || '').trim().slice(0, 80),
      })),
  }));

  const queueClick = await clickSelector(page, '[data-testid="control-button-queue"]');
  await sleep(1200);
  const queueState = await page.evaluate(() => ({
    dialogs: [...document.querySelectorAll('[role="dialog"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 10 && rect.height > 10;
      })
      .map((element) => (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 200)),
    body: (document.body.innerText || '').slice(0, 500),
  }));

  if ((await playLabel()) === 'Pause') {
    await clickSelector(page, '[data-testid="control-button-playpause"]');
  }
  const result = {
    app: 'Spotify',
    track: 'One of Your Girls (nzv7h)',
    baseline,
    clickAt,
    clickToUiMs: playing ? playing.at - clickAt : null,
    clickToAudioMs: audioAt ? audioAt - clickAt : null,
    positionAfterPlay,
    pauseClick,
    pausedAt: paused ? paused.at : null,
    pauseSilenceAt: silenceAt,
    resumeClick,
    resumedAt: resumed ? resumed.at : null,
    resumeAudioAt: resumeAudio,
    nextClick,
    nextTitle: nextUi ? nextUi.value : null,
    nextAt: nextUi ? nextUi.at : null,
    prevClick,
    prevTitle: prevUi ? prevUi.value : null,
    prevAt: prevUi ? prevUi.at : null,
    seekBefore,
    seekAfter,
    lyricsClick,
    lyricsState,
    queueClick,
    queueState,
  };
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(os.tmpdir(), 'spotify-functional.json'), JSON.stringify(result, null, 2));
  meter.kill();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
