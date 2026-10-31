const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BENCH = __dirname;
const LOG = path.join(os.tmpdir(), 'hermes-seq-audio.log');
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
  const spotify = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const spotifyPage = spotify.contexts()[0].pages()[0];
  const spotifyPlay = await spotifyPage
    .locator('[data-testid="control-button-playpause"]')
    .getAttribute('aria-label')
    .catch(() => null);
  if (spotifyPlay === 'Pause') {
    await spotifyPage.locator('[data-testid="control-button-playpause"]').click();
    await sleep(900);
  }

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];
  await page.evaluate(() => {
    const row = document.querySelector('[aria-label="Play One of Your Girls by nzv7h"]');
    if (row) row.setAttribute('data-bench', 'target');
    return Boolean(row);
  });
  const marked = await page.locator('[data-bench="target"]').count();
  if (!marked) throw new Error('Hermes recent track row missing');

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
    const state = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="spotify-player-bar"]');
      const wave = bar?.querySelector('[data-testid="siri-wave"]');
      return {
        bar: Boolean(bar),
        text: (bar?.innerText || '').replace(/\s+/g, ' ').trim(),
        wave: wave?.getAttribute('data-playing'),
      };
    });
    return state.bar && /One of Your Girls/i.test(state.text) ? state : null;
  }, 25000);
  let audioAt = null;
  for (let i = 0; i < 400; i += 1) {
    audioAt = firstAudio(clickAt);
    if (audioAt) break;
    await sleep(40);
  }
  await sleep(1400);
  const positionAfterPlay = await page.evaluate(
    () => (document.querySelector('[data-testid="spotify-player-bar"]')?.innerText || '').replace(/\s+/g, ' ').trim(),
  );

  const pauseClick = await clickSelector(
    page,
    '[data-testid="spotify-player-bar"] [data-testid="siri-play"]',
  );
  const paused = await poll(
    async () =>
      page.evaluate(() =>
        document.querySelector('[data-testid="spotify-player-bar"] [data-testid="siri-wave"]')?.getAttribute('data-playing') === 'false',
      ),
    8000,
  );
  let silenceAt = null;
  for (let i = 0; i < 200; i += 1) {
    silenceAt = firstSilence(pauseClick);
    if (silenceAt) break;
    await sleep(40);
  }

  const resumeClick = await clickSelector(
    page,
    '[data-testid="spotify-player-bar"] [data-testid="siri-play"]',
  );
  const resumed = await poll(
    async () =>
      page.evaluate(() =>
        document.querySelector('[data-testid="spotify-player-bar"] [data-testid="siri-wave"]')?.getAttribute('data-playing') === 'true',
      ),
    8000,
  );
  let resumeAudio = null;
  for (let i = 0; i < 250; i += 1) {
    resumeAudio = firstAudio(resumeClick);
    if (resumeAudio) break;
    await sleep(40);
  }

  const barTitle = () =>
    page.evaluate(() =>
      (document.querySelector('[data-testid="spotify-player-bar"]')?.innerText || '').replace(/\s+/g, ' ').trim(),
    );
  const beforeNext = await barTitle();
  const nextClick = await clickSelector(page, '[data-testid="spotify-player-bar"] [aria-label="Next track"]');
  const nextUi = await poll(async () => {
    const text = await barTitle();
    return text && text !== beforeNext ? text : null;
  }, 15000);
  await sleep(700);
  const prevClick = await clickSelector(page, '[data-testid="spotify-player-bar"] [aria-label="Previous track"]');
  const prevUi = await poll(async () => {
    const text = await barTitle();
    return text && text !== nextUi?.value ? text : null;
  }, 15000);

  const seekBefore = await barTitle();
  const seekGeometry = await page.evaluate(() => {
    const element = document.querySelector('[data-testid="spotify-player-bar"] [aria-label="Seek in track"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { iw: innerWidth, ih: innerHeight, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  });
  if (seekGeometry) {
    const win = windowInfo();
    const x = win.x + (seekGeometry.x + seekGeometry.w * 0.7) * (win.w / seekGeometry.iw);
    const y = win.y + (seekGeometry.y + seekGeometry.h / 2) * (win.h / seekGeometry.ih);
    ps('os-click.ps1', ['-ProcessName', 'Hermes', '-X', String(Math.round(x)), '-Y', String(Math.round(y))]);
  }
  await sleep(1000);
  const seekAfter = await barTitle();

  const fullClick = await clickSelector(
    page,
    '[data-testid="spotify-player-bar"] [aria-label="Open full player"]',
  );
  const full = await poll(
    async () =>
      page.evaluate(() => Boolean(document.querySelector('[data-testid="spotify-full-player"]'))),
    10000,
  );
  let lyricState = null;
  if (full) {
    const lyrics = await poll(
      async () =>
        page.evaluate(() => {
          const lines = document.querySelectorAll('.lyrics-line');
          const active = document.querySelector('.lyrics-line[data-active="true"]');
          const text = document.body.innerText || '';
          return lines.length > 0
            ? { count: lines.length, active: (active?.textContent || '').trim(), text: text.slice(-700) }
            : text.includes('Lyrics unavailable') || text.includes('No lyrics found') || text.includes('Instrumental')
              ? { count: 0, active: '', text: text.slice(-700) }
              : null;
        }),
      12000,
    );
    lyricState = lyrics ? { at: lyrics.at, ...lyrics.value } : null;
  }
  let queueState = null;
  if (full) {
    const showQueue = await page.locator('[data-testid="spotify-full-player"]').getByRole('button', { name: 'Show queue' }).count();
    if (showQueue) {
      const queueClick = await clickSelector(page, '[data-testid="spotify-full-player"] [aria-label="Show queue"]').catch(() => null);
      await sleep(900);
      queueState = await page.evaluate(() => {
        const region = document.querySelector('[role="region"][aria-label="Queue"]');
        return {
          clickAt: null,
          text: (region?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500),
          rows: region ? region.querySelectorAll('button[aria-label^="Play "]').length : 0,
        };
      });
    }
  }
  const dock = await page
    .getByTestId('spotify-full-player')
    .getByRole('button', { name: 'Dock player' })
    .count()
    .catch(() => 0);
  if (dock) {
    await clickSelector(page, '[data-testid="spotify-full-player"] [aria-label="Dock player"]').catch(() => null);
  }
  const bar = await barTitle();
  if (bar && (await page.locator('[data-testid="spotify-player-bar"] [data-testid="siri-wave"]').getAttribute('data-playing')) === 'true') {
    await clickSelector(page, '[data-testid="spotify-player-bar"] [data-testid="siri-play"]').catch(() => null);
  }

  const result = {
    app: 'Hermes',
    track: 'One of Your Girls (nzv7h)',
    baseline,
    clickAt,
    clickToUiMs: playing ? playing.at - clickAt : null,
    clickToAudioMs: audioAt ? audioAt - clickAt : null,
    barAtPlayback: positionAfterPlay,
    pauseClick,
    pausedAt: paused ? paused.at : null,
    pauseSilenceAt: silenceAt,
    resumeClick,
    resumedAt: resumed ? resumed.at : null,
    resumeAudioAt: resumeAudio,
    nextClick,
    nextBar: nextUi ? nextUi.value : null,
    nextAt: nextUi ? nextUi.at : null,
    prevClick,
    prevBar: prevUi ? prevUi.value : null,
    prevAt: prevUi ? prevUi.at : null,
    seekBefore,
    seekAfter,
    fullPlayerAt: full ? full.at : null,
    lyrics: lyricState,
    queue: queueState,
  };
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(os.tmpdir(), 'hermes-functional.json'), JSON.stringify(result, null, 2));
  meter.kill();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
