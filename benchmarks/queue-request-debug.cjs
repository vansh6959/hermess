const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages()[0];
  let capture = null;
  p.on('request', (req) => {
    try {
      if (req.method() === 'PUT' && req.url().includes('/me/player/play')) {
        const body = req.postDataJSON();
        capture = {
          url: req.url(),
          uris: Array.isArray(body?.uris) ? body.uris : null,
          offset: body?.offset,
          contextUri: body?.context_uri || null,
        };
      }
    } catch {}
  });
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(300);
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(300);
  await p.locator('a[aria-label="Library"]').click();
  await sleep(1200);
  await p.getByText('3am', { exact: true }).first().click();
  await sleep(1000);
  const dialogText = await p.evaluate(() => (document.querySelector('[role="dialog"]')?.innerText || '').slice(0, 700));
  const searchValue = await p.evaluate(() => document.querySelector('[role="dialog"] input')?.value ?? null);
  const play = p.locator('[role="dialog"] button[aria-label="Play 3am"]').first();
  await play.click();
  await sleep(2500);
  const body = await p.evaluate(() => (document.body.innerText || '').slice(0, 500));
  let summary = null;
  if (capture?.uris) {
    const ids = capture.uris;
    const unique = new Set(ids);
    summary = {
      url: capture.url,
      count: ids.length,
      unique: unique.size,
      first: ids.slice(0, 8),
      last: ids.slice(-3),
      offset: capture.offset,
      contextUri: capture.contextUri,
    };
  }
  console.log(JSON.stringify({ dialogText, searchValue, capture: summary, body }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
