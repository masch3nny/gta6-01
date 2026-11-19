// Solmar Bay — keyboard and mouse input.
// Tracks held keys, drag-look deltas, and click edges the game reads each frame.
(function () {
  'use strict';
  var SB = window.SB;

  var keys = {};
  var lookDX = 0, lookDY = 0;
  var dragging = false, lastX = 0, lastY = 0;
  var mouseDownEdge = false, mouseDown = false;
  var pressed = {}; // edge-triggered keys, consumed by the game each frame

  var KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump',
    KeyE: 'enter', KeyF: 'punch', KeyR: 'reload', KeyM: 'missions',
    Escape: 'pause', KeyP: 'pause'
  };

  window.addEventListener('keydown', function (e) {
    var name = KEYMAP[e.code];
    if (name) {
      if (!keys[name]) pressed[name] = true;
      keys[name] = true;
      if (e.code === 'Space') e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) {
    var name = KEYMAP[e.code];
    if (name) keys[name] = false;
  });
  window.addEventListener('blur', function () { keys = {}; dragging = false; });

  function bind(canvas) {
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) { mouseDown = true; mouseDownEdge = true; }
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) mouseDown = false;
      dragging = false;
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      lookDX += e.clientX - lastX; lookDY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    });
    // Touch: one finger drags to look, on-screen buttons are not needed for shots.
    canvas.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; dragging = true; lastX = t.clientX; lastY = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!dragging) return;
      lookDX += t.clientX - lastX; lookDY += t.clientY - lastY;
      lastX = t.clientX; lastY = t.clientY;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', function () { dragging = false; });
  }

  SB.Input = {
    bind: bind,
    held: function (name) { return !!keys[name]; },
    // Edge: true once for the frame after the key went down.
    wasPressed: function (name) { return !!pressed[name]; },
    mouseClicked: function () { return mouseDownEdge; },
    mouseHeld: function () { return mouseDown; },
    // Look deltas since last frame, in pixels.
    lookDelta: function () { var d = { x: lookDX, y: lookDY }; lookDX = 0; lookDY = 0; return d; },
    endFrame: function () {
      pressed = {};
      mouseDownEdge = false;
    }
  };
})();
