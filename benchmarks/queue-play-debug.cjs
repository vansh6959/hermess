const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function queueState(p) {
  return p.evaluate(async () => {
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
      isPlaying: player?.is_playing, progress: player?.progress_ms,
      current: queue?.currently_playing?.name,
      count: queue?.queue?.length,
      next: (queue?.queue || []).slice(0, 6).map(t => t.name + ' — ' + (t.artists || []).map(a => a.name).join(', ')),
    };
  });
}
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  let playReq = null; let playRes = null;
  p.on('request', (req) => {
    try { if (req.method() === 'PUT' && req.url().includes('/me/player/play')) { const body = req.postDataJSON(); playReq = { count: Array.isArray(body?.uris) ? body.uris.length : null, first: body?.uris?.[0], context: body?.context_uri || null }; } } catch {}
  });
  p.on('response', async (res) => {
    try { if (res.request().method() === 'PUT' && res.url().includes('/me/player/play')) { playRes = { status: res.status(), retryAfter: res.headers()['retry-after'] || null }; } } catch {}
  });
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(300); await p.keyboard.press('Escape').catch(() => {}); await sleep(300);
  await p.locator('a[aria-label="Library"]').click();
  await sleep(1200);
  await p.getByText('aaahhhhh', { exact: true }).first().click();
  await sleep(1000);
  const play = p.locator('[role="dialog"] button[aria-label="Play aaahhhhh"]').first();
  await play.waitFor({ state: 'visible', timeout: 5000 });
  const before = await queueState(p);
  await play.click();
  await sleep(3500);
  const after = await queueState(p);
  console.log(JSON.stringify({ before, playReq, playRes, after, body: (await p.evaluate(() => document.body.innerText)).slice(0, 350) }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
