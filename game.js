/* NEON HOP — one-tap runner. Tap / click / Space = jump (double jump in the air). */
(function () {
  var cv = document.getElementById('c'), cx = cv.getContext('2d');
  var W = 1280, H = 720, scale = 1, DPR = 1;
  var T = {
    title: { ru: 'NEON HOP', en: 'NEON HOP' },
    tap: { ru: 'Тапни, чтобы начать', en: 'Tap to start' },
    hint: { ru: 'Тап — прыжок, в воздухе ещё раз — двойной', en: 'Tap to jump, tap again in the air to double jump' },
    best: { ru: 'Рекорд', en: 'Best' },
    over: { ru: 'Разбился!', en: 'Crashed!' },
    revive: { ru: '▶ Продолжить за рекламу', en: '▶ Continue (watch ad)' },
    x2: { ru: '▶ x2 монет за рекламу', en: '▶ x2 coins (watch ad)' },
    again: { ru: 'Ещё раз', en: 'Play again' },
    shop: { ru: 'Скины', en: 'Skins' },
    back: { ru: 'Назад', en: 'Back' },
    pause: { ru: 'Пауза', en: 'Paused' },
    newbest: { ru: 'Новый рекорд!', en: 'New best!' },
    owned: { ru: 'Выбрать', en: 'Select' },
    used: { ru: 'Выбран', en: 'Selected' },
    invite: { ru: '📨 Друг +30 ●', en: '📨 Invite +30 ●' },
    shareText: { ru: 'Залипаю в NEON HOP — неоновый раннер в одно касание. Побьёшь мой рекорд?', en: 'Playing NEON HOP, a one-tap neon runner. Can you beat my best?' },
    welcome: { ru: '+50 ● за приглашение!', en: '+50 ● welcome bonus!' }
  };
  var SKINS = [
    { c: '#2de2e6', p: 0 }, { c: '#ff3cac', p: 50 }, { c: '#f9f871', p: 120 },
    { c: '#7cff6b', p: 250 }, { c: '#ff8c42', p: 400 }, { c: '#b388ff', p: 600 }
  ];
  var save = { best: 0, coins: 0, skins: [0], skin: 0, runs: 0 };
  var state = 'loading', paused = false, pauseReason = null;
  var pl, obs, coins, parts, dist, speed, runCoins, revived, groundY = 600, tPrev = 0, shake = 0, newBest = false, doubled = false;
  var buttons = [], uiOY = 0, oy = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    if (w >= h) { H = 720; W = Math.round(720 * w / h); } else { W = 720; H = Math.round(720 * h / w); }
    scale = w / W; groundY = H - 120; uiOY = Math.round((H - 720) / 2);
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
  }
  window.addEventListener('resize', resize); resize();

  function reset() {
    pl = { x: 220, y: groundY - 50, vy: 0, s: 50, jumps: 0, rot: 0, alive: true };
    obs = []; coins = []; parts = []; dist = 0; speed = 520; runCoins = 0; revived = false; newBest = false; doubled = false;
    lastSpawnX = 900;
  }
  var lastSpawnX = 900;

  function spawn() {
    // keep the world filled to the right
    while (lastSpawnX < dist + W + 400) {
      var gap = 380 + Math.random() * 380 - Math.min(140, speed / 12);
      var x = lastSpawnX + Math.max(300, gap);
      var r = Math.random();
      if (r < 0.45) obs.push({ k: 'spike', x: x, w: 46, h: 50 });
      else if (r < 0.65) { obs.push({ k: 'spike', x: x, w: 46, h: 50 }); obs.push({ k: 'spike', x: x + 46, w: 46, h: 50 }); x += 46; }
      else if (r < 0.85) obs.push({ k: 'pit', x: x, w: 140 + Math.random() * 60 });
      else obs.push({ k: 'saw', x: x, y: groundY - 150 - Math.random() * 40, r: 28 });
      // coin arc above the obstacle
      if (Math.random() < 0.7) for (var i = 0; i < 5; i++) coins.push({ x: x - 80 + i * 45, y: groundY - 120 - Math.sin(i / 4 * Math.PI) * 90, got: false });
      lastSpawnX = x;
    }
  }

  function jump() {
    if (!pl.alive) return;
    if (pl.jumps < 2) {
      pl.vy = pl.jumps === 0 ? -980 : -860; pl.jumps++;
      SFX.beep(pl.jumps === 1 ? 520 : 760, 0.12, 'square', pl.jumps === 1 ? 880 : 1200);
      for (var i = 0; i < 6; i++) parts.push({ x: pl.x, y: pl.y + pl.s, vx: -Math.random() * 200, vy: Math.random() * -100, l: 0.4, c: SKINS[save.skin].c });
    }
  }

  function onGround() {
    // is there ground under player (not over a pit)?
    var px = dist + pl.x + pl.s / 2;
    for (var i = 0; i < obs.length; i++) { var o = obs[i]; if (o.k === 'pit' && px > o.x + 8 && px < o.x + o.w - 8) return false; }
    return true;
  }

  function die() {
    if (!pl.alive) return;
    pl.alive = false; shake = 0.4; SFX.beep(200, 0.4, 'sawtooth', 60);
    for (var i = 0; i < 30; i++) parts.push({ x: pl.x + 25, y: pl.y + 25, vx: (Math.random() - 0.5) * 700, vy: (Math.random() - 0.8) * 700, l: 0.8, c: SKINS[save.skin].c });
    P.gameplayStop();
    var score = Math.floor(dist / 10);
    save.coins += runCoins; save.runs++;
    if (score > save.best) { save.best = score; newBest = true; }
    P.save(save);
    setTimeout(function () { state = 'over'; }, 700);
  }

  function update(dt) {
    if (state !== 'play' || paused) return;
    speed = Math.min(1100, speed + dt * 9);
    dist += speed * dt;
    spawn();
    if (pl.alive) {
      pl.vy += 2600 * dt; pl.y += pl.vy * dt;
      var gnd = onGround();
      if (gnd && pl.y + pl.s >= groundY && pl.y + pl.s <= groundY + 40 && pl.vy >= 0) { pl.y = groundY - pl.s; pl.vy = 0; pl.jumps = 0; }
      if (pl.jumps > 0) pl.rot += dt * 9; else pl.rot = Math.round(pl.rot / (Math.PI / 2)) * (Math.PI / 2);
      if (pl.y > H + 50) die();
      // collisions
      for (var i = 0; i < obs.length; i++) {
        var o = obs[i], ox = o.x - dist;
        if (o.k === 'spike' && pl.x + pl.s - 8 > ox + 6 && pl.x + 8 < ox + o.w - 6 && pl.y + pl.s > groundY - o.h + 14) die();
        if (o.k === 'saw') { var dx = pl.x + pl.s / 2 - ox, dy = pl.y + pl.s / 2 - o.y; if (dx * dx + dy * dy < Math.pow(o.r + pl.s / 2 - 8, 2)) die(); }
      }
      for (var j = 0; j < coins.length; j++) {
        var c = coins[j]; if (c.got) continue;
        var cx2 = c.x - dist;
        if (Math.abs(cx2 - (pl.x + pl.s / 2)) < 40 && Math.abs(c.y - (pl.y + pl.s / 2)) < 40) { c.got = true; runCoins++; SFX.beep(1200, 0.08, 'triangle', 1800); }
      }
    }
    obs = obs.filter(function (o) { return o.x + (o.w || 60) - dist > -200; });
    coins = coins.filter(function (c) { return c.x - dist > -100 && !c.got; });
  }

  function updParts(dt) {
    parts.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.l -= dt; });
    parts = parts.filter(function (p) { return p.l > 0; });
    if (shake > 0) shake -= dt;
  }

  // ---------- drawing
  function btn(x, y, w, h, label, fn, col) {
    buttons.push({ x: x, y: y + oy, w: w, h: h, fn: fn });
    cx.fillStyle = col || 'rgba(255,255,255,0.1)'; rr(x, y, w, h, 18); cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,0.35)'; cx.lineWidth = 2; cx.stroke();
    text(label, x + w / 2, y + h / 2 + 10, 28, '#fff');
  }
  function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function text(s, x, y, size, col, align) { cx.font = '800 ' + size + 'px system-ui, Arial'; cx.textAlign = align || 'center'; cx.fillStyle = col || '#fff'; cx.fillText(s, x, y); }

  function drawHero(x, y, s, rot, col) {
    cx.save(); cx.translate(x + s / 2, y + s / 2); cx.rotate(rot);
    cx.shadowColor = col; cx.shadowBlur = 25; cx.fillStyle = col; rr(-s / 2, -s / 2, s, s, 10); cx.fill();
    cx.shadowBlur = 0; cx.fillStyle = '#0b0f1a'; cx.fillRect(4, -10, 9, 12); cx.fillRect(-12, -10, 9, 12);
    cx.restore();
  }

  function draw() {
    buttons = [];
    cx.setTransform(DPR * scale, 0, 0, DPR * scale, 0, 0);
    if (shake > 0) cx.translate((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    // background
    var g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b0f2a'); g.addColorStop(1, '#2a0b3a');
    cx.fillStyle = g; cx.fillRect(-20, -20, W + 40, H + 40);
    var off = (dist || 0) * 0.2;
    cx.strokeStyle = 'rgba(255,60,172,0.18)'; cx.lineWidth = 2;
    for (var i = -1; i < W / 80 + 2; i++) { var lx = i * 80 - (off % 80); cx.beginPath(); cx.moveTo(lx, groundY); cx.lineTo(lx - 200, H); cx.stroke(); }
    // sun
    var sy = groundY - 230, sg = cx.createLinearGradient(0, sy - 150, 0, sy + 150);
    sg.addColorStop(0, 'rgba(249,248,113,0.55)'); sg.addColorStop(1, 'rgba(255,60,172,0.35)');
    cx.fillStyle = sg; cx.beginPath(); cx.arc(W * 0.72, sy, 150, 0, Math.PI * 2); cx.fill();
    cx.save(); cx.beginPath(); cx.arc(W * 0.72, sy, 151, 0, Math.PI * 2); cx.clip();
    cx.globalCompositeOperation = 'destination-out';
    for (var sl = 0; sl < 6; sl++) cx.fillRect(W * 0.72 - 160, sy + 20 + sl * 22, 320, 4 + sl * 2);
    cx.restore();
    if (pl) {
      // ground with pits
      cx.fillStyle = '#121633';
      var pits = obs.filter(function (o) { return o.k === 'pit'; }).map(function (o) { return [o.x - dist, o.x - dist + o.w]; });
      var x0 = -20; pits.sort(function (a, b) { return a[0] - b[0]; });
      cx.strokeStyle = '#2de2e6'; cx.lineWidth = 4; cx.shadowColor = '#2de2e6'; cx.shadowBlur = 12;
      pits.concat([[W + 20, W + 20]]).forEach(function (p) {
        if (p[0] > x0) { cx.fillRect(x0, groundY, p[0] - x0, H - groundY); cx.beginPath(); cx.moveTo(x0, groundY); cx.lineTo(p[0], groundY); cx.stroke(); }
        x0 = Math.max(x0, p[1]);
      });
      cx.shadowBlur = 0;
      obs.forEach(function (o) {
        var ox = o.x - dist;
        if (o.k === 'spike') {
          cx.fillStyle = '#ff3cac'; cx.shadowColor = '#ff3cac'; cx.shadowBlur = 15;
          cx.beginPath(); cx.moveTo(ox, groundY); cx.lineTo(ox + o.w / 2, groundY - o.h); cx.lineTo(ox + o.w, groundY); cx.fill(); cx.shadowBlur = 0;
        } else if (o.k === 'saw') {
          cx.save(); cx.translate(ox, o.y); cx.rotate(dist / 40); cx.fillStyle = '#f9f871'; cx.shadowColor = '#f9f871'; cx.shadowBlur = 15;
          cx.beginPath(); for (var k = 0; k < 16; k++) { var a = k / 16 * Math.PI * 2, rr2 = k % 2 ? o.r : o.r * 0.7; cx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } cx.fill(); cx.restore(); cx.shadowBlur = 0;
        }
      });
      coins.forEach(function (c) { var x = c.x - dist; cx.fillStyle = '#f9f871'; cx.beginPath(); cx.ellipse(x, c.y, 12 * Math.abs(Math.cos(Date.now() / 300 + c.x)), 14, 0, 0, Math.PI * 2); cx.fill(); });
      if (pl.alive) drawHero(pl.x, pl.y, pl.s, pl.rot, SKINS[save.skin].c);
    }
    parts.forEach(function (p) { cx.globalAlpha = Math.max(0, p.l); cx.fillStyle = p.c; cx.fillRect(p.x, p.y, 7, 7); });
    cx.globalAlpha = 1;
    drawUI();
  }

  function drawUI() {
    oy = 0;
    // sound toggle (top right)
    btn(W - 90, 20, 70, 60, SFX.muted ? '🔇' : '🔊', function () { SFX.muted = !SFX.muted; save.muted = SFX.muted; P.save(save); });
    if (state === 'play') {
      text(String(Math.floor(dist / 10)), W / 2, 80, 56, '#fff');
      text('● ' + (save.coins + runCoins), 30, 60, 30, '#f9f871', 'left');
      btn(W - 180, 20, 70, 60, 'II', function () { setPause(true, 'user'); });
    }
    if (state !== 'play') { if (state === 'over' || state === 'shop') { cx.fillStyle = 'rgba(5,6,20,0.72)'; cx.fillRect(0, 0, W, H); } oy = uiOY; cx.save(); cx.translate(0, oy); }
    if (state === 'menu') {
      text(P.t(T.title), W / 2, 230, 110, '#2de2e6');
      drawHero(W / 2 - 40, 280, 80, Math.sin(Date.now() / 400) * 0.2, SKINS[save.skin].c);
      text(P.t(T.best) + ': ' + save.best + '   ● ' + save.coins, W / 2, 420, 30, '#f9f871');
      btn(W / 2 - 170, 460, 340, 80, P.t(T.tap), start, 'rgba(45,226,230,0.25)');
      if (P.canShare) {
        btn(W / 2 - 260, 560, 240, 64, P.t(T.shop), function () { state = 'shop'; });
        btn(W / 2 + 20, 560, 240, 64, P.t(T.invite), invite, 'rgba(179,136,255,0.25)');
      } else btn(W / 2 - 120, 560, 240, 64, P.t(T.shop), function () { state = 'shop'; });
      if (toastT > Date.now()) text(toastMsg, W / 2, 650, 26, '#7cff6b');
      text(P.t(T.hint), W / 2, 680, 22, 'rgba(255,255,255,0.6)');
    }
    if (state === 'over') {
      text(P.t(T.over), W / 2, 150, 70, '#ff3cac');
      text(String(Math.floor(dist / 10)), W / 2, 240, 80, '#fff');
      if (newBest) text(P.t(T.newbest), W / 2, 290, 30, '#f9f871');
      text(P.t(T.best) + ': ' + save.best + '    ● +' + runCoins + (doubled ? ' x2' : ''), W / 2, 335, 28, 'rgba(255,255,255,0.8)');
      var y = 380;
      if (!revived) { btn(W / 2 - 230, y, 460, 74, P.t(T.revive), revive, 'rgba(124,255,107,0.25)'); y += 90; }
      if (!doubled && runCoins > 0) { btn(W / 2 - 230, y, 460, 74, P.t(T.x2), double, 'rgba(249,248,113,0.2)'); y += 90; }
      btn(W / 2 - 160, y, 320, 74, P.t(T.again), again, 'rgba(45,226,230,0.25)');
    }
    if (state === 'shop') {
      text(P.t(T.shop) + '   ● ' + save.coins, W / 2, 110, 50, '#fff');
      var cols = W >= 1200 ? 6 : 3, cw = 170, gap = 24, total = cols * cw + (cols - 1) * gap, sx = W / 2 - total / 2;
      var rows2 = Math.ceil(SKINS.length / cols), y0 = rows2 > 1 ? 135 : 200, ch = rows2 > 1 ? 225 : 260;
      SKINS.forEach(function (s, i) {
        var x = sx + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + 18);
        cx.fillStyle = 'rgba(255,255,255,0.06)'; rr(x, y, cw, ch, 18); cx.fill();
        drawHero(x + cw / 2 - 35, y + 30, 70, 0, s.c);
        var own = save.skins.indexOf(i) >= 0;
        var label = save.skin === i ? P.t(T.used) : own ? P.t(T.owned) : '● ' + s.p;
        btn(x + 15, y + ch - 80, cw - 30, 60, label, function () {
          if (own) { save.skin = i; }
          else if (save.coins >= s.p) { save.coins -= s.p; save.skins.push(i); save.skin = i; SFX.beep(900, 0.2, 'triangle', 1400); }
          else { SFX.beep(150, 0.15, 'square'); }
          P.save(save);
        }, save.skin === i ? 'rgba(45,226,230,0.3)' : own ? 'rgba(255,255,255,0.1)' : (save.coins >= s.p ? 'rgba(124,255,107,0.2)' : 'rgba(255,255,255,0.05)'));
      });
      btn(W / 2 - 120, rows2 > 1 ? 630 : 540, 240, 70, P.t(T.back), function () { state = 'menu'; });
    }
    if (state !== 'play') { cx.restore(); oy = 0; }
    if (paused && state === 'play') {
      cx.fillStyle = 'rgba(5,6,20,0.6)'; cx.fillRect(0, 0, W, H);
      oy = 0;
      text(P.t(T.pause), W / 2, H / 2 - 20, 70, '#fff');
      btn(W / 2 - 100, H / 2 + 20, 200, 80, '▶', function () { setPause(false, 'user'); });
    }
  }

  // ---------- invite (Telegram): награда раз в сутки
  var toastMsg = '', toastT = 0;
  function toast(m) { toastMsg = m; toastT = Date.now() + 2500; }
  function invite() {
    if (!P.share(P.t(T.shareText) + ' ' + P.t(T.best) + ': ' + save.best)) return;
    var day = Math.floor(Date.now() / 864e5);
    if (save.lastShareDay !== day) { save.lastShareDay = day; save.coins += 30; P.save(save); toast('+30 ●'); SFX.beep(900, 0.2, 'triangle', 1400); }
  }

  // ---------- flow
  function start() { reset(); state = 'play'; P.gameplayStart(); SFX.beep(660, 0.1, 'square', 990); }
  function again() {
    var n = save.runs;
    var go = function () { start(); };
    if (n % 2 === 0) P.showInterstitial().then(go); else go();
  }
  function revive() {
    P.showRewarded().then(function (ok) {
      if (!ok) return;
      revived = true; state = 'play';
      // clear nearby danger and put the hero back on safe ground
      obs = obs.filter(function (o) { return o.x - dist > pl.x + 500 || o.x - dist < pl.x - 200; });
      pl.alive = true; pl.y = groundY - pl.s - 200; pl.vy = 0; pl.jumps = 1;
      save.coins -= runCoins; save.runs--; P.save(save); // run continues, totals are re-counted at the next death
      P.gameplayStart();
    });
  }
  function double() {
    P.showRewarded().then(function (ok) { if (ok) { save.coins += runCoins; doubled = true; P.save(save); SFX.beep(900, 0.25, 'triangle', 1500); } });
  }
  function setPause(v, why) {
    if (v === paused) return;
    paused = v; pauseReason = v ? why : null;
    if (v) { SFX.suspend(); P.gameplayStop(); } else { SFX.resume(); if (state === 'play') P.gameplayStart(); }
  }
  P.onPause = function (why) { setPause(true, why); };
  P.onResume = function (why) { if (pauseReason === why) setPause(false, why); };

  function pointer(ev) {
    ev.preventDefault();
    var r = cv.getBoundingClientRect();
    var p = ev.touches ? ev.touches[0] : ev;
    var x = (p.clientX - r.left) / scale, y = (p.clientY - r.top) / scale;
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
    }
    if (state === 'play' && !paused) jump();
  }
  cv.addEventListener('mousedown', pointer);
  cv.addEventListener('touchstart', pointer, { passive: false });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (state === 'play' && !paused) jump(); else if (state === 'menu') start(); }
    if (e.code === 'Escape' && state === 'play') setPause(!paused, 'user');
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function loop(t) {
    var dt = Math.min(0.033, (t - tPrev) / 1000 || 0); tPrev = t;
    update(dt); updParts(dt); draw();
    requestAnimationFrame(loop);
  }

  P.init().then(function () { return P.load(); }).then(function (s) {
    for (var k in s) save[k] = s[k];
    // пришёл по ссылке друга: разовый бонус новичку
    if (P.startParam && P.startParam.indexOf('ref_') === 0 && !save.refBonus) { save.refBonus = 1; save.coins += 50; P.save(save); setTimeout(function () { toast(P.t(T.welcome)); }, 300); }
    SFX.muted = !!save.muted;
    reset(); state = 'menu'; P.gameReady();
    requestAnimationFrame(loop);
  });
  window.__game = { state: function () { return state; }, start: start, jump: jump, save: save, dist: function () { return dist; } };
})();
