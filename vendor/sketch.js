/* Sketchbook — original pocket book of Singapore plates.
   Drag a leaf and the paper curls. Drag the brass glass to read the ink.
   idea after @mengto (mengto/sketchbook); clean-room implementation, no code copied. */
(function () {
  "use strict";

  var canvas = document.getElementById("stage");
  var toggle = document.getElementById("toggle");
  var panel = document.getElementById("panel");
  var list = document.getElementById("plates");
  var hint = document.getElementById("hint");
  var ctx = canvas.getContext("2d");
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduce = false; }

  var CURL_R = 0.36;
  var HANDLE = 0.95;
  var FONT = 'Palatino, "Songti SC", "Noto Serif CJK SC", Georgia, serif';
  var INK = "rgba(46,36,28,0.9)";
  var INK_SOFT = "rgba(46,36,28,0.55)";

  var PLATES = [
    { en: "Bay Deck", zh: "滨海甲板", paint: paintBay },
    { en: "Lattice Garden", zh: "格子花园", paint: paintGarden },
    { en: "Five-foot Way", zh: "五脚基", paint: paintShops },
    { en: "Steam Alley", zh: "热气小巷", paint: paintHawker },
    { en: "Lily Pond", zh: "睡莲池", paint: paintPond },
    { en: "Void Deck", zh: "底层架空", paint: paintBlocks },
    { en: "Boat Quay", zh: "驳船码头", paint: paintQuay },
    { en: "Lantern Mile", zh: "灯笼街", paint: paintLanterns }
  ];

  var cache = [];
  var L = null;
  var dpr = 1;
  var index = 0;
  var flip = 0;
  var nudge = 0;
  var borrowed = false;
  var anim = null;
  var mode = null;
  var pointerId = null;
  var downX = 0;
  var originFlip = 0;
  var backArmed = false;
  var lastPX = 0;
  var lastPT = 0;
  var vel = 0;
  var indexAtDown = 0;
  var lookX = 0;
  var lookY = 0;
  var parX = 0;
  var parY = 0;
  var loupe = { x: 0, y: 0, sx: 0, sy: 0, r: 48, grabX: 0, grabY: 0 };
  var placed = false;
  var bakeAt = 1;
  var frameN = 0;
  var readyCalled = false;
  var raf = 0;
  var clock = 0;
  var actx = null;
  var buttons = [];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRect(g, x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  function blob(g, x, y, rx, ry, r, gg, b, a, rot) {
    if (rx < 1 || ry < 1) return;
    g.save();
    g.translate(x, y);
    g.rotate(rot || 0);
    g.scale(1, ry / rx);
    var grd = g.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx);
    grd.addColorStop(0, "rgba(" + r + "," + gg + "," + b + "," + a + ")");
    grd.addColorStop(1, "rgba(" + r + "," + gg + "," + b + ",0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, rx, 0, 6.2832);
    g.fill();
    g.restore();
  }

  function ink(g, pts, w, color, rnd) {
    if (!pts || pts.length < 2) return;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      var jx = rnd ? (rnd() - 0.5) * 1.3 : 0;
      var jy = rnd ? (rnd() - 0.5) * 1.3 : 0;
      g.lineTo(pts[i][0] + jx, pts[i][1] + jy);
    }
    g.strokeStyle = color || INK;
    g.lineWidth = w;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.stroke();
  }

  function paper(g, w, h, rnd) {
    g.fillStyle = "#f4ead6";
    g.fillRect(0, 0, w, h);
    blob(g, w * 0.48, h * 0.42, w * 0.72, h * 0.62, 255, 248, 232, 0.55, 0);
    var edge = g.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, "rgba(255,250,240,0.2)");
    edge.addColorStop(1, "rgba(120,78,40,0.1)");
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(176,78,68,0.28)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(w * 0.08, 26);
    g.lineTo(w * 0.08, h - 22);
    g.stroke();
    g.fillStyle = "rgba(90,58,30,0.045)";
    for (var i = 0; i < 200; i++) g.fillRect(rnd() * w, rnd() * h, 1.4, 1.4);
  }

  function finishPlate(g, w, h, plate, n, rnd) {
    var vg = g.createRadialGradient(w * 0.5, h * 0.46, w * 0.28, w * 0.5, h * 0.5, w * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(92,54,24,0.16)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    sprig(g, w * 0.16, h * 0.1, 1, rnd);
    g.fillStyle = "rgba(48,38,30,0.22)";
    g.fillRect(w * 0.12, h - 92, 78, 1);
    g.fillStyle = "rgba(48,38,30,0.82)";
    g.font = "600 " + Math.round(w * 0.048) + "px " + FONT;
    g.fillText(plate.en, w * 0.12, h - 62);
    g.font = Math.round(w * 0.034) + "px " + FONT;
    g.fillStyle = "rgba(48,38,30,0.58)";
    g.fillText(plate.zh, w * 0.12, h - 34);
    g.font = Math.round(w * 0.032) + "px " + FONT;
    g.fillStyle = "rgba(48,38,30,0.45)";
    var label = n < 10 ? "0" + n : String(n);
    g.fillText(label, w - w * 0.16, 48);
  }

  function sprig(g, x, y, s, rnd) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = "rgba(62,96,58,0.7)";
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(0, 8);
    g.quadraticCurveTo(8 * s, -16 * s, 2 * s, -48 * s);
    g.stroke();
    g.fillStyle = "rgba(78,120,64,0.45)";
    for (var i = 0; i < 4; i++) {
      var yy = -8 - i * 10;
      g.save();
      g.translate((i % 2 ? 6 : -4) * s, yy * s);
      g.rotate((i % 2 ? 0.6 : -0.7) + (rnd() - 0.5) * 0.2);
      g.beginPath();
      g.ellipse(0, 0, 9 * s, 4 * s, 0, 0, 6.3);
      g.fill();
      g.restore();
    }
    g.restore();
  }

  function windows(g, x, y, w, h, cols, rows, lit) {
    var gw = (w - 8) / cols;
    var gh = (h - 8) / rows;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var on = lit && ((r * 3 + c * 5) % 7 === 0 || (r + c) % 11 === 0);
        g.fillStyle = on ? "rgba(240,196,110,0.85)" : "rgba(46,36,28,0.18)";
        g.fillRect(x + 4 + c * gw, y + 4 + r * gh, Math.max(1, gw - 2), Math.max(1, gh - 2));
      }
    }
  }

  function paintBay(g, w, h, rnd) {
    blob(g, w * 0.3, h * 0.16, w * 0.46, h * 0.22, 244, 214, 168, 0.45, 0.1);
    blob(g, w * 0.7, h * 0.2, w * 0.4, h * 0.2, 176, 208, 214, 0.4, 0);
    blob(g, w * 0.74, h * 0.15, w * 0.1, w * 0.1, 255, 230, 180, 0.75, 0);
    blob(g, w * 0.5, h * 0.62, w * 0.7, h * 0.16, 86, 150, 154, 0.34, 0);
    blob(g, w * 0.42, h * 0.7, w * 0.55, h * 0.1, 64, 124, 132, 0.26, 0);
    blob(g, w * 0.52, h * 0.64, w * 0.16, h * 0.1, 220, 186, 120, 0.28, 0);
    g.fillStyle = "rgba(214,186,146,0.9)";
    g.beginPath();
    g.moveTo(0, h * 0.78);
    g.lineTo(w, h * 0.74);
    g.lineTo(w, h * 0.84);
    g.lineTo(0, h * 0.88);
    g.fill();
    ink(g, [[0, h * 0.78], [w, h * 0.74]], 1.4, INK_SOFT, null);
    var towers = [[0.28, 0.4, 0.1, 0.36], [0.44, 0.46, 0.13, 0.3], [0.63, 0.42, 0.1, 0.34]];
    for (var i = 0; i < towers.length; i++) {
      var t = towers[i];
      var x = t[0] * w, y = t[1] * h, tw = t[2] * w, th = t[3] * h;
      blob(g, x + tw * 0.5, y + th * 0.4, tw * 0.9, th * 0.6, 150, 176, 184, 0.35, 0);
      g.fillStyle = "rgba(186,204,208,0.55)";
      g.fillRect(x, y, tw, th);
      windows(g, x, y, tw, th, 3, 8, false);
      ink(g, [[x, y], [x + tw, y], [x + tw, y + th], [x, y + th], [x, y]], 1.7, INK, rnd);
    }
    g.save();
    g.translate(w * 0.51, h * 0.385);
    g.beginPath();
    g.ellipse(0, 0, w * 0.26, h * 0.028, 0, 0, 6.3);
    g.fillStyle = "rgba(236,240,236,0.95)";
    g.fill();
    g.lineWidth = 1.8;
    g.strokeStyle = INK;
    g.stroke();
    g.restore();
    ink(g, [[w * 0.14, h * 0.7], [w * 0.22, h * 0.675], [w * 0.4, h * 0.675], [w * 0.46, h * 0.7], [w * 0.14, h * 0.7]], 1.7, INK, rnd);
    g.fillStyle = "rgba(186,78,64,0.75)";
    g.fillRect(w * 0.26, h * 0.645, w * 0.08, h * 0.03);
    ink(g, [[w * 0.3, h * 0.645], [w * 0.3, h * 0.61]], 1.3, INK, null);
    for (var b = 0; b < 4; b++) {
      var bx = w * (0.16 + b * 0.14);
      var by = h * (0.2 + rnd() * 0.05);
      ink(g, [[bx, by], [bx + 7, by - 4], [bx + 15, by]], 1.2, "rgba(46,36,28,0.6)", null);
    }
  }

  function paintGarden(g, w, h, rnd) {
    blob(g, w * 0.5, h * 0.3, w * 0.6, h * 0.35, 186, 150, 196, 0.28, 0);
    blob(g, w * 0.3, h * 0.72, w * 0.5, h * 0.2, 120, 160, 110, 0.3, 0);
    blob(g, w * 0.7, h * 0.78, w * 0.4, h * 0.14, 90, 140, 100, 0.22, 0);
    var trunks = [0.28, 0.48, 0.68];
    for (var i = 0; i < trunks.length; i++) {
      var x = trunks[i] * w;
      var top = h * (0.28 + (i === 1 ? -0.04 : 0.02));
      g.strokeStyle = "rgba(90,70,50,0.8)";
      g.lineWidth = 7;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x, h * 0.78);
      g.quadraticCurveTo(x + (i - 1) * 10, (top + h * 0.78) / 2, x, top);
      g.stroke();
      var rad = w * (i === 1 ? 0.16 : 0.13);
      g.strokeStyle = "rgba(70,110,80,0.75)";
      g.lineWidth = 1.3;
      for (var k = 1; k <= 4; k++) {
        g.beginPath();
        g.arc(x, top, rad * k / 4, 0, 6.3);
        g.stroke();
      }
      blob(g, x, top, rad, rad * 0.7, 140, 180, 120, 0.2, 0);
    }
    ink(g, [[w * 0.22, h * 0.34], [w * 0.48, h * 0.3], [w * 0.74, h * 0.36]], 2, "rgba(80,70,60,0.7)", rnd);
    g.strokeStyle = "rgba(70,100,70,0.35)";
    g.lineWidth = 1;
    for (var f = 0; f < 9; f++) {
      var fx = w * (0.12 + f * 0.09);
      g.beginPath();
      g.moveTo(fx, h * 0.8);
      g.quadraticCurveTo(fx + 6, h * 0.74, fx - 2, h * 0.7);
      g.stroke();
    }
  }

  function paintShops(g, w, h, rnd) {
    blob(g, w * 0.5, h * 0.2, w * 0.6, h * 0.22, 196, 214, 220, 0.35, 0);
    var colors = [[232, 176, 162], [168, 196, 214], [186, 214, 176], [230, 206, 150], [206, 180, 214]];
    var n = 5;
    var gap = w * 0.03;
    var houseW = (w * 0.82 - gap * (n - 1)) / n;
    var left = w * 0.09;
    var base = h * 0.74;
    for (var i = 0; i < n; i++) {
      var x = left + i * (houseW + gap);
      var hh = h * (0.34 + (i % 2) * 0.04);
      var y = base - hh;
      var c = colors[i];
      blob(g, x + houseW / 2, y + hh * 0.4, houseW * 0.7, hh * 0.5, c[0], c[1], c[2], 0.45, 0);
      g.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0.72)";
      g.fillRect(x, y, houseW, hh);
      g.fillStyle = "rgba(70,50,40,0.75)";
      g.beginPath();
      g.moveTo(x - 4, y);
      g.lineTo(x + houseW / 2, y - h * 0.045);
      g.lineTo(x + houseW + 4, y);
      g.fill();
      windows(g, x + 4, y + 10, houseW - 8, hh * 0.45, 2, 3, false);
      g.fillStyle = "rgba(46,36,28,0.55)";
      g.fillRect(x + houseW * 0.35, base - hh * 0.28, houseW * 0.3, hh * 0.28);
      ink(g, [[x, y], [x + houseW, y], [x + houseW, base], [x, base], [x, y]], 1.4, INK, rnd);
    }
    g.strokeStyle = "rgba(80,60,40,0.35)";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(left, base + 8);
    g.lineTo(left + n * (houseW + gap), base + 14);
    g.stroke();
    ink(g, [[w * 0.18, base + 6], [w * 0.24, base - 8], [w * 0.32, base + 4]], 1.6, INK, null);
    g.beginPath();
    g.arc(w * 0.24, base - 10, 7, 0, 6.3);
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.stroke();
  }

  function paintHawker(g, w, h, rnd) {
    blob(g, w * 0.5, h * 0.22, w * 0.55, h * 0.24, 232, 170, 120, 0.35, 0);
    blob(g, w * 0.5, h * 0.7, w * 0.6, h * 0.2, 160, 110, 80, 0.18, 0);
    g.fillStyle = "rgba(196,92,64,0.78)";
    g.beginPath();
    g.moveTo(w * 0.08, h * 0.38);
    g.lineTo(w * 0.5, h * 0.26);
    g.lineTo(w * 0.92, h * 0.38);
    g.lineTo(w * 0.84, h * 0.42);
    g.lineTo(w * 0.5, h * 0.32);
    g.lineTo(w * 0.16, h * 0.42);
    g.fill();
    ink(g, [[w * 0.08, h * 0.38], [w * 0.5, h * 0.26], [w * 0.92, h * 0.38]], 1.8, INK, rnd);
    var stalls = [0.18, 0.4, 0.62];
    var awn = [[214, 96, 78], [80, 130, 140], [214, 170, 70]];
    for (var i = 0; i < stalls.length; i++) {
      var x = stalls[i] * w;
      g.fillStyle = "rgba(" + awn[i][0] + "," + awn[i][1] + "," + awn[i][2] + ",0.8)";
      g.fillRect(x, h * 0.42, w * 0.18, h * 0.05);
      g.fillStyle = "rgba(90,60,40,0.25)";
      g.fillRect(x, h * 0.47, w * 0.18, h * 0.16);
      ink(g, [[x, h * 0.42], [x + w * 0.18, h * 0.42], [x + w * 0.18, h * 0.63], [x, h * 0.63], [x, h * 0.42]], 1.3, INK, rnd);
    }
    for (var t = 0; t < 4; t++) {
      var tx = w * (0.22 + t * 0.16);
      var ty = h * (0.7 + (t % 2) * 0.03);
      g.fillStyle = "rgba(120,78,50,0.55)";
      g.beginPath();
      g.ellipse(tx, ty, w * 0.045, h * 0.018, 0, 0, 6.3);
      g.fill();
      g.strokeStyle = INK_SOFT;
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,0.45)";
    g.lineWidth = 1.4;
    for (var s = 0; s < 5; s++) {
      g.beginPath();
      g.arc(w * (0.3 + s * 0.1), h * (0.34 + rnd() * 0.04), 8 + rnd() * 6, 3.4, 5.6);
      g.stroke();
    }
    for (var lamp = 0; lamp < 3; lamp++) {
      blob(g, w * (0.3 + lamp * 0.2), h * 0.4, 14, 14, 255, 210, 120, 0.55, 0);
    }
  }

  function paintPond(g, w, h, rnd) {
    blob(g, w * 0.5, h * 0.28, w * 0.55, h * 0.28, 168, 206, 176, 0.4, 0);
    blob(g, w * 0.5, h * 0.58, w * 0.42, h * 0.16, 80, 140, 150, 0.38, 0);
    blob(g, w * 0.46, h * 0.6, w * 0.28, h * 0.08, 120, 170, 160, 0.25, 0);
    g.strokeStyle = "rgba(50,90,60,0.75)";
    g.lineWidth = 1.5;
    var palms = [0.16, 0.3, 0.78];
    for (var i = 0; i < palms.length; i++) {
      var x = palms[i] * w;
      g.beginPath();
      g.moveTo(x, h * 0.78);
      g.quadraticCurveTo(x + 10, h * 0.5, x - 4, h * 0.32);
      g.stroke();
      var topx = x - 4, topy = h * 0.32;
      for (var k = 0; k < 5; k++) {
        var a = -2.4 + k * 0.55;
        ink(g, [[topx, topy], [topx + Math.cos(a) * w * 0.1, topy + Math.sin(a) * h * 0.06]], 1.4, "rgba(40,80,48,0.75)", null);
      }
    }
    for (var p = 0; p < 6; p++) {
      var px = w * (0.34 + (p % 3) * 0.1);
      var py = h * (0.52 + Math.floor(p / 3) * 0.07);
      g.fillStyle = "rgba(70,130,80,0.55)";
      g.beginPath();
      g.ellipse(px, py, 16, 8, rnd() * 2, 0, 6.3);
      g.fill();
      g.strokeStyle = "rgba(40,70,40,0.6)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + 10, py - 2);
      g.stroke();
    }
    blob(g, w * 0.48, h * 0.5, 18, 14, 230, 160, 170, 0.55, 0);
    g.fillStyle = "rgba(196,164,120,0.85)";
    g.fillRect(w * 0.1, h * 0.74, w * 0.8, 8);
    ink(g, [[w * 0.1, h * 0.74], [w * 0.9, h * 0.74]], 1.2, INK_SOFT, null);
  }

  function paintBlocks(g, w, h, rnd) {
    blob(g, w * 0.5, h * 0.22, w * 0.6, h * 0.28, 186, 206, 220, 0.45, 0);
    blob(g, w * 0.2, h * 0.16, w * 0.3, h * 0.16, 255, 214, 170, 0.3, 0);
    function block(x, y, bw, bh, cols, rows) {
      g.fillStyle = "rgba(210,206,198,0.8)";
      g.fillRect(x, y, bw, bh);
      windows(g, x, y, bw, bh, cols, rows, true);
      ink(g, [[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh], [x, y]], 1.6, INK, rnd);
    }
    block(w * 0.12, h * 0.22, w * 0.34, h * 0.5, 4, 9);
    block(w * 0.52, h * 0.3, w * 0.32, h * 0.42, 4, 8);
    g.strokeStyle = "rgba(80,80,90,0.45)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.14, h * 0.48);
    g.lineTo(w * 0.44, h * 0.48);
    g.stroke();
    var laundry = [[214, 90, 80], [80, 140, 170], [230, 200, 90], [160, 190, 140]];
    for (var i = 0; i < laundry.length; i++) {
      g.fillStyle = "rgba(" + laundry[i][0] + "," + laundry[i][1] + "," + laundry[i][2] + ",0.8)";
      g.fillRect(w * 0.16 + i * 16, h * 0.5, 10, 14 + (i % 2) * 6);
    }
    g.fillStyle = "rgba(120,140,110,0.35)";
    g.fillRect(0, h * 0.74, w, h * 0.06);
  }

  function paintQuay(g, w, h, rnd) {
    blob(g, w * 0.5, h * 0.2, w * 0.55, h * 0.22, 200, 214, 206, 0.4, 0);
    blob(g, w * 0.5, h * 0.62, w * 0.7, h * 0.12, 70, 120, 130, 0.32, 0);
    blob(g, w * 0.4, h * 0.66, w * 0.3, h * 0.06, 180, 160, 120, 0.2, 0);
    var sheds = [[0.08, 0.34, 0.22, 0.22], [0.32, 0.3, 0.18, 0.26], [0.52, 0.36, 0.2, 0.2]];
    for (var i = 0; i < sheds.length; i++) {
      var s = sheds[i];
      var x = s[0] * w, y = s[1] * h, sw = s[2] * w, sh = s[3] * h;
      g.fillStyle = "rgba(150,86,64,0.55)";
      g.beginPath();
      g.moveTo(x, y + sh * 0.35);
      g.lineTo(x + sw * 0.5, y);
      g.lineTo(x + sw, y + sh * 0.35);
      g.lineTo(x + sw, y + sh);
      g.lineTo(x, y + sh);
      g.fill();
      windows(g, x + 4, y + sh * 0.42, sw - 8, sh * 0.5, 3, 2, false);
      ink(g, [[x, y + sh * 0.35], [x + sw * 0.5, y], [x + sw, y + sh * 0.35], [x + sw, y + sh], [x, y + sh], [x, y + sh * 0.35]], 1.4, INK, rnd);
    }
    g.strokeStyle = "rgba(50,40,36,0.8)";
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(w * 0.58, h * 0.58);
    g.quadraticCurveTo(w * 0.74, h * 0.4, w * 0.92, h * 0.56);
    g.stroke();
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(w * 0.7, h * 0.4);
    g.lineTo(w * 0.7, h * 0.56);
    g.moveTo(w * 0.8, h * 0.44);
    g.lineTo(w * 0.8, h * 0.55);
    g.stroke();
    function boat(x, y, s) {
      ink(g, [[x, y], [x + 46 * s, y - 8], [x + 70 * s, y], [x, y]], 1.6, INK, rnd);
      g.strokeStyle = "rgba(180,60,50,0.7)";
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x + 28 * s, y - 8);
      g.lineTo(x + 34 * s, y - 28 * s);
      g.stroke();
    }
    boat(w * 0.14, h * 0.64, 1);
    boat(w * 0.38, h * 0.68, 0.8);
  }

  function paintLanterns(g, w, h, rnd) {
    blob(g, w * 0.5, h * 0.4, w * 0.7, h * 0.5, 48, 62, 110, 0.42, 0);
    blob(g, w * 0.5, h * 0.78, w * 0.6, h * 0.16, 40, 48, 80, 0.3, 0);
    g.strokeStyle = "rgba(40,36,30,0.45)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(w * 0.08, h * 0.28);
    g.quadraticCurveTo(w * 0.5, h * 0.24, w * 0.92, h * 0.3);
    g.stroke();
    var cols = [[214, 64, 58], [230, 150, 60], [196, 70, 90], [220, 90, 50], [180, 50, 70]];
    for (var i = 0; i < 7; i++) {
      var x = w * (0.16 + i * 0.11);
      var y = h * (0.3 + (i % 2) * 0.03);
      var c = cols[i % cols.length];
      g.strokeStyle = "rgba(60,40,30,0.5)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, h * 0.27);
      g.lineTo(x, y);
      g.stroke();
      blob(g, x, y + 16, 16, 20, c[0], c[1], c[2], 0.85, 0);
      g.strokeStyle = "rgba(255,220,160,0.8)";
      g.beginPath();
      g.moveTo(x, y + 30);
      g.lineTo(x, y + 42);
      g.stroke();
    }
    g.fillStyle = "rgba(70,48,36,0.55)";
    g.fillRect(w * 0.1, h * 0.62, w * 0.22, h * 0.16);
    g.fillRect(w * 0.68, h * 0.6, w * 0.2, h * 0.18);
    blob(g, w * 0.2, h * 0.66, 30, 16, 255, 190, 90, 0.35, 0);
    blob(g, w * 0.76, h * 0.64, 26, 14, 255, 170, 80, 0.3, 0);
    for (var f = 0; f < 4; f++) {
      var fx = w * (0.32 + f * 0.1);
      g.fillStyle = "rgba(28,24,32,0.72)";
      g.beginPath();
      g.ellipse(fx, h * 0.78, 7, 16, 0, 0, 6.3);
      g.fill();
      g.beginPath();
      g.arc(fx, h * 0.74, 5, 0, 6.3);
      g.fill();
    }
  }

  function plateCanvas(i) {
    if (cache[i]) return cache[i];
    var c = document.createElement("canvas");
    c.width = 600;
    c.height = 840;
    var g = c.getContext("2d");
    var rnd = mulberry(80 + i * 29);
    var plate = PLATES[i];
    paper(g, c.width, c.height, rnd);
    plate.paint(g, c.width, c.height, rnd);
    finishPlate(g, c.width, c.height, plate, i + 1, rnd);
    cache[i] = c;
    return c;
  }

  function layout(vw, vh) {
    var short = vh < 640;
    var side = Math.max(14, Math.round(vw * 0.045));
    var top = short ? 56 : Math.max(18, Math.round(vh * 0.045));
    var bot = short ? 48 : Math.max(18, Math.round(vh * 0.045));
    var maxW = Math.max(80, vw - side * 2);
    var maxH = Math.max(80, vh - top - bot);
    var lip = Math.max(9, Math.round(Math.min(maxW, maxH) * 0.03));
    var ratio = 0.7;
    var pageW = maxW - lip * 2;
    var pageH = pageW / ratio;
    if (pageH > maxH - lip * 2) {
      pageH = maxH - lip * 2;
      pageW = pageH * ratio;
    }
    pageW = Math.round(pageW);
    pageH = Math.round(pageH);
    var bw = pageW + lip * 2;
    var bh = pageH + lip * 2;
    var x = Math.round((vw - bw) / 2);
    var y = Math.round(top + (maxH - bh) / 2);
    return { x: x, y: y, bw: bw, bh: bh, lip: lip, pageX: x + lip, pageY: y + lip, pageW: pageW, pageH: pageH, vw: vw, vh: vh };
  }

  function ensureFit() {
    var w = canvas.clientWidth || 0;
    var h = canvas.clientHeight || 0;
    if (w < 2 || h < 2) return false;
    var next = Math.min(window.devicePixelRatio || 1, 1.6);
    var pw = Math.max(1, Math.round(w * next));
    var ph = Math.max(1, Math.round(h * next));
    if (L && L.vw === w && L.vh === h && canvas.width === pw && canvas.height === ph) return true;
    var prev = L;
    dpr = next;
    canvas.width = pw;
    canvas.height = ph;
    L = layout(w, h);
    loupe.r = clamp(Math.round(L.pageW * 0.175), 36, 62);
    if (!placed || !prev) {
      loupe.x = L.pageX + L.pageW * 0.6;
      loupe.y = L.pageY + L.pageH * 0.48;
      loupe.sx = loupe.x;
      loupe.sy = loupe.y;
      placed = true;
    } else {
      var u = (loupe.x - prev.pageX) / prev.pageW;
      var v = (loupe.y - prev.pageY) / prev.pageH;
      loupe.x = clamp(L.pageX + u * L.pageW, loupe.r, w - loupe.r);
      loupe.y = clamp(L.pageY + v * L.pageH, loupe.r, h - loupe.r);
    }
    lookX = w * 0.5;
    lookY = h * 0.45;
    return true;
  }

  function projectPoint(s, crease, R) {
    if (s <= crease) return { p: s, ang: 0 };
    var arc = s - crease;
    var ang = arc / R;
    if (ang < Math.PI) return { p: crease + R * Math.sin(ang), ang: ang };
    return { p: crease - (arc - Math.PI * R), ang: Math.PI };
  }

  function drawDesk(g) {
    var grd = g.createLinearGradient(0, 0, 0, L.vh);
    grd.addColorStop(0, "#e0c392");
    grd.addColorStop(0.45, "#c69960");
    grd.addColorStop(1, "#8d5c34");
    g.fillStyle = grd;
    g.fillRect(0, 0, L.vw, L.vh);
    g.strokeStyle = "rgba(92,48,18,0.14)";
    g.lineWidth = 1;
    for (var y = 6; y < L.vh; y += 12) {
      g.beginPath();
      g.moveTo(0, y);
      g.quadraticCurveTo(L.vw * 0.5, y + Math.sin(y * 0.08) * 2.5, L.vw, y + Math.sin(y * 0.03) * 1.5);
      g.stroke();
    }
    g.fillStyle = "rgba(120,70,30,0.18)";
    g.beginPath();
    g.ellipse(L.vw * 0.22, L.vh * 0.72, 28, 16, 0.4, 0, 6.3);
    g.fill();
    var vig = g.createRadialGradient(L.vw * 0.5, L.vh * 0.48, Math.min(L.vw, L.vh) * 0.2, L.vw * 0.5, L.vh * 0.5, Math.max(L.vw, L.vh) * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(48,22,6,0.28)");
    g.fillStyle = vig;
    g.fillRect(0, 0, L.vw, L.vh);
  }

  function drawProps(g) {
    if (L.y > 86) {
      var cx = L.x + 36;
      var cy = L.y - 46;
      g.fillStyle = "rgba(60,30,12,0.2)";
      g.beginPath();
      g.ellipse(cx + 4, cy + 18, 22, 7, 0, 0, 6.3);
      g.fill();
      g.fillStyle = "#f2efe6";
      g.beginPath();
      g.ellipse(cx, cy, 18, 16, 0, 0, 6.3);
      g.fill();
      g.fillStyle = "rgba(90,150,160,0.55)";
      g.beginPath();
      g.ellipse(cx, cy + 2, 11, 8, 0, 0, 6.3);
      g.fill();
      g.strokeStyle = "rgba(80,60,40,0.45)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(cx, cy - 12, 16, 5, 0, 0, 6.3);
      g.stroke();
    }
    var below = L.vh - (L.y + L.bh);
    if (below > 86) {
      var px = L.x + L.bw * 0.42;
      var py = L.y + L.bh + Math.min(48, below * 0.45);
      g.save();
      g.translate(px, py);
      g.rotate(-0.18);
      g.fillStyle = "#e6b23c";
      g.fillRect(0, -3.5, 92, 7);
      g.fillStyle = "#f3e2b0";
      g.fillRect(92, -3.5, 16, 7);
      g.fillStyle = "#3a3a3a";
      g.beginPath();
      g.moveTo(108, -3.5);
      g.lineTo(120, 0);
      g.lineTo(108, 3.5);
      g.fill();
      g.fillStyle = "#c45a4a";
      g.fillRect(-8, -3.5, 10, 7);
      g.restore();
    }
  }

  function drawFlat(g, plate) {
    g.drawImage(plate, L.pageX, L.pageY, L.pageW, L.pageH);
    shadeGutter(g);
  }

  function shadeGutter(g) {
    var gg = g.createLinearGradient(L.pageX, 0, L.pageX + L.pageW * 0.07, 0);
    gg.addColorStop(0, "rgba(40,28,16,0.28)");
    gg.addColorStop(1, "rgba(40,28,16,0)");
    g.fillStyle = gg;
    g.fillRect(L.pageX, L.pageY, L.pageW * 0.08, L.pageH);
  }

  function curlSpan(amount) {
    var crease = 1 - amount;
    var arc = Math.max(0, amount);
    var angMax = arc / CURL_R;
    var apex = crease + (angMax >= Math.PI / 2 ? CURL_R : CURL_R * Math.sin(Math.max(0, angMax)));
    var left = crease;
    if (angMax > Math.PI) left = crease - (arc - Math.PI * CURL_R);
    return { crease: crease, left: left, apex: apex, angMax: angMax };
  }

  function drawCurl(g, top, under, amount) {
    var span = curlSpan(amount);
    var crease = span.crease;
    g.drawImage(under || top, L.pageX, L.pageY, L.pageW, L.pageH);
    var apexX = L.pageX + span.apex * L.pageW;
    if (amount > 0.02 && apexX < L.pageX + L.pageW - 1) {
      var sh = g.createLinearGradient(apexX, 0, apexX + L.pageW * 0.16, 0);
      sh.addColorStop(0, "rgba(36,22,10,0.33)");
      sh.addColorStop(1, "rgba(36,22,10,0)");
      g.fillStyle = sh;
      g.fillRect(apexX, L.pageY, L.pageW * 0.18, L.pageH);
    }
    if (crease > 0.004) {
      g.drawImage(top, 0, 0, Math.max(1, crease * top.width), top.height, L.pageX, L.pageY, crease * L.pageW + 1.5, L.pageH);
    }
    g.save();
    g.beginPath();
    g.rect(L.pageX - 2, L.pageY - 1, L.pageW + 8, L.pageH + 2);
    g.clip();
    var N = 40;
    var segs = [];
    for (var i = 0; i < N; i++) {
      var s0 = crease + (1 - crease) * (i / N);
      var s1 = crease + (1 - crease) * ((i + 1) / N);
      var a = projectPoint(s0, crease, CURL_R);
      var b = projectPoint(s1, crease, CURL_R);
      segs.push({ s0: s0, s1: s1, a: a, b: b, ang: (a.ang + b.ang) * 0.5 });
    }
    function paintSeg(s, back) {
      var x0 = L.pageX + Math.min(s.a.p, s.b.p) * L.pageW;
      var x1 = L.pageX + Math.max(s.a.p, s.b.p) * L.pageW;
      var dw = x1 - x0;
      if (dw < 0.4) return;
      var sx = s.s0 * top.width;
      var sw = Math.max(1, (s.s1 - s.s0) * top.width);
      var flipped = s.a.p > s.b.p;
      var destW = dw + 1.25;
      if (!back) {
        if (!flipped) g.drawImage(top, sx, 0, sw, top.height, x0, L.pageY, destW, L.pageH);
        else g.drawImage(top, sx, 0, sw, top.height, x1, L.pageY, -destW, L.pageH);
      } else {
        g.fillStyle = "#efe2c6";
        g.fillRect(x0, L.pageY, destW, L.pageH);
        g.fillStyle = "rgba(92,64,36,0.16)";
        g.fillRect(x0, L.pageY, destW, L.pageH);
      }
    }
    var creaseX = L.pageX + crease * L.pageW;
    for (var f = 0; f < segs.length; f++) if (segs[f].ang < Math.PI * 0.5) paintSeg(segs[f], false);
    if (apexX > creaseX + 3) {
      var roll = g.createLinearGradient(creaseX, 0, apexX, 0);
      roll.addColorStop(0, "rgba(255,248,230,0.12)");
      roll.addColorStop(0.28, "rgba(255,248,230,0.02)");
      roll.addColorStop(0.62, "rgba(48,30,14,0.08)");
      roll.addColorStop(0.88, "rgba(36,20,8,0.26)");
      roll.addColorStop(1, "rgba(20,12,6,0.5)");
      g.fillStyle = roll;
      g.fillRect(creaseX, L.pageY, apexX - creaseX, L.pageH);
      var specX = creaseX + (apexX - creaseX) * 0.32;
      var spec = g.createLinearGradient(specX - L.pageW * 0.06, 0, specX + L.pageW * 0.07, 0);
      spec.addColorStop(0, "rgba(255,252,240,0)");
      spec.addColorStop(0.5, "rgba(255,252,240,0.2)");
      spec.addColorStop(1, "rgba(255,252,240,0)");
      g.fillStyle = spec;
      g.fillRect(specX - L.pageW * 0.06, L.pageY, L.pageW * 0.13, L.pageH);
    }
    var lift = Math.sin(Math.min(span.angMax, Math.PI * 0.5));
    if (lift > 0.08) {
      var contact = g.createLinearGradient(creaseX - L.pageW * 0.07, 0, creaseX + 2, 0);
      contact.addColorStop(0, "rgba(40,24,10,0)");
      contact.addColorStop(1, "rgba(40,24,10," + (0.2 * lift).toFixed(3) + ")");
      g.fillStyle = contact;
      g.fillRect(creaseX - L.pageW * 0.07, L.pageY, L.pageW * 0.07 + 2, L.pageH);
    }
    for (var k = 0; k < segs.length; k++) {
      var seg = segs[k];
      if (seg.ang < Math.PI * 0.5) continue;
      if (Math.max(seg.a.p, seg.b.p) > crease - 0.004) continue;
      paintSeg(seg, true);
    }
    if (span.angMax > 0.35 && apexX > creaseX + 4) {
      var rim = g.createLinearGradient(apexX - 5, 0, apexX, 0);
      rim.addColorStop(0, "rgba(255,250,236,0)");
      rim.addColorStop(0.45, "rgba(255,250,236,0.45)");
      rim.addColorStop(1, "rgba(64,42,22,0.55)");
      g.fillStyle = rim;
      g.fillRect(apexX - 5, L.pageY, 5, L.pageH);
    }
    g.restore();
    g.strokeStyle = "rgba(255,248,232,0.7)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(apexX + 0.5, L.pageY + 1);
    g.lineTo(apexX + 0.5, L.pageY + L.pageH - 1);
    g.stroke();
    shadeGutter(g);
  }

  function visualOrigin() {
    return { x: L.pageX + parX + nudge * 0.4, y: L.pageY + parY };
  }

  function faceUnder(x, y) {
    var o = visualOrigin();
    var u = (x - o.x) / L.pageW;
    var v = (y - o.y) / L.pageH;
    var inside = Math.min(u, 1 - u, v, 1 - v);
    if (inside <= 0) return { plate: null, alpha: 0, u: u, v: v };
    var edgeA = Math.min(1, inside / 0.07);
    if (flip < 0.02) return { plate: plateCanvas(index), alpha: edgeA, u: u, v: v };
    var span = curlSpan(flip);
    if (u > span.apex + 0.012) {
      var underI = Math.min(PLATES.length - 1, index + 1);
      if (underI === index) return { plate: null, alpha: 0, u: u, v: v };
      return { plate: plateCanvas(underI), alpha: edgeA, u: u, v: v };
    }
    if (u >= span.left && u < span.crease - 0.008) {
      return { plate: null, alpha: 0, u: u, v: v };
    }
    if (u < span.crease) return { plate: plateCanvas(index), alpha: edgeA, u: u, v: v };
    var ang = Math.asin(clamp((u - span.crease) / CURL_R, 0, 1));
    var s = span.crease + ang * CURL_R;
    return { plate: plateCanvas(index), alpha: edgeA, u: s, v: v };
  }

  function dodgeTarget() {
    if (mode === "loupe" || flip < 0.05 || flip > 0.98) return null;
    var o = visualOrigin();
    var span = curlSpan(flip);
    var left = o.x + span.left * L.pageW;
    var right = o.x + span.apex * L.pageW;
    if (loupe.y < o.y - 6 || loupe.y > o.y + L.pageH + 6) return null;
    if (loupe.x + loupe.r * 0.55 < left || loupe.x - loupe.r * 0.55 > right) return null;
    var roomL = left - o.x;
    var roomR = o.x + L.pageW - right;
    var x = roomL >= roomR
      ? left - loupe.r - 8
      : right + loupe.r + 8;
    x = clamp(x, o.x + loupe.r * 0.15, o.x + L.pageW - loupe.r * 0.15);
    return { x: x, y: loupe.y };
  }

  function drawLoupe(g) {
    var x = loupe.sx;
    var y = loupe.sy;
    var r = loupe.r;
    var info = faceUnder(x, y);
    g.save();
    g.beginPath();
    g.arc(x, y, r - 5, 0, 6.2832);
    g.clip();
    if (info.plate && info.alpha > 0.03) {
      g.save();
      g.globalAlpha = info.alpha;
      var z = 2.15;
      g.translate(x, y);
      g.scale(z, z);
      g.translate(-x, -y);
      var o = visualOrigin();
      var su = info.u == null ? (x - o.x) / L.pageW : info.u;
      var sv = info.v == null ? (y - o.y) / L.pageH : info.v;
      g.drawImage(info.plate, x - su * L.pageW, y - sv * L.pageH, L.pageW, L.pageH);
      g.restore();
    }
    var lens = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    lens.addColorStop(0, "rgba(255,255,255,0.04)");
    lens.addColorStop(0.72, "rgba(0,0,0,0)");
    lens.addColorStop(1, "rgba(40,28,12,0.3)");
    g.fillStyle = lens;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.beginPath();
    g.ellipse(x - r * 0.28, y - r * 0.32, r * 0.28, r * 0.16, -0.6, 0, 6.3);
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.fill();
    g.restore();
    var ring = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.2, x, y, r * 1.05);
    ring.addColorStop(0, "#f6e2a4");
    ring.addColorStop(0.45, "#d7a85a");
    ring.addColorStop(0.78, "#a87432");
    ring.addColorStop(1, "#6a481f");
    g.beginPath();
    g.arc(x, y, r, 0, 6.2832);
    g.arc(x, y, r - 6.5, 0, 6.2832, true);
    g.fillStyle = ring;
    g.fill();
    g.beginPath();
    g.arc(x, y, r - 5.5, 0, 6.2832);
    g.strokeStyle = "rgba(60,36,12,0.4)";
    g.lineWidth = 1.4;
    g.stroke();
    g.beginPath();
    g.arc(x, y, r - 2.2, -2.5, -0.55);
    g.strokeStyle = "rgba(255,250,230,0.75)";
    g.lineWidth = 2;
    g.stroke();
    g.save();
    g.translate(x + Math.cos(HANDLE) * (r - 2), y + Math.sin(HANDLE) * (r - 2));
    g.rotate(HANDLE);
    roundRect(g, 0, -5, r * 0.7, 10, 5);
    var hg = g.createLinearGradient(0, -5, 0, 5);
    hg.addColorStop(0, "#f3d98a");
    hg.addColorStop(0.5, "#c48b3e");
    hg.addColorStop(1, "#6e4c22");
    g.fillStyle = hg;
    g.fill();
    g.beginPath();
    g.arc(r * 0.52, 0, 3, 0, 6.3);
    g.fillStyle = "rgba(50,28,10,0.55)";
    g.fill();
    g.restore();
  }

  function drawBook(g) {
    g.save();
    g.translate(parX + nudge * 0.4, parY);
    g.fillStyle = "rgba(50,24,8,0.28)";
    g.beginPath();
    g.ellipse(L.x + L.bw * 0.5, L.y + L.bh + 10, L.bw * 0.42, 14, 0, 0, 6.3);
    g.fill();
    roundRect(g, L.x, L.y, L.bw, L.bh, 7);
    g.fillStyle = "#1c3c44";
    g.fill();
    var cloth = g.createLinearGradient(L.x, L.y, L.x, L.y + L.bh);
    cloth.addColorStop(0, "rgba(255,255,255,0.08)");
    cloth.addColorStop(1, "rgba(0,0,0,0.18)");
    g.fillStyle = cloth;
    g.fill();
    g.fillStyle = "#ead9bc";
    for (var i = 1; i <= 3; i++) g.fillRect(L.pageX + L.pageW + i, L.pageY + 8, 1.2, L.pageH - 12);
    g.strokeStyle = "rgba(198,161,90,0.9)";
    g.lineWidth = 1.15;
    g.strokeRect(L.pageX - 3.5, L.pageY - 3.5, L.pageW + 7, L.pageH + 7);
    if (flip < 0.012) {
      drawFlat(g, plateCanvas(index));
    } else {
      var underI = index < PLATES.length - 1 ? index + 1 : index;
      var under = underI === index ? null : plateCanvas(underI);
      drawCurl(g, plateCanvas(index), under, flip);
    }
    g.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDesk(ctx);
    drawProps(ctx);
    drawBook(ctx);
    drawLoupe(ctx);
  }

  function localPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitLoupe(p) {
    var dx = p.x - loupe.sx;
    var dy = p.y - loupe.sy;
    if (dx * dx + dy * dy <= (loupe.r + 8) * (loupe.r + 8)) return true;
    var hx = loupe.sx + Math.cos(HANDLE) * (loupe.r + loupe.r * 0.28);
    var hy = loupe.sy + Math.sin(HANDLE) * (loupe.r + loupe.r * 0.28);
    var ex = p.x - hx;
    var ey = p.y - hy;
    return ex * ex + ey * ey <= 24 * 24;
  }

  function hitBook(p) {
    return p.x >= L.x - 8 && p.x <= L.x + L.bw + 8 && p.y >= L.y - 8 && p.y <= L.y + L.bh + 8;
  }

  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!actx) {
      try { actx = new AC(); } catch (err) { actx = null; }
    }
    if (actx && actx.state === "suspended") {
      try { actx.resume(); } catch (err2) { /* ignore */ }
    }
  }

  function rustle() {
    if (!actx) return;
    try {
      var dur = 0.11;
      var n = Math.floor(actx.sampleRate * dur);
      var buf = actx.createBuffer(1, n, actx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) {
        var env = Math.sin(Math.PI * i / n);
        d[i] = (Math.random() * 2 - 1) * env * env;
      }
      var src = actx.createBufferSource();
      src.buffer = buf;
      var filter = actx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1600;
      filter.Q.value = 0.6;
      var gain = actx.createGain();
      gain.gain.value = 0.12;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);
      src.start();
    } catch (err) { /* ignore */ }
  }

  function settle(target) {
    var visible;
    if (target >= 1) {
      if (borrowed) visible = index + 1;
      else visible = Math.min(PLATES.length - 1, index + 1);
    } else {
      visible = index;
    }
    var changed = visible !== indexAtDown;
    if (target >= 1) {
      if (borrowed) {
        index += 1;
        borrowed = false;
      } else if (index < PLATES.length - 1) {
        index += 1;
      }
      flip = 0;
    } else {
      borrowed = false;
      flip = 0;
    }
    if (changed) rustle();
    markActive();
  }

  function releasePage() {
    var target;
    if (index >= PLATES.length - 1 && !borrowed) target = 0;
    else if (vel > 0.45 && flip < 0.94) target = 0;
    else if (vel < -0.45 && flip > 0.05) target = 1;
    else target = flip > 0.42 ? 1 : 0;
    if (index >= PLATES.length - 1 && !borrowed) target = 0;
    var inherited = clamp(-vel / Math.max(1, L.pageW) * 1000, -2.4, 2.4);
    if (reduce) {
      flip = target;
      settle(target);
      return;
    }
    anim = { target: target, v: inherited };
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (!L) return;
    var p = localPoint(e);
    ensureAudio();
    hint.className = "off";
    pointerId = e.pointerId;
    lookX = p.x;
    lookY = p.y;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (hitLoupe(p)) {
      mode = "loupe";
      loupe.grabX = p.x - loupe.x;
      loupe.grabY = p.y - loupe.y;
    } else if (hitBook(p)) {
      anim = null;
      mode = "page";
      downX = p.x;
      originFlip = flip;
      backArmed = flip < 0.03 && index > 0 && !borrowed;
      indexAtDown = borrowed ? index + 1 : index;
      lastPX = p.x;
      lastPT = performance.now();
      vel = 0;
    } else {
      mode = "look";
    }
    e.preventDefault();
    kick();
  }

  function onMove(e) {
    if (e.pointerId !== pointerId || !mode) return;
    var p = localPoint(e);
    lookX = p.x;
    lookY = p.y;
    if (mode === "loupe") {
      loupe.x = clamp(p.x - loupe.grabX, loupe.r, L.vw - loupe.r);
      loupe.y = clamp(p.y - loupe.grabY, loupe.r, L.vh - loupe.r);
    } else if (mode === "page") {
      var now = performance.now();
      var dt = Math.max(8, now - lastPT);
      vel = (p.x - lastPX) / dt;
      lastPX = p.x;
      lastPT = now;
      if (backArmed && !borrowed && p.x - downX > 16) {
        index -= 1;
        borrowed = true;
        flip = 1;
        originFlip = 1;
        downX = p.x;
        backArmed = false;
      }
      var raw = originFlip + (downX - p.x) / L.pageW;
      if (!borrowed && index >= PLATES.length - 1) {
        if (raw > 0) raw = 0.2 * (1 - Math.exp(-raw / 0.2));
        else raw = 0;
      }
      if (!borrowed && raw < 0) {
        if (index === 0) nudge = Math.min(18, -raw * L.pageW);
        raw = 0;
      } else if (mode === "page") {
        nudge = 0;
      }
      flip = clamp(raw, 0, 1);
    }
    e.preventDefault();
    kick();
  }

  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    if (mode === "page") releasePage();
    mode = null;
    pointerId = null;
    kick();
  }

  function update(dt) {
    var more = false;
    if (anim) {
      var w = 15;
      var acc = (anim.target - flip) * w * w - anim.v * 2 * w;
      anim.v += acc * dt;
      flip += anim.v * dt;
      more = true;
      if (Math.abs(anim.target - flip) < 0.007 && Math.abs(anim.v) < 0.06) {
        var target = anim.target;
        anim = null;
        settle(target);
      }
    }
    if (mode !== "page" && Math.abs(nudge) > 0.25) {
      nudge += (0 - nudge) * Math.min(1, dt * 9);
      more = true;
    }
    var dodge = dodgeTarget();
    var tx = dodge ? dodge.x : loupe.x;
    var ty = dodge ? dodge.y : loupe.y;
    var ease = 1 - Math.exp(-16 * dt);
    loupe.sx += (tx - loupe.sx) * ease;
    loupe.sy += (ty - loupe.sy) * ease;
    if (Math.abs(tx - loupe.sx) > 0.45 || Math.abs(ty - loupe.sy) > 0.45) more = true;
    var wantX = 0;
    var wantY = 0;
    if (mode === "page" || mode === "loupe" || mode === "look") {
      wantX = (lookX / L.vw - 0.5) * 7;
      wantY = (lookY / L.vh - 0.5) * 5;
    }
    var pe = 1 - Math.exp(-8 * dt);
    parX += (wantX - parX) * pe;
    parY += (wantY - parY) * pe;
    if (Math.abs(parX - wantX) > 0.25 || Math.abs(parY - wantY) > 0.25) more = true;
    if (readyCalled && bakeAt < PLATES.length) {
      plateCanvas(bakeAt);
      bakeAt += 1;
      more = true;
    }
    if (mode) more = true;
    return more;
  }

  function callReady() {
    if (readyCalled) return;
    if (window.__gbSandbox && window.__gbSandbox.ready) {
      readyCalled = true;
      window.__gbSandbox.ready();
    }
  }

  function loop(t) {
    raf = 0;
    if (!ensureFit()) {
      kick();
      return;
    }
    var dt = clock ? Math.min(0.05, (t - clock) / 1000) : 0.016;
    clock = t;
    var more = update(dt);
    draw();
    frameN += 1;
    if (!readyCalled && frameN >= 2) callReady();
    if (more || !readyCalled) kick();
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function markActive() {
    for (var i = 0; i < buttons.length; i++) {
      if (i === index) buttons[i].className = "on";
      else buttons[i].className = "";
    }
  }

  function jumpTo(i) {
    if (i === index && flip < 0.01 && !borrowed) return;
    anim = null;
    borrowed = false;
    flip = 0;
    nudge = 0;
    index = i;
    markActive();
    kick();
  }

  function buildList() {
    for (var i = 0; i < PLATES.length; i++) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = PLATES[i].en + "<small>" + PLATES[i].zh + "</small>";
      (function (n) {
        b.addEventListener("pointerdown", function (e) {
          e.stopPropagation();
          e.preventDefault();
        });
        b.addEventListener("pointerup", function (e) {
          e.stopPropagation();
          e.preventDefault();
          jumpTo(n);
        });
      })(i);
      li.appendChild(b);
      list.appendChild(li);
      buttons.push(b);
    }
    markActive();
  }

  function stopUI(el) {
    var names = ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend", "click"];
    for (var i = 0; i < names.length; i++) {
      el.addEventListener(names[i], function (e) { e.stopPropagation(); });
    }
  }

  toggle.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
    e.preventDefault();
  });
  toggle.addEventListener("pointerup", function (e) {
    e.stopPropagation();
    e.preventDefault();
    var open = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  stopUI(panel);

  canvas.addEventListener("pointerdown", onDown, { passive: false });
  canvas.addEventListener("pointermove", onMove, { passive: false });
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  window.addEventListener("resize", kick);

  buildList();
  setTimeout(function () { hint.className = "off"; }, 2800);
  kick();
})();
