const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const baseUrl = 'http://localhost:8090';
  const shotDir = path.join(__dirname, '..', 'test-shots');
  const fs = require('fs');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir);

  console.log('1. Loading main page...');
  await page.goto(baseUrl);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(shotDir, '01-main.png') });
  console.log('   -> 01-main.png');

  // Roll 2D6
  console.log('2. Rolling 2D6...');
  await page.click('#roll-btn');
  await page.waitForTimeout(500); // modal opens
  await page.screenshot({ path: path.join(shotDir, '02-rolling.png') });
  console.log('   -> 02-rolling.png (mid-roll)');

  await page.waitForTimeout(3500); // wait for animation + alignment
  await page.screenshot({ path: path.join(shotDir, '03-settled-d6.png') });
  console.log('   -> 03-settled-d6.png (after settle + align)');

  await page.waitForTimeout(2000); // wait for result overlay
  await page.screenshot({ path: path.join(shotDir, '04-result-d6.png') });
  console.log('   -> 04-result-d6.png (result overlay)');

  // Close modal
  await page.click('#result-close-btn');
  await page.waitForTimeout(500);

  // Roll 3D20
  console.log('3. Setting D20 x3...');
  await page.selectOption('#dice-type', '20');
  await page.fill('#dice-count', '3');
  await page.waitForTimeout(300);

  console.log('4. Rolling 3D20...');
  await page.click('#roll-btn');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, '05-rolling-d20.png') });
  console.log('   -> 05-rolling-d20.png');

  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(shotDir, '06-settled-d20.png') });
  console.log('   -> 06-settled-d20.png');

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(shotDir, '07-result-d20.png') });
  console.log('   -> 07-result-d20.png');

  await page.click('#result-close-btn');
  await page.waitForTimeout(500);

  // Roll 1D8
  console.log('5. Setting D8 x1...');
  await page.selectOption('#dice-type', '8');
  await page.fill('#dice-count', '1');
  await page.click('#roll-btn');
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(shotDir, '08-settled-d8.png') });
  console.log('   -> 08-settled-d8.png');

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(shotDir, '09-result-d8.png') });
  console.log('   -> 09-result-d8.png');

  await page.click('#result-close-btn');
  await page.waitForTimeout(500);

  // Roll 5D6 for grid layout
  console.log('6. Setting D6 x5...');
  await page.selectOption('#dice-type', '6');
  await page.fill('#dice-count', '5');
  await page.click('#roll-btn');
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(shotDir, '10-settled-5d6.png') });
  console.log('   -> 10-settled-5d6.png');

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(shotDir, '11-result-5d6.png') });
  console.log('   -> 11-result-5d6.png');

  console.log('\nDone! Screenshots in test-shots/');
  await browser.close();
})();
