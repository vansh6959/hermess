#!/usr/bin/env node
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BENCH = __dirname;
const OUT_DIR = path.resolve(__dirname, '..', 'test-results');
const APPS = {
  spotify: {
    process: 'Spotify',
    cdpPort: 9223,
    pageMatch: /xpui\.app\.spotify\.com/,
  },
  hermes: {
    process: 'Hermes',
    cdpPort: 9222,
    pageMatch: /127\.0\.0\.1:47100/,
  },
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ps(script, args = [], timeout = 120000) {
  return execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(BENCH, script),
      ...args,
    ],
    { encoding: 'utf8', timeout },
  );
}

function psJson(script, args = []) {
  const text = ps(script, args);
  const line = text
    .trim()
    .split(/\r?\n/)
    .filter((value) => value.trim().startsWith('{'))
    .pop();
  if (!line) throw new Error(`No JSON from ${script}: ${text}`);
  return JSON.parse(line);
}

function winInfo(processName) {
  const text = ps('window-info.ps1', ['-ProcessName', processName]);
  const line =
    text
      .trim()
      .split(/\r?\n/)
      .filter((value) => value.startsWith('PROCESS='))
      .pop() || '';
  const match = line.match(/CLIENT=(-?\d+),(-?\d+),(\d+),(\d+)/);
  if (!match) throw new Error(`Window info failed: ${text}`);
  return {
    line,
    clientX: Number(match[1]),
    clientY: Number(match[2]),
    clientW: Number(match[3]),
    clientH: Number(match[4]),
  };
}

async function waitCdp(port, timeout = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return Date.now();
    } catch {
      // not up yet
    }
    await sleep(50);
  }
  throw new Error(`CDP did not open on ${port}`);
}

async function poll(check, timeout = 30000, interval = 60) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check().catch(() => null);
    if (value) return { at: Date.now(), value };
    await sleep(interval);
  }
  return null;
}

async function osClick(page, selector, processName) {
  const geometry = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      dpr: window.devicePixelRatio,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
    };
  }, selector);
  if (!geometry) throw new Error(`OS click target missing: ${selector}`);
  const win = winInfo(processName);
  const screenX =
    win.clientX + (geometry.x + geometry.w / 2) * (win.clientW / geometry.innerW);
  const screenY =
    win.clientY + (geometry.y + geometry.h / 2) * (win.clientH / geometry.innerH);
  const output = ps('os-click.ps1', [
    '-ProcessName',
    processName,
    '-X',
    String(Math.round(screenX)),
    '-Y',
    String(Math.round(screenY)),
  ]);
  const match = output.match(/CLICKAT=(\d+)/);
  return {
    at: match ? Number(match[1]) : Date.now(),
    screenX: Math.round(screenX),
    screenY: Math.round(screenY),
  };
}

