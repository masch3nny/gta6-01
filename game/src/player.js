// Solmar Bay — the player: Dario "Dax" Cruz, on foot and behind the wheel.
// Handles movement, camera-relative controls, car entry, punching and shooting.
(function () {
  'use strict';
  var SB = window.SB;

  var scene = null;
  var mesh = null, legL = null, legR = null, armR = null;
  var muzzle = null, muzzleTimer = 0;
  var tracer = null;

  var P = {
    x: 0, z: 0, y: 0, vy: 0, angle: 0, camYaw: Math.PI * 0.75, camPitch: 0.32,
    health: 100, onGround: true, walkPhase: 0,
    inCar: false, car: null, speed: 0, steer: 0,
    ammo: SB.TUNE.pistolAmmo, armed: true, lastHurt: -99, lastShot: -99
  };

  function makePlayerMesh() {
    var g = new THREE.Group();
    var jacket = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.44), jacket);
    body.position.y = 1.08; body.castShadow = true; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xd89a6a }));
    head.position.y = 1.82; head.castShadow = true; g.add(head);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x222831 }));
    cap.position.y = 2.02; g.add(cap);
    var pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.24), pants);
    legL.position.set(0, 0.36, 0.17); g.add(legL);
    legR = legL.clone(); legR.position.z = -0.17; g.add(legR);
    armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), jacket);
    armR.position.set(0.42, 1.2, 0); g.add(armR);
    var armL = armR.clone(); armL.position.x = -0.42; g.add(armL);
    return g;
  }

  function forwardVector() {
    return { x: Math.cos(P.angle), z: -Math.sin(P.angle) };
  }

  function enterCar(car) {
    P.inCar = true; P.car = car; car.held = true; car.speed = 0;
    mesh.visible = false;
    SB.Audio.setEngine(0, true);
    return true;
  }

  function exitCar() {
    if (!P.car) return;
    var car = P.car;
    car.held = false; car.speed = 0;
    // step out to the driver's side
    var sx = car.x + Math.sin(car.angle) * 2.2, sz = car.z + Math.cos(car.angle) * 2.2;
    var fixed = SB.City.resolveCircle(sx, sz, 0.8);
    P.x = fixed.x; P.z = fixed.z; P.y = 0;
    P.angle = car.angle; P.camYaw = car.angle;
    P.inCar = false; P.car = null;
    mesh.visible = true;
    mesh.position.set(P.x, 0, P.z);
    SB.Audio.setEngine(0, false);
  }

  function shoot(now) {
    if (P.ammo <= 0) { SB.Audio.click(); return; }
    if (now - P.lastShot < 0.22) return;
    P.lastShot = now; P.ammo--;
    SB.Audio.gunshot();
    SB.Police.commitCrime(1, 'You fired a shot in public.');
    // muzzle flash + tracer
    muzzle.visible = true; muzzleTimer = 0.06;
    var f = forwardVector();
    var ox = P.x + f.x * 1.2, oz = P.z + f.z * 1.2;
    var pts = [new THREE.Vector3(ox, 1.45, oz), new THREE.Vector3(ox + f.x * 42, 1.45, oz + f.z * 42)];
    tracer.geometry.setFromPoints(pts);
    tracer.visible = true;
    setTimeout(function () { tracer.visible = false; }, 60);
    // hitscan: nearest ped or cop within a thin corridor ahead
    var best = null, bestD = 45;
    function consider(x, z, obj) {
      var dx = x - P.x, dz = z - P.z;
      var along = dx * f.x + dz * f.z, side = Math.abs(-dx * f.z + dz * f.x);
      if (along > 0 && along < bestD && side < 2.2) { best = obj; bestD = along; }
    }
    SB.Pedestrians.peds.forEach(function (ped) { if (ped.state !== 'down') consider(ped.x, ped.z, { kind: 'ped', ref: ped }); });
    SB.Police.cops.forEach(function (cop) { consider(cop.x, cop.z, { kind: 'cop', ref: cop }); });
    if (best) {
      if (best.kind === 'ped') {
        best.ref.health -= SB.TUNE.pistolDamage;
        if (best.ref.health <= 0) {
          SB.Pedestrians.knockDown(best.ref);
          SB.Police.commitCrime(1, 'A bystander is down.');
        }
        SB.Pedestrians.scare(best.ref.x, best.ref.z, 18);
      } else {
        best.ref.health -= SB.TUNE.pistolDamage;
        if (best.ref.health <= 0) SB.Police.killCop(best.ref);
      }
    }
  }

  function punch() {
    var f = forwardVector();
    var ped = SB.Pedestrians.nearestPed(P.x + f.x * 1.6, P.z + f.z * 1.6, 2.0);
    SB.Audio.punch();
    armR.rotation.x = -1.4;
    setTimeout(function () { armR.rotation.x = 0; }, 140);
    if (ped) {
      ped.health -= SB.TUNE.punchDamage;
      SB.Police.commitCrime(1, 'You assaulted a pedestrian.');
      SB.Pedestrians.scare(ped.x, ped.z, 14);
      if (ped.health <= 0) SB.Pedestrians.knockDown(ped);
    }
    var cop = SB.Police.nearestCop(P.x + f.x * 1.6, P.z + f.z * 1.6, 2.0);
    if (cop) {
      cop.health -= SB.TUNE.punchDamage;
      SB.Police.commitCrime(1, 'You hit an officer.');
      if (cop.health <= 0) SB.Police.killCop(cop);
    }
  }

  function updateOnFoot(dt, now) {
    var look = SB.Input.lookDelta();
    P.camYaw -= look.x * 0.005;
    P.camPitch = SB.clamp(P.camPitch + look.y * 0.003, -0.1, 1.1);
    var ix = (SB.Input.held('right') ? 1 : 0) - (SB.Input.held('left') ? 1 : 0);
    var iz = (SB.Input.held('up') ? 1 : 0) - (SB.Input.held('down') ? 1 : 0);
    var speed = SB.Input.held('sprint') ? SB.TUNE.runSpeed : SB.TUNE.walkSpeed;
    var moving = ix !== 0 || iz !== 0;
    if (moving) {
      var len = Math.sqrt(ix * ix + iz * iz); ix /= len; iz /= len;
      // camera-relative: forward is away from camera
      var fx = Math.cos(P.camYaw), fz = -Math.sin(P.camYaw);
      var rx = -fz, rz = fx;
      var mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
      P.x += mx * speed * dt; P.z += mz * speed * dt;
      P.angle = SB.angleLerp(P.angle, Math.atan2(-mz, mx), Math.min(1, dt * 12));
      P.walkPhase += dt * speed * 1.6;
      var swing = Math.sin(P.walkPhase) * 0.5;
      legL.rotation.x = swing; legR.rotation.x = -swing;
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
    }
    // jump + gravity
    if (SB.Input.wasPressed('jump') && P.onGround) { P.vy = 7.5; P.onGround = false; }
    if (!P.onGround) {
      P.vy -= 22 * dt; P.y += P.vy * dt;
      if (P.y <= 0) { P.y = 0; P.vy = 0; P.onGround = true; }
    }
    // collisions + bounds
    var fixed = SB.City.resolveCircle(P.x, P.z, 0.7);
    P.x = fixed.x; P.z = fixed.z;
    var c = SB.clampCity(P.x, P.z);
    P.x = c.x; P.z = c.z;
    mesh.position.set(P.x, P.y, P.z);
    mesh.rotation.y = P.angle;
    // actions
    if (SB.Input.wasPressed('enter')) {
      var car = SB.Vehicles.nearestCar(P.x, P.z, 4.2);
      if (car) {
        enterCar(car);
        SB.Police.commitCrime(1, 'You stole a car.');
        SB.HUD.toast('Car stolen — the cops noticed.');
      }
    }
    if (SB.Input.wasPressed('punch')) punch();
    if (SB.Input.wasPressed('reload')) { P.ammo = SB.TUNE.pistolAmmo; SB.Audio.click(); }
    if (SB.Input.mouseClicked()) shoot(now);
    // health regen when calm
    if (now - P.lastHurt > 12 && P.health < 100) P.health = Math.min(100, P.health + dt * 2.5);
    // muzzle flash decay
    if (muzzleTimer > 0) { muzzleTimer -= dt; if (muzzleTimer <= 0) muzzle.visible = false; }
  }

  function updateDriving(dt, now) {
    var car = P.car;
    // When driving, the camera eases back behind the car after a mouse swing.
    var look = SB.Input.lookDelta();
    P.camYaw -= look.x * 0.005;
    P.camPitch = SB.clamp(P.camPitch + look.y * 0.003, 0.05, 1.0);
    // Chase cam: view direction follows the car's heading (camYaw ~= car.angle).
    P.camYaw = SB.angleLerp(P.camYaw, car.angle, Math.min(1, dt * 1.4));
    var accel = (SB.Input.held('up') ? 1 : 0) - (SB.Input.held('down') ? 1 : 0);
    if (SB.Game.shotAutoDrive) accel = 1; // staged shots keep the car moving
    var handbrake = SB.Input.held('jump');
    var steerInput = (SB.Input.held('left') ? 1 : 0) - (SB.Input.held('right') ? 1 : 0);
    var maxSpd = SB.TUNE.carMaxSpeed;
    if (accel > 0) car.speed += SB.TUNE.carAccel * dt;
    else if (accel < 0) {
      if (car.speed > 0.5) car.speed -= SB.TUNE.carBrake * dt;
      else car.speed -= SB.TUNE.carAccel * 0.5 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 10 * dt;
      if (Math.abs(car.speed) < 0.4) car.speed = 0;
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * 26 * dt;
    car.speed = SB.clamp(car.speed, -SB.TUNE.carMaxReverse, maxSpd);
    var turnRate = (handbrake ? SB.TUNE.handbrakeTurn : SB.TUNE.carTurn) * SB.clamp(Math.abs(car.speed) / 10, 0, 1);
    car.angle += steerInput * turnRate * dt * Math.sign(car.speed || 1);
    var fx = Math.cos(car.angle), fz = -Math.sin(car.angle);
    var nx = car.x + fx * car.speed * dt, nz = car.z + fz * car.speed * dt;
    // building collision: slide + thud
    var before = SB.City.hitsBuilding(nx, nz, 2.1);
    if (before) {
      car.speed *= 0.35;
      var fixed = SB.City.resolveCircle(nx, nz, 2.1);
      nx = fixed.x; nz = fixed.z;
      if (Math.abs(car.speed) > 8) { SB.Audio.punch(); }
    }
    // hit pedestrians
    SB.Pedestrians.peds.forEach(function (ped) {
      if (ped.state === 'down') return;
      if (Math.abs(car.speed) > 3 && SB.dist2d(nx, nz, ped.x, ped.z) < 2.4) {
        SB.Pedestrians.knockDown(ped);
        SB.Police.commitCrime(1, 'You ran someone over.');
        SB.Pedestrians.scare(ped.x, ped.z, 20);
        car.speed *= 0.85;
      }
    });
    // bump traffic cars
    SB.Vehicles.allCars.forEach(function (o) {
      if (o === car || o.held || o.dead) return;
      var d = SB.dist2d(nx, nz, o.x, o.z);
      if (d < 4.4) {
        var push = (4.4 - d) * 0.5;
        var dx = (o.x - nx) / (d || 1), dz = (o.z - nz) / (d || 1);
        o.x += dx * push; o.z += dz * push;
        o.group.position.set(o.x, 0, o.z);
        if (Math.abs(car.speed) > 10) {
          car.speed *= 0.7;
          SB.Police.commitCrime(0, '');
          SB.Audio.punch();
        }
      }
    });
    var c = SB.clampCity(nx, nz);
    car.x = c.x; car.z = c.z;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.angle;
    // wheel spin + light bar
    var wheels = car.group.userData.wheels;
    for (var w = 0; w < wheels.length; w++) wheels[w].rotation.z -= car.speed * dt * 1.4;
    if (car.group.userData.lightBar) {
      car.lightPhase += dt * 6;
      car.group.userData.lightBar.visible = Math.sin(car.lightPhase) > -0.2;
    }
    SB.Audio.setEngine(Math.abs(car.speed) / SB.TUNE.carMaxSpeed, true);
    P.x = car.x; P.z = car.z; P.angle = car.angle;
    if (SB.Input.wasPressed('enter')) exitCar();
    if (muzzleTimer > 0) { muzzleTimer -= dt; if (muzzleTimer <= 0) muzzle.visible = false; }
  }

  SB.Player = {
    state: P,
    init: function (threeScene, x, z) {
      scene = threeScene;
      mesh = makePlayerMesh();
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      muzzle.visible = false; scene.add(muzzle);
      tracer = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8 }));
      tracer.visible = false; scene.add(tracer);
      P.x = x; P.z = z;
      P.angle = Math.PI / 2;
    },
    update: function (dt, now) {
      if (P.inCar) updateDriving(dt, now);
      else updateOnFoot(dt, now);
      if (muzzle.visible) {
        var f = forwardVector();
        muzzle.position.set(P.x + f.x * 1.4, 1.45, P.z + f.z * 1.4);
      }
    },
    enterCar: enterCar,
    exitCar: exitCar,
    damage: function (amount, now) {
      P.health -= amount;
      P.lastHurt = now;
      if (P.health < 0) P.health = 0;
    },
    heal: function (amount) { P.health = Math.min(100, P.health + amount); },
    cameraGoal: function () {
      // Third-person camera: behind the facing direction, looking at the player.
      // Forward is (cos(camYaw), -sin(camYaw)); the camera sits at P - forward*dist.
      // A staged shot may offset the angle / distance / height for a better frame.
      var yaw = P.camYaw, dist = P.inCar ? 11.5 : 9.5, height = P.inCar ? 4.6 : 4.3;
      if (SB.Game.shotCam) {
        yaw += SB.Game.shotCam.yawOffset || 0;
        dist = SB.Game.shotCam.dist || dist;
        height = SB.Game.shotCam.height || height;
      }
      var cx = P.x - Math.cos(yaw) * dist;
      var cz = P.z + Math.sin(yaw) * dist;
      var cy = height + Math.sin(P.camPitch) * 4;
      if (cy < 1.6) cy = 1.6;
      return {
        pos: { x: cx, y: cy, z: cz },
        look: { x: P.x, y: P.inCar ? 1.4 : 1.6, z: P.z }
      };
    },
    teleport: function (x, z) {
      P.x = x; P.z = z; P.y = 0;
      if (P.inCar) exitCar();
      mesh.position.set(x, 0, z);
    }
  };
})();
