const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  const before = await p.evaluate(() => {
    const full = document.querySelector('[data-testid="spotify-full-player"]');
    const lyrics = full?.querySelector('[aria-label="Lyrics"]');
    return {
      full: Boolean(full),
      body: (full?.innerText || '').slice(0, 900),
      paragraphs: lyrics ? [...lyrics.querySelectorAll('p')].slice(0, 6).map(e => (e.textContent || '').trim()) : [],
      lyricLines: full ? full.querySelectorAll('.lyrics-line').length : 0,
      unsynced: (full?.innerText || '').includes('Unsynced'),
      siri: full?.querySelector('[data-testid="siri-play"]')?.getAttribute('aria-label') || null,
    };
  });
  console.log(JSON.stringify(before, null, 2));
  const siri = p.locator('[data-testid="spotify-full-player"] [data-testid="siri-play"]');
  if (await siri.count()) {
    const label = await siri.first().getAttribute('aria-label');
    if (/pause/i.test(label || '')) { await siri.first().click(); await p.waitForTimeout(800); }
  }
  const after = await p.evaluate(() => ({
    siri: [...document.querySelectorAll('[data-testid="siri-play"]')].map(e => ({ aria: e.getAttribute('aria-label'), playing: e.getAttribute('data-playing') })),
    full: Boolean(document.querySelector('[data-testid="spotify-full-player"]')),
  }));
  console.log(JSON.stringify(after, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
