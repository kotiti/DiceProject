(function () {
  "use strict";

  // ===================== SKINS =====================
  const SKINS = {
    classic: {
      name: "클래식",
      colors: { 4: 0xe74c3c, 6: 0x3498db, 8: 0x2ecc71, 12: 0x9b59b6, 15: 0xe67e22, 20: 0xf1c40f },
      textColor: "#ffffff", roughness: 0.4, metalness: 0.1,
      trayFloor: 0x1b4332, trayRim: 0x3e2723
    },
    neon: {
      name: "네온",
      colors: { 4: 0xff0066, 6: 0x00ffcc, 8: 0xff6600, 12: 0xcc00ff, 15: 0x00ccff, 20: 0xffff00 },
      textColor: "#ffffff", roughness: 0.2, metalness: 0.5,
      trayFloor: 0x080818, trayRim: 0x1a1a3e
    },
    wooden: {
      name: "우드",
      colors: { 4: 0x8b4513, 6: 0xa0522d, 8: 0xd2691e, 12: 0xcd853f, 15: 0xdeb887, 20: 0xf4a460 },
      textColor: "#1a1a1a", roughness: 0.8, metalness: 0.0,
      trayFloor: 0x2d1810, trayRim: 0x5c3a21
    },
    metal: {
      name: "메탈",
      colors: { 4: 0x8888aa, 6: 0x9999bb, 8: 0x7777aa, 12: 0xaaaacc, 15: 0x6666aa, 20: 0xbbbbdd },
      textColor: "#111122", roughness: 0.15, metalness: 0.9,
      trayFloor: 0x1a1a22, trayRim: 0x333344
    },
    galaxy: {
      name: "갤럭시",
      colors: { 4: 0x6a00b0, 6: 0x0060d0, 8: 0x008080, 12: 0xb00060, 15: 0x0080c0, 20: 0x8000b0 },
      textColor: "#ffffff", roughness: 0.3, metalness: 0.4,
      trayFloor: 0x06060f, trayRim: 0x1a1a3e
    }
  };

  // ===================== CONSTANTS =====================
  const DICE_FACES = { D4: 4, D6: 6, D8: 8, D12: 12, D15: 15, D20: 20 };
  const DICE_RADIUS = 0.85;
  const TRAY_HALF = 5.0;  // half-size of square boundary
  const TABLE_Y = 0;
  const WALL_BOUNCE = 0.65;
  const FRICTION = 0.992;
  const ANG_FRICTION = 0.995;
  // Animation phases
  const PHASE_CHAOS_END = 1.8;      // wild bouncing
  const PHASE_CONVERGE_END = 2.8;   // moving toward grid
  const PHASE_SNAP_END = 3.2;       // final flip & snap
  const ANIM_DONE = 3.3;

  // ===================== STATE =====================
  let scene, camera, renderer;
  let trayGroup;
  let activeDice = [];
  let isAnimating = false;
  let animStartTime = 0;
  let preResults = [];
  let currentSkin = "classic";
  let sceneReady = false;
  let lastTimestamp = 0;

  // DOM refs
  const modal = document.getElementById("dice-modal");
  const modalOverlay = document.getElementById("modal-overlay");
  const modalClose = document.getElementById("modal-close");
  const modalTitle = document.getElementById("modal-title");
  const canvasContainer = document.getElementById("canvas-container");
  const resultOverlay = document.getElementById("result-overlay");
  const resultBadges = document.getElementById("result-badges");
  const resultTotal = document.getElementById("result-total");
  const resultCloseBtn = document.getElementById("result-close-btn");
  const rollBtn = document.getElementById("roll-btn");
  const diceTypeSelect = document.getElementById("dice-type");
  const diceCountInput = document.getElementById("dice-count");
  const skinSelect = document.getElementById("dice-skin");
  const historyEl = document.getElementById("history");
  const skinPreview = document.getElementById("skin-preview");
  const countUp = document.getElementById("count-up");
  const countDown = document.getElementById("count-down");

  // ===================== SCENE SETUP =====================
  function initScene() {
    scene = new THREE.Scene();
    scene.background = null; // transparent — modal is the backdrop

    // Top-down camera (BG3-style, nearly straight down with tiny tilt)
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 18, 0.8);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);
    resizeRenderer();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xfff5e0, 0.7);
    dir.position.set(3, 14, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 30;
    dir.shadow.camera.left = -8;
    dir.shadow.camera.right = 8;
    dir.shadow.camera.top = 8;
    dir.shadow.camera.bottom = -8;
    scene.add(dir);

    const fill = new THREE.PointLight(0xc9a84c, 0.3, 20);
    fill.position.set(-4, 10, -4);
    scene.add(fill);

    buildTray();
    sceneReady = true;
  }

  function resizeRenderer() {
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ===================== INVISIBLE FLOOR (shadow catcher) =====================
  function buildTray() {
    if (trayGroup) scene.remove(trayGroup);
    trayGroup = new THREE.Group();

    // Invisible floor that only receives shadows
    var floorGeo = new THREE.PlaneGeometry(TRAY_HALF * 2.5, TRAY_HALF * 2.5);
    var floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = TABLE_Y - 0.01;
    floor.receiveShadow = true;
    trayGroup.add(floor);

    scene.add(trayGroup);
  }

  // ===================== FACE TEXTURE (D6 - solid background) =====================
  function createFaceTexture(number, hexColor, textColor, size) {
    size = size || 256;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const r = (hexColor >> 16) & 255, g = (hexColor >> 8) & 255, b = hexColor & 255;
    ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    ctx.fillRect(0, 0, size, size);

    // Subtle gradient for depth
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.7);
    grad.addColorStop(0, "rgba(255,255,255,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0.15)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Number
    ctx.fillStyle = textColor;
    ctx.font = "bold " + (size * 0.45) + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(String(number), size/2, size/2);

    // Underline 6 and 9
    if (number === 6 || number === 9) {
      const w = ctx.measureText(String(number)).width;
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(size/2 - w/2, size/2 + size*0.25);
      ctx.lineTo(size/2 + w/2, size/2 + size*0.25);
      ctx.stroke();
    }
    return canvas;
  }

  // ===================== FACE TEXTURE (non-D6 - transparent bg with circle) =====================
  function createPlaneTexture(number, bgColor, textColor, size) {
    size = size || 256;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Transparent background
    ctx.clearRect(0, 0, size, size);

    // Semi-transparent circle background for readability
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Number
    ctx.fillStyle = textColor;
    ctx.font = "bold " + (size * 0.5) + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), size / 2, size / 2);

    // Underline 6 and 9
    if (number === 6 || number === 9) {
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 3;
      const w = ctx.measureText(String(number)).width;
      ctx.beginPath();
      ctx.moveTo(size / 2 - w / 2, size / 2 + size * 0.22);
      ctx.lineTo(size / 2 + w / 2, size / 2 + size * 0.22);
      ctx.stroke();
    }

    return canvas;
  }

  // ===================== COMPUTE FACE RADIUS =====================
  function computeFaceRadius(geo, group) {
    const pos = geo.getAttribute("position");
    let maxDist = 0;
    for (let ti = 0; ti < group.tris.length; ti++) {
      const triIdx = group.tris[ti];
      for (let v = 0; v < 3; v++) {
        const vi = triIdx * 3 + v;
        const vPos = new THREE.Vector3().fromBufferAttribute(pos, vi);
        const dist = vPos.distanceTo(group.center);
        if (dist > maxDist) maxDist = dist;
      }
    }
    return maxDist;
  }

  // ===================== GEOMETRY BUILDERS =====================
  function buildGeometry(sides) {
    switch (sides) {
      case 4:  return new THREE.TetrahedronGeometry(DICE_RADIUS * 1.2);
      case 6:  return new THREE.BoxGeometry(DICE_RADIUS*1.3, DICE_RADIUS*1.3, DICE_RADIUS*1.3);
      case 8:  return new THREE.OctahedronGeometry(DICE_RADIUS * 1.1);
      case 12: return new THREE.DodecahedronGeometry(DICE_RADIUS * 1.1);
      case 15: return new THREE.CylinderGeometry(DICE_RADIUS*0.9, DICE_RADIUS*0.9, DICE_RADIUS, 15);
      case 20: return new THREE.IcosahedronGeometry(DICE_RADIUS * 1.1);
      default: return new THREE.BoxGeometry(DICE_RADIUS*1.3, DICE_RADIUS*1.3, DICE_RADIUS*1.3);
    }
  }

  // ===================== FACE NORMALS & GROUPING =====================
  function computeTriNormals(geo) {
    const pos = geo.getAttribute("position");
    const normals = [], centers = [];
    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i+1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i+2);
      const n = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      ).normalize();
      normals.push(n);
      centers.push(new THREE.Vector3((a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3,(a.z+b.z+c.z)/3));
    }
    return { normals, centers };
  }

  function groupCoplanar(normals, centers, tol) {
    const groups = [];
    for (let i = 0; i < normals.length; i++) {
      let found = false;
      for (const g of groups) {
        if (normals[i].distanceTo(g.normal) < tol && centers[i].distanceTo(g.center) < 2) {
          const n = g.tris.length + 1;
          g.center.multiplyScalar((n-1)/n).addScaledVector(centers[i], 1/n);
          g.tris.push(i);
          found = true;
          break;
        }
      }
      if (!found) groups.push({ normal: normals[i].clone(), center: centers[i].clone(), tris: [i] });
    }
    return groups;
  }

  // ===================== FACE QUATERNION MAP =====================
  function quatAlignUp(normal) {
    return new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0,1,0));
  }

  const faceQuatCache = {};

  function getFaceQuat(dieType, value) {
    if (!faceQuatCache[dieType]) faceQuatCache[dieType] = buildFaceQuats(dieType);
    return faceQuatCache[dieType][value] || new THREE.Quaternion();
  }

  function buildFaceQuats(dieType) {
    const result = {};
    const sides = DICE_FACES[dieType];

    if (dieType === "D6") {
      const map = {
        1: [1,0,0], 6: [-1,0,0], 2: [0,1,0], 5: [0,-1,0], 3: [0,0,1], 4: [0,0,-1]
      };
      for (let v = 1; v <= 6; v++)
        result[v] = quatAlignUp(new THREE.Vector3(...map[v]));
      return result;
    }

    let geo = buildGeometry(sides);
    if (geo.index) geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    const data = computeTriNormals(geo);

    if (dieType === "D15") {
      const groups = groupCoplanar(data.normals, data.centers, 0.05);
      const sides15 = groups.filter(g => Math.abs(g.normal.y) < 0.3)
        .sort((a,b) => Math.atan2(a.normal.z,a.normal.x) - Math.atan2(b.normal.z,b.normal.x));
      for (let v = 1; v <= 15; v++) {
        const idx = (v-1) % sides15.length;
        result[v] = quatAlignUp(sides15[idx] ? sides15[idx].normal : new THREE.Vector3(1,0,0));
      }
    } else {
      let tol = 0.05;
      let groups = groupCoplanar(data.normals, data.centers, tol);
      if (groups.length > sides) groups = groupCoplanar(data.normals, data.centers, 0.15);
      if (groups.length > sides) groups = groupCoplanar(data.normals, data.centers, 0.3);
      groups.sort((a,b) => {
        if (Math.abs(a.normal.y - b.normal.y) > 0.001) return b.normal.y - a.normal.y;
        if (Math.abs(a.normal.x - b.normal.x) > 0.001) return a.normal.x - b.normal.x;
        return a.normal.z - b.normal.z;
      });
      for (let v = 1; v <= sides; v++) {
        const idx = (v-1) % groups.length;
        result[v] = quatAlignUp(groups[idx].normal);
      }
    }
    geo.dispose();
    return result;
  }

  // ===================== DICE MESH CREATION =====================
  function createDieMesh(dieType) {
    const skin = SKINS[currentSkin];
    const sides = DICE_FACES[dieType];
    const color = skin.colors[sides];

    if (dieType === "D6") {
      const geo = buildGeometry(6);
      const order = [1, 6, 2, 5, 3, 4]; // +x -x +y -y +z -z
      const mats = order.map(v => {
        const tex = new THREE.CanvasTexture(createFaceTexture(v, color, skin.textColor));
        tex.minFilter = THREE.LinearFilter;
        return new THREE.MeshStandardMaterial({ map: tex, roughness: skin.roughness, metalness: skin.metalness });
      });
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      return mesh;
    }

    // Non-cube: face-center plane approach
    // Create a solid-color base mesh, then add small number planes on each face
    let geo = buildGeometry(sides);
    if (geo.index) geo = geo.toNonIndexed();
    geo.computeVertexNormals();

    const baseMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: skin.roughness,
      metalness: skin.metalness,
      flatShading: true
    });
    const mesh = new THREE.Mesh(geo, baseMat);
    mesh.castShadow = true;

    // Group coplanar triangles to find logical faces
    const data = computeTriNormals(geo);
    let tol = 0.05;
    let groups = groupCoplanar(data.normals, data.centers, tol);
    if (dieType !== "D15" && groups.length > sides) groups = groupCoplanar(data.normals, data.centers, 0.15);
    if (dieType !== "D15" && groups.length > sides) groups = groupCoplanar(data.normals, data.centers, 0.3);

    let faceGroups;
    if (dieType === "D15") {
      // D15: only the side faces get numbers, filter out top/bottom caps
      const sideG = groups.filter(g => Math.abs(g.normal.y) < 0.3)
        .sort((a, b) => Math.atan2(a.normal.z, a.normal.x) - Math.atan2(b.normal.z, b.normal.x));
      faceGroups = sideG;
    } else {
      groups.sort((a, b) => {
        if (Math.abs(a.normal.y - b.normal.y) > 0.001) return b.normal.y - a.normal.y;
        if (Math.abs(a.normal.x - b.normal.x) > 0.001) return a.normal.x - b.normal.x;
        return a.normal.z - b.normal.z;
      });
      faceGroups = groups.slice(0, sides);
    }

    // Compute CSS background color (slightly darker than die color)
    const cr = (color >> 16) & 255;
    const cg = (color >> 8) & 255;
    const cb = color & 255;
    const bgCSS = "rgba(" + Math.max(0, cr - 40) + "," + Math.max(0, cg - 40) + "," + Math.max(0, cb - 40) + ",0.85)";

    // Create a number plane for each face
    for (let fi = 0; fi < faceGroups.length && fi < sides; fi++) {
      const faceGroup = faceGroups[fi];
      const faceCenter = faceGroup.center.clone();
      const faceNormal = faceGroup.normal.clone().normalize();

      // Compute face radius for plane sizing
      const faceRadius = computeFaceRadius(geo, faceGroup);
      let planeSize = faceRadius * 0.6 * 2; // 60% of face size, diameter
      if (planeSize < 0.25) planeSize = 0.25;

      // Create number texture
      const number = fi + 1;
      const texCanvas = createPlaneTexture(number, bgCSS, skin.textColor, 256);
      const texture = new THREE.CanvasTexture(texCanvas);
      texture.minFilter = THREE.LinearFilter;

      // Create the plane
      const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);
      const planeMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(planeGeo, planeMat);

      // Position at face center + slight offset along normal
      plane.position.copy(faceCenter).addScaledVector(faceNormal, 0.02);

      // Orient: make the plane face outward
      const up = Math.abs(faceNormal.dot(new THREE.Vector3(0, 1, 0))) > 0.99
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
      const lookTarget = faceCenter.clone().add(faceNormal);
      plane.lookAt(lookTarget);

      // Add as child of the die mesh so it rotates with it
      mesh.add(plane);
    }

    return mesh;
  }

  // ===================== REST HEIGHT =====================
  function getRestY(dieType) {
    const map = { D4: 0.4, D6: 0.57, D8: 0.5, D12: 0.65, D15: 0.43, D20: 0.55 };
    return TABLE_Y + DICE_RADIUS * (map[dieType] || 0.57);
  }

  // ===================== GRID LAYOUT =====================
  function getGridPositions(count) {
    // Returns array of {x, z} for each die centered at origin
    if (count === 1) return [{ x: 0, z: 0 }];
    if (count === 2) return [{ x: -1.1, z: 0 }, { x: 1.1, z: 0 }];
    if (count === 3) return [{ x: -1.1, z: -0.6 }, { x: 1.1, z: -0.6 }, { x: 0, z: 0.8 }];

    // Grid layout for 4+
    const cols = count <= 4 ? 2 : count <= 6 ? 3 : count <= 9 ? 3 : 5;
    const rows = Math.ceil(count / cols);
    const spacing = 2.0;
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

  // ===================== EASING =====================
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  // ===================== LOAD PRE-BAKED PATHS =====================
  // Paths loaded from js/paths.js (generated by tools/generate-paths.js or sim-tool.html).
  // No runtime simulation. Format: PREBAKED_PATHS[count][setIdx][dieIdx] = [[x,z], ...]
  function getPrebakedPathSet(diceCount) {
    if (typeof PREBAKED_PATHS === "undefined") return null;
    var sets = PREBAKED_PATHS[diceCount];
    if (!sets || sets.length === 0) return null;
    return sets[Math.floor(Math.random() * sets.length)];
  }

  // ===================== CREATE DIE STATE =====================
  function createDieState(dieType, targetVal, index, total, prebakedPath) {
    var mesh = createDieMesh(dieType);
    var targetQ = getFaceQuat(dieType, targetVal);
    var yRotQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2
    );
    var finalQ = yRotQ.clone().multiply(targetQ);
    var restY = getRestY(dieType);

    var gridPositions = (typeof PREBAKED_GRID !== "undefined" && PREBAKED_GRID[total])
      ? PREBAKED_GRID[total] : getGridPositions(total);
    var gridTarget = gridPositions[index];

    // Path from pre-baked data: [[x,z], ...]
    var path = prebakedPath;

    var startQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2)
    );
    // === Rotation: guaranteed to land on target, NO correction ===
    // Delta from start to target orientation
    var deltaQ = startQuat.clone().conjugate().multiply(finalQ);
    if (deltaQ.w < 0) { deltaQ.x = -deltaQ.x; deltaQ.y = -deltaQ.y; deltaQ.z = -deltaQ.z; deltaQ.w = -deltaQ.w; }
    var deltaAngle = 2 * Math.acos(Math.min(1, deltaQ.w));
    var deltaAxis = new THREE.Vector3(0, 1, 0);
    if (deltaAngle > 0.001) {
      var s = Math.sqrt(1 - deltaQ.w * deltaQ.w);
      deltaAxis.set(deltaQ.x / s, deltaQ.y / s, deltaQ.z / s);
    }

    // Primary tumble: horizontal axis, N full rotations (N×2π = identity at end)
    var rollDir = Math.random() * Math.PI * 2;
    var tumbleAxis = new THREE.Vector3(Math.cos(rollDir), 0, Math.sin(rollDir));
    var tumbleRotations = 15 + Math.floor(Math.random() * 10); // 15-25 full tumbles
    var tumbleTotalAngle = tumbleRotations * Math.PI * 2;

    // Secondary wobble: perpendicular, also full rotations (identity at end)
    var wobbleAxis = new THREE.Vector3(-Math.sin(rollDir), 0.3, Math.cos(rollDir)).normalize();
    var wobbleRotations = 3 + Math.floor(Math.random() * 3);
    var wobbleTotalAngle = wobbleRotations * Math.PI * 2;

    mesh.position.set(path[0][0], restY, path[0][1]);
    mesh.quaternion.copy(startQuat);

    return {
      mesh: mesh, targetQuat: finalQ, startQuat: startQuat.clone(),
      tumbleAxis: tumbleAxis, tumbleTotalAngle: tumbleTotalAngle,
      wobbleAxis: wobbleAxis, wobbleTotalAngle: wobbleTotalAngle,
      deltaAxis: deltaAxis, deltaAngle: deltaAngle,
      gridTarget: gridTarget, path: path, restY: restY, settled: false,
      dieType: dieType, resultValue: targetVal
    };
  }

  // ===================== ANIMATION PLAYBACK =====================
  // Pure parametric. Position from pre-baked path, rotation from math.
  function updatePhysics(dt, elapsed) {
    var duration = (typeof PATH_CONFIG !== "undefined") ? PATH_CONFIG.duration : ANIM_DONE;
    var rawT = Math.min(elapsed / duration, 1.0);

    for (var d = 0; d < activeDice.length; d++) {
      var die = activeDice[d];
      if (die.settled) continue;

      // Shared progress curve for BOTH position and rotation.
      // Both decelerate identically → stop at the same moment.
      // progress = 1 - (1-t)^(p+1), velocity ∝ (1-t)^p → natural deceleration
      var p = 1.5;
      var progress = 1 - Math.pow(1 - rawT, p + 1); // 0→1, decelerating

      // Position: path provides the trajectory shape, progress controls speed
      var pathLen = die.path.length;
      var pathPos = progress * (pathLen - 1);
      var idx = Math.min(Math.floor(pathPos), pathLen - 2);
      var frac = pathPos - idx;
      var px = die.path[idx][0] + (die.path[idx+1][0] - die.path[idx][0]) * frac;
      var pz = die.path[idx][1] + (die.path[idx+1][1] - die.path[idx][1]) * frac;
      die.mesh.position.set(px, die.restY, pz);

      // Rotation: same progress. NO correction. Guaranteed to arrive at target.
      // Tumble (N×2π) = identity, Wobble (M×2π) = identity, Delta = target diff
      // startQ × identity × identity × deltaQ = targetQ ✓

      var tumbleQ = new THREE.Quaternion().setFromAxisAngle(
        die.tumbleAxis, die.tumbleTotalAngle * progress
      );
      var wobbleQ = new THREE.Quaternion().setFromAxisAngle(
        die.wobbleAxis, die.wobbleTotalAngle * progress
      );
      var deltaQ = new THREE.Quaternion().setFromAxisAngle(
        die.deltaAxis, die.deltaAngle * progress
      );

      die.mesh.quaternion.copy(die.startQuat).multiply(tumbleQ).multiply(wobbleQ).multiply(deltaQ);

      if (rawT >= 1.0) {
        die.mesh.position.set(die.gridTarget.x, die.restY, die.gridTarget.z);
        die.mesh.quaternion.copy(die.targetQuat);
        die.settled = true;
      }
    }
  }

  // ===================== MODAL =====================
  function showModal() {
    modal.classList.add("active");
    resultOverlay.classList.add("hidden");
    if (!sceneReady) initScene();
    setTimeout(resizeRenderer, 50);
  }

  function hideModal() {
    modal.classList.remove("active");
    isAnimating = false;
    clearDice();
  }

  function clearDice() {
    for (const d of activeDice) {
      scene.remove(d.mesh);
      // Dispose child number planes (non-D6 dice)
      for (let ci = d.mesh.children.length - 1; ci >= 0; ci--) {
        const child = d.mesh.children[ci];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
        d.mesh.remove(child);
      }
      if (d.mesh.geometry) d.mesh.geometry.dispose();
      if (Array.isArray(d.mesh.material)) {
        d.mesh.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else if (d.mesh.material) {
        if (d.mesh.material.map) d.mesh.material.map.dispose();
        d.mesh.material.dispose();
      }
    }
    activeDice = [];
  }

  // ===================== ROLL =====================
  function rollDice() {
    const sides = parseInt(diceTypeSelect.value);
    let count = parseInt(diceCountInput.value) || 1;
    count = Math.max(1, Math.min(10, count));
    const dieType = "D" + sides;

    // Pre-determine results
    preResults = [];
    for (let i = 0; i < count; i++) {
      preResults.push(Math.floor(Math.random() * sides) + 1);
    }

    // Update skin
    currentSkin = skinSelect.value;
    faceQuatCache[dieType] = null; // reset since skin might need fresh geometry

    // Show modal
    modalTitle.textContent = count + dieType + " 굴리는 중...";
    showModal();

    // Rebuild tray for current skin
    buildTray();

    // Clear old dice
    clearDice();

    // Load pre-baked path set for this dice count
    var pathSet = getPrebakedPathSet(count);

    // Create dice with pre-baked paths
    setTimeout(function() {
      for (let i = 0; i < count; i++) {
        var diePath = pathSet ? pathSet[i] : [[0,0]]; // fallback
        const state = createDieState(dieType, preResults[i], i, count, diePath);
        activeDice.push(state);
        scene.add(state.mesh);
      }
      isAnimating = true;
      animStartTime = performance.now() / 1000;
    }, 350);
  }

  // ===================== ALIGN DICE FOR READABILITY =====================
  var isAligning = false;
  var alignStartTime = 0;
  var ALIGN_DURATION = 0.4;

  // D6 per-face Y-rotation correction so text reads upright from camera.
  // Computed from Three.js BoxGeometry UV mapping + setFromUnitVectors result.
  // Camera looks from +Z toward origin → screen "up" = world -Z.
  var D6_Y_FIX = { 1: -Math.PI/2, 2: 0, 3: 0, 4: Math.PI, 5: Math.PI, 6: Math.PI/2 };

  function getAlignedFaceQuat(die) {
    var faceQ = getFaceQuat(die.dieType, die.resultValue);
    if (!faceQ) return new THREE.Quaternion();
    faceQ = faceQ.clone();

    if (die.dieType === "D6") {
      // Apply hardcoded Y correction for each face's UV orientation
      var angle = D6_Y_FIX[die.resultValue] || 0;
      var yCorr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      return yCorr.multiply(faceQ);
    }

    // Non-D6: compute EXACT Y correction from top child plane's text direction
    if (die.mesh.children.length > 0) {
      var screenUp = new THREE.Vector3(0, 0, -1);
      var savedQ = die.mesh.quaternion.clone();

      // Apply face-up quaternion to measure child plane orientation
      die.mesh.quaternion.copy(faceQ);
      die.mesh.updateMatrixWorld(true);

      // Find topmost child plane (the visible number)
      var topPlane = null, topY = -Infinity;
      for (var c = 0; c < die.mesh.children.length; c++) {
        var wp = new THREE.Vector3();
        die.mesh.children[c].getWorldPosition(wp);
        if (wp.y > topY) { topY = wp.y; topPlane = die.mesh.children[c]; }
      }

      if (topPlane) {
        // Get the plane's text-up direction in world space
        var wq = new THREE.Quaternion();
        topPlane.getWorldQuaternion(wq);
        var textUp = new THREE.Vector3(0, 1, 0).applyQuaternion(wq);
        textUp.y = 0;

        if (textUp.length() > 0.001) {
          textUp.normalize();
          // Compute exact angle between textUp and screenUp in XZ plane
          var angle = Math.atan2(
            textUp.x * screenUp.z - textUp.z * screenUp.x,
            textUp.x * screenUp.x + textUp.z * screenUp.z
          );
          var yCorr = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), -angle
          );
          die.mesh.quaternion.copy(savedQ);
          return yCorr.multiply(faceQ);
        }
      }

      die.mesh.quaternion.copy(savedQ);
    }

    return faceQ;
  }

  function alignDiceToCamera() {
    for (var d = 0; d < activeDice.length; d++) {
      var die = activeDice[d];
      die._alignFrom = die.mesh.quaternion.clone();
      die._alignTarget = getAlignedFaceQuat(die);
    }

    isAligning = true;
    alignStartTime = performance.now() / 1000;
  }

  function updateAlignment(dt) {
    var elapsed = performance.now() / 1000 - alignStartTime;
    var t = Math.min(elapsed / ALIGN_DURATION, 1.0);
    var ease = 1 - Math.pow(1 - t, 3);

    for (var d = 0; d < activeDice.length; d++) {
      var die = activeDice[d];
      if (!die._alignTarget) continue;

      die.mesh.quaternion.copy(die._alignFrom).slerp(die._alignTarget, ease);

      // Subtle scale bounce effect
      var bounce = 1.0 + 0.08 * Math.sin(ease * Math.PI);
      die.mesh.scale.set(bounce, bounce, bounce);
    }

    if (t >= 1.0) {
      for (var d2 = 0; d2 < activeDice.length; d2++) {
        var die2 = activeDice[d2];
        if (die2._alignTarget) {
          die2.mesh.quaternion.copy(die2._alignTarget);
          die2.targetQuat.copy(die2._alignTarget);
        }
        die2.mesh.scale.set(1, 1, 1);
      }
      isAligning = false;
    }
  }

  // ===================== SHOW RESULTS =====================
  function showResults() {
    const sides = parseInt(diceTypeSelect.value);
    const dieType = "D" + sides;
    const total = preResults.reduce(function(s,v){ return s+v; }, 0);

    modalTitle.textContent = preResults.length + dieType + " 결과";

    // Result badges
    resultBadges.innerHTML = "";
    for (let i = 0; i < preResults.length; i++) {
      const badge = document.createElement("div");
      badge.className = "result-badge";
      badge.textContent = preResults[i];
      if (preResults[i] === sides) badge.classList.add("max-roll");
      else if (preResults[i] === 1) badge.classList.add("min-roll");
      resultBadges.appendChild(badge);
    }

    resultTotal.textContent = total;
    resultOverlay.classList.remove("hidden");

    // Add to history
    addHistory(dieType, preResults, total);
  }

  function addHistory(dieType, values, total) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML =
      '<span class="h-type">' + values.length + dieType + '</span>' +
      '<span class="h-values">[' + values.join(", ") + ']</span>' +
      '<span class="h-total">= ' + total + '</span>';
    historyEl.insertBefore(item, historyEl.firstChild);
    // Keep max 20
    while (historyEl.children.length > 20) historyEl.removeChild(historyEl.lastChild);
  }

  // ===================== SKIN PREVIEW =====================
  function updateSkinPreview() {
    const skin = SKINS[skinSelect.value];
    skinPreview.innerHTML = "";
    [4,6,8,12,20].forEach(function(s) {
      const dot = document.createElement("div");
      dot.className = "skin-dot";
      dot.style.backgroundColor = "#" + skin.colors[s].toString(16).padStart(6,"0");
      skinPreview.appendChild(dot);
    });
  }

  // ===================== RENDER LOOP =====================
  function animate(timestamp) {
    requestAnimationFrame(animate);
    if (!sceneReady) return;

    const now = timestamp / 1000;
    const dt = Math.min(lastTimestamp > 0 ? now - lastTimestamp : 0.016, 0.05);
    lastTimestamp = now;

    if (isAnimating) {
      const elapsed = performance.now() / 1000 - animStartTime;
      updatePhysics(dt, elapsed);

      var animDuration = (typeof PATH_CONFIG !== "undefined") ? PATH_CONFIG.duration : ANIM_DONE;
      if (elapsed >= animDuration && activeDice.every(function(d){ return d.settled; })) {
        isAnimating = false;
        // Smoothly align dice so numbers face camera
        alignDiceToCamera();
      }
    }

    if (isAligning) {
      updateAlignment(dt);
      if (!isAligning) {
        // Alignment done → wait, then show result overlay
        setTimeout(showResults, 1200);
      }
    }

    renderer.render(scene, camera);
  }

  // ===================== INIT =====================
  function init() {
    // Counter buttons
    countUp.addEventListener("click", function() {
      let v = parseInt(diceCountInput.value) || 1;
      if (v < 10) diceCountInput.value = v + 1;
    });
    countDown.addEventListener("click", function() {
      let v = parseInt(diceCountInput.value) || 1;
      if (v > 1) diceCountInput.value = v - 1;
    });

    // Roll
    rollBtn.addEventListener("click", rollDice);

    // Modal close
    modalClose.addEventListener("click", hideModal);
    modalOverlay.addEventListener("click", hideModal);
    resultCloseBtn.addEventListener("click", hideModal);

    // Skin change
    skinSelect.addEventListener("change", updateSkinPreview);
    updateSkinPreview();

    // Keyboard
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && modal.classList.contains("active")) {
        hideModal();
      }
      if (e.key === "Enter" && !modal.classList.contains("active") &&
          document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
        rollDice();
      }
    });

    // Window resize
    window.addEventListener("resize", function() {
      if (sceneReady) resizeRenderer();
    });

    // Start render loop
    requestAnimationFrame(animate);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
