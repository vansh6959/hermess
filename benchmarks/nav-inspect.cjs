const { chromium } = require('playwright');
(async () => {
  const hermes = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const h = hermes.contexts()[0].pages()[0];
  const hInfo = await h.evaluate(() => ({
    full: Boolean(document.querySelector('[data-testid="spotify-full-player"]')),
    nav: [...document.querySelectorAll('a[aria-label],button[aria-label]')].map(e => e.getAttribute('aria-label')).filter(Boolean).slice(0, 30),
    body: (document.body.innerText || '').slice(0, 500),
  }));
  const spotify = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const s = spotify.contexts()[0].pages()[0];
  const sInfo = await s.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 5 && r.height > 5; };
    const lyric = document.querySelector('[data-testid="lyrics-button"]');
    return {
      lyrics: lyric ? { disabled: lyric.disabled, aria: lyric.getAttribute('aria-label') } : null,
      queueButton: Boolean(document.querySelector('[data-testid="control-button-queue"]')),
      body: (document.body.innerText || '').slice(0, 300),
    };
  });
  console.log(JSON.stringify({ hermes: hInfo, spotify: sInfo }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
