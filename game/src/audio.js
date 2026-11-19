// Solmar Bay — synthesized sound: WebAudio only, no audio files.
// Every sound is built from oscillators and filtered noise at run time.
(function () {
  'use strict';
  var SB = window.SB;

  var ctx = null, master = null, musicGain = null, engineOsc = null, engineGain = null;
  var sirenOn = false, sirenTimer = 0, musicTimer = 0, musicStep = 0;
  var enabled = true;

  function ensureContext() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      // Engine hum: two detuned saws through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      var engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 55 * 1.005;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      engineOsc.connect(lp); engineOsc2.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); engineOsc2.start();
      SB._engineOsc2 = engineOsc2;
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, slideTo, when) {
    if (!ctx || !enabled) return;
    var t0 = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq, type) {
    if (!ctx || !enabled) return;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.4;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }

  // A lazy bass-and-keys loop in A minor, 92 BPM: the Bay's own radio.
  var BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  var KEYS = [[220, 261.63, 329.63], [220, 261.63, 329.63], [174.61, 220, 261.63], [146.83, 220, 293.66]];
  function musicTick() {
    if (!ctx || !enabled) return;
    var bar = musicStep % 8;
    var root = BASS[bar];
    tone(root, 0.55, 'triangle', 0.5, null, 0);
    tone(root / 2, 0.6, 'sine', 0.35, null, 0);
    var chord = KEYS[Math.floor(musicStep / 2) % 4];
    if (musicStep % 2 === 0) {
      for (var i = 0; i < chord.length; i++) tone(chord[i], 1.1, 'sine', 0.10, null, 0.02 * i);
    }
    if (musicStep % 4 === 2) tone(root * 4, 0.12, 'square', 0.05, null, 0);
    musicStep++;
  }

  SB.Audio = {
    unlock: function () { ensureContext(); },
    setEnabled: function (v) { enabled = v; if (master) master.gain.value = v ? 0.5 : 0; },
    setEngine: function (speed01, on) {
      if (!ctx) return;
      var target = on ? 0.05 + speed01 * 0.10 : 0.0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      var f = 55 + speed01 * 130;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      if (SB._engineOsc2) SB._engineOsc2.frequency.setTargetAtTime(f * 1.005, ctx.currentTime, 0.05);
    },
    setSiren: function (on) { sirenOn = on; },
    gunshot: function () { noiseBurst(0.16, 0.5, 2600, 'bandpass'); tone(160, 0.1, 'square', 0.2, 60); },
    punch: function () { noiseBurst(0.09, 0.35, 700); },
    pickup: function () { tone(880, 0.09, 'sine', 0.3); tone(1318, 0.14, 'sine', 0.3, null, 0.08); },
    cash: function () { tone(1046, 0.1, 'triangle', 0.3); tone(1568, 0.18, 'triangle', 0.3, null, 0.09); },
    missionStart: function () { tone(523, 0.12, 'triangle', 0.3); tone(659, 0.12, 'triangle', 0.3, null, 0.1); tone(784, 0.22, 'triangle', 0.3, null, 0.2); },
    missionDone: function () {
      var notes = [523, 659, 784, 1046];
      for (var i = 0; i < notes.length; i++) tone(notes[i], 0.22, 'triangle', 0.32, null, i * 0.11);
    },
    fail: function () { tone(311, 0.3, 'sawtooth', 0.22, 233); tone(233, 0.45, 'sawtooth', 0.22, 175, 0.25); },
    busted: function () { tone(440, 0.25, 'square', 0.2, 330); tone(330, 0.4, 'square', 0.2, 220, 0.22); },
    click: function () { tone(1200, 0.05, 'square', 0.12); },
    update: function (dt) {
      if (!ctx || !enabled) return;
      // Siren: alternating two-tone wail while wanted.
      if (sirenOn) {
        sirenTimer -= dt;
        if (sirenTimer <= 0) {
          sirenTimer = 0.42;
          var f = (Math.floor(performance.now() / 420) % 2 === 0) ? 720 : 960;
          tone(f, 0.4, 'triangle', 0.07);
        }
      }
      // Music: one step every 0.325s (92 BPM eighth notes).
      musicTimer -= dt;
      if (musicTimer <= 0) { musicTimer = 0.325; musicTick(); }
    }
  };
})();
