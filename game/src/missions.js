// Solmar Bay — jobs for Vera Solano: five story missions + hidden packages.
(function () {
  'use strict';
  var SB = window.SB;

  var scene = null;
  var active = null;      // {def, stageIdx, stage, timer, raceIdx}
  var marker = null;      // 3D beacon group
  var markerRing = null;
  var packageMeshes = []; // {mesh, x, z, found}
  var targetCar = null;   // the Sultan GT for m5
  var racePoints = [];

  function makeBeacon() {
    var g = new THREE.Group();
    var cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, SB.TUNE.missionMarkerHeight, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    cyl.position.y = SB.TUNE.missionMarkerHeight / 2;
    g.add(cyl);
    var diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    diamond.position.y = 8; g.add(diamond);
    g.userData.diamond = diamond;
    var ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    g.add(ring);
    g.visible = false;
    scene.add(g);
    return g;
  }

  function setMarker(x, z, visible) {
    marker.visible = !!visible;
    if (visible) { marker.position.set(x, 0, z); }
  }

  function stageText(stage) { return stage.text; }

  function startMission(id) {
    var def = null;
    SB.MISSIONS.forEach(function (m) { if (m.id === id) def = m; });
    if (!def) return false;
    if (active) return false;
    active = { def: def, stageIdx: 0, stage: def.stages[0], timer: 0, raceIdx: 0 };
    SB.Audio.missionStart();
    SB.HUD.showObjective(def.name, def.giver);
    SB.HUD.toast('New job: ' + def.name + ' — ' + SB.fmtCash(def.reward));
    if (def.id === 'm3') { /* wanted comes at pickup */ }
    if (def.id === 'm5') spawnTargetCar();
    advanceStage(true);
    return true;
  }

  function spawnTargetCar() {
    var spot = { x: 104, z: -52 };
    targetCar = SB.Vehicles.spawnCar(spot.x, spot.z, Math.PI / 2, { color: 0xc2142a, targetCar: true });
    setMarker(spot.x, spot.z, true);
  }

  function advanceStage(first) {
    if (!active) return;
    var stage = active.stage;
    if (!stage) { completeMission(); return; }
    if (stage.type === 'goto') setMarker(stage.x, stage.z, true);
    else if (stage.type === 'pickup') {
      // the package sits at the previous goto point
      var prev = active.def.stages[active.stageIdx - 1];
      if (prev) setMarker(prev.x, prev.z, true);
    }
    else if (stage.type === 'stealTarget') setMarker(targetCar ? targetCar.x : stage.x, targetCar ? targetCar.z : stage.z, true);
    else if (stage.type === 'loseHeat') {
      SB.Police.setWanted(2);
      SB.HUD.toast('Milo is in — 2 stars! Lose the cops.');
      setMarker(0, 0, false);
    }
    else if (stage.type === 'race') {
      racePoints = stage.points.slice();
      active.raceIdx = 0;
      active.timer = stage.time;
      setMarker(racePoints[0][0], racePoints[0][1], true);
    } else setMarker(0, 0, false);
    if (!first) SB.Audio.pickup();
  }

  function nextStage() {
    active.stageIdx++;
    if (active.stageIdx >= active.def.stages.length) { completeMission(); return; }
    active.stage = active.def.stages[active.stageIdx];
    advanceStage(false);
  }

  function completeMission() {
    var def = active.def;
    SB.Game.save.cash += def.reward;
    if (SB.Game.save.missionsDone.indexOf(def.id) < 0) SB.Game.save.missionsDone.push(def.id);
    SB.writeSave(SB.Game.save);
    SB.Audio.missionDone();
    SB.Audio.cash();
    SB.HUD.showBanner('JOB DONE', def.name + ' — earned ' + SB.fmtCash(def.reward));
    SB.HUD.showObjective('Free roam', 'Press M for more jobs from Vera.');
    setMarker(0, 0, false);
    active = null;
  }

  function failMission(reason) {
    if (!active) return;
    SB.Audio.fail();
    SB.HUD.showBanner('JOB FAILED', reason);
    SB.HUD.showObjective('Free roam', 'Press M for more jobs from Vera.');
    setMarker(0, 0, false);
    if (targetCar) { SB.Vehicles.removeCar(targetCar); targetCar = null; }
    active = null;
  }

  function currentObjective() {
    if (SB.Game.objectiveOverride) return SB.Game.objectiveOverride;
    if (!active) return { title: 'FREE ROAM', text: 'Press M for jobs from Vera. Find the 8 green packages.' };
    var t = active.stage.text;
    if (active.stage.type === 'race') t += ' — ' + Math.ceil(active.timer) + 's left (' + active.raceIdx + '/6)';
    return { title: active.def.name.toUpperCase(), text: t };
  }

  function update(dt, now) {
    // marker pulse
    if (marker.visible) {
      marker.userData.diamond.rotation.y += dt * 2;
      marker.userData.diamond.position.y = 8 + Math.sin(now * 2.2) * 0.8;
    }
    // hidden packages: glow, collect on touch
    for (var i = 0; i < packageMeshes.length; i++) {
      var pk = packageMeshes[i];
      if (pk.found) continue;
      pk.mesh.rotation.y += dt * 1.5;
      var P = SB.Player.state;
      if (SB.dist2d(P.x, P.z, pk.x, pk.z) < 2.6) {
        pk.found = true;
        pk.mesh.visible = false;
        SB.Game.save.cash += 50;
        SB.Game.save.packages.push(pk.x + ',' + pk.z);
        SB.writeSave(SB.Game.save);
        SB.Audio.cash();
        SB.HUD.toast('Hidden package found! +$50');
      }
    }
    if (!active) return;
    var P = SB.Player.state;
    var stage = active.stage;
    if (stage.type === 'getCar') {
      if (P.inCar) nextStage();
    } else if (stage.type === 'goto') {
      if (SB.dist2d(P.x, P.z, stage.x, stage.z) < stage.r) nextStage();
    } else if (stage.type === 'pickup') {
      // the package sits at the previous goto point; walk into it
      var prev = active.def.stages[active.stageIdx - 1];
      if (prev && SB.dist2d(P.x, P.z, prev.x, prev.z) < 4) nextStage();
    } else if (stage.type === 'loseHeat') {
      if (SB.Police.wanted === 0) nextStage();
    } else if (stage.type === 'race') {
      active.timer -= dt;
      if (active.timer <= 0) { failMission('Out of time on the Checkpoint Rush.'); return; }
      var pt = racePoints[active.raceIdx];
      if (pt && SB.dist2d(P.x, P.z, pt[0], pt[1]) < 9) {
        active.raceIdx++;
        SB.Audio.pickup();
        if (active.raceIdx >= racePoints.length) { nextStage(); return; }
        var np = racePoints[active.raceIdx];
        setMarker(np[0], np[1], true);
      }
    } else if (stage.type === 'stealTarget') {
      if (targetCar && P.inCar && P.car === targetCar) {
        SB.Police.setWanted(3);
        SB.HUD.toast('The GT is yours — now lose the cops and deliver it!');
        nextStage();
      }
    }
    // failing a mission by getting busted/wasted is handled by main.js
  }

  SB.Missions = {
    init: function (threeScene) {
      scene = threeScene;
      marker = makeBeacon();
      // hidden packages
      var geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      var mat = new THREE.MeshBasicMaterial({ color: 0x39ff88 });
      SB.PACKAGES.forEach(function (p) {
        var m = new THREE.Mesh(geo, mat);
        m.position.set(p[0], 1.0, p[1]);
        scene.add(m);
        packageMeshes.push({ mesh: m, x: p[0], z: p[1], found: false });
      });
    },
    startMission: startMission,
    update: update,
    failMission: failMission,
    currentObjective: currentObjective,
    isActive: function () { return !!active; },
    activeDef: function () { return active ? active.def : null; },
    // current beacon position for the minimap (null when no marker)
    markerTarget: function () {
      if (!marker || !marker.visible) return null;
      return { x: marker.position.x, z: marker.position.z };
    },
    // for the shot stager + save restore
    markPackagesFound: function (foundKeys) {
      packageMeshes.forEach(function (pk) {
        if (foundKeys.indexOf(pk.x + ',' + pk.z) >= 0) { pk.found = true; pk.mesh.visible = false; }
      });
    }
  };
})();
