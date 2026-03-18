const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const baseUrl = 'http://localhost:8090';
  const shotDir = path.join(__dirname, '..', 'test-shots');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir);

  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
  });

  await page.goto(baseUrl);
  await page.waitForTimeout(2000);

  // Test each skin
  const skins = ['dice_00', 'dice_01', 'dice_02', 'dice_03'];
  for (const skin of skins) {
    console.log(`Testing skin: ${skin}`);
    await page.selectOption('#dice-skin', skin);
    await page.selectOption('#dice-type', '6');
    await page.fill('#dice-count', '2');
    await page.waitForTimeout(200);

    await page.click('#roll-btn');
    await page.waitForTimeout(5500);
    await page.screenshot({ path: path.join(shotDir, `gltf-${skin}.png`) });
    console.log(`  -> gltf-${skin}.png`);

    try { await page.click('#result-close-btn', { timeout: 2000 }); }
    catch(e) { await page.click('#modal-close', { timeout: 1000 }).catch(() => {}); }
    await page.waitForTimeout(500);
  }

  console.log('\nDone!');
  await browser.close();
})();
