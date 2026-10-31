const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  const before = await p.evaluate(() => ({
    siri: [...document.querySelectorAll('[data-testid="siri-play"]')].map(e => e.getAttribute('aria-label')),
    body: (document.body.innerText || '').slice(0, 400),
  }));
  const target = p.locator('[data-testid="siri-play"]').filter({ has: p.locator('xpath=.') });
  const visible = p.locator('[data-testid="siri-play"]:visible');
  const count = await visible.count();
  for (let i = 0; i < count; i += 1) {
    const label = await visible.nth(i).getAttribute('aria-label');
    if (/pause/i.test(label || '')) { await visible.nth(i).click(); break; }
  }
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({
    siri: [...document.querySelectorAll('[data-testid="siri-play"]')].map(e => e.getAttribute('aria-label')),
    body: (document.body.innerText || '').slice(0, 400),
  }));
  console.log(JSON.stringify({ before, after }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
