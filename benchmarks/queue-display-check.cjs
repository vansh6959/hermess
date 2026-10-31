const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  await p.keyboard.press('Escape').catch(() => {});
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(700);
  const trigger = p.getByTestId('quick-queue-trigger');
  if (await trigger.count()) { await trigger.click(); await sleep(600); }
  const panelText = await p.evaluate(() => (document.querySelector('[data-testid="quick-queue-panel"]')?.innerText || '').slice(0, 700));
  const rows = await p.evaluate(() => [...document.querySelectorAll('[data-testid="quick-queue-row"]')].map(e => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100)));
  const body = await p.evaluate(() => (document.body.innerText || '').slice(0, 400));
  const api = await p.evaluate(async () => {
    const tr = await fetch('/api/spotify/token', { cache: 'no-store' });
    if (!tr.ok) return { error: tr.status };
    const token = (await tr.json()).accessToken;
    const headers = { Authorization: 'Bearer ' + token };
    const qr = await fetch('https://api.spotify.com/v1/me/player/queue', { headers, cache: 'no-store' });
    const q = qr.ok ? await qr.json() : null;
    return { count: q?.queue?.length, next: (q?.queue || []).slice(0, 6).map(t => t.name) };
  });
  console.log(JSON.stringify({ panelText, rows, body, api }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
