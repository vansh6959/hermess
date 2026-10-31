const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function queueState(page) {
  return page.evaluate(async () => {
    const tr = await fetch('/api/spotify/token', { cache: 'no-store' });
    if (!tr.ok) return { error: 'token ' + tr.status };
    const token = (await tr.json()).accessToken;
    const headers = { Authorization: 'Bearer ' + token };
    const [pr, qr] = await Promise.all([
      fetch('https://api.spotify.com/v1/me/player', { headers, cache: 'no-store' }),
      fetch('https://api.spotify.com/v1/me/player/queue', { headers, cache: 'no-store' }),
    ]);
    const player = pr.ok ? await pr.json() : null;
    const queue = qr.ok ? await qr.json() : null;
    return {
      isPlaying: player?.is_playing, progress: player?.progress_ms, device: player?.device?.name,
      current: queue?.currently_playing?.name,
      count: queue?.queue?.length,
      next: (queue?.queue || []).slice(0, 12).map(t => t.name + ' — ' + (t.artists || []).map(a => a.name).join(', ')),
      body: (document.body.innerText || '').slice(0, 350),
    };
  });
}
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(300);
  await p.locator('a[aria-label="Library"]').click();
  await sleep(1200);
  await p.getByText('3am', { exact: true }).first().click();
  await sleep(1000);
  const play = p.locator('[role="dialog"] button[aria-label="Play 3am"]').first();
  await play.waitFor({ state: 'visible', timeout: 5000 });
  await play.click();
  await sleep(3000);
  const afterStart = await queueState(p);
  await p.keyboard.press('Escape').catch(() => {});
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  const next = p.locator('[aria-label="Next track"]:visible').first();
  const nextCount = await next.count();
  if (nextCount) await next.click();
  await sleep(3000);
  const afterNext = await queueState(p);
  if (nextCount) await next.click();
  await sleep(2500);
  const afterNext2 = await queueState(p);
  console.log(JSON.stringify({ afterStart, afterNext, afterNext2 }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
