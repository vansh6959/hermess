const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  const result = await p.evaluate(async () => {
    const tokenRes = await fetch('/api/spotify/token', { cache: 'no-store' });
    if (!tokenRes.ok) return { error: 'token ' + tokenRes.status };
    const token = (await tokenRes.json()).accessToken;
    if (!token) return { error: 'no token' };
    const headers = { Authorization: 'Bearer ' + token };
    const [playerRes, queueRes] = await Promise.all([
      fetch('https://api.spotify.com/v1/me/player', { headers, cache: 'no-store' }),
      fetch('https://api.spotify.com/v1/me/player/queue', { headers, cache: 'no-store' }),
    ]);
    const player = playerRes.ok ? await playerRes.json() : null;
    const queue = queueRes.ok ? await queueRes.json() : null;
    return {
      playerStatus: playerRes.status,
      queueStatus: queueRes.status,
      isPlaying: player?.is_playing,
      device: player?.device?.name,
      progress: player?.progress_ms,
      current: queue?.currently_playing?.name,
      queueCount: queue?.queue?.length,
      queueFirst: (queue?.queue || []).slice(0, 8).map((t) => t.name + ' — ' + (t.artists || []).map((a) => a.name).join(', ')),
    };
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
