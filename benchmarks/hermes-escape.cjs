const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  for (let i = 0; i < 3; i += 1) { await p.keyboard.press('Escape'); await p.waitForTimeout(350); }
  const visible = p.locator('[data-testid="siri-play"]:visible');
  const n = await visible.count();
  for (let i = 0; i < n; i += 1) {
    const label = await visible.nth(i).getAttribute('aria-label');
    if (/pause/i.test(label || '')) { await visible.nth(i).click(); await p.waitForTimeout(900); break; }
  }
  const state = await p.evaluate(() => ({
    dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10}).map(e=>e.getAttribute('aria-label')||e.textContent.slice(0,50)),
    siri: [...document.querySelectorAll('[data-testid="siri-play"]')].map(e=>({aria:e.getAttribute('aria-label'),playing:e.getAttribute('data-playing')})),
    body: (document.body.innerText||'').slice(0,400),
  }));
  console.log(JSON.stringify(state,null,2));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
