const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  const info = await p.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      url: location.href,
      body: (document.body.innerText || '').slice(-500),
      controls: [...document.querySelectorAll('[aria-label]')]
        .filter((e) => visible(e) && /play current|pause current|next track|previous track|open full player|seek in current|queue|lyrics/i.test(e.getAttribute('aria-label') || ''))
        .map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName, aria: e.getAttribute('aria-label'), testid: e.getAttribute('data-testid'), x: r.x, y: r.y, w: r.width, h: r.height }; }),
      siri: [...document.querySelectorAll('[data-testid="siri-play"]')].filter(visible).map(e => ({ aria: e.getAttribute('aria-label'), playing: e.getAttribute('data-playing'), testid: e.getAttribute('data-testid') })),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
