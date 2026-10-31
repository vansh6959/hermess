const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  const info = await p.evaluate(() => {
    const raw = localStorage.getItem('hermes.library.imported.v1');
    if (!raw) return { error: 'no library' };
    const data = JSON.parse(raw);
    const playlists = data?.state?.playlists || data?.playlists || [];
    const three = playlists.find((pl) => pl.name === '3am');
    if (!three) return { error: 'no 3am', names: playlists.map((pl) => pl.name).slice(0, 10) };
    const tracks = three.tracks || [];
    const counts = new Map();
    for (const track of tracks) counts.set(track.name, (counts.get(track.name) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      trackCount: tracks.length,
      first: tracks.slice(0, 20).map((t) => ({ name: t.name, id: t.id, artists: t.artists })),
      top,
      unique: counts.size,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
