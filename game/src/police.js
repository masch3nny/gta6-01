// Solmar Bay — the Bayfront Police: wanted level, pursuit cars and foot cops.
(function () {
  'use strict';
  var SB = window.SB;

  var scene = null;
  var wanted = 0;
  var quietTimer = 0, decayTimer = 0;
  var cops = [];        // {kind:'car'|'foot', car|group, x, z, angle, speed, health, arrestTimer}
  var spawnTimer = 0;
  var onBusted = null, onWasted = null;

  function wantedTarget() {
    // how many pursuit units the current wanted level calls for
    return wanted === 0 ? 0 : Math.min(1 + wanted, 6);
  }

  function spawnCopCar() {
    var P = SB.Player.state;
    var ang = Math.random() * Math.PI * 2;
    var d = SB.rand(55, 80);
    var x = SB.clamp(P.x + Math.cos(ang) * d, -SB.CITY + 10, SB.CITY - 10);
    var z = SB.clamp(P.z + Math.sin(ang) * d, -SB.CITY + 10, SB.CITY - 10);
    var snap = SB.nearestStreetPoint(x, z);
    var car = SB.Vehicles.spawnCar(snap.x, snap.z, 0, { cop: true, color: SB.PALETTE.copCar });
    var cop = { kind: 'car', car: car, x: car.x, z: car.z, angle: 0, speed: 0, health: 100, arrestTimer: 0 };
    car.copRef = cop;
    cops.push(cop);
    return cop;
  }

  function spawnFootCop() {
    var P = SB.Player.state;
    var ang = Math.random() * Math.PI * 2;
    var x = P.x + Math.cos(ang) * 26, z = P.z + Math.sin(ang) * 26;
    var c = SB.clampCity(x, z);
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.44),
      new THREE.MeshLambertMaterial({ color: 0x1c3a6e }));
    body.position.y = 1.08; body.castShadow = true; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xd89a6a }));
    head.position.y = 1.8; g.add(head);
    var hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.14, 10),
      new THREE.MeshLambertMaterial({ color: 0x0e2247 }));
    hat.position.y = 2.0; g.add(hat);
    g.position.set(c.x, 0, c.z);
    scene.add(g);
    var cop = { kind: 'foot', group: g, x: c.x, z: c.z, angle: 0, speed: 0, health: 100, arrestTimer: 0, walkPhase: 0 };
    cops.push(cop);
    return cop;
  }

  function removeCop(cop) {
    var idx = cops.indexOf(cop);
    if (idx >= 0) cops.splice(idx, 1);
    if (cop.kind === 'car') {
      cop.car.dead = true;
      SB.Vehicles.removeCar(cop.car);
    } else {
      scene.remove(cop.group);
    }
  }

  function commitCrime(stars, note) {
    if (stars > 0) {
      wanted = Math.min(5, wanted + stars);
      quietTimer = 0; decayTimer = 0;
      if (wanted > SB.Game.save.bestWanted) SB.Game.save.bestWanted = wanted;
      SB.Audio.setSiren(wanted > 0);
      if (note) SB.HUD.toast(note + '  Wanted: ' + wanted + '★');
    }
  }

  function killCop(cop) {
    removeCop(cop);
    commitCrime(2, 'An officer is down — the whole Bay is after you.');
    SB.Audio.fail();
  }

  function update(dt, now) {
    var P = SB.Player.state;
    // decay: quiet + unseen for a while drops a star
    if (wanted > 0) {
      quietTimer += dt;
      var nearest = 999;
      cops.forEach(function (c) { nearest = Math.min(nearest, SB.dist2d(P.x, P.z, c.x, c.z)); });
      if (quietTimer > SB.TUNE.wantedDecayQuiet && nearest > 42) {
        decayTimer += dt;
        if (decayTimer > SB.TUNE.wantedDecayStep) {
          decayTimer = 0; wanted--;
          SB.HUD.toast(wanted > 0 ? 'Heat cooling off… ' + wanted + '★' : 'You lost them. Clean.');
          if (wanted === 0) SB.Audio.setSiren(false);
        }
      } else if (nearest <= 42) { decayTimer = 0; }
    }
    // keep the right number of pursuit units
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 1.2;
      var target = wantedTarget();
      if (cops.length < target && wanted > 0) {
        if (wanted >= 2 && cops.filter(function (c) { return c.kind === 'foot'; }).length < 2 && !P.inCar) spawnFootCop();
        else spawnCopCar();
      } else if (cops.length > target) {
        // stand down the farthest unit when the heat drops
        var far = null, fd = -1;
        cops.forEach(function (c) {
          var d = SB.dist2d(P.x, P.z, c.x, c.z);
          if (d > fd) { fd = d; far = c; }
        });
        if (far) removeCop(far);
      }
    }
    // pursuit behaviour
    for (var i = cops.length - 1; i >= 0; i--) {
      var cop = cops[i];
      var dx = P.x - cop.x, dz = P.z - cop.z;
      var dist = Math.sqrt(dx * dx + dz * dz) || 1;
      if (cop.kind === 'car') {
        var car = cop.car;
        var wantAngle = Math.atan2(-dz, dx);
        var diff = ((wantAngle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        car.angle += SB.clamp(diff, -1.6 * dt, 1.6 * dt);
        var targetSpeed = wanted >= 4 ? 30 : wanted >= 3 ? 26 : 21;
        // slow down to ram, not to orbit
        if (dist < 6) targetSpeed = 14;
        car.speed = SB.lerp(car.speed, targetSpeed, Math.min(1, dt * 1.2));
        var fx = Math.cos(car.angle), fz = -Math.sin(car.angle);
        var nx = car.x + fx * car.speed * dt, nz = car.z + fz * car.speed * dt;
        if (!SB.City.hitsBuilding(nx, nz, 2.1)) { car.x = nx; car.z = nz; }
        else { car.angle += Math.PI * 0.5 * dt * 8; car.speed *= 0.5; }
        var c2 = SB.clampCity(car.x, car.z);
        car.x = c2.x; car.z = c2.z;
        car.group.position.set(car.x, 0, car.z);
        car.group.rotation.y = car.angle;
        var wheels = car.group.userData.wheels;
        for (var w = 0; w < wheels.length; w++) wheels[w].rotation.z -= car.speed * dt * 1.4;
        car.lightPhase += dt * 6;
        if (car.group.userData.lightBar) car.group.userData.lightBar.visible = Math.sin(car.lightPhase) > -0.2;
        cop.x = car.x; cop.z = car.z;
        // ram the player
        if (dist < 4.6) {
          if (P.inCar) {
            P.car.speed *= 0.86;
            SB.Audio.punch();
          } else {
            SB.Player.damage(SB.TUNE.copRamDamage * dt * 3, now);
          }
          // arrest on foot when a cop car pins the player
          if (!P.inCar) {
            cop.arrestTimer += dt;
            if (cop.arrestTimer > 2.2 && onBusted) onBusted();
          } else cop.arrestTimer = 0;
        } else cop.arrestTimer = 0;
      } else {
        // foot cop: run at the player, shoot when close, arrest on contact
        var fAngle = Math.atan2(-dz, dx);
        cop.angle = SB.angleLerp(cop.angle, fAngle, Math.min(1, dt * 8));
        var spd = dist > 26 ? 7.5 : 6.0;
        cop.x += Math.cos(fAngle) * spd * dt;
        cop.z += -Math.sin(fAngle) * spd * dt;
        cop.walkPhase += dt * spd * 2;
        cop.group.position.set(cop.x, 0, cop.z);
        cop.group.rotation.y = cop.angle;
        if (dist < 26 && wanted >= 2 && now - (cop.lastShot || 0) > 1.4) {
          cop.lastShot = now;
          SB.Audio.gunshot();
          if (Math.random() < 0.4) SB.Player.damage(SB.TUNE.copShotDamage, now);
        }
        if (dist < 2.4) {
          cop.arrestTimer += dt;
          SB.HUD.toast('They\'re grabbing you…');
          if (cop.arrestTimer > 2.0 && onBusted) onBusted();
        } else cop.arrestTimer = 0;
      }
    }
    if (P.health <= 0 && onWasted) onWasted();
  }

  SB.Police = {
    cops: cops,
    init: function (threeScene, callbacks) {
      scene = threeScene;
      onBusted = callbacks.onBusted;
      onWasted = callbacks.onWasted;
    },
    // Stage a pursuit car at an exact spot (used by screenshot staging).
    stageCopAt: function (x, z, angle) {
      var car = SB.Vehicles.spawnCar(x, z, angle, { cop: true, color: SB.PALETTE.copCar });
      var cop = { kind: 'car', car: car, x: car.x, z: car.z, angle: angle, speed: 18, health: 100, arrestTimer: 0 };
      car.copRef = cop;
      cops.push(cop);
      return cop;
    },
    update: update,
    commitCrime: commitCrime,
    killCop: killCop,
    get wanted() { return wanted; },
    setWanted: function (v) {
      wanted = SB.clamp(v | 0, 0, 5);
      quietTimer = 0; decayTimer = 0;
      SB.Audio.setSiren(wanted > 0);
    },
    clearHeat: function () { wanted = 0; quietTimer = 0; decayTimer = 0; SB.Audio.setSiren(false); },
    nearestCop: function (x, z, maxD) {
      var best = null, bd = maxD;
      for (var i = 0; i < cops.length; i++) {
        var d = SB.dist2d(x, z, cops[i].x, cops[i].z);
        if (d < bd) { bd = d; best = cops[i]; }
      }
      return best;
    }
  };
})();
