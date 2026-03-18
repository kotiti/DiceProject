const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const shotDir = path.join(__dirname, '..', 'test-shots');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir);

  // Test on both desktop and mobile-like viewport
  const configs = [
    { name: 'desktop', width: 1280, height: 900, deviceScaleFactor: 1 },
    { name: 'mobile', width: 375, height: 667, deviceScaleFactor: 2, isMobile: true },
  ];

  for (const cfg of configs) {
    console.log(`\n===== ${cfg.name.toUpperCase()} (${cfg.width}x${cfg.height}) =====`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: cfg.deviceScaleFactor || 1,
      isMobile: cfg.isMobile || false,
    });
    const page = await context.newPage();

    // Collect performance metrics
    await page.goto('http://localhost:8090');
    await page.waitForTimeout(2000);

    // Measure initial page load
    const loadMetrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      let totalSize = 0;
      let gltfTime = 0;
      let pathsTime = 0;
      resources.forEach(r => {
        totalSize += r.transferSize || 0;
        if (r.name.includes('scene.gltf') || r.name.includes('scene.bin'))
          gltfTime = Math.max(gltfTime, r.responseEnd - r.startTime);
        if (r.name.includes('paths.js'))
          pathsTime = r.responseEnd - r.startTime;
      });
      return {
        domReady: Math.round(perf.domContentLoadedEventEnd - perf.startTime),
        loadComplete: Math.round(perf.loadEventEnd - perf.startTime),
        resourceCount: resources.length,
        totalTransferKB: Math.round(totalSize / 1024),
        gltfLoadMs: Math.round(gltfTime),
        pathsLoadMs: Math.round(pathsTime),
      };
    });
    console.log('Page Load:', loadMetrics);

    // Measure FPS during dice roll
    await page.selectOption('#dice-type', '6');
    await page.fill('#dice-count', '5');
    await page.waitForTimeout(500);

    // Start FPS measurement
    await page.evaluate(() => {
      window._fpsFrames = [];
      window._fpsLast = performance.now();
      window._fpsRAF = function() {
        const now = performance.now();
        window._fpsFrames.push(now - window._fpsLast);
        window._fpsLast = now;
        if (window._fpsMeasuring) requestAnimationFrame(window._fpsRAF);
      };
      window._fpsMeasuring = true;
      requestAnimationFrame(window._fpsRAF);
    });

    await page.click('#roll-btn');
    await page.waitForTimeout(4500); // full animation

    const fpsData = await page.evaluate(() => {
      window._fpsMeasuring = false;
      const frames = window._fpsFrames;
      if (frames.length < 10) return { error: 'not enough frames' };
      const sorted = frames.slice().sort((a,b) => a-b);
      const avg = frames.reduce((s,v) => s+v, 0) / frames.length;
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const fps = 1000 / avg;
      const minFps = 1000 / p99;
      return {
        totalFrames: frames.length,
        avgFrameMs: Math.round(avg * 10) / 10,
        avgFps: Math.round(fps),
        p50Ms: Math.round(p50 * 10) / 10,
        p95Ms: Math.round(p95 * 10) / 10,
        p99Ms: Math.round(p99 * 10) / 10,
        minFps: Math.round(minFps),
        droppedFrames: frames.filter(f => f > 33).length,
      };
    });
    console.log('FPS (5D6 roll):', fpsData);

    // Memory usage
    const memory = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
          totalHeapMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
        };
      }
      return { note: 'performance.memory not available' };
    });
    console.log('Memory:', memory);

    // Measure Three.js renderer info
    const rendererInfo = await page.evaluate(() => {
      // Access the Three.js renderer through the global scope
      // Since app.js is in an IIFE, we can't access directly.
      // Instead, measure DOM/canvas size
      const canvas = document.querySelector('canvas');
      return {
        canvasWidth: canvas ? canvas.width : 0,
        canvasHeight: canvas ? canvas.height : 0,
        pixelRatio: window.devicePixelRatio,
      };
    });
    console.log('Renderer:', rendererInfo);

    // Test with 10 dice (max)
    try { await page.click('#result-close-btn', { timeout: 2000 }); } catch(e) {}
    await page.waitForTimeout(300);
    await page.fill('#dice-count', '10');

    await page.evaluate(() => {
      window._fpsFrames = [];
      window._fpsLast = performance.now();
      window._fpsMeasuring = true;
      requestAnimationFrame(window._fpsRAF);
    });

    await page.click('#roll-btn');
    await page.waitForTimeout(4500);

    const fps10 = await page.evaluate(() => {
      window._fpsMeasuring = false;
      const frames = window._fpsFrames;
      if (frames.length < 10) return { error: 'not enough frames' };
      const avg = frames.reduce((s,v) => s+v, 0) / frames.length;
      const sorted = frames.slice().sort((a,b) => a-b);
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      return {
        totalFrames: frames.length,
        avgFps: Math.round(1000 / avg),
        p99Ms: Math.round(p99 * 10) / 10,
        minFps: Math.round(1000 / p99),
        droppedFrames: frames.filter(f => f > 33).length,
      };
    });
    console.log('FPS (10D6 roll):', fps10);

    await browser.close();
  }

  console.log('\n===== ASSET SIZES =====');
  const assetDir = path.join(__dirname, '..');
  const files = [
    'js/app.js', 'js/paths.js', 'css/style.css', 'index.html',
    'assets/scene.gltf', 'assets/scene.bin',
    'assets/textures/dice_00_baseColor.png', 'assets/textures/dice_01_baseColor.png',
    'assets/textures/dice_01_normal.png', 'assets/textures/dice_01_metallicRoughness.png',
  ];
  let total = 0;
  for (const f of files) {
    const fp = path.join(assetDir, f);
    if (fs.existsSync(fp)) {
      const size = fs.statSync(fp).size;
      total += size;
      console.log(`  ${f}: ${(size/1024).toFixed(1)} KB`);
    }
  }
  console.log(`  TOTAL: ${(total/1024).toFixed(1)} KB`);
})();
