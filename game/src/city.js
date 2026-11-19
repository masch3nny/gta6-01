// Solmar Bay — the city itself: streets, buildings, beach, palms, sky and light.
// Builds the whole 3D world once and exposes colliders + helpers for the game.
(function () {
  'use strict';
  var SB = window.SB;

  var scene = null, sun = null, hemi = null;
  var colliders = []; // {minX,maxX,minZ,maxZ} building footprints (AABB)
  var lampPositions = [];
  var buildingGeos = {};
  var facadeMats = [];

  // A facade texture: rows of windows on a warm wall, drawn once on a canvas.
  function facadeTexture(base, litRatio) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    // subtle vertical shading
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (var x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 256);
    for (var r = 0; r < 8; r++) {
      for (var col = 0; col < 4; col++) {
        var wx = 10 + col * 30, wy = 12 + r * 30;
        var lit = Math.random() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#2c4a63';
        g.fillRect(wx, wy, 20, 20);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(wx, wy, 20, 3);
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function roadTexture() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#2e3138'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#3a3e46';
    g.fillRect(0, 0, 64, 4); g.fillRect(0, 252, 64, 4);
    g.fillStyle = '#e8c33a';
    g.fillRect(30, 20, 4, 40); g.fillRect(30, 108, 4, 40); g.fillRect(30, 196, 4, 40);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  function addBox(x, y, z, w, h, d, mat, parent, shadow) {
    var m = new THREE.Mesh(buildingGeos.box, mat);
    m.position.set(x, y, z); m.scale.set(w, h, d);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    (parent || scene).add(m);
    return m;
  }

  function buildGround() {
    // Grass / dirt base.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SB.CITY * 2 + 120, SB.BEACH_Z + SB.CITY + 120),
      new THREE.MeshLambertMaterial({ color: SB.PALETTE.ground })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, (SB.BEACH_Z - SB.CITY) / 2);
    ground.receiveShadow = true;
    scene.add(ground);

    // Roads: dark strips along every street centreline, with dashed centres.
    var tex = roadTexture();
    var roadMat = new THREE.MeshLambertMaterial({ map: tex });
    var len = SB.CITY * 2 + 40;
    for (var i = -SB.HALF; i <= SB.HALF; i++) {
      var s = SB.streetAt(i);
      var rx = new THREE.Mesh(new THREE.PlaneGeometry(len, SB.ROAD), roadMat.clone());
      rx.material.map = tex.clone(); rx.material.map.repeat.set(len / 26, 1); rx.material.map.needsUpdate = true;
      rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, s); rx.receiveShadow = true; scene.add(rx);
      var rz = new THREE.Mesh(new THREE.PlaneGeometry(len, SB.ROAD), roadMat.clone());
      rz.material.map = tex.clone(); rz.material.map.repeat.set(len / 26, 1); rz.material.map.needsUpdate = true;
      rz.rotation.x = -Math.PI / 2; rz.rotation.z = Math.PI / 2; rz.position.set(s, 0.02, 0); rz.receiveShadow = true; scene.add(rz);
      // Sidewalks: pale strips flanking each road.
      var walkMat = new THREE.MeshLambertMaterial({ color: SB.PALETTE.sidewalk });
      var wx = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), walkMat);
      wx.rotation.x = -Math.PI / 2; wx.position.set(0, 0.015, s - SB.ROAD / 2 - 1.5); wx.receiveShadow = true; scene.add(wx);
      var wx2 = wx.clone(); wx2.position.z = s + SB.ROAD / 2 + 1.5; scene.add(wx2);
      var wz = new THREE.Mesh(new THREE.PlaneGeometry(3, len), walkMat);
      wz.rotation.x = -Math.PI / 2; wz.position.set(s - SB.ROAD / 2 - 1.5, 0.015, 0); wz.receiveShadow = true; scene.add(wz);
      var wz2 = wz.clone(); wz2.position.x = s + SB.ROAD / 2 + 1.5; scene.add(wz2);
    }

    // Beach sand + sea + pier.
    var sand = new THREE.Mesh(new THREE.PlaneGeometry(SB.CITY * 2 + 120, 46),
      new THREE.MeshLambertMaterial({ color: SB.PALETTE.sand }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.03, SB.BEACH_Z + 20); sand.receiveShadow = true;
    scene.add(sand);
    var sea = new THREE.Mesh(new THREE.PlaneGeometry(SB.CITY * 2 + 400, 320),
      new THREE.MeshLambertMaterial({ color: SB.PALETTE.sea, transparent: true, opacity: 0.94 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, SB.SEA_Z + 160);
    scene.add(sea);
    // Pier planks.
    var pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    for (var p = 0; p < 14; p++) {
      var plank = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 3), pierMat);
      plank.position.set(0, 0.6, SB.BEACH_Z + 8 + p * 3.2); plank.castShadow = true; scene.add(plank);
    }
    // Beach umbrellas.
    var umbMat = new THREE.MeshLambertMaterial({ color: 0xff7a5c });
    var umbMat2 = new THREE.MeshLambertMaterial({ color: 0x2a9d8f });
    for (var u = 0; u < 10; u++) {
      var ux = -180 + u * 40 + SB.rand(-8, 8);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6),
        new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(ux, 1.5, SB.BEACH_Z + 12 + SB.rand(-4, 4)); scene.add(pole);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 8), u % 2 ? umbMat : umbMat2);
      cone.position.set(pole.position.x, 3.4, pole.position.z); cone.castShadow = true; scene.add(cone);
    }
  }

  function buildBuildings() {
    var bases = ['#e8b48a', '#f2d5a0', '#9fc3d8', '#d88a7a', '#b8c4a8', '#e0a3b5', '#8fb8a8', '#f0e0c0'];
    facadeMats = bases.map(function (b, idx) {
      var tex = facadeTexture(b, 0.35 + (idx % 3) * 0.12);
      return new THREE.MeshLambertMaterial({ map: tex, emissive: 0x664422, emissiveMap: tex, emissiveIntensity: 0.35 });
    });
    buildingGeos.box = new THREE.BoxGeometry(1, 1, 1);
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });

    for (var i = -SB.HALF; i <= SB.HALF; i++) {
      for (var j = -SB.HALF; j <= SB.HALF; j++) {
        if (i === 0 && j === 0) continue; // Palm Plaza stays open
        if (i === -3 && j === 3) continue; // docks yard stays open
        var cx = SB.streetAt(i) + SB.PITCH / 2;
        var cz = SB.streetAt(j) + SB.PITCH / 2;
        var downtown = 1 - (Math.abs(i) + Math.abs(j)) / (SB.HALF * 2);
        var count = downtown > 0.55 ? 3 : (Math.random() < 0.6 ? 2 : 1);
        for (var k = 0; k < count; k++) {
          var w = SB.rand(12, 22), d = SB.rand(12, 22);
          var h = (6 + downtown * 46) * SB.rand(0.7, 1.25);
          if (downtown > 0.8) h = SB.rand(38, 62);
          var ox = SB.rand(-9, 9), oz = SB.rand(-9, 9);
          var bx = cx + ox, bz = cz + oz;
          // keep clear of the road strips
          if (Math.abs(bx - SB.streetAt(i)) - w / 2 < SB.ROAD / 2 + 2) bx = cx;
          if (Math.abs(bz - SB.streetAt(j)) - d / 2 < SB.ROAD / 2 + 2) bz = cz;
          var mat = SB.pick(facadeMats);
          var b = addBox(bx, h / 2, bz, w, h, d, mat);
          b.material.map = mat.map; // shared texture
          // roof cap
          var roof = new THREE.Mesh(buildingGeos.box, roofMat);
          roof.position.set(bx, h + 0.3, bz); roof.scale.set(w + 0.6, 0.6, d + 0.6);
          scene.add(roof);
          // rooftop box (AC unit) on some
          if (Math.random() < 0.4) {
            addBox(bx + SB.rand(-4, 4), h + 1.2, bz + SB.rand(-4, 4), 3, 1.6, 3,
              new THREE.MeshLambertMaterial({ color: 0x777777 }));
          }
          colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
        }
      }
    }
  }

  function buildProps() {
    // Streetlights at street corners.
    var poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x333a40 });
    var lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (var i = -SB.HALF; i <= SB.HALF; i++) {
      for (var j = -SB.HALF; j <= SB.HALF; j++) {
        if ((i + j) % 2 !== 0) continue;
        var x = SB.streetAt(i) + SB.ROAD / 2 + 2.2, z = SB.streetAt(j) + SB.ROAD / 2 + 2.2;
        var pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 3.25, z); scene.add(pole);
        var lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(x, 6.6, z); scene.add(lamp);
        lampPositions.push({ x: x, z: z });
      }
    }
    // Palm trees along the beach avenue and the plaza.
    var trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 7, 7);
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57, side: THREE.DoubleSide });
    var leafGeo = new THREE.ConeGeometry(2.2, 4.5, 4);
    function palm(x, z) {
      var t = new THREE.Mesh(trunkGeo, trunkMat);
      t.position.set(x, 3.5, z); t.castShadow = true; scene.add(t);
      for (var l = 0; l < 5; l++) {
        var leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(x, 7.2, z);
        leaf.rotation.z = 1.1; leaf.rotation.y = (l / 5) * Math.PI * 2;
        leaf.castShadow = true; scene.add(leaf);
      }
    }
    for (var px = -200; px <= 200; px += 26) palm(px + SB.rand(-3, 3), SB.BEACH_Z - 8);
    palm(-14, -14); palm(14, -14); palm(-14, 14); palm(14, 14);
    palm(-40, 26); palm(40, -26);
  }

  function buildSky() {
    scene.background = new THREE.Color(SB.PALETTE.sky);
    scene.fog = new THREE.Fog(SB.PALETTE.fog, 220, 620);
    hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.75);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffe9b0, 1.25);
    sun.position.set(140, 220, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 700;
    scene.add(sun);
    scene.add(sun.target);
    // Sun disc + a few flat clouds.
    var disc = new THREE.Mesh(new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }));
    disc.position.set(260, 260, -320); disc.lookAt(0, 0, 0); scene.add(disc);
    var cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    var clouds = [[-180, 150, -260, 60], [120, 170, -300, 80], [260, 140, 120, 55], [-260, 160, 160, 70], [40, 180, 260, 90]];
    clouds.forEach(function (c) {
      var cl = new THREE.Mesh(new THREE.BoxGeometry(c[3], 7, 22), cloudMat);
      cl.position.set(c[0], c[1], c[2]); scene.add(cl);
    });
  }

  // Point-in-building test (for player/car collision + spawning).
  function hitsBuilding(x, z, pad) {
    pad = pad || 0;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return c;
    }
    return null;
  }
  function resolveCircle(x, z, radius) {
    // Push a circle out of any building AABB it overlaps. Returns corrected {x,z}.
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      var nx = SB.clamp(x, c.minX, c.maxX), nz = SB.clamp(z, c.minZ, c.maxZ);
      var dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius && d2 > 0.0001) {
        var d = Math.sqrt(d2);
        x = nx + (dx / d) * radius; z = nz + (dz / d) * radius;
      } else if (d2 <= 0.0001) {
        // centre inside the box: push out along the smallest penetration axis
        var pl = x - (c.minX - radius), pr = (c.maxX + radius) - x;
        var pt = z - (c.minZ - radius), pb = (c.maxZ + radius) - z;
        var m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - radius; else if (m === pr) x = c.maxX + radius;
        else if (m === pt) z = c.minZ - radius; else z = c.maxZ + radius;
      }
    }
    return { x: x, z: z };
  }

  SB.City = {
    init: function (threeScene) {
      scene = threeScene;
      buildGround();
      buildBuildings();
      buildProps();
      buildSky();
    },
    setSun: function (elevation, azimuth, warmth) {
      // Re-aim the sun (used by the dusk driving shot).
      var el = elevation, az = azimuth;
      sun.position.set(Math.cos(az) * Math.cos(el) * 300, Math.sin(el) * 300, Math.sin(az) * Math.cos(el) * 300);
      sun.color.setHex(warmth || 0xffe9b0);
    },
    followShadows: function (x, z) {
      sun.position.set(x + 140, 220, z + 90);
      sun.target.position.set(x, 0, z);
    },
    hitsBuilding: hitsBuilding,
    resolveCircle: resolveCircle,
    colliders: colliders,
    lampPositions: lampPositions
  };
})();
