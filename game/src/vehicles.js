// Solmar Bay — vehicles: car factory, traffic AI and parked cars.
(function () {
  'use strict';
  var SB = window.SB;

  var scene = null;
  var traffic = [];   // moving AI cars
  var parked = [];    // stealable parked cars
  var allCars = [];   // every car object {group, x, z, angle, speed, ...}
  var wheelGeo, bodyGeo, cabinGeo;

  function makeCarMesh(color, isCop) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.62; body.castShadow = true; g.add(body);
    var cabinMat = new THREE.MeshLambertMaterial({ color: isCop ? 0xdfe8f2 : 0x1d2f42 });
    var cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-0.15, 1.18, 0); cabin.castShadow = true; g.add(cabin);
    // headlights + taillights (front is local +X)
    var hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    var tlMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    [[2.06, 0.62, 0.7], [2.06, 0.62, -0.7]].forEach(function (p) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.34), hlMat);
      hl.position.set(p[0], p[1], p[2]); g.add(hl);
    });
    [[-2.06, 0.62, 0.7], [-2.06, 0.62, -0.7]].forEach(function (p) {
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.34), tlMat);
      tl.position.set(p[0], p[1], p[2]); g.add(tl);
    });
    // wheels (holders spin around the axle = local Z)
    var wheels = [];
    [[1.35, 0.95], [1.35, -0.95], [-1.35, 0.95], [-1.35, -0.95]].forEach(function (p) {
      var holder = new THREE.Group();
      holder.position.set(p[0], 0.34, p[1]);
      var w = new THREE.Mesh(wheelGeo, new THREE.MeshLambertMaterial({ color: 0x141414 }));
      w.rotation.x = Math.PI / 2; w.castShadow = true;
      holder.add(w); g.add(holder); wheels.push(holder);
    });
    // police light bar
    var lightBar = null;
    if (isCop) {
      lightBar = new THREE.Group();
      var lr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5),
        new THREE.MeshBasicMaterial({ color: SB.PALETTE.copLightRed }));
      lr.position.x = -0.25; lightBar.add(lr);
      var lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5),
        new THREE.MeshBasicMaterial({ color: SB.PALETTE.copLightBlue }));
      lb.position.x = 0.25; lightBar.add(lb);
      lightBar.position.set(-0.15, 1.62, 0);
      g.add(lightBar);
      var star = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      star.position.set(0, 0.75, 1.03); g.add(star);
      var star2 = star.clone(); star2.position.z = -1.03; g.add(star2);
    }
    g.userData.wheels = wheels;
    g.userData.lightBar = lightBar;
    return g;
  }

  function spawnCar(x, z, angle, opts) {
    opts = opts || {};
    var color = opts.color !== undefined ? opts.color : SB.pick(SB.PALETTE.carColors);
    var group = makeCarMesh(color, !!opts.cop);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    scene.add(group);
    var car = {
      group: group, x: x, z: z, angle: angle, speed: 0,
      color: color, cop: !!opts.cop, target: opts.target || null,
      isTraffic: !!opts.traffic, isParked: !!opts.parked,
      isTarget: !!opts.targetCar, health: 100, stuck: 0,
      steer: 0, lightPhase: Math.random() * 10
    };
    allCars.push(car);
    if (car.isTraffic) traffic.push(car);
    if (car.isParked) parked.push(car);
    return car;
  }

  function randomStreetSpot() {
    var i = Math.floor(SB.rand(-SB.HALF, SB.HALF + 1));
    var j = Math.floor(SB.rand(-SB.HALF, SB.HALF + 1));
    var axis = Math.random() < 0.5 ? 'x' : 'z';
    var lane = SB.pick([-3.4, 3.4]);
    var t = SB.rand(-SB.CITY + 20, SB.CITY - 20);
    if (axis === 'x') return { x: t, z: SB.streetAt(j) + lane, angle: lane > 0 ? 0 : Math.PI, axis: 'x', line: SB.streetAt(j) };
    return { x: SB.streetAt(i) + lane, z: t, angle: lane > 0 ? -Math.PI / 2 : Math.PI / 2, axis: 'z', line: SB.streetAt(i) };
  }

  function spawnTraffic(n) {
    for (var k = 0; k < n; k++) {
      var s = randomStreetSpot();
      var car = spawnCar(s.x, s.z, s.angle, { traffic: true });
      car.axis = s.axis; car.line = s.line;
      car.cruise = SB.rand(7, 12);
      car.speed = car.cruise;
    }
  }

  function spawnParked(n) {
    var placed = 0, guard = 0;
    while (placed < n && guard++ < 200) {
      var s = randomStreetSpot();
      var edge = SB.pick([-1, 1]);
      var px = s.axis === 'x' ? s.x : s.line + edge * (SB.ROAD / 2 + 2.6);
      var pz = s.axis === 'x' ? s.line + edge * (SB.ROAD / 2 + 2.6) : s.z;
      if (SB.City.hitsBuilding(px, pz, 3)) continue;
      if (SB.dist2d(px, pz, 0, 0) < 18) continue;
      spawnCar(px, pz, s.angle + (edge > 0 ? 0 : Math.PI), { parked: true });
      placed++;
    }
  }

  function carAhead(car, dist) {
    var fx = Math.cos(car.angle), fz = -Math.sin(car.angle);
    var best = null, bestD = dist;
    for (var i = 0; i < allCars.length; i++) {
      var o = allCars[i];
      if (o === car || o.speed < 0.5 && o.isParked) continue;
      var dx = o.x - car.x, dz = o.z - car.z;
      var along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
      if (along > 0 && along < bestD && side < 2.6) { best = o; bestD = along; }
    }
    return best;
  }

  function updateTraffic(dt) {
    for (var i = 0; i < traffic.length; i++) {
      var car = traffic[i];
      if (car.held) continue; // player is driving this one
      var fx = Math.cos(car.angle), fz = -Math.sin(car.angle);
      // slow for the car ahead — and for the player crossing on foot
      var ahead = carAhead(car, 12);
      var want = ahead ? 0 : car.cruise;
      if (!SB.Player.state.inCar) {
        var P = SB.Player.state;
        var pdx = P.x - car.x, pdz = P.z - car.z;
        var along = pdx * fx + pdz * fz, side = Math.abs(-pdx * fz + pdz * fx);
        if (along > 0 && along < 10 && side < 2.6) want = 0;
      }
      car.speed = SB.lerp(car.speed, want, Math.min(1, dt * 1.5));
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      // at the end of a street, turn onto a cross street (or turn around)
      var limit = SB.CITY - 8;
      var offLine = Math.abs((car.axis === 'x' ? car.z : car.x) - car.line) > 0.5;
      var pastEnd = car.axis === 'x' ? Math.abs(car.x) > limit : Math.abs(car.z) > limit;
      if (pastEnd || offLine) {
        var atJunction = Math.abs(Math.round((car.axis === 'x' ? car.x : car.z) / SB.PITCH) * SB.PITCH -
          (car.axis === 'x' ? car.x : car.z)) < 10;
        if (atJunction && Math.random() < 0.6) {
          // turn 90 degrees onto the cross street
          var turn = SB.pick([-1, 1]) * Math.PI / 2;
          var nx = Math.round(car.x / SB.PITCH) * SB.PITCH;
          var nz = Math.round(car.z / SB.PITCH) * SB.PITCH;
          car.x = nx; car.z = nz;
          car.angle += turn;
          car.axis = car.axis === 'x' ? 'z' : 'x';
          car.line = car.axis === 'x' ? car.z : car.x;
        } else {
          // U-turn
          car.angle += Math.PI;
          car.line = car.axis === 'x' ? car.z : car.x;
        }
      }
      // keep inside the city
      var c = SB.clampCity(car.x, car.z);
      car.x = c.x; car.z = c.z;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.angle;
      // wheel spin
      var wheels = car.group.userData.wheels;
      for (var w = 0; w < wheels.length; w++) wheels[w].rotation.z -= car.speed * dt * 1.4;
      // light bar blink for cop cars (not traffic, but shared mesh)
      if (car.group.userData.lightBar) {
        car.lightPhase += dt * 6;
        car.group.userData.lightBar.visible = Math.sin(car.lightPhase) > -0.2;
      }
    }
  }

  SB.Vehicles = {
    init: function (threeScene) {
      scene = threeScene;
      wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10);
      bodyGeo = new THREE.BoxGeometry(4.1, 0.62, 2.1);
      cabinGeo = new THREE.BoxGeometry(2.2, 0.62, 1.7);
      spawnTraffic(16);
      spawnParked(14);
    },
    spawnCar: spawnCar,
    // Stage a traffic car at an exact spot (used by screenshot staging).
    stageTraffic: function (x, z, angle) {
      var axis = Math.abs(Math.cos(angle)) > 0.7 ? 'x' : 'z';
      var line = axis === 'x' ? Math.round(z / SB.PITCH) * SB.PITCH : Math.round(x / SB.PITCH) * SB.PITCH;
      var car = spawnCar(x, z, angle, { traffic: true });
      car.axis = axis; car.line = line; car.cruise = 10; car.speed = 10;
      return car;
    },
    updateTraffic: updateTraffic,
    allCars: allCars,
    traffic: traffic,
    parked: parked,
    nearestCar: function (x, z, maxD) {
      var best = null, bd = maxD;
      for (var i = 0; i < allCars.length; i++) {
        var car = allCars[i];
        if (car.held || car.dead) continue;
        var d = SB.dist2d(x, z, car.x, car.z);
        if (d < bd) { bd = d; best = car; }
      }
      return best;
    },
    removeCar: function (car) {
      scene.remove(car.group);
      [allCars, traffic, parked].forEach(function (arr) {
        var idx = arr.indexOf(car); if (idx >= 0) arr.splice(idx, 1);
      });
    }
  };
})();
