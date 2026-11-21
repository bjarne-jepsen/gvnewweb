// Papmodel af et Grøndalsvænge-hus fra 1918. Vises på siden i en iframe med sandbox="allow-scripts",
// så den ikke kan røre resten af sitet. Henter intet udefra (se Content-Security-Policy i hus-1918.html).
(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("scene");
  const layerBase = document.getElementById("layer-base");
  const layerModel = document.getElementById("layer-model");
  const layerNet = document.getElementById("layer-net");
  const layerHud = document.getElementById("layer-hud");

  // ── State ──────────────────────────────────────────────────────────
  const state = {
    mode: "assembled",     // assembled | lift | exploded | net
    yaw: -2.48,            // radians (front-entrance + bay-window hero angle)
    pitch: 0.34,           // radians
    targetYaw: -2.48,
    targetPitch: 0.34,
    zoom: 1.0,
    lift: 0.0,             // 0..1 roof lift
    explode: 0.0,          // 0..1 floor separation
    targetLift: 0.0,
    targetExplode: 0.0,
    lamp: false,
    spin: false,
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  // ── Cardboard Material Palette (RGB base tones) ────────────────────
  const MAT = {
    wall:       [222, 194, 155], // warm kraft cardboard
    plinth:     [188, 158, 121], // darker kraft plinth
    roof:       [176, 134, 92],  // corrugated tan-brown roof
    roofUnder:  [145, 108, 74],  // underside of roof eaves
    gableWood:  [202, 168, 124], // vertical board-clad upper gable
    bayRoof:    [164, 124, 84],
    chimney:    [186, 138, 98],
    steps:      [198, 174, 142],
    interior:   [234, 214, 182], // lighter inner cardboard
    floor:      [212, 184, 146],
    baseplate:  [230, 211, 182],
    baseEdge:   [162, 128, 90],
    door:       [158, 118, 78],
    frame:      [246, 236, 218], // cream-white cardboard sash
    ink:        "#45301c",
    inkSoft:    "#6e5134",
    glassDark:  "#3d4a52",
    glassLight: "#596a74"
  };

  // Light direction (normalized studio key light from front-top-left)
  const LIGHT = normalize([-0.48, 0.78, -0.40]);

  // ── Vector Math ────────────────────────────────────────────────────
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  function len(a) { return Math.hypot(a[0], a[1], a[2]) || 1; }
  function normalize(a) { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; }

  function shadeColor(rgb, normal, boost = 0) {
    const ndl = dot(normal, LIGHT);
    // Soft cardboard lighting: ambient 0.64 + diffuse 0.40 + upward sky bounce
    const sky = Math.max(0, normal[1]) * 0.08;
    const factor = Math.max(0.46, Math.min(1.14, 0.68 + ndl * 0.34 + sky + boost));
    const r = Math.min(255, Math.max(0, Math.round(rgb[0] * factor)));
    const g = Math.min(255, Math.max(0, Math.round(rgb[1] * factor)));
    const b = Math.min(255, Math.max(0, Math.round(rgb[2] * factor)));
    return `rgb(${r},${g},${b})`;
  }

  // ── Camera Projection ──────────────────────────────────────────────
  const VIEW_W = 820, VIEW_H = 368;
  const CX = VIEW_W * 0.5;
  const CY = VIEW_H * 0.58;

  function getCameraBasis() {
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    // Camera looks at center (0, 5.2, 0) from distance D
    const camDist = 48;
    const targetY = 5.0 + state.lift * 1.4 + state.explode * 1.6;
    return { cy, sy, cp, sp, camDist, targetY };
  }

  function projectPoint(pt, cam) {
    const x0 = pt[0];
    const y0 = pt[1] - cam.targetY;
    const z0 = pt[2];
    // Rotate around Y (yaw)
    const x1 = x0 * cam.cy + z0 * cam.sy;
    const z1 = -x0 * cam.sy + z0 * cam.cy;
    // Rotate around X (pitch)
    const y2 = y0 * cam.cp - z1 * cam.sp;
    const z2 = y0 * cam.sp + z1 * cam.cp;
    // Gentle perspective (architectural telephoto feel)
    const depth = cam.camDist - z2;
    const focal = 690 * state.zoom;
    const s = focal / Math.max(8, depth);
    return {
      x: CX + x1 * s,
      y: CY - y2 * s,
      z: z2, // larger z = closer to camera
      s
    };
  }

  function faceNormal(pts) {
    return normalize(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  }

  function poly2DArea(p2) {
    let a = 0;
    for (let i = 0; i < p2.length; i++) {
      const j = (i + 1) % p2.length;
      a += p2[i].x * p2[j].y - p2[j].x * p2[i].y;
    }
    return a * 0.5;
  }

  // ── House Architectural Geometry (1918 Poul Holsøe & Jesper Tvede) ─
  // Coordinate system:
  //   X: -7.1 (Garden Gable) .. +7.1 (Bay Window Gable)  [Length = 14.2]
  //   Z: -5.9 (Front Entrance) .. +5.9 (Back Garden)     [Width  = 11.8]
  //   Y: 0 (ground) .. 1.2 (plinth) .. 5.4 (eaves) .. 11.4 (ridge)

  const HX = 7.1, HZ = 5.9;
  const Y_PLINTH = 1.2;
  const Y_EAVE = 5.4;
  const Y_RIDGE = 11.4;

  // Helper: create a wall face with optional coplanar decals (windows, doors, seams)
  function makeFace(pts, mat, opts = {}) {
    return {
      pts,
      mat,
      doubleSided: !!opts.doubleSided,
      stroke: opts.stroke || MAT.ink,
      strokeWidth: opts.strokeWidth ?? 0.9,
      decals: opts.decals || [],
      lines: opts.lines || [],
      bias: opts.bias || 0,
      group: opts.group || 0
    };
  }

  // Helper: build rectangular box faces (outward CCW winding)
  function pushBox(list, x0, x1, y0, y1, z0, z1, mat, opts = {}) {
    const skip = opts.skip || {};
    const g = opts.group || 0;
    const b = opts.bias || 0;
    const sw = opts.strokeWidth ?? 0.85;
    // Front (-Z)
    if (!skip.front) list.push(makeFace([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]], mat, { group: g, bias: b, strokeWidth: sw, decals: opts.frontDecals, lines: opts.frontLines }));
    // Back (+Z)
    if (!skip.back) list.push(makeFace([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], mat, { group: g, bias: b, strokeWidth: sw, decals: opts.backDecals, lines: opts.backLines }));
    // Right (+X)
    if (!skip.right) list.push(makeFace([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], mat, { group: g, bias: b, strokeWidth: sw, decals: opts.rightDecals, lines: opts.rightLines }));
    // Left (-X)
    if (!skip.left) list.push(makeFace([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], mat, { group: g, bias: b, strokeWidth: sw, decals: opts.leftDecals, lines: opts.leftLines }));
    // Top (+Y)
    if (!skip.top) list.push(makeFace([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], opts.topMat || mat, { group: g, bias: b, strokeWidth: sw }));
    // Bottom (-Y)
    if (!skip.bottom) list.push(makeFace([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], mat, { group: g, bias: b, strokeWidth: sw }));
  }

  // Helper: create a multi-pane Danish window decal on a rectangular face
  // uAxis, vAxis define local 2D plane; origin is bottom-left of window
  function makeWindowDecal(origin, uVec, vVec, w, h, cols, rows, opts = {}) {
    const p = (u, v) => add(add(origin, scale(uVec, u)), scale(vVec, v));
    const pad = opts.pad ?? 0.10;
    const outer = [p(0,0), p(w,0), p(w,h), p(0,h)];
    const inner = [p(pad,pad), p(w-pad,pad), p(w-pad,h-pad), p(pad,h-pad)];
    const mullions = [];
    for (let c = 1; c < cols; c++) {
      const u = pad + ((w - 2 * pad) * c) / cols;
      const thick = (cols === 4 && c === 2) || (cols === 6 && (c === 2 || c === 4));
      mullions.push({ a: p(u, pad), b: p(u, h - pad), thick });
    }
    for (let r = 1; r < rows; r++) {
      const v = pad + ((h - 2 * pad) * r) / rows;
      mullions.push({ a: p(pad, v), b: p(w - pad, v), thick: false });
    }
    const sill = opts.noSill ? null : [p(-0.08, -0.09), p(w+0.08, -0.09), p(w+0.08, 0.04), p(-0.08, 0.04)];
    return { type: "window", outer, inner, mullions, sill, isCellar: !!opts.isCellar };
  }

  // Helper: create a door decal (upper panes + lower panels)
  function makeDoorDecal(origin, uVec, vVec, w, h, topCols, topRows, glassFrac) {
    const p = (u, v) => add(add(origin, scale(uVec, u)), scale(vVec, v));
    const pad = 0.11;
    const outer = [p(0,0), p(w,0), p(w,h), p(0,h)];
    const gy0 = h * (1 - glassFrac);
    const gy1 = h - pad;
    const glass = [p(pad, gy0), p(w-pad, gy0), p(w-pad, gy1), p(pad, gy1)];
    const mullions = [];
    for (let c = 1; c < topCols; c++) {
      const u = pad + ((w - 2 * pad) * c) / topCols;
      mullions.push({ a: p(u, gy0), b: p(u, gy1), thick: topCols === 4 && c === 2 });
    }
    for (let r = 1; r < topRows; r++) {
      const v = gy0 + ((gy1 - gy0) * r) / topRows;
      mullions.push({ a: p(pad, v), b: p(w - pad, v), thick: false });
    }
    // Lower wooden panels
    const panels = [];
    const mid = w * 0.5;
    if (w > 1.9) {
      panels.push([p(pad+0.06, pad+0.08), p(mid-0.06, pad+0.08), p(mid-0.06, gy0-0.12), p(pad+0.06, gy0-0.12)]);
      panels.push([p(mid+0.06, pad+0.08), p(w-pad-0.06, pad+0.08), p(w-pad-0.06, gy0-0.12), p(mid+0.06, gy0-0.12)]);
    } else {
      panels.push([p(pad+0.10, pad+0.10), p(w-pad-0.10, pad+0.10), p(w-pad-0.10, gy0-0.14), p(pad+0.10, gy0-0.14)]);
    }
    return { type: "door", outer, glass, mullions, panels };
  }

  // Build all 3D faces for the current lift/explode state
  function buildHouseFaces() {
    const faces = [];
    const yLift1 = state.explode * 3.6;                         // 1st floor slab lift
    const yLiftRoof = state.lift * 4.8 + state.explode * 6.8;   // roof prism lift
    const showInterior = (state.lift > 0.04 || state.explode > 0.04);

    // ── 1. PLINTH (Kælder, y = 0..1.2) ────────────────────────────
    const plinthFrontDecals = [
      makeWindowDecal([5.6, 0.25, -HZ], [-1,0,0], [0,1,0], 1.1, 0.65, 2, 1, { isCellar: true, noSill: true, pad: 0.06 }),
      makeWindowDecal([-3.1, 0.25, -HZ], [-1,0,0], [0,1,0], 1.7, 0.65, 2, 1, { isCellar: true, noSill: true, pad: 0.06 })
    ];
    const plinthBackDecals = [
      makeWindowDecal([-5.2, 0.25, HZ], [1,0,0], [0,1,0], 1.8, 0.65, 2, 1, { isCellar: true, noSill: true, pad: 0.06 }),
      makeWindowDecal([3.4, 0.25, HZ], [1,0,0], [0,1,0], 1.8, 0.65, 2, 1, { isCellar: true, noSill: true, pad: 0.06 })
    ];
    pushBox(faces, -HX, HX, 0, Y_PLINTH, -HZ, HZ, MAT.plinth, {
      group: 1,
      skip: { bottom: true, top: !showInterior },
      topMat: MAT.floor,
      frontDecals: plinthFrontDecals,
      backDecals: plinthBackDecals
    });

    // ── 2. GROUND FLOOR (Stue, y = 1.2..5.4) ──────────────────────
    // Front (-Z) decals: looking from -Z, u = [-1,0,0] goes left-to-right
    const stueFrontDecals = [
      // W.C. window (far left, x ≈ +5.3)
      makeWindowDecal([5.8, 2.7, -HZ], [-1,0,0], [0,1,0], 0.95, 1.35, 1, 2),
      // Main Entrance Door (left of center, x ≈ +3.0)
      makeDoorDecal([3.9, 1.6, -HZ], [-1,0,0], [0,1,0], 1.85, 3.25, 4, 1, 0.28),
      // Narrow pantry (Spk.) window (x ≈ -1.6)
      makeWindowDecal([-1.25, 3.2, -HZ], [-1,0,0], [0,1,0], 0.62, 1.05, 1, 2),
      // Large Kitchen double window (far right, x ≈ -4.2)
      makeWindowDecal([-3.0, 2.15, -HZ], [-1,0,0], [0,1,0], 2.45, 2.45, 4, 3)
    ];

    // Back (+Z) decals: looking from +Z, u = [1,0,0] goes left-to-right
    const stueBackDecals = [
      makeWindowDecal([-5.45, 2.1, HZ], [1,0,0], [0,1,0], 2.5, 2.55, 4, 4),
      makeWindowDecal([2.95, 2.1, HZ], [1,0,0], [0,1,0], 2.5, 2.55, 4, 4)
    ];

    // Left Gable (-X) decals: Garden Door centered at z = 0
    const stueLeftDecals = [
      makeDoorDecal([-HX, 1.45, -1.1], [0,0,1], [0,1,0], 2.2, 3.45, 4, 3, 0.62)
    ];

    pushBox(faces, -HX, HX, Y_PLINTH, Y_EAVE, -HZ, HZ, MAT.wall, {
      group: 2,
      skip: { bottom: true, top: true },
      frontDecals: stueFrontDecals,
      backDecals: stueBackDecals,
      leftDecals: stueLeftDecals
    });

    // Ground floor interior cardboard walls (visible when roof lifted / exploded)
    if (showInterior) {
      // Interior floor surface
      faces.push(makeFace([[-HX+0.15, Y_PLINTH+0.04, -HZ+0.15], [HX-0.15, Y_PLINTH+0.04, -HZ+0.15], [HX-0.15, Y_PLINTH+0.04, HZ-0.15], [-HX+0.15, Y_PLINTH+0.04, HZ-0.15]], MAT.floor, { doubleSided: true, group: 2, strokeWidth: 0.6 }));
      // Inner wall faces so open box looks like real cardboard
      const t = 0.16;
      // Longitudinal spine wall (z = -0.6) separating Stue rooms from Kitchen/Hall
      faces.push(makeFace([[-HX+t, Y_PLINTH, -0.6], [HX-t, Y_PLINTH, -0.6], [HX-t, Y_EAVE-0.1, -0.6], [-HX+t, Y_EAVE-0.1, -0.6]], MAT.interior, { doubleSided: true, group: 2, strokeWidth: 0.7 }));
      // Cross wall between left Stue and right Stue (x = +0.3, z = -0.6..HZ)
      faces.push(makeFace([[0.3, Y_PLINTH, -0.6], [0.3, Y_PLINTH, HZ-t], [0.3, Y_EAVE-0.1, HZ-t], [0.3, Y_EAVE-0.1, -0.6]], MAT.interior, { doubleSided: true, group: 2, strokeWidth: 0.7 }));
      // Kitchen / Pantry partition (x = -2.4, z = -HZ..-0.6)
      faces.push(makeFace([[-2.4, Y_PLINTH, -HZ+t], [-2.4, Y_PLINTH, -0.6], [-2.4, Y_EAVE-0.1, -0.6], [-2.4, Y_EAVE-0.1, -HZ+t]], MAT.interior, { doubleSided: true, group: 2, strokeWidth: 0.7 }));
      // Forstue / W.C. partition (x = +1.9, z = -HZ..-0.6)
      faces.push(makeFace([[1.9, Y_PLINTH, -HZ+t], [1.9, Y_PLINTH, -0.6], [1.9, Y_EAVE-0.1, -0.6], [1.9, Y_EAVE-0.1, -HZ+t]], MAT.interior, { doubleSided: true, group: 2, strokeWidth: 0.7 }));
      // Miniature cardboard staircase in center-front (x = -1.8..+1.3, z = -3.8..-1.0)
      for (let s = 0; s < 6; s++) {
        const sy = Y_PLINTH + 0.45 + s * 0.55;
        const sx = -1.6 + s * 0.48;
        faces.push(makeFace([[sx, sy, -3.5], [sx+0.48, sy, -3.5], [sx+0.48, sy, -1.6], [sx, sy, -1.6]], MAT.steps, { doubleSided: true, group: 2, strokeWidth: 0.5 }));
      }
    }

    // ── 3. BAY WINDOW / KARNAP (+X Gable, x = 7.1..8.45, z = -2.35..2.35) ─
    const bx0 = HX, bx1 = HX + 1.35, bz = 2.35;
    // Bay plinth
    pushBox(faces, bx0, bx1, 0, Y_PLINTH, -bz, bz, MAT.plinth, {
      group: 2, skip: { left: true, bottom: true, top: true },
      rightDecals: [
        makeWindowDecal([bx1, 0.3, 0.7], [0,0,-1], [0,1,0], 1.4, 0.48, 2, 1, { isCellar: true, noSill: true, pad: 0.05 })
      ]
    });
    // Bay body
    pushBox(faces, bx0, bx1, Y_PLINTH, Y_EAVE - 0.15, -bz, bz, MAT.wall, {
      group: 2, skip: { left: true, bottom: true, top: true },
      rightDecals: [
        makeWindowDecal([bx1, 2.15, 2.05], [0,0,-1], [0,1,0], 4.1, 2.45, 6, 4)
      ],
      frontDecals: [
        makeWindowDecal([bx1 - 0.22, 2.15, -bz], [-1,0,0], [0,1,0], 0.9, 2.45, 2, 4)
      ],
      backDecals: [
        makeWindowDecal([bx0 + 0.22, 2.15, bz], [1,0,0], [0,1,0], 0.9, 2.45, 2, 4)
      ]
    });
    // Bay sloped roof cap
    const by0 = Y_EAVE - 0.15, by1 = Y_EAVE + 0.42;
    const bxCap = bx1 + 0.16, bzCap = bz + 0.14;
    faces.push(makeFace([[bxCap, by0, bzCap], [bxCap, by0, -bzCap], [bx0, by1, -bz], [bx0, by1, bz]], MAT.bayRoof, { group: 2 }));
    faces.push(makeFace([[bx0, by0, -bzCap], [bxCap, by0, -bzCap], [bx0, by1, -bz]], MAT.bayRoof, { group: 2 }));
    faces.push(makeFace([[bxCap, by0, bzCap], [bx0, by0, bzCap], [bx0, by1, bz]], MAT.bayRoof, { group: 2 }));

    // ── 4. FRONT ENTRANCE STEPS & RAILING (-Z, x ≈ +1.2..+4.3) ────
    // Landing in front of entrance door (x = 1.9..4.1, z = -7.2..-5.9, y = 0..1.55)
    pushBox(faces, 1.9, 4.1, 0, 1.55, -7.2, -HZ, MAT.steps, { group: 2, skip: { bottom: true, back: true } });
    // 4 exterior steps descending to the left (+X side, x = 4.1..5.6)
    for (let i = 0; i < 4; i++) {
      const sx0 = 4.1 + i * 0.36;
      const sx1 = sx0 + 0.36;
      const sh = 1.24 - i * 0.31;
      pushBox(faces, sx0, sx1, 0, sh, -7.15, -HZ, MAT.steps, { group: 2, skip: { bottom: true, left: true, back: true }, strokeWidth: 0.65 });
    }
    // Wooden railing posts & top rail on front landing
    const railY = 2.65;
    faces.push(makeFace([[1.95, 1.55, -7.15], [4.05, 1.55, -7.15], [4.05, railY, -7.15], [1.95, railY, -7.15]], MAT.frame, {
      doubleSided: true, group: 2, strokeWidth: 0.7,
      lines: [
        { a: [1.95, 2.1, -7.15], b: [4.05, 2.1, -7.15] },
        { a: [2.45, 1.55, -7.15], b: [2.45, railY, -7.15] },
        { a: [3.0, 1.55, -7.15], b: [3.0, railY, -7.15] },
        { a: [3.55, 1.55, -7.15], b: [3.55, railY, -7.15] }
      ]
    }));

    // ── 5. GARDEN GABLE STEPS (-X, centered at z = 0) ─────────────
    for (let i = 0; i < 3; i++) {
      const sx1 = -HX - i * 0.42;
      const sx0 = sx1 - 0.42;
      const sh = 1.25 - i * 0.38;
      pushBox(faces, sx0, sx1, 0, sh, -1.45, 1.45, MAT.steps, { group: 2, skip: { bottom: true, right: true }, strokeWidth: 0.65 });
    }

    // ── 6. FIRST FLOOR (1. Sal) INTERIOR PLATE (when lifted/exploded) ─
    if (showInterior) {
      const y1 = Y_EAVE + yLift1;
      const t = 0.16;
      // Cardboard floor slab
      pushBox(faces, -HX+0.12, HX-0.12, y1-0.22, y1, -HZ+0.12, HZ-0.12, MAT.floor, { group: 3, strokeWidth: 0.65 });
      // Knee walls (skunkvægge at z = ±3.7)
      const kh = 1.55;
      faces.push(makeFace([[-HX+t, y1, -3.7], [HX-t, y1, -3.7], [HX-t, y1+kh, -3.7], [-HX+t, y1+kh, -3.7]], MAT.interior, { doubleSided: true, group: 3, strokeWidth: 0.65 }));
      faces.push(makeFace([[-HX+t, y1, 3.7], [HX-t, y1, 3.7], [HX-t, y1+kh, 3.7], [-HX+t, y1+kh, 3.7]], MAT.interior, { doubleSided: true, group: 3, strokeWidth: 0.65 }));
      // Main 1st-floor room divider (x = -0.6, separating large right Stue from left Stue & Køkken)
      faces.push(makeFace([[-0.6, y1, -3.7], [-0.6, y1, 3.7], [-0.6, y1+2.5, 3.7], [-0.6, y1+2.5, -3.7]], MAT.interior, { doubleSided: true, group: 3, strokeWidth: 0.7 }));
      // Left-side divider between 1st-floor Køkken and Stue (z = -0.2, x = -HX..-0.6)
      faces.push(makeFace([[-HX+t, y1, -0.2], [-0.6, y1, -0.2], [-0.6, y1+2.5, -0.2], [-HX+t, y1+2.5, -0.2]], MAT.interior, { doubleSided: true, group: 3, strokeWidth: 0.7 }));
    }

    // ── 7. ROOF PRISM, GABLES, DORMER & CHIMNEY (y + yLiftRoof) ───
    const yr0 = Y_EAVE + yLiftRoof;
    const yrRidge = Y_RIDGE + yLiftRoof;
    const ovX = 0.38, ovZ = 0.56;
    // Slope ratio: dy/dz = (11.4 - 5.4) / 5.9 = 6.0 / 5.9 ≈ 1.017
    const slope = (Y_RIDGE - Y_EAVE) / HZ;
    const yrEave = yr0 - ovZ * slope;

    // Vertical standing-seam / corrugated roof lines
    const roofLinesFront = [];
    const roofLinesBack = [];
    const roofSteps = 22;
    for (let i = 1; i < roofSteps; i++) {
      const rx = -HX - ovX + ((2 * (HX + ovX)) * i) / roofSteps;
      roofLinesFront.push({ a: [rx, yrEave, -HZ - ovZ], b: [rx, yrRidge, 0] });
      roofLinesBack.push({ a: [rx, yrEave, HZ + ovZ], b: [rx, yrRidge, 0] });
    }

    // Skylight decal on Front (-Z) roof slope (high left of dormer, x ≈ +2.0)
    const skyU = [-1, 0, 0];
    const skyV = normalize([0, Y_RIDGE - Y_EAVE, HZ]);
    const skyOrigin = [2.45, yr0 + (HZ - 2.35) * slope, -2.35];
    const frontRoofDecals = [
      makeWindowDecal(skyOrigin, skyU, skyV, 0.9, 1.05, 2, 2, { noSill: true, pad: 0.08 })
    ];

    // Front (-Z) roof plane
    faces.push(makeFace(
      [[HX+ovX, yrEave, -HZ-ovZ], [-HX-ovX, yrEave, -HZ-ovZ], [-HX-ovX, yrRidge, 0], [HX+ovX, yrRidge, 0]],
      MAT.roof, { group: 4, doubleSided: showInterior, lines: roofLinesFront, decals: frontRoofDecals }
    ));
    // Back (+Z) roof plane
    faces.push(makeFace(
      [[-HX-ovX, yrEave, HZ+ovZ], [HX+ovX, yrEave, HZ+ovZ], [HX+ovX, yrRidge, 0], [-HX-ovX, yrRidge, 0]],
      MAT.roof, { group: 4, doubleSided: showInterior, lines: roofLinesBack }
    ));

    // Gable Triangles (Right +X and Left -X), split into lower plaster trapezoid + upper wood-clad triangle
    const ySplit = yr0 + 3.05; // lintel height of 1st-floor windows
    const zSplit = HZ * (1 - 3.05 / (Y_RIDGE - Y_EAVE));

    // Right Gable (+X) lower plaster trapezoid with 2 side-by-side windows
    const rGableDecals = [
      makeWindowDecal([HX, yr0 + 0.55, 2.55], [0,0,-1], [0,1,0], 1.95, 2.15, 3, 3),
      makeWindowDecal([HX, yr0 + 0.55, -0.6], [0,0,-1], [0,1,0], 1.95, 2.15, 3, 3)
    ];
    faces.push(makeFace(
      [[HX, yr0, HZ], [HX, yr0, -HZ], [HX, ySplit, -zSplit], [HX, ySplit, zSplit]],
      MAT.wall, { group: 4, doubleSided: showInterior, decals: rGableDecals }
    ));
    // Right Gable (+X) upper vertical wood-clad triangle
    const rCladLines = [];
    for (let i = 1; i < 10; i++) {
      const zz = -zSplit + (2 * zSplit * i) / 10;
      const yy = yrRidge - Math.abs(zz) * slope;
      rCladLines.push({ a: [HX, ySplit, zz], b: [HX, yy, zz] });
    }
    faces.push(makeFace(
      [[HX, ySplit, zSplit], [HX, ySplit, -zSplit], [HX, yrRidge, 0]],
      MAT.gableWood, { group: 4, doubleSided: showInterior, lines: rCladLines }
    ));

    // Left Gable (-X) lower plaster trapezoid with 2 side-by-side windows
    const lGableDecals = [
      makeWindowDecal([-HX, yr0 + 0.55, -2.55], [0,0,1], [0,1,0], 1.95, 2.15, 3, 3),
      makeWindowDecal([-HX, yr0 + 0.55, 0.6], [0,0,1], [0,1,0], 1.95, 2.15, 3, 3)
    ];
    faces.push(makeFace(
      [[-HX, yr0, -HZ], [-HX, yr0, HZ], [-HX, ySplit, zSplit], [-HX, ySplit, -zSplit]],
      MAT.wall, { group: 4, doubleSided: showInterior, decals: lGableDecals }
    ));
    // Left Gable (-X) upper vertical wood-clad triangle
    const lCladLines = [];
    for (let i = 1; i < 10; i++) {
      const zz = -zSplit + (2 * zSplit * i) / 10;
      const yy = yrRidge - Math.abs(zz) * slope;
      lCladLines.push({ a: [-HX, ySplit, zz], b: [-HX, yy, zz] });
    }
    faces.push(makeFace(
      [[-HX, ySplit, -zSplit], [-HX, ySplit, zSplit], [-HX, yrRidge, 0]],
      MAT.gableWood, { group: 4, doubleSided: showInterior, lines: lCladLines }
    ));

    // ── 8. FRONT DORMER (Kvist) on -Z roof slope (x = -2.0..+0.6) ─
    const dx0 = -2.0, dx1 = 0.6, dxMid = (dx0 + dx1) * 0.5;
    const dzFront = -4.55;
    const dyBase = yr0 + (HZ - Math.abs(dzFront)) * slope;
    const dyTop = dyBase + 2.15;
    const dyPeak = dyTop + 0.85;
    const dzBackTop = -(HZ - (dyTop - yr0) / slope);
    const dzBackPeak = -(HZ - (dyPeak - yr0) / slope);

    // Dormer front wall with double window
    faces.push(makeFace(
      [[dx1, dyBase, dzFront], [dx0, dyBase, dzFront], [dx0, dyTop, dzFront], [dx1, dyTop, dzFront]],
      MAT.wall, {
        group: 5, bias: 0.4,
        decals: [makeWindowDecal([dx1 - 0.25, dyBase + 0.22, dzFront], [-1,0,0], [0,1,0], 2.1, 1.72, 4, 3)]
      }
    ));
    // Dormer front gable triangle
    faces.push(makeFace(
      [[dx1, dyTop, dzFront], [dx0, dyTop, dzFront], [dxMid, dyPeak, dzFront]],
      MAT.gableWood, { group: 5, bias: 0.4 }
    ));
    // Dormer side cheeks
    faces.push(makeFace(
      [[dx1, dyBase, dzFront], [dx1, dyTop, dzFront], [dx1, dyTop, dzBackTop]],
      MAT.wall, { group: 5, bias: 0.35 }
    ));
    faces.push(makeFace(
      [[dx0, dyBase, dzFront], [dx0, dyTop, dzBackTop], [dx0, dyTop, dzFront]],
      MAT.wall, { group: 5, bias: 0.35 }
    ));
    // Dormer pitched roof halves
    const dOv = 0.16;
    faces.push(makeFace(
      [[dx1+dOv, dyTop-0.08, dzFront-dOv], [dxMid, dyPeak, dzFront-dOv], [dxMid, dyPeak, dzBackPeak], [dx1+dOv, dyTop-0.08, dzBackTop]],
      MAT.bayRoof, { group: 5, bias: 0.45 }
    ));
    faces.push(makeFace(
      [[dxMid, dyPeak, dzFront-dOv], [dx0-dOv, dyTop-0.08, dzFront-dOv], [dx0-dOv, dyTop-0.08, dzBackTop], [dxMid, dyPeak, dzBackPeak]],
      MAT.bayRoof, { group: 5, bias: 0.45 }
    ));

    // ── 9. CHIMNEY (Skorsten) along ridge at x = -1.35..+0.15 ───────
    const chY0 = yrRidge - 0.7;
    const chY1 = yrRidge + 1.85;
    pushBox(faces, -1.35, 0.15, chY0, chY1, -0.58, 0.58, MAT.chimney, { group: 6, bias: 0.5, skip: { bottom: true } });
    // Chimney cap rim
    pushBox(faces, -1.46, 0.26, chY1, chY1 + 0.24, -0.68, 0.68, MAT.plinth, { group: 6, bias: 0.55, skip: { bottom: true } });

    return faces;
  }

  // ── SVG DOM Helpers ────────────────────────────────────────────────
  function el(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }
  function ptsStr(p2) {
    return p2.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }

  // ── Render 3D Scene ────────────────────────────────────────────────
  function render3D() {
    layerNet.innerHTML = "";
    layerBase.innerHTML = "";
    layerModel.innerHTML = "";
    layerHud.innerHTML = "";

    const cam = getCameraBasis();

    // 1. Cardboard Architectural Model Baseplate & Ground Shadow
    const bw = 11.4, bd = 9.8, bh = 0.42;
    const baseFaces = [];
    pushBox(baseFaces, -bw, bw, -bh, 0, -bd, bd, MAT.baseEdge, { topMat: MAT.baseplate, skip: { bottom: true } });
    drawFaces(layerBase, baseFaces, cam, true);

    // Subtle architectural cutting-mat grid on baseplate top
    for (let gx = -10; gx <= 10; gx += 2) {
      const a = projectPoint([gx, 0.01, -bd + 0.5], cam);
      const b = projectPoint([gx, 0.01, bd - 0.5], cam);
      layerBase.appendChild(el("line", {
        x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1),
        stroke: "#a88962", "stroke-width": "0.55", "stroke-opacity": "0.35"
      }));
    }
    for (let gz = -8; gz <= 8; gz += 2) {
      const a = projectPoint([-bw + 0.5, 0.01, gz], cam);
      const b = projectPoint([bw - 0.5, 0.01, gz], cam);
      layerBase.appendChild(el("line", {
        x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1),
        stroke: "#a88962", "stroke-width": "0.55", "stroke-opacity": "0.35"
      }));
    }

    // Soft cast shadow on baseplate
    const shPts = [
      [-HX - 0.3, 0.02, -HZ - 0.2],
      [HX + 2.4, 0.02, -HZ + 1.4],
      [HX + 2.8, 0.02, HZ + 2.1],
      [-HX + 1.4, 0.02, HZ + 2.1]
    ].map(p => projectPoint(p, cam));
    layerBase.appendChild(el("polygon", {
      points: ptsStr(shPts),
      fill: "#5c4124",
      "fill-opacity": "0.17"
    }));

    // 2. Build & Sort House Faces
    const faces = buildHouseFaces();
    drawFaces(layerModel, faces, cam, false);

  }

  function drawFaces(targetGroup, faces, cam, isBase) {
    const renderables = [];

    for (const f of faces) {
      const p2 = f.pts.map(pt => projectPoint(pt, cam));
      const area = poly2DArea(p2);
      // In screen space (Y down), CCW in 3D projects to negative signed area when facing camera
      if (!f.doubleSided && area > 0.2) continue;

      let n = faceNormal(f.pts);
      if (f.doubleSided && area > 0) n = scale(n, -1);

      // Average depth for painter's sort
      let zSum = 0;
      let yAvg = 0;
      for (let i = 0; i < p2.length; i++) {
        zSum += p2[i].z;
        yAvg += f.pts[i][1];
      }
      const zAvg = zSum / p2.length + (f.bias || 0);
      yAvg /= p2.length;

      renderables.push({ f, p2, n, zAvg, yAvg });
    }

    // Sort back-to-front (smaller zAvg = further from camera)
    renderables.sort((a, b) => a.zAvg - b.zAvg);

    for (const item of renderables) {
      const { f, p2, n } = item;
      const fill = shadeColor(f.mat, n);

      targetGroup.appendChild(el("polygon", {
        points: ptsStr(p2),
        fill,
        stroke: f.stroke,
        "stroke-width": f.strokeWidth,
        "stroke-linejoin": "round"
      }));

      // Coplanar texture / seam / cladding lines
      if (f.lines && f.lines.length) {
        for (const ln of f.lines) {
          const a = projectPoint(ln.a, cam);
          const b = projectPoint(ln.b, cam);
          targetGroup.appendChild(el("line", {
            x1: a.x.toFixed(1), y1: a.y.toFixed(1),
            x2: b.x.toFixed(1), y2: b.y.toFixed(1),
            stroke: MAT.inkSoft,
            "stroke-width": "0.55",
            "stroke-opacity": "0.48"
          }));
        }
      }

      // Coplanar architectural decals (windows & doors)
      if (f.decals && f.decals.length) {
        for (const d of f.decals) {
          drawDecal(targetGroup, d, n, cam);
        }
      }
    }
  }

  function drawDecal(group, d, n, cam) {
    const frameColor = shadeColor(MAT.frame, n, 0.04);
    const glassFill = state.lamp && !d.isCellar
      ? "url(#lamp-glow)"
      : (d.isCellar ? "#3a352f" : MAT.glassDark);

    if (d.type === "window") {
      // Outer white/cream frame
      const o2 = d.outer.map(p => projectPoint(p, cam));
      group.appendChild(el("polygon", {
        points: ptsStr(o2),
        fill: frameColor,
        stroke: MAT.ink,
        "stroke-width": "0.7"
      }));
      // Recessed glass pane
      const i2 = d.inner.map(p => projectPoint(p, cam));
      group.appendChild(el("polygon", {
        points: ptsStr(i2),
        fill: glassFill,
        stroke: MAT.ink,
        "stroke-width": "0.55"
      }));
      // Mullions (sprosser)
      for (const m of d.mullions) {
        const a = projectPoint(m.a, cam);
        const b = projectPoint(m.b, cam);
        group.appendChild(el("line", {
          x1: a.x.toFixed(1), y1: a.y.toFixed(1),
          x2: b.x.toFixed(1), y2: b.y.toFixed(1),
          stroke: frameColor,
          "stroke-width": m.thick ? "1.65" : "0.95"
        }));
      }
      // Sill
      if (d.sill) {
        const s2 = d.sill.map(p => projectPoint(p, cam));
        group.appendChild(el("polygon", {
          points: ptsStr(s2),
          fill: shadeColor(MAT.steps, n, 0.06),
          stroke: MAT.ink,
          "stroke-width": "0.55"
        }));
      }
    } else if (d.type === "door") {
      const o2 = d.outer.map(p => projectPoint(p, cam));
      group.appendChild(el("polygon", {
        points: ptsStr(o2),
        fill: shadeColor(MAT.door, n),
        stroke: MAT.ink,
        "stroke-width": "0.8"
      }));
      const g2 = d.glass.map(p => projectPoint(p, cam));
      group.appendChild(el("polygon", {
        points: ptsStr(g2),
        fill: glassFill,
        stroke: MAT.ink,
        "stroke-width": "0.6"
      }));
      for (const m of d.mullions) {
        const a = projectPoint(m.a, cam);
        const b = projectPoint(m.b, cam);
        group.appendChild(el("line", {
          x1: a.x.toFixed(1), y1: a.y.toFixed(1),
          x2: b.x.toFixed(1), y2: b.y.toFixed(1),
          stroke: frameColor,
          "stroke-width": m.thick ? "1.6" : "0.9"
        }));
      }
      for (const pan of d.panels) {
        const p2 = pan.map(p => projectPoint(p, cam));
        group.appendChild(el("polygon", {
          points: ptsStr(p2),
          fill: shadeColor(MAT.door, n, -0.07),
          stroke: MAT.inkSoft,
          "stroke-width": "0.55"
        }));
      }
    }
  }

  // ── Render 2D Printable Cardboard Cut-and-Fold Net ─────────────────
  function renderCutoutNet() {
    layerBase.innerHTML = "";
    layerModel.innerHTML = "";
    layerNet.innerHTML = "";
    layerHud.innerHTML = "";

    const g = layerNet;
    const S = 12.2; // scale px per model unit
    const cut = "#3c2714";
    const fold = "#8a6239";
    const wallFill = "#dec29b";
    const roofFill = "#b58b60";
    const tabFill = "#e9d8be";

    function rect(x, y, w, h, fill, dashed = false) {
      g.appendChild(el("rect", {
        x, y, width: w, height: h, fill,
        stroke: dashed ? fold : cut,
        "stroke-width": dashed ? "0.8" : "1.1",
        "stroke-dasharray": dashed ? "4 3" : ""
      }));
    }
    function line(x1, y1, x2, y2, dashed = false, sw = 0.9) {
      g.appendChild(el("line", {
        x1, y1, x2, y2,
        stroke: dashed ? fold : cut,
        "stroke-width": sw,
        "stroke-dasharray": dashed ? "4 3" : ""
      }));
    }
    function tab(x1, y1, x2, y2, dx, dy) {
      const pts = `${x1},${y1} ${x1+dx},${y1+dy} ${x2+dx},${y2+dy} ${x2},${y2}`;
      g.appendChild(el("polygon", { points: pts, fill: tabFill, stroke: cut, "stroke-width": "0.8" }));
    }
    function win(x, y, w, h, cols, rows) {
      g.appendChild(el("rect", { x, y, width: w, height: h, fill: "#f4ead8", stroke: cut, "stroke-width": "0.7" }));
      g.appendChild(el("rect", { x: x+1.5, y: y+1.5, width: w-3, height: h-3, fill: "#46555e", stroke: cut, "stroke-width": "0.4" }));
      for (let c = 1; c < cols; c++) line(x + (w * c) / cols, y + 1.5, x + (w * c) / cols, y + h - 1.5, false, 0.7);
      for (let r = 1; r < rows; r++) line(x + 1.5, y + (h * r) / rows, x + w - 1.5, y + (h * r) / rows, false, 0.7);
    }
    function label(x, y, text, anchor = "middle") {
      const t = el("text", { x, y, fill: "#593e24", "font-size": "9", "font-family": "ui-monospace, SFMono-Regular, monospace", "text-anchor": anchor });
      t.textContent = text;
      g.appendChild(t);
    }

    // 1. Main 4-wall strip (bottom)
    const x0 = 36, yBase = 342;
    const wGable = 11.8 * S; // 143.96
    const wLong = 14.2 * S;  // 173.24
    const hWall = 5.4 * S;   // 65.88
    const hPlinth = 1.2 * S;
    const hGable = 6.0 * S;  // 73.2

    const xs = [x0, x0 + wGable, x0 + wGable + wLong, x0 + 2 * wGable + wLong, x0 + 2 * wGable + 2 * wLong];
    // Glue tab on far left
    tab(xs[0], yBase, xs[0], yBase - hWall, -11, 5);

    // Wall 1: Garden Gable
    rect(xs[0], yBase - hWall, wGable, hWall, wallFill);
    g.appendChild(el("polygon", { points: `${xs[0]},${yBase-hWall} ${xs[1]},${yBase-hWall} ${(xs[0]+xs[1])/2},${yBase-hWall-hGable}`, fill: wallFill, stroke: cut, "stroke-width": "1.1" }));
    // Garden door + 2 gable windows
    win(xs[0] + wGable*0.5 - 13, yBase - hPlinth - 38, 26, 38, 4, 3);
    win(xs[0] + wGable*0.28 - 11, yBase - hWall - 32, 22, 24, 3, 3);
    win(xs[0] + wGable*0.72 - 11, yBase - hWall - 32, 22, 24, 3, 3);
    label((xs[0]+xs[1])/2, yBase + 13, "HAVEGAVL");

    // Wall 2: Front Entrance Facade
    rect(xs[1], yBase - hWall, wLong, hWall, wallFill);
    win(xs[1] + 15, yBase - hPlinth - 32, 11, 16, 1, 2);
    win(xs[1] + 40, yBase - hPlinth - 42, 21, 40, 4, 1);
    win(xs[1] + 102, yBase - hPlinth - 38, 8, 13, 1, 2);
    win(xs[1] + 124, yBase - hPlinth - 38, 30, 30, 4, 3);
    label((xs[1]+xs[2])/2, yBase + 13, "INDGANGSSIDE");

    // Wall 3: Bay Window Gable
    rect(xs[2], yBase - hWall, wGable, hWall, wallFill);
    g.appendChild(el("polygon", { points: `${xs[2]},${yBase-hWall} ${xs[3]},${yBase-hWall} ${(xs[2]+xs[3])/2},${yBase-hWall-hGable}`, fill: wallFill, stroke: cut, "stroke-width": "1.1" }));
    // Dashed bay attachment outline
    rect(xs[2] + wGable*0.5 - 28, yBase - hWall + 2, 56, hWall - 2, "none", true);
    win(xs[2] + wGable*0.28 - 11, yBase - hWall - 32, 22, 24, 3, 3);
    win(xs[2] + wGable*0.72 - 11, yBase - hWall - 32, 22, 24, 3, 3);
    label((xs[2]+xs[3])/2, yBase + 13, "KARNAPGAVL");

    // Wall 4: Back Garden Facade
    rect(xs[3], yBase - hWall, wLong, hWall, wallFill);
    win(xs[3] + 20, yBase - hPlinth - 40, 30, 31, 4, 4);
    win(xs[3] + 122, yBase - hPlinth - 40, 30, 31, 4, 4);
    label((xs[3]+xs[4])/2, yBase + 13, "BAGSIDE");

    // Plinth line & fold lines across all 4 walls
    line(xs[0], yBase - hPlinth, xs[4], yBase - hPlinth, false, 0.7);
    for (let i = 1; i <= 3; i++) line(xs[i], yBase, xs[i], yBase - hWall, true, 1.0);
    line(xs[0], yBase - hWall, xs[1], yBase - hWall, true, 0.9);
    line(xs[2], yBase - hWall, xs[3], yBase - hWall, true, 0.9);

    // 2. Pitched Roof Net (top-left)
    const rx = 36, ry = 22, rw = 14.9 * S, rh = 8.4 * S * 0.82;
    tab(rx, ry, rx + rw, ry, 0, -9);
    rect(rx, ry, rw, rh, roofFill);
    rect(rx, ry + rh, rw, rh, roofFill);
    line(rx, ry + rh, rx + rw, ry + rh, true, 1.2); // ridge fold
    // Dormer slot & skylight on front slope
    rect(rx + rw * 0.44, ry + rh * 0.25, 30, 26, "#f4ead8", true);
    win(rx + rw * 0.28, ry + rh * 0.68, 11, 13, 2, 2);
    label(rx + rw * 0.5, ry + rh * 0.92, "TAG · FOLD VED KIPPEN");

    // 3. Bay Window (Karnap) Mini-Net (top-center)
    const bx = 266, by = 36, bSide = 1.35 * S, bFront = 4.7 * S, bH = 5.25 * S;
    rect(bx, by, bSide, bH, wallFill);
    rect(bx + bSide, by, bFront, bH, wallFill);
    rect(bx + bSide + bFront, by, bSide, bH, wallFill);
    win(bx + bSide + 4, by + 11, bFront - 8, 29, 6, 4);
    win(bx + 2, by + 11, bSide - 4, 29, 2, 4);
    win(bx + bSide + bFront + 2, by + 11, bSide - 4, 29, 2, 4);
    line(bx + bSide, by, bx + bSide, by + bH, true);
    line(bx + bSide + bFront, by, bx + bSide + bFront, by + bH, true);
    tab(bx, by, bx, by + bH, -8, 4);
    tab(bx + 2*bSide + bFront, by, bx + 2*bSide + bFront, by + bH, 8, 4);
    label(bx + bSide + bFront/2, by + bH + 14, "KARNAP");

    // 4. Dormer (Kvist) & Chimney Mini-Nets (top-right)
    const kx = 415, ky = 42, kw = 32, kh = 26;
    rect(kx, ky, kw, kh, wallFill);
    g.appendChild(el("polygon", { points: `${kx},${ky} ${kx+kw},${ky} ${kx+kw/2},${ky-11}`, fill: wallFill, stroke: cut, "stroke-width": "1" }));
    win(kx + 4, ky + 4, kw - 8, kh - 8, 4, 3);
    rect(kx - 16, ky, 16, kh, wallFill);
    rect(kx + kw, ky, 16, kh, wallFill);
    line(kx, ky, kx, ky + kh, true);
    line(kx + kw, ky, kx + kw, ky + kh, true);
    label(kx + kw/2, ky + kh + 14, "KVIST");

    // Chimney strip
    const chx = 515, chy = 38, chW = 18, chD = 14, chH = 30;
    rect(chx, chy, chW, chH, "#ba8a62");
    rect(chx + chW, chy, chD, chH, "#ba8a62");
    rect(chx + chW + chD, chy, chW, chH, "#ba8a62");
    rect(chx + 2*chW + chD, chy, chD, chH, "#ba8a62");
    line(chx + chW, chy, chx + chW, chy + chH, true);
    line(chx + chW + chD, chy, chx + chW + chD, chy + chH, true);
    line(chx + 2*chW + chD, chy, chx + 2*chW + chD, chy + chH, true);
    label(chx + chW + chD, chy + chH + 14, "SKORSTEN");

    // Legend
    line(650, 36, 676, 36, false, 1.2);
    label(682, 39, "Fuld streg = klip", "start");
    line(650, 54, 676, 54, true, 1.1);
    label(682, 57, "Stiplet = fold", "start");
  }

  // ── Animation & Render Loop ────────────────────────────────────────
  let rafId = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tick() {
    let dirty = false;
    if (state.spin && state.mode !== "net" && !state.dragging) {
      state.targetYaw += 0.008;
      dirty = true;
    }
    const dy = state.targetYaw - state.yaw;
    const dp = state.targetPitch - state.pitch;
    const dl = state.targetLift - state.lift;
    const de = state.targetExplode - state.explode;

    if (reduceMotion) {
      // Jump straight to the new view instead of gliding there.
      state.yaw = state.targetYaw; state.pitch = state.targetPitch;
      state.lift = state.targetLift; state.explode = state.targetExplode;
    } else if (Math.abs(dy) > 0.0005 || Math.abs(dp) > 0.0005 || Math.abs(dl) > 0.0005 || Math.abs(de) > 0.0005) {
      state.yaw += dy * 0.16;
      state.pitch += dp * 0.16;
      state.lift += dl * 0.14;
      state.explode += de * 0.14;
      dirty = true;
    }

    if (state.mode === "net") {
      renderCutoutNet();
    } else {
      render3D();
    }

    if (dirty || state.spin) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function requestRender() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  // ── UI Wiring ──────────────────────────────────────────────────────
  const modeBtns = document.querySelectorAll(".mode-btn");
  const viewBtns = document.querySelectorAll(".view-btn");
  const sliderLift = document.getElementById("slider-lift");
  const sliderZoom = document.getElementById("slider-zoom");
  const btnLamp = document.getElementById("btn-lamp");
  const btnSpin = document.getElementById("btn-spin");
  const viewPresets = document.getElementById("view-presets");
  const explodeWrap = document.getElementById("explode-wrap");
  const zoomWrap = document.getElementById("zoom-wrap");
  const statusNote = document.getElementById("status-note");

  function updateActiveStyles() {
    modeBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
    btnLamp.setAttribute("aria-pressed", String(state.lamp));
    btnSpin.setAttribute("aria-pressed", String(state.spin));

    const isNet = state.mode === "net";
    viewPresets.hidden = isNet;
    explodeWrap.hidden = isNet;
    zoomWrap.hidden = isNet;
    svg.classList.toggle("flat", isNet);
    statusNote.textContent = isNet
      ? "Udklipsark: fuld streg = klip, stiplet = fold"
      : "Træk i modellen for at dreje den";
  }

  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      if (state.mode === "assembled") {
        state.targetLift = 0; state.targetExplode = 0; sliderLift.value = 0;
      } else if (state.mode === "lift") {
        state.targetLift = 1; state.targetExplode = 0; sliderLift.value = 100;
        if (state.targetPitch < 0.35) state.targetPitch = 0.44;
      } else if (state.mode === "exploded") {
        state.targetLift = 0.45; state.targetExplode = 1; sliderLift.value = 100;
        if (state.targetPitch < 0.35) state.targetPitch = 0.42;
      }
      updateActiveStyles();
      requestRender();
    });
  });

  const PRESETS = {
    hero:   { yaw: -2.48, pitch: 0.34 },
    front:  { yaw: -3.14, pitch: 0.10 },
    bay:    { yaw: -1.57, pitch: 0.10 },
    back:   { yaw: 0.0,   pitch: 0.10 },
    garden: { yaw: 1.57,  pitch: 0.10 }
  };
  viewBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.view];
      if (!p) return;
      state.spin = false;
      state.targetYaw = p.yaw;
      state.targetPitch = p.pitch;
      updateActiveStyles();
      requestRender();
    });
  });

  sliderLift.addEventListener("input", () => {
    const v = Number(sliderLift.value) / 100;
    if (state.mode === "exploded") {
      state.targetExplode = v;
      state.targetLift = v * 0.45;
    } else {
      state.targetLift = v;
      state.targetExplode = 0;
    }
    requestRender();
  });

  sliderZoom.addEventListener("input", () => {
    state.zoom = Number(sliderZoom.value) / 100;
    requestRender();
  });

  btnLamp.addEventListener("click", () => {
    state.lamp = !state.lamp;
    updateActiveStyles();
    requestRender();
  });

  btnSpin.addEventListener("click", () => {
    state.spin = !state.spin;
    updateActiveStyles();
    requestRender();
  });


  // Pointer drag orbit. No wheel zoom: the model sits inside a page, and the wheel must scroll it.
  svg.addEventListener("pointerdown", e => {
    if (state.mode === "net") return;
    state.dragging = true;
    state.spin = false;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    svg.setPointerCapture(e.pointerId);
    updateActiveStyles();
  });
  svg.addEventListener("pointermove", e => {
    if (!state.dragging || state.mode === "net") return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.targetYaw -= dx * 0.0085;
    state.targetPitch = Math.max(-0.08, Math.min(1.25, state.targetPitch + dy * 0.0075));
    state.yaw = state.targetYaw;
    state.pitch = state.targetPitch;
    requestRender();
  });
  svg.addEventListener("pointerup", () => { state.dragging = false; });
  svg.addEventListener("pointercancel", () => { state.dragging = false; });


  // Initial draw
  updateActiveStyles();
  render3D();
})();
