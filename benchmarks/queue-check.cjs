const { chromium } = require('playwright');
(async () => {
  const s = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const sp = s.contexts()[0].pages()[0];
  const q = sp.locator('[data-testid="control-button-queue"]');
  if (await q.count()) { await q.click(); await sp.waitForTimeout(1200); }
  const spotify = await sp.evaluate(() => ({
    body: (document.body.innerText || '').slice(0, 1400),
    panels: [...document.querySelectorAll('[data-testid*="queue" i],[class*="queue" i],[role="dialog"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; }).slice(0, 8).map(e => ({ testid: e.getAttribute('data-testid'), text: (e.textContent || '').trim().slice(0, 600) })),
    now: (document.querySelector('[data-testid="now-playing-widget-v2"]')?.textContent || '').trim(),
  }));
  const h = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const hp = h.contexts()[0].pages()[0];
  const hermes = await hp.evaluate(() => ({
    body: (document.body.innerText || '').slice(0, 800),
    full: Boolean(document.querySelector('[data-testid="spotify-full-player"]')),
  }));
  console.log(JSON.stringify({ spotify, hermes }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
