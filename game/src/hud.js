// Solmar Bay — HUD, minimap, menus and banners (all DOM, over the 3D canvas).
(function () {
  'use strict';
  var SB = window.SB;

  var el = {};
  var toastTimer = null, bannerTimer = null;
  var minimapCtx = null;

  function $(id) { return document.getElementById(id); }

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  function drawMinimap() {
    if (!minimapCtx) return;
    var P = SB.Player.state;
    var g = minimapCtx, S = 190, C = SB.CITY;
    var toMap = function (x, z) { return { x: (x / C * 0.5 + 0.5) * S, y: (z / C * 0.5 + 0.5) * S }; };
    g.clearRect(0, 0, S, S);
    // water + sand at the south edge
    g.fillStyle = '#123a4d'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#17384a'; g.fillRect(0, 0, S, S * 0.94);
    g.fillStyle = '#c9b078'; g.fillRect(0, S * 0.94, S, S * 0.06);
    // streets
    g.strokeStyle = '#8fa8b5'; g.lineWidth = 3.5;
    for (var i = -SB.HALF; i <= SB.HALF; i++) {
      var s = SB.streetAt(i);
      var a = toMap(s, -C), b = toMap(s, C);
      g.beginPath(); g.moveTo(a.x, 6); g.lineTo(b.x, S - 6); g.stroke();
      var c = toMap(-C, s), d = toMap(C, s);
      g.beginPath(); g.moveTo(6, c.y); g.lineTo(S - 6, d.y); g.stroke();
    }
    // mission marker
    var missionTarget = SB.Missions.markerTarget();
    if (missionTarget) {
      var m = toMap(missionTarget.x, missionTarget.z);
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(m.x, m.y, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(m.x, m.y, 8, 0, Math.PI * 2); g.stroke();
    }
    // police (red/blue)
    SB.Police.cops.forEach(function (cop) {
      var p = toMap(cop.x, cop.z);
      g.fillStyle = cop.kind === 'car' ? '#ff3b30' : '#4da3ff';
      g.beginPath(); g.arc(p.x, p.y, 3.5, 0, Math.PI * 2); g.fill();
    });
    // traffic dots
    g.fillStyle = 'rgba(200,200,200,0.7)';
    SB.Vehicles.traffic.forEach(function (car) {
      var p = toMap(car.x, car.z);
      g.fillRect(p.x - 1, p.y - 1, 2, 2);
    });
    // player arrow (points along facing; canvas y is down, so rotate by PI/2 - angle)
    var pp = toMap(P.x, P.z);
    g.save();
    g.translate(pp.x, pp.y);
    g.rotate(Math.PI / 2 - P.angle);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    g.restore();
    // north tick
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
    g.fillText('N', S / 2, 12);
  }

  SB.HUD = {
    init: function () {
      ['hud', 'wanted-row', 'objective', 'objective-title', 'objective-text', 'prompt',
       'speedo', 'speed', 'cash', 'ammo', 'health-fill', 'health-bar', 'minimap',
       'crosshair', 'toast', 'hint', 'title-screen', 'how-screen', 'mission-screen',
       'mission-list', 'pause-screen', 'pause-stats', 'banner', 'banner-title',
       'banner-sub', 'end-screen', 'end-title', 'end-text', 'btn-continue',
       'btn-new', 'btn-how', 'btn-how-back', 'btn-mission-close', 'btn-resume',
       'btn-quit-title', 'btn-end-retry', 'btn-end-title', 'status'].forEach(function (id) {
        el[id] = $(id);
      });
      minimapCtx = el['minimap'].getContext('2d');
    },
    showHud: function () { show('hud'); hide('title-screen'); hide('how-screen'); hide('mission-screen'); hide('pause-screen'); hide('end-screen'); },
    showTitle: function (save) {
      hide('hud'); hide('how-screen'); hide('mission-screen'); hide('pause-screen'); hide('end-screen');
      show('title-screen');
      if (save && save.started) {
        el['btn-continue'].classList.remove('hidden');
        el['btn-continue'].textContent = 'CONTINUE — ' + SB.fmtCash(save.cash);
      } else {
        el['btn-continue'].classList.add('hidden');
      }
    },
    showHow: function () { hide('title-screen'); show('how-screen'); },
    showMissions: function () { this.buildMissionList(); hide('title-screen'); show('mission-screen'); },
    hideMissions: function () { hide('mission-screen'); },
    showPause: function (save) {
      el['pause-stats'].textContent = 'Cash ' + SB.fmtCash(save.cash) + '  ·  Jobs done ' +
        save.missionsDone.length + '/5  ·  Packages ' + save.packages.length + '/8  ·  Best wanted ' + save.bestWanted + '★';
      show('pause-screen');
    },
    hidePause: function () { hide('pause-screen'); },
    buildMissionList: function () {
      var save = SB.Game.save;
      var html = '';
      SB.MISSIONS.forEach(function (m) {
        var done = save.missionsDone.indexOf(m.id) >= 0;
        var locked = false;
        // missions unlock in order
        var idx = SB.MISSIONS.indexOf(m);
        if (idx > 0 && save.missionsDone.indexOf(SB.MISSIONS[idx - 1].id) < 0) locked = true;
        html += '<div class="mission-item' + (done ? ' done' : '') + '">' +
          '<div><div class="mi-name">' + m.name + '</div>' +
          '<div class="mi-desc">' + m.giver + '</div></div>' +
          '<span class="mi-reward">' + SB.fmtCash(m.reward) + '</span>' +
          (done ? '' : (locked ? '<button class="btn" disabled>LOCKED</button>'
            : '<button class="btn primary" data-mission="' + m.id + '">START</button>')) +
          '</div>';
      });
      el['mission-list'].innerHTML = html;
      var btns = el['mission-list'].querySelectorAll('[data-mission]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function (e) {
          var id = e.currentTarget.getAttribute('data-mission');
          if (SB.Missions.startMission(id)) SB.HUD.hideMissions();
        });
      }
    },
    showObjective: function (title, text) {
      el['objective-title'].textContent = title;
      el['objective-text'].textContent = text;
    },
    showBanner: function (title, sub) {
      el['banner-title'].textContent = title;
      el['banner-sub'].textContent = sub || '';
      show('banner');
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(function () { hide('banner'); }, 3200);
    },
    showEnd: function (title, text) {
      el['end-title'].textContent = title;
      el['end-text'].textContent = text;
      hide('hud');
      show('end-screen');
    },
    hideEnd: function () { hide('end-screen'); },
    toast: function (msg) {
      el['toast'].textContent = msg;
      el['toast'].style.opacity = 1;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el['toast'].style.opacity = 0; }, 3200);
    },
    setPrompt: function (text) {
      if (text) { el['prompt'].textContent = text; show('prompt'); }
      else hide('prompt');
    },
    update: function () {
      var P = SB.Player.state;
      var save = SB.Game.save;
      el['health-fill'].style.width = Math.max(0, P.health) + '%';
      el['health-fill'].classList.toggle('low', P.health < 35);
      el['cash'].textContent = SB.fmtCash(save.cash);
      el['ammo'].textContent = P.armed ? ('◉ ' + P.ammo + ' / ' + SB.TUNE.pistolAmmo) : '';
      var stars = '';
      for (var s = 0; s < 5; s++) {
        stars += s < SB.Police.wanted
          ? '<span>★</span>'
          : '<span class="star-off">★</span>';
      }
      el['wanted-row'].innerHTML = stars;
      var obj = SB.Missions.currentObjective();
      el['objective-title'].textContent = obj.title;
      el['objective-text'].textContent = obj.text;
      // speedometer
      if (P.inCar && P.car) {
        show('speedo');
        el['speed'].textContent = Math.round(Math.abs(P.car.speed) * 2.2);
      } else hide('speedo');
      el['crosshair'].classList.toggle('hidden', !(P.armed && !P.inCar));
      // context prompt
      var prompt = '';
      if (!P.inCar) {
        var car = SB.Vehicles.nearestCar(P.x, P.z, 4.2);
        if (car) prompt = 'E — ' + (car.cop ? 'Jack the police car?!' : 'Enter car');
        else {
          var ped = SB.Pedestrians.nearestPed(P.x, P.z, 2.4);
          if (ped) prompt = 'F — Punch';
        }
      } else prompt = 'E — Exit car';
      this.setPrompt(prompt);
      drawMinimap();
    },
    setStatus: function (text) { el['status'].textContent = text; }
  };
})();
