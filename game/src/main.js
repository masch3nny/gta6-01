// Solmar Bay — boot, game loop, state machine, camera and screenshot staging.
(function () {
  'use strict';
  var SB = window.SB;

  SB.Game = { save: SB.loadSave(), state: 'title', time: 0, shotMode: null };

  var renderer, scene, camera, clock;
  var camPos = { x: 0, y: 30, z: 60 };
  var shotTimer = 0, shotFrames = 0, shotReady = false;

  function params() {
    var q = {};
    var s = window.location.search.replace(/^\?/, '');
    s.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return q;
  }

  function startGame(fresh) {
    if (fresh) {
      SB.Game.save = SB.defaultSave();
      SB.Game.save.started = true;
      SB.writeSave(SB.Game.save);
      SB.Player.teleport(0, 26);
      SB.Player.state.health = 100;
      SB.Police.clearHeat();
    }
    SB.Game.save.started = true;
    SB.writeSave(SB.Game.save);
    SB.Audio.unlock();
    SB.Game.state = 'playing';
    SB.HUD.showHud();
    SB.HUD.showObjective('FREE ROAM', 'Press M for jobs from Vera. Find the 8 green packages.');
    SB.HUD.toast(SB.STORY.intro);
  }

  function toTitle() {
    SB.writeSave(SB.Game.save);
    SB.Game.state = 'title';
    SB.Police.clearHeat();
    SB.HUD.showTitle(SB.Game.save);
  }

  function endGame(kind) {
    // kind: 'busted' | 'wasted'
    SB.Game.state = 'over';
    SB.Audio.setEngine(0, false);
    SB.Audio.setSiren(false);
    if (SB.Missions.isActive()) SB.Missions.failMission(kind === 'busted' ? 'Busted by the Bayfront police.' : 'You got wasted.');
    var fee = 150;
    SB.Game.save.cash = Math.max(0, SB.Game.save.cash - fee);
    SB.writeSave(SB.Game.save);
    SB.Audio.busted();
    if (kind === 'busted') SB.HUD.showEnd('BUSTED', 'The Bayfront police hauled you in. Bail cost you ' + SB.fmtCash(fee) + '.');
    else SB.HUD.showEnd('WASTED', 'You woke up at Solmar General, ' + SB.fmtCash(fee) + ' lighter.');
  }

  function respawn() {
    SB.Player.teleport(0, 26);
    SB.Player.state.health = 100;
    SB.Player.state.ammo = SB.TUNE.pistolAmmo;
    SB.Police.clearHeat();
    SB.HUD.hideEnd();
    SB.Game.state = 'playing';
    SB.HUD.showHud();
  }

  // ----- Screenshot staging ---------------------------------------------------
  // ?shot=cover|chase|mission|drive stages a deterministic scene, runs the
  // simulation briefly, then sets document.title = 'SHOT_READY'.
  function stageShot(kind) {
    SB.Game.shotMode = kind;
    SB.Game.state = 'playing';
    SB.HUD.showHud();
    SB.Game.save.cash = 1250; // staged cash, not saved
    var P = SB.Player.state;
    if (kind === 'cover') {
      SB.Player.teleport(6, 26);
      P.camYaw = Math.PI * 0.5; P.camPitch = 0.28;
      P.angle = Math.PI / 2;
      SB.Vehicles.stageTraffic(3.4, -18, Math.PI / 2);
      SB.Vehicles.stageTraffic(-3.4, -8, -Math.PI / 2);
      SB.HUD.showObjective('FREE ROAM', 'Press M for jobs from Vera. Find the 8 green packages.');
    } else if (kind === 'chase') {
      var car = SB.Vehicles.spawnCar(0, 104, Math.PI / 2, { color: 0xff7a1a });
      SB.Player.teleport(0, 104);
      SB.Player.enterCar(car);
      car.speed = 24;
      P.camYaw = Math.PI / 2; P.camPitch = 0.3;
      SB.Police.setWanted(3);
      SB.Police.stageCopAt(3.4, 132, Math.PI / 2);
      SB.Police.stageCopAt(-3.4, 144, Math.PI / 2);
      SB.Game.shotAutoDrive = true;
      SB.Game.shotCam = { yawOffset: 0.5, dist: 15, height: 6.5 };
      SB.Game.objectiveOverride = { title: 'LOSE THE COPS', text: '3 stars — break line of sight and hide.' };
      SB.HUD.showObjective('LOSE THE COPS', '3 stars — break line of sight and hide.');
    } else if (kind === 'mission') {
      SB.Missions.startMission('m2');
      SB.Player.teleport(-104, 194);
      P.camYaw = -Math.PI / 2; P.camPitch = 0.3;
      P.angle = -Math.PI / 2;
    } else if (kind === 'drive') {
      var car2 = SB.Vehicles.spawnCar(-156, 208, 0, { color: 0x2a6fd4 });
      SB.Player.teleport(-156, 208);
      SB.Player.enterCar(car2);
      car2.speed = 22;
      P.camYaw = 0; P.camPitch = 0.26;
      SB.Game.shotAutoDrive = true;
      SB.Game.shotCam = { yawOffset: 0.35, dist: 14, height: 5.5 };
      SB.Game.objectiveOverride = { title: 'FREE ROAM', text: 'Golden hour on the Bayfront — Solmar Bay.' };
      SB.City.setSun(0.22, 2.4, 0xff9a50);
      scene.background = new THREE.Color(0xf2a56b);
      scene.fog.color.setHex(0xe8a06a);
      SB.HUD.showObjective('FREE ROAM', 'Golden hour on the Bayfront — Solmar Bay.');
    }
    // snap the camera to the goal so the first frames already frame the shot
    var goal = SB.Player.cameraGoal();
    camPos.x = goal.pos.x; camPos.y = goal.pos.y; camPos.z = goal.pos.z;
    camera.position.set(camPos.x, camPos.y, camPos.z);
    camera.lookAt(goal.look.x, goal.look.y, goal.look.z);
    shotTimer = 0; shotFrames = 0; shotReady = false;
  }

  // ----- Boot ---------------------------------------------------------------------
  function init() {
    var q = params();
    var canvas = document.getElementById('game');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.set(0, 30, 60);
    clock = { last: performance.now() };

    SB.City.init(scene);
    SB.Vehicles.init(scene);
    SB.Pedestrians.init(scene, 26);
    SB.Player.init(scene, 0, 26);
    SB.Police.init(scene, { onBusted: function () { if (SB.Game.state === 'playing') endGame('busted'); },
      onWasted: function () { if (SB.Game.state === 'playing') endGame('wasted'); } });
    SB.Missions.init(scene);
    SB.Missions.markPackagesFound(SB.Game.save.packages);
    SB.HUD.init();
    SB.Input.bind(canvas);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    window.addEventListener('error', function (e) {
      SB.HUD.setStatus('Error: ' + (e.message || 'unknown'));
    });

    // menu wiring
    document.getElementById('btn-new').addEventListener('click', function () { startGame(true); });
    document.getElementById('btn-continue').addEventListener('click', function () { startGame(false); });
    document.getElementById('btn-how').addEventListener('click', function () { SB.HUD.showHow(); });
    document.getElementById('btn-how-back').addEventListener('click', function () { SB.HUD.showTitle(SB.Game.save); });
    document.getElementById('btn-mission-close').addEventListener('click', function () {
      SB.HUD.hideMissions();
      SB.Game.state = 'playing';
      SB.HUD.showHud();
    });
    document.getElementById('btn-resume').addEventListener('click', function () {
      SB.Game.state = 'playing'; SB.HUD.hidePause();
    });
    document.getElementById('btn-quit-title').addEventListener('click', function () { toTitle(); });
    document.getElementById('btn-end-retry').addEventListener('click', function () { respawn(); });
    document.getElementById('btn-end-title').addEventListener('click', function () { SB.HUD.hideEnd(); toTitle(); });

    if (q.shot) {
      stageShot(q.shot);
    } else {
      SB.HUD.showTitle(SB.Game.save);
    }
    requestAnimationFrame(loop);
  }

  function loop() {
    requestAnimationFrame(loop);
    var nowMs = performance.now();
    var dt = Math.min(0.05, (nowMs - clock.last) / 1000);
    clock.last = nowMs;
    SB.Game.time += dt;
    var now = SB.Game.time;

    if (SB.Game.state === 'playing') {
      // pause / missions keys
      if (SB.Input.wasPressed('pause')) {
        SB.Game.state = 'paused';
        SB.HUD.showPause(SB.Game.save);
      } else if (SB.Input.wasPressed('missions')) {
        SB.Game.state = 'menu';
        SB.HUD.showMissions();
      }
      SB.Player.update(dt, now);
      SB.Vehicles.updateTraffic(dt);
      SB.Pedestrians.update(dt, SB.Player.state.x, SB.Player.state.z, 0);
      SB.Police.update(dt, now);
      SB.Missions.update(dt, now);
      SB.Audio.update(dt);
      SB.HUD.update();
      // camera follows the player smoothly (snapped in shot mode's first frames)
      var goal = SB.Player.cameraGoal();
      var k = SB.Game.shotMode ? 0.35 : 1 - Math.pow(0.0001, dt);
      camPos.x = SB.lerp(camPos.x, goal.pos.x, k);
      camPos.y = SB.lerp(camPos.y, goal.pos.y, k);
      camPos.z = SB.lerp(camPos.z, goal.pos.z, k);
      camera.position.set(camPos.x, camPos.y, camPos.z);
      camera.lookAt(goal.look.x, goal.look.y, goal.look.z);
      SB.City.followShadows(SB.Player.state.x, SB.Player.state.z);
      // screenshot readiness
      if (SB.Game.shotMode && !shotReady) {
        shotTimer += dt; shotFrames++;
        if (shotTimer > 1.8 && shotFrames > 35) {
          shotReady = true;
          document.title = 'SHOT_READY';
        }
      }
    } else if (SB.Game.state === 'menu') {
      // mission picker open: world frozen; M or Esc closes it
      if (SB.Input.wasPressed('missions') || SB.Input.wasPressed('pause')) {
        SB.Game.state = 'playing';
        SB.HUD.hideMissions();
      }
    } else if (SB.Game.state === 'title') {
      // slow orbit over the plaza behind the title screen (high enough to clear the towers)
      var t = now * 0.05;
      camera.position.set(Math.cos(t) * 120, 70, Math.sin(t) * 120 + 20);
      camera.lookAt(0, 0, 20);
      SB.Vehicles.updateTraffic(dt);
      SB.Pedestrians.update(dt, 0, 0, 0);
    }
    renderer.render(scene, camera);
    SB.Input.endFrame();
  }

  init();
})();