async function measureApp(appKey, mode) {
  const app = APPS[appKey];
  const record = { app: appKey, mode, startedAt: Date.now(), ok: false };
  try {
    // Keep conditions identical: no other test app may be resident.
    for (const processName of ['Spotify', 'Hermes']) {
      ps('close-app.ps1', ['-ProcessName', processName]);
    }
    await sleep(mode === 'cold' ? 8000 : 600);
    const launch = psJson('launch-and-wait.ps1', ['-App', appKey]);
    Object.assign(record, launch);
    if (!launch.windowAt) throw new Error('No visible window within timeout');

    const cdpAt = await waitCdp(app.cdpPort);
    record.cdpAt = cdpAt;
    record.cdpMs = cdpAt - launch.launchAt;
    await sleep(80);

    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${app.cdpPort}`,
    );
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page =
      pages.find((candidate) => app.pageMatch.test(candidate.url())) || pages[0];
    if (!page) throw new Error('No app page over CDP');
    record.pageUrl = page.url();

    const uiSelector =
      appKey === 'hermes' ? 'a[aria-label="Home"]' : '[data-testid="search-input"]';
    const interactive = await poll(
      () =>
        page.evaluate(
          (selector) =>
            document.readyState === 'complete' &&
            Boolean(document.querySelector(selector)),
          uiSelector,
        ),
      25000,
    );
    if (!interactive) throw new Error('Main UI did not become interactive');
    record.mainUiAt = interactive.at;
    record.mainUiMs = interactive.at - launch.launchAt;
    record.uiBody = await page.evaluate(() =>
      (document.body.innerText || '').slice(0, 500),
    );
    const uiShot = path.join(
      OUT_DIR,
      `startup-${appKey}-${mode}-${record.startedAt}-ui.png`,
    );
    try {
      await page.screenshot({ path: uiShot });
      record.uiScreenshot = uiShot;
    } catch {
      // UI capture is evidence only.
    }

    const session = await poll(async () => {
      if (appKey === 'hermes') {
        return page.evaluate(async () => {
          const response = await fetch('/api/spotify/session', {
            cache: 'no-store',
          });
          const body = await response.json();
          return body?.connected === true;
        });
      }
      return page.evaluate(() =>
        Boolean(document.querySelector('[data-testid="user-widget-link"]')),
      );
    }, 30000);
    record.sessionRestored = Boolean(session);
    record.sessionAt = session ? session.at : null;
    record.sessionMs = session ? session.at - launch.launchAt : null;

    if (appKey === 'spotify') {
      const clicked = await osClick(
        page,
        '[data-testid="home-button"]',
        app.process,
      );
      record.homeClickAt = clicked.at;
      const home = await poll(
        () =>
          page.evaluate(() => {
            const element = document.querySelector('[data-testid="home-page"]');
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 200 && rect.height > 200;
          }),
        25000,
      );
      if (!home) throw new Error('Spotify home page did not appear');
      record.homeAt = home.at;
      record.homeMs = home.at - launch.launchAt;
    } else {
      const home = await poll(
        () =>
          page.evaluate(() =>
            (document.body.innerText || '').includes("Let's dive in"),
          ),
        30000,
      );
      record.homeAt = home ? home.at : null;
      record.homeMs = home ? home.at - launch.launchAt : null;
    }

    record.homeBody = await page.evaluate(() =>
      (document.body.innerText || '').slice(0, 500),
    );
    record.visibleDialogs = await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"]')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 10 && rect.height > 10;
        })
        .map((element) =>
          (
            element.getAttribute('aria-label') ||
            element.textContent ||
            ''
          )
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100),
        ),
    );
    const homeShot = path.join(
      OUT_DIR,
      `startup-${appKey}-${mode}-${record.startedAt}-home.png`,
    );
    try {
      await page.screenshot({ path: homeShot });
      record.homeScreenshot = homeShot;
    } catch {
      // UI capture is evidence only.
    }

    ps('window-info.ps1', ['-ProcessName', app.process]);
    record.stats = psJson('process-stats.ps1', [
      '-ProcessName',
      app.process,
    ]);
    const screenshot = path.join(
      OUT_DIR,
      `startup-${appKey}-${mode}-${record.startedAt}.png`,
    );
    try {
      ps('screenshot-window.ps1', [
        '-ProcessName',
        app.process,
        '-Out',
        screenshot,
      ]);
      record.screenshot = screenshot;
    } catch {
      // Screenshot is evidence only; do not fail the run for it.
    }
    try {
      await browser.close();
    } catch {
      // Closing the CDP connection may also close the app; either is fine here.
    }
    try {
      ps('close-app.ps1', ['-ProcessName', app.process]);
    } catch {
      // best effort
    }
    record.ok = true;
  } catch (error) {
    record.error = String(error && error.message ? error.message : error);
    try {
      ps('close-app.ps1', ['-ProcessName', app.process]);
    } catch {
      // best effort
    }
  }
  return record;
}

function summarize(records) {
  const groups = {};
  for (const record of records) {
    if (!record.ok) continue;
    const key = `${record.app}-${record.mode}`;
    const group = groups[key] || (groups[key] = {});
    for (const field of [
      'windowMs',
      'cdpMs',
      'mainUiMs',
      'sessionMs',
      'homeMs',
      'cpuSeconds',
      'workingSetMb',
      'privateMb',
    ]) {
      if (typeof record[field] === 'number') {
        (group[field] ||= []).push(record[field]);
      }
    }
  }
  const output = {};
  for (const [key, fields] of Object.entries(groups)) {
    output[key] = {};
    for (const [field, values] of Object.entries(fields)) {
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
      output[key][field] = {
        n: values.length,
        median,
        mean: Number(mean.toFixed(1)),
        worst: sorted[sorted.length - 1],
      };
    }
  }
  return output;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const phase = args[0] || 'startup';
  if (phase !== 'startup') {
    throw new Error('Only the startup phase is implemented');
  }
  const readOption = (name, fallback) => {
    const prefix = `--${name}=`;
    const value = args.find((arg) => arg.startsWith(prefix));
    return value ? value.slice(prefix.length) : fallback;
  };
  const runs = Number(readOption('runs', '5'));
  const modes = String(readOption('modes', 'cold,warm')).split(',');
  const apps = String(readOption('apps', 'spotify,hermes')).split(',');
  const records = [];
  for (const appKey of apps) {
    for (const mode of modes) {
      for (let run = 0; run < runs; run += 1) {
        process.stdout.write(`${appKey} ${mode} ${run + 1}/${runs}... `);
        const record = await measureApp(appKey, mode);
        records.push(record);
        if (record.ok) {
          console.log(
            `ok window=${record.windowMs}ms ui=${record.mainUiMs}ms home=${record.homeMs}ms ram=${record.stats?.workingSetMb}MB`,
          );
        } else {
          console.log(`FAILED ${record.error}`);
        }
      }
    }
  }
  const report = {
    phase: 'startup',
    generatedAt: new Date().toISOString(),
    runs,
    modes,
    apps,
    records,
    summary: summarize(records),
  };
  const file = path.join(OUT_DIR, 'startup-benchmark.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log('WROTE', file);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
