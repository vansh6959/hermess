const { chromium } = require('playwright');
(async () => {
  const h = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const hp = h.contexts()[0].pages()[0];
  await hp.screenshot({ path: 'benchmarks/results/hermes-final.png' });
  const s = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const sp = s.contexts()[0].pages()[0];
  await sp.screenshot({ path: 'benchmarks/results/spotify-final.png' });
  console.log('captured');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
