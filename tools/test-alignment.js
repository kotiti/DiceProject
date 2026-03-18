const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const baseUrl = 'http://localhost:8090';
  const shotDir = path.join(__dirname, '..', 'test-shots');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir);

  await page.goto(baseUrl);
  await page.waitForTimeout(1000);

  // Test each die type: D6, D8, D12, D20 — roll 3 times each
  const types = ['6', '8', '12', '20'];

  for (const t of types) {
    await page.selectOption('#dice-type', t);
    await page.fill('#dice-count', '3');
    await page.waitForTimeout(200);

    for (let roll = 1; roll <= 2; roll++) {
      console.log(`Rolling 3D${t}, attempt ${roll}...`);
      await page.click('#roll-btn');
      await page.waitForTimeout(5500); // animation + alignment + wait
      await page.screenshot({ path: path.join(shotDir, `align-d${t}-${roll}.png`) });
      console.log(`  -> align-d${t}-${roll}.png`);

      // Close result overlay if visible
      try {
        await page.click('#result-close-btn', { timeout: 2000 });
      } catch (e) {
        await page.click('#modal-close', { timeout: 1000 }).catch(() => {});
      }
      await page.waitForTimeout(500);
    }
  }

  console.log('\nDone!');
  await browser.close();
})();
