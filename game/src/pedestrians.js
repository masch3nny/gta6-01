// Solmar Bay — pedestrians: sidewalk walkers who flee from danger.
(function () {
  'use strict';
  var SB = window.SB;

  var scene = null;
  var peds = [];
  var bodyGeo, headGeo;
  var SHIRTS = [0xe85d5d, 0x5da8e8, 0x7ac74f, 0xe8b13c, 0xb06fd0, 0xe8e8e8, 0x3aa6a0, 0xd06f9b];
  var PANTS = [0x2c3e50, 0x5a4632, 0x334455, 0x6b4a2f];

  function makePedMesh(shirt, pants) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 1.05; body.castShadow = true; g.add(body);
    var head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
    head.position.y = 1.78; head.castShadow = true; g.add(head);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22),
      new THREE.MeshLambertMaterial({ color: pants }));
    legL.position.set(0, 0.35, 0.16); g.add(legL);
    var legR = legL.clone(); legR.position.z = -0.16; g.add(legR);
    g.userData.legL = legL; g.userData.legR = legR;
    return g;
  }

  function spawnPed(x, z) {
    var axis = Math.random() < 0.5 ? 'x' : 'z';
    var line = Math.round((axis === 'x' ? z : x) / SB.PITCH) * SB.PITCH;
    var side = SB.pick([-1, 1]) * (SB.ROAD / 2 + 1.6);
    var px = axis === 'x' ? x : line + side;
    var pz = axis === 'x' ? line + side : z;
    var g = makePedMesh(SB.pick(SHIRTS), SB.pick(PANTS));
    g.position.set(px, 0, pz);
    scene.add(g);
    var ped = {
      group: g, x: px, z: pz, axis: axis, line: line, side: side,
      dir: SB.pick([-1, 1]), speed: SB.rand(1.2, 2.1),
      state: 'walk', // walk | flee | down
      downTimer: 0, walkPhase: Math.random() * 10, health: 100
    };
    g.rotation.y = axis === 'x' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    peds.push(ped);
    return ped;
  }

  function scare(x, z, radius) {
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p.state === 'down') continue;
      if (SB.dist2d(x, z, p.x, p.z) < radius) {
        p.state = 'flee';
        p.fleeX = x; p.fleeZ = z; p.fleeTimer = 4;
      }
    }
  }

  function knockDown(ped) {
    ped.state = 'down';
    ped.downTimer = 6;
    ped.group.rotation.x = Math.PI / 2;
    ped.group.position.y = 0.35;
  }

  function update(dt, playerX, playerZ, playerSpeed) {
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.state = 'walk';
          p.group.rotation.x = 0;
          p.group.position.y = 0;
        }
        continue;
      }
      var speed = p.speed;
      var tx = p.x, tz = p.z;
      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        speed = 5.2;
        var dx = p.x - p.fleeX, dz = p.z - p.fleeZ;
        var d = Math.sqrt(dx * dx + dz * dz) || 1;
        tx = p.x + (dx / d) * speed * dt;
        tz = p.z + (dz / d) * speed * dt;
        p.group.rotation.y = Math.atan2(-(dz / d), dx / d);
        if (p.fleeTimer <= 0) p.state = 'walk';
      } else {
        // walk along the sidewalk line; turn at junctions sometimes
        if (p.axis === 'x') { tx = p.x + p.dir * speed * dt; }
        else { tz = p.z + p.dir * speed * dt; }
        var along = p.axis === 'x' ? tx : tz;
        var atJunction = Math.abs(Math.round(along / SB.PITCH) * SB.PITCH - along) < 2.5;
        if (atJunction && Math.random() < dt * 0.25) {
          // turn onto the cross sidewalk
          var nx = Math.round(tx / SB.PITCH) * SB.PITCH;
          var nz = Math.round(tz / SB.PITCH) * SB.PITCH;
          p.x = nx; p.z = nz;
          p.axis = p.axis === 'x' ? 'z' : 'x';
          p.line = p.axis === 'x' ? p.z : p.x;
          p.side = SB.pick([-1, 1]) * (SB.ROAD / 2 + 1.6);
          p.dir = SB.pick([-1, 1]);
          p.group.rotation.y = p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        }
        if (Math.abs(along) > SB.CITY - 6) { p.dir *= -1; p.group.rotation.y += Math.PI; }
      }
      // stay on the sidewalk line (unless fleeing)
      if (p.state !== 'flee') {
        if (p.axis === 'x') tz = p.line + p.side; else tx = p.line + p.side;
      }
      var c = SB.clampCity(tx, tz);
      p.x = c.x; p.z = c.z;
      // legs swing
      p.walkPhase += dt * speed * 2.4;
      var swing = Math.sin(p.walkPhase) * 0.45;
      p.group.userData.legL.rotation.x = swing;
      p.group.userData.legR.rotation.x = -swing;
      p.group.position.set(p.x, p.group.position.y, p.z);
    }
  }

  SB.Pedestrians = {
    init: function (threeScene, count) {
      scene = threeScene;
      bodyGeo = new THREE.BoxGeometry(0.62, 0.85, 0.42);
      headGeo = new THREE.SphereGeometry(0.26, 10, 8);
      for (var i = 0; i < (count || 26); i++) {
        spawnPed(SB.rand(-SB.CITY + 10, SB.CITY - 10), SB.rand(-SB.CITY + 10, SB.CITY - 10));
      }
    },
    update: update,
    scare: scare,
    knockDown: knockDown,
    peds: peds,
    nearestPed: function (x, z, maxD) {
      var best = null, bd = maxD;
      for (var i = 0; i < peds.length; i++) {
        var p = peds[i];
        if (p.state === 'down') continue;
        var d = SB.dist2d(x, z, p.x, p.z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }
  };
})();
