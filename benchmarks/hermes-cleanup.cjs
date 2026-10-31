const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  const dialogs = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10}).map(e=>e.getAttribute('aria-label')||e.textContent.slice(0,80)));
  console.log('dialogs', JSON.stringify(dialogs));
  const close = p.getByRole('button', { name: /^Close / }).first();
  if (await close.count()) { await close.click(); await p.waitForTimeout(500); }
  const visible = p.locator('[data-testid="siri-play"]:visible');
  const n = await visible.count();
  for (let i = 0; i < n; i += 1) {
    const label = await visible.nth(i).getAttribute('aria-label');
    if (/pause/i.test(label || '')) { await visible.nth(i).click(); await p.waitForTimeout(800); break; }
  }
  const after = await p.evaluate(() => ({
    dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10}).map(e=>e.getAttribute('aria-label')||e.textContent.slice(0,60)),
    siri: [...document.querySelectorAll('[data-testid="siri-play"]')].map(e=>({aria:e.getAttribute('aria-label'),playing:e.getAttribute('data-playing')})),
    body: (document.body.innerText||'').slice(-300),
  }));
  console.log(JSON.stringify(after,null,2));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
