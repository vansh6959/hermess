const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function panel(page) {
  const trigger = page.getByTestId('quick-queue-trigger');
  const state = await trigger.getAttribute('data-state').catch(() => null);
  if (state !== 'open') await trigger.click().catch(() => {});
  await sleep(500);
  const text = await page.evaluate(() => (document.querySelector('[data-testid="quick-queue-panel"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 800));
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="quick-queue-row"]')].map(e => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90)));
  return { text, count: rows.length, first: rows.slice(0, 5), last: rows.slice(-2) };
}
async function api(page) {
  return page.evaluate(async () => {
    const tr = await fetch('/api/spotify/token', { cache: 'no-store' });
    if (!tr.ok) return { error: tr.status };
    const token = (await tr.json()).accessToken;
    const headers = { Authorization: 'Bearer ' + token };
    const [pr, qr] = await Promise.all([
      fetch('https://api.spotify.com/v1/me/player', { headers, cache: 'no-store' }),
      fetch('https://api.spotify.com/v1/me/player/queue', { headers, cache: 'no-store' }),
    ]);
    const player = pr.ok ? await pr.json() : null;
    const queue = qr.ok ? await qr.json() : null;
    return { isPlaying: player?.is_playing, current: player?.item?.name, queueCount: queue?.queue?.length, queueFirst: (queue?.queue || []).slice(0, 4).map(t => t.name) };
  });
}
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  await p.keyboard.press('Escape').catch(() => {});
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  await p.locator('a[aria-label="Library"]').click();
  await sleep(1200);
  await p.getByText('3am', { exact: true }).first().click();
  await sleep(900);
  const play = p.locator('[role="dialog"] button[aria-label="Play 3am"]').first();
  await play.waitFor({ state: 'visible', timeout: 5000 });
  await play.click();
  await sleep(3000);
  await p.keyboard.press('Escape').catch(() => {});
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  const initial = { panel: await panel(p), api: await api(p) };
  const next = p.locator('[aria-label="Next track"]:visible').first();
  if (await next.count()) await next.click();
  await sleep(3000);
  const afterNext = { panel: await panel(p), api: await api(p) };
  if (await next.count()) await next.click();
  await sleep(2500);
  const afterNext2 = { panel: await panel(p), api: await api(p) };
  const siri = p.locator('[data-testid="siri-play"]:visible').first();
  if (await siri.count() && /pause/i.test((await siri.getAttribute('aria-label')) || '')) await siri.click();
  console.log(JSON.stringify({ initial, afterNext, afterNext2 }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
