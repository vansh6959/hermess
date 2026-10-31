const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  const before = await p.evaluate(() => ({
    np: (document.querySelector('[data-testid="now-playing-widget-v2"]')?.textContent || '').trim(),
    lyricsBtn: document.querySelector('[data-testid="lyrics-button"]')?.outerHTML?.slice(0, 300) || null,
    queueBtn: Boolean(document.querySelector('[data-testid="control-button-queue"]')),
  }));
  const lyricsBtn = p.locator('[data-testid="lyrics-button"]');
  if (await lyricsBtn.count()) { await lyricsBtn.click(); await p.waitForTimeout(2500); }
  const lyrics = await p.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 5 && r.height > 5; };
    return {
      body: (document.body.innerText || '').slice(0, 900),
      panels: [...document.querySelectorAll('[data-testid*="lyric" i],[class*="lyric" i],[role="dialog"]')].filter(vis).slice(0, 12).map(e => ({ tag: e.tagName, testid: e.getAttribute('data-testid'), cls: e.className.toString().slice(0, 80), text: (e.textContent || '').trim().slice(0, 200) })),
      buttons: [...document.querySelectorAll('[data-testid="lyrics-button"]')].map(e => ({ pressed: e.getAttribute('aria-pressed'), expanded: e.getAttribute('aria-expanded'), label: e.getAttribute('aria-label') })),
    };
  });
  const queueBtn = p.locator('[data-testid="control-button-queue"]');
  if (await queueBtn.count()) { await queueBtn.click(); await p.waitForTimeout(1500); }
  const queue = await p.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 5 && r.height > 5; };
    return {
      body: (document.body.innerText || '').slice(0, 900),
      panels: [...document.querySelectorAll('[data-testid*="queue" i],[class*="queue" i],[role="dialog"]')].filter(vis).slice(0, 12).map(e => ({ tag: e.tagName, testid: e.getAttribute('data-testid'), cls: e.className.toString().slice(0, 80), text: (e.textContent || '').trim().slice(0, 200) })),
    };
  });
  console.log(JSON.stringify({ before, lyrics, queue }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
