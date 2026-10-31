const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  const info = await p.evaluate(() => {
    const bar = document.querySelector('[data-testid="spotify-player-bar"]');
    return {
      bar: Boolean(bar),
      text: (bar?.innerText || '').replace(/\s+/g, ' ').trim(),
      buttons: bar ? [...bar.querySelectorAll('button')].map(b => ({ aria: b.getAttribute('aria-label'), testid: b.getAttribute('data-testid'), cls: b.className.slice(0,80) })) : [],
      allSiri: [...document.querySelectorAll('[data-testid="siri-play"]')].map(e => ({ inBar: Boolean(e.closest('[data-testid="spotify-player-bar"]')), aria: e.getAttribute('aria-label') })),
      full: Boolean(document.querySelector('[data-testid="spotify-full-player"]')),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
