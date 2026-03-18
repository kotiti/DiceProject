/**
 * Pre-baked Dice Path Generator
 * Run: node tools/generate-paths.js
 * Output: js/paths.js
 *
 * Generates pure-physics trajectories for dice rolling animations.
 * For each dice count (1-10), generates multiple path sets.
 * Each path is a series of [x, z] coordinates at fixed FPS.
 * No steering forces — runs many random trials, picks the one
 * that naturally ends closest to the target grid position.
 */

const fs = require("fs");
const path = require("path");

// ===================== CONFIGURABLE PARAMETERS =====================
// These can be changed when tray design changes, then re-run this script.

const CONFIG = {
  trayRadius: 5.5,       // inner radius of the dice tray
  wallBounce: 0.65,      // velocity multiplier on wall bounce
  frictionMin: 0.988,    // min friction per step (randomized per trial)
  frictionMax: 0.996,    // max friction per step
  speedMin: 6,           // min initial speed
  speedMax: 16,          // max initial speed
  aimSpread: 3.0,        // radians of random spread in initial aim
  animDuration: 3.3,     // seconds of animation
  pathFps: 20,           // stored frames per second (interpolate on playback)
  setsPerCount: 5,       // path sets per dice count
  maxDice: 10,           // maximum dice count
  trialsPerPath: 80,     // random trials to find best path
  minBounces: 1,         // require at least this many wall bounces
  precision: 2,          // decimal places for stored coordinates
  startRadiusFactor: 0.75, // start position radius as factor of tray radius
  wallCollisionMargin: 0.6, // die radius + margin for wall collision
  gridSpacing: 2.0,      // spacing between dice in grid layout
};

// ===================== GRID POSITIONS =====================

function getGridPositions(count) {
  if (count === 1) return [{ x: 0, z: 0 }];
  if (count === 2) return [{ x: -1.1, z: 0 }, { x: 1.1, z: 0 }];
  if (count === 3) return [{ x: -1.1, z: -0.6 }, { x: 1.1, z: -0.6 }, { x: 0, z: 0.8 }];

  const cols = count <= 4 ? 2 : count <= 6 ? 3 : count <= 9 ? 3 : 5;
  const rows = Math.ceil(count / cols);
  const spacing = CONFIG.gridSpacing;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const colsInRow = (row === rows - 1) ? (count - row * cols) : cols;
    positions.push({
      x: (col - (colsInRow - 1) / 2) * spacing,
      z: (row - (rows - 1) / 2) * spacing
    });
  }
  return positions;
}

// ===================== SINGLE PATH SIMULATION =====================

function simulateOnePath(startX, startZ, targetX, targetZ) {
  const steps = Math.ceil(CONFIG.animDuration * CONFIG.pathFps);
  const dt = 1 / CONFIG.pathFps;
  const wallR = CONFIG.trayRadius - CONFIG.wallCollisionMargin;
  const p = CONFIG.precision;
  let bestPath = null;
  let bestError = Infinity;

  for (let attempt = 0; attempt < CONFIG.trialsPerPath; attempt++) {
    const pathData = [];
    let x = startX, z = startZ;

    // Random initial velocity
    const aimAngle = Math.atan2(-startZ, -startX) + (Math.random() - 0.5) * CONFIG.aimSpread;
    const speed = CONFIG.speedMin + Math.random() * (CONFIG.speedMax - CONFIG.speedMin);
    let vx = Math.cos(aimAngle) * speed;
    let vz = Math.sin(aimAngle) * speed;
    const friction = CONFIG.frictionMin + Math.random() * (CONFIG.frictionMax - CONFIG.frictionMin);
    let bounceCount = 0;

    for (let i = 0; i <= steps; i++) {
      pathData.push([
        parseFloat(x.toFixed(p)),
        parseFloat(z.toFixed(p))
      ]);

      // Pure physics integration
      x += vx * dt;
      z += vz * dt;

      // Wall bounce (circle)
      const d = Math.sqrt(x * x + z * z);
      if (d > wallR && d > 0.001) {
        const nx = x / d, nz = z / d;
        x = nx * wallR;
        z = nz * wallR;
        const dot = vx * nx + vz * nz;
        if (dot > 0) {
          vx -= 2 * dot * nx;
          vz -= 2 * dot * nz;
          vx *= CONFIG.wallBounce;
          vz *= CONFIG.wallBounce;
          bounceCount++;
        }
      }

      // Surface friction only
      vx *= friction;
      vz *= friction;
    }

    // Must have minimum bounces
    if (bounceCount < CONFIG.minBounces) continue;

    // Score by distance to target
    const endX = pathData[pathData.length - 1][0];
    const endZ = pathData[pathData.length - 1][1];
    const error = Math.sqrt((endX - targetX) ** 2 + (endZ - targetZ) ** 2);

    if (error < bestError) {
      bestError = error;
      bestPath = pathData;
    }
  }

  // Fallback
  if (!bestPath) {
    bestPath = [];
    const steps2 = Math.ceil(CONFIG.animDuration * CONFIG.pathFps);
    for (let i = 0; i <= steps2; i++) {
      const t = i / steps2;
      bestPath.push([
        parseFloat((startX + (targetX - startX) * t).toFixed(p)),
        parseFloat((startZ + (targetZ - startZ) * t).toFixed(p))
      ]);
    }
  }

  // Micro-correction with t^5 weight (invisible)
  const errX = targetX - bestPath[bestPath.length - 1][0];
  const errZ = targetZ - bestPath[bestPath.length - 1][1];
  for (let j = 0; j < bestPath.length; j++) {
    const w = Math.pow(j / (bestPath.length - 1), 5);
    bestPath[j][0] = parseFloat((bestPath[j][0] + errX * w).toFixed(p));
    bestPath[j][1] = parseFloat((bestPath[j][1] + errZ * w).toFixed(p));
  }

  return { path: bestPath, error: bestError };
}

