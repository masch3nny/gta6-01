// Solmar Bay — shared constants, city layout and mission data.
// One global namespace (SB) so every classic script can reach the same state.
(function () {
  'use strict';

  var SB = window.SB = window.SB || {};

  // ----- World layout -------------------------------------------------------
  // The city is a grid of blocks. Streets run along x = i*PITCH and z = j*PITCH.
  SB.PITCH = 52;            // distance between street centrelines
  SB.ROAD = 14;             // road width
  SB.HALF = 4;              // grid runs -HALF..HALF streets (9x9)
  SB.CITY = SB.HALF * SB.PITCH + 26; // playable half-extent (234)
  SB.BEACH_Z = 238;         // sand starts here (south edge)
  SB.SEA_Z = 268;           // sea plane starts here

  SB.streetAt = function (i) { return i * SB.PITCH; };
  SB.onRoad = function (x, z) {
    // true when the point is on a road strip (either axis)
    var r = SB.ROAD / 2 + 1.2;
    var fx = Math.abs(((x + SB.PITCH / 2) % SB.PITCH + SB.PITCH) % SB.PITCH - SB.PITCH / 2);
    var fz = Math.abs(((z + SB.PITCH / 2) % SB.PITCH + SB.PITCH) % SB.PITCH - SB.PITCH / 2);
    return fx < r || fz < r;
  };
  SB.clampCity = function (x, z) {
    return {
      x: Math.max(-SB.CITY, Math.min(SB.CITY, x)),
      z: Math.max(-SB.CITY, Math.min(SB.BEACH_Z + 18, z))
    };
  };
  SB.nearestStreetPoint = function (x, z) {
    // snap a point onto the nearest street centreline (used by traffic/peds)
    var sx = Math.round(x / SB.PITCH) * SB.PITCH;
    var sz = Math.round(z / SB.PITCH) * SB.PITCH;
    return (Math.abs(x - sx) < Math.abs(z - sz)) ? { x: sx, z: z, axis: 'z' } : { x: x, z: sz, axis: 'x' };
  };

  // ----- Tuning --------------------------------------------------------------
  SB.TUNE = {
    walkSpeed: 5.2, runSpeed: 9.0,
    carAccel: 26, carBrake: 46, carMaxSpeed: 38, carMaxReverse: 12,
    carTurn: 1.9, handbrakeTurn: 2.6,
    trafficSpeed: 9.5, pedSpeed: 1.6,
    punchDamage: 25, pistolDamage: 34, pistolAmmo: 12,
    copRamDamage: 9, copShotDamage: 6,
    wantedDecayQuiet: 22, wantedDecayStep: 8,
    missionMarkerHeight: 26
  };

  // ----- Palette --------------------------------------------------------------
  SB.PALETTE = {
    sky: 0x8ec9e8, skyDusk: 0xffb37a, fog: 0xa8c8dd,
    ground: 0x5d6b52, road: 0x2e3138, sidewalk: 0x9aa0a3,
    sand: 0xe8d29a, sea: 0x1e6f8e,
    buildings: [0xe8b48a, 0xf2d5a0, 0x9fc3d8, 0xd88a7a, 0xb8c4a8, 0xe0a3b5, 0x8fb8a8, 0xf0e0c0],
    glass: 0x2c4a63,
    carColors: [0xd43d2a, 0x2a6fd4, 0xf2c230, 0x3aa655, 0xe8e8e8, 0x222226, 0x8a4fd0, 0xff7a1a],
    copCar: 0x1c3a6e, copLightRed: 0xff2a2a, copLightBlue: 0x2a6aff
  };

  // ----- Story ------------------------------------------------------------------
  SB.STORY = {
    playerName: "Dario 'Dax' Cruz",
    fixer: 'Vera Solano',
    city: 'Solmar Bay',
    intro: 'Dax is back in Solmar Bay. Vera Solano has work for him — if the Bayfront police don\'t catch him first.'
  };

  // Mission definitions. Each: id, name, giver line, objective text, reward,
  // and a script of stages. Stages are plain data the missions module drives.
  SB.MISSIONS = [
    {
      id: 'm1', name: 'First Wheels', reward: 150,
      giver: 'Vera: "Dax, baby, you need wheels before we talk work. Grab any car and bring it to my garage on Coral Row."',
      objective: 'Steal a car and drive to Vera\'s garage',
      stages: [
        { type: 'getCar', text: 'Get in any car (E near a car)' },
        { type: 'goto', x: 52, z: -104, r: 9, text: 'Drive to Vera\'s garage on Coral Row' }
      ]
    },
    {
      id: 'm2', name: 'Dockside Pickup', reward: 250,
      giver: 'Vera: "A package is waiting at the docks, south end. Pick it up, bring it to the Bayfront Club. No cops, no noise."',
      objective: 'Pick up the package at the docks, deliver it to the Bayfront Club',
      stages: [
        { type: 'goto', x: -104, z: 208, r: 8, text: 'Go to the docks pickup point' },
        { type: 'pickup', text: 'Grab the package (walk into the marker)' },
        { type: 'goto', x: 156, z: 52, r: 9, text: 'Deliver the package to the Bayfront Club' }
      ]
    },
    {
      id: 'm3', name: 'Hot Getaway', reward: 400,
      giver: 'Vera: "Milo is waiting at Palm Plaza with the heat on him. Pick him up — and then lose the cops. All of them."',
      objective: 'Pick up Milo, then lose your wanted level',
      stages: [
        { type: 'goto', x: 0, z: 0, r: 9, text: 'Pick up Milo at Palm Plaza' },
        { type: 'loseHeat', text: 'Lose the cops — get your wanted level to zero' }
      ]
    },
    {
      id: 'm4', name: 'Checkpoint Rush', reward: 350,
      giver: 'Vera: "The Midnight Club wants a show. Six checkpoints, a hundred seconds. Beat the clock and the purse is yours."',
      objective: 'Hit all 6 checkpoints before the timer runs out',
      stages: [
        { type: 'race', time: 100, points: [[-156, -156], [156, -156], [156, 104], [-52, 104], [-156, 52], [0, -156]], text: 'Race through the checkpoints' }
      ]
    },
    {
      id: 'm5', name: 'The Big Score', reward: 800,
      giver: 'Vera: "Last one, Dax. A cherry-red Sultan GT is parked outside the Marina Hotel — guarded. Take it, bring it to the chop shop, and try not to die."',
      objective: 'Steal the Sultan GT and deliver it to the chop shop',
      stages: [
        { type: 'stealTarget', x: 104, z: -52, text: 'Steal the red Sultan GT at the Marina Hotel' },
        { type: 'goto', x: -156, z: -156, r: 9, text: 'Deliver it to the chop shop — the cops will be coming' }
      ]
    }
  ];

  // Hidden package spots (side activity, +$50 each).
  SB.PACKAGES = [
    [-182, -182], [182, -182], [-182, 104], [182, 208], [0, 208],
    [-104, -52], [104, 156], [52, -182]
  ];

  // ----- Save -------------------------------------------------------------------
  SB.SAVE_KEY = 'solmarbay-save-v1';
  SB.defaultSave = function () {
    return { cash: 0, missionsDone: [], packages: [], bestWanted: 0, started: false };
  };
  SB.loadSave = function () {
    try {
      var raw = localStorage.getItem(SB.SAVE_KEY);
      if (!raw) return SB.defaultSave();
      var s = JSON.parse(raw);
      s.cash = s.cash | 0; s.missionsDone = s.missionsDone || [];
      s.packages = s.packages || []; s.bestWanted = s.bestWanted | 0;
      return s;
    } catch (e) { return SB.defaultSave(); }
  };
  SB.writeSave = function (save) {
    try { localStorage.setItem(SB.SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
  };

  // ----- Small helpers -------------------------------------------------------------
  SB.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  SB.lerp = function (a, b, t) { return a + (b - a) * t; };
  SB.dist2d = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
  SB.angleLerp = function (a, b, t) {
    var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
  };
  SB.rand = function (a, b) { return a + Math.random() * (b - a); };
  SB.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  SB.fmtCash = function (n) { return '$' + n.toLocaleString('en-US'); };

})();