// ===================== GENERATE ALL =====================

function generateAll() {
  const allPaths = {};
  let totalPaths = 0;
  let totalError = 0;
  let maxError = 0;

  for (let count = 1; count <= CONFIG.maxDice; count++) {
    allPaths[count] = [];
    const gridPositions = getGridPositions(count);

    for (let set = 0; set < CONFIG.setsPerCount; set++) {
      const pathSet = [];

      for (let d = 0; d < count; d++) {
        // Start at tray edge, spaced evenly
        const startAngle = (d / count) * Math.PI * 2 + set * 0.7 + Math.random() * 0.5;
        const startR = CONFIG.trayRadius * CONFIG.startRadiusFactor;
        const startX = Math.cos(startAngle) * startR;
        const startZ = Math.sin(startAngle) * startR;

        const result = simulateOnePath(startX, startZ, gridPositions[d].x, gridPositions[d].z);
        pathSet.push(result.path);
        totalPaths++;
        totalError += result.error;
        maxError = Math.max(maxError, result.error);
      }

      allPaths[count].push(pathSet);
    }

    process.stderr.write(`  Count ${count}: ${CONFIG.setsPerCount} sets generated\n`);
  }

  process.stderr.write(`\nTotal: ${totalPaths} paths\n`);
  process.stderr.write(`Avg error: ${(totalError / totalPaths).toFixed(3)} units\n`);
  process.stderr.write(`Max error: ${maxError.toFixed(3)} units\n`);

  return allPaths;
}

// ===================== MAIN =====================

process.stderr.write("Generating pre-baked dice paths...\n");
process.stderr.write(`Config: ${CONFIG.trialsPerPath} trials/path, ${CONFIG.pathFps}fps, ${CONFIG.animDuration}s\n\n`);

const allPaths = generateAll();

// Write as JS module
const gridPositions = {};
for (let c = 1; c <= CONFIG.maxDice; c++) {
  gridPositions[c] = getGridPositions(c);
}

const output = `// Auto-generated by tools/generate-paths.js
// Re-run: node tools/generate-paths.js
// Format: PREBAKED_PATHS[diceCount][setIndex][dieIndex] = [[x,z], ...]
//
// Config used:
//   trayRadius: ${CONFIG.trayRadius}
//   animDuration: ${CONFIG.animDuration}s
//   pathFps: ${CONFIG.pathFps}
//   setsPerCount: ${CONFIG.setsPerCount}
//   trialsPerPath: ${CONFIG.trialsPerPath}

var PREBAKED_PATHS = ${JSON.stringify(allPaths)};

var PREBAKED_GRID = ${JSON.stringify(gridPositions)};

var PATH_CONFIG = {
  fps: ${CONFIG.pathFps},
  duration: ${CONFIG.animDuration}
};
`;

const outPath = path.join(__dirname, "..", "js", "paths.js");
fs.writeFileSync(outPath, output, "utf-8");
process.stderr.write(`\nWritten to: ${outPath}\n`);
process.stderr.write(`File size: ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB\n`);
