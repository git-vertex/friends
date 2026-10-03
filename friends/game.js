(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const timeEl = document.getElementById('time');
  const statusEl = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const restartBtn = document.getElementById('restart');
  const p1HpText = document.getElementById('p1HpText');
  const p2HpText = document.getElementById('p2HpText');
  const p1Health = document.getElementById('p1Health');
  const p2Health = document.getElementById('p2Health');

  const W = canvas.width;
  const H = canvas.height;
  const keys = new Set();
  const mouse = { x: W * .5, y: H * .5, down: false };
  let state;
  let last = performance.now();
  let round = 1;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const len = (x, y) => Math.hypot(x, y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function makePlayer(x, y, color, dir) {
    return {
      x,
      y,
      r: 17,
      hp: 100,
      color,
      dir,
      speed: 215,
      cooldown: 0,
      hurt: 0,
      recoil: 0,
      hookVx: 0,
      hookVy: 0
    };
  }

  function reset() {
    state = {
      running: true,
      time: 30,
      bullets: [],
      particles: [],
      flash: 0,

      hook: {
        active: false,
        mode: null,
        x: 0,
        y: 0,
        age: 0,
        life: .62,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        bend: [],
        power: 0,
        restLength: 0
      },

      hookCooldown: 0,

      aiFireClock: 0,
      aiMoveClock: 0,
      aiStrafe: 1,

      p1: makePlayer(130, H / 2, '#67a7ff', 1),
      p2: makePlayer(W - 130, H / 2, '#ff6d7f', -1)
    };

    mouse.x = W / 2;
    mouse.y = H / 2;
    mouse.down = false;

    overlay.classList.remove('show');

    statusEl.textContent = 'ROUND ' + round;

    updateHud();
  }

  function arenaBounds(p) {
    p.x = clamp(
      p.x,
      42 + p.r,
      W - 42 - p.r
    );

    p.y = clamp(
      p.y,
      42 + p.r,
      H - 42 - p.r
    );
  }

  function canShoot(p) {
    return (
      p.cooldown <= 0 &&
      state.running &&
      p.hp > 0
    );
  }

  function rayCircleDistance(
    x,
    y,
    dx,
    dy,
    cx,
    cy,
    r
  ) {
    const ox = x - cx;
    const oy = y - cy;

    const b = ox * dx + oy * dy;

    const c =
      ox * ox +
      oy * oy -
      r * r;

    const h = b * b - c;

    if (h < 0)
      return Infinity;

    const s = Math.sqrt(h);

    const t1 = -b - s;
    const t2 = -b + s;

    if (t1 > 0)
      return t1;

    if (t2 > 0)
      return t2;

    return Infinity;
  }

  function rayWallDistance(
    x,
    y,
    dx,
    dy
  ) {
    const left = 40;
    const right = W - 40;
    const top = 40;
    const bottom = H - 40;

    let t = Infinity;

    if (dx < -0.0001)
      t = Math.min(
        t,
        (left - x) / dx
      );

    if (dx > 0.0001)
      t = Math.min(
        t,
        (right - x) / dx
      );

    if (dy < -0.0001)
      t = Math.min(
        t,
        (top - y) / dy
      );

    if (dy > 0.0001)
      t = Math.min(
        t,
        (bottom - y) / dy
      );

    return Math.max(0, t);
  }

  function buildHookBend(
    sx,
    sy,
    ex,
    ey
  ) {
    const dx = ex - sx;
    const dy = ey - sy;

    const d = Math.max(
      1,
      Math.hypot(dx, dy)
    );

    const bendStrength = clamp(
      38 - d * .045,
      5,
      38
    );

    const count = 12;
    const result = [];

    for (let i = 1; i < count; i++) {
      const t = i / count;

      const falloff =
        Math.sin(Math.PI * t);

      result.push({
        t,

        offset:
          (Math.random() - .5) *
          2 *
          bendStrength *
          falloff,

        wave:
          .55 +
          Math.random() * 1.45,

        phase:
          Math.random() *
          Math.PI *
          2
      });
    }

    return result;
  }

  function hookImpact(
    x,
    y,
    kind
  ) {
    for (let i = 0; i < 18; i++) {
      const a =
        Math.random() *
        Math.PI *
        2;

      const s =
        80 +
        Math.random() *
        240;

      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life:
          .22 +
          Math.random() * .32,
        size:
          2 +
          Math.random() * 3
      });
    }

    state.flash =
      kind === 'player'
        ? .11
        : .06;
  }

  function launchHook(
    targetX,
    targetY
  ) {
    if (
      !state.running ||
      state.hookCooldown > 0 ||
      state.p1.hp <= 0
    )
      return;

    const p = state.p1;

    let dx = targetX - p.x;
    let dy = targetY - p.y;

    const d = Math.max(
      .001,
      Math.hypot(dx, dy)
    );

    dx /= d;
    dy /= d;

    const wallT = Math.min(
      820,
      rayWallDistance(
        p.x,
        p.y,
        dx,
        dy
      )
    );

    const playerT =
      rayCircleDistance(
        p.x,
        p.y,
        dx,
        dy,
        state.p2.x,
        state.p2.y,
        state.p2.r + 6
      );

    const hitPlayer =
      playerT <= wallT &&
      playerT <= 820;

    const hitT =
      hitPlayer
        ? playerT
        : wallT;

    const ex =
      p.x +
      dx * hitT;

    const ey =
      p.y +
      dy * hitT;

    const pullDistance =
      Math.max(
        40,
        Math.min(
          820,
          hitT
        )
      );

    state.hookCooldown = 2;

    state.hook.active = true;

    state.hook.mode =
      hitPlayer
        ? 'player'
        : 'wall';

    state.hook.x = ex;
    state.hook.y = ey;

    state.hook.age = 0;

    state.hook.startX = p.x;
    state.hook.startY = p.y;

    state.hook.endX = ex;
    state.hook.endY = ey;

    state.hook.restLength =
      pullDistance;

    state.hook.bend =
      buildHookBend(
        p.x,
        p.y,
        ex,
        ey
      );

    state.hook.power =
      clamp(
        .9 +
        Math.pow(
          pullDistance / 360,
          1.2
        ),
        1.05,
        3.4
      );

    if (hitPlayer) {
      const t = state.p2;

      const p0x = p.x;
      const p0y = p.y;

      const t0x = t.x;
      const t0y = t.y;

      const strength =
        720 *
        state.hook.power;

      const tx = t0x - p0x;
      const ty = t0y - p0y;

      const td = Math.max(
        .001,
        Math.hypot(tx, ty)
      );

      const ux = tx / td;
      const uy = ty / td;

      p.hookVx =
        ux *
        strength *
        .86;

      p.hookVy =
        uy *
        strength *
        .86;

      t.hookVx =
        -ux *
        strength *
        1.04;

      t.hookVy =
        -uy *
        strength *
        1.04;

      state.hook.endX = t0x;
      state.hook.endY = t0y;

      hookImpact(
        t0x,
        t0y,
        'player'
      );
    } else {
      const strength =
        570 *
        state.hook.power;

      p.hookVx =
        dx *
        strength;

      p.hookVy =
        dy *
        strength;

      hookImpact(
        ex,
        ey,
        'wall'
      );
    }
  }

  function updateHook(dt) {
    state.hookCooldown =
      Math.max(
        0,
        state.hookCooldown - dt
      );

    if (state.hook.active) {
      state.hook.age += dt;

      if (
        state.hook.mode ===
        'player'
      ) {
        state.hook.endX =
          state.p2.x;

        state.hook.endY =
          state.p2.y;

        const dx =
          state.p2.x -
          state.p1.x;

        const dy =
          state.p2.y -
          state.p1.y;

        const distance =
          Math.max(
            1,
            Math.hypot(
              dx,
              dy
            )
          );

        const ux = dx / distance;
        const uy = dy / distance;

        const stretch =
          Math.max(
            0,
            distance -
            state.hook.restLength *
            .38
          );

        const spring =
          Math.min(
            1900,
            stretch *
            (
              8.5 +
              state.hook.power *
              2.2
            )
          );

        state.p1.hookVx +=
          ux *
          spring *
          dt;

        state.p1.hookVy +=
          uy *
          spring *
          dt;

        state.p2.hookVx -=
          ux *
          spring *
          1.24 *
          dt;

        state.p2.hookVy -=
          uy *
          spring *
          1.24 *
          dt;
      } else {
        const dx =
          state.hook.endX -
          state.p1.x;

        const dy =
          state.hook.endY -
          state.p1.y;

        const distance =
          Math.max(
            1,
            Math.hypot(
              dx,
              dy
            )
          );

        const ux = dx / distance;
        const uy = dy / distance;

        const stretch =
          Math.max(
            0,
            distance -
            state.hook.restLength *
            .28
          );

        const spring =
          Math.min(
            2200,
            stretch *
            (
              10 +
              state.hook.power *
              2.6
            )
          );

        state.p1.hookVx +=
          ux *
          spring *
          dt;

        state.p1.hookVy +=
          uy *
          spring *
          dt;
      }

      if (
        state.hook.age >=
        state.hook.life
      ) {
        state.hook.active = false;
      }
    }

    state.p1.hookVx *=
      Math.exp(-1.35 * dt);

    state.p1.hookVy *=
      Math.exp(-1.35 * dt);

    state.p2.hookVx *=
      Math.exp(-1.35 * dt);

    state.p2.hookVy *=
      Math.exp(-1.35 * dt);

    if (
      Math.hypot(
        state.p1.hookVx,
        state.p1.hookVy
      ) < 5
    ) {
      state.p1.hookVx = 0;
      state.p1.hookVy = 0;
    }

    if (
      Math.hypot(
        state.p2.hookVx,
        state.p2.hookVy
      ) < 5
    ) {
      state.p2.hookVx = 0;
      state.p2.hookVy = 0;
    }
  }

  function shoot(
    shooter,
    targetX,
    targetY
  ) {
    if (!canShoot(shooter))
      return;

    let dx =
      targetX -
      shooter.x;

    let dy =
      targetY -
      shooter.y;

    const d =
      Math.max(
        .001,
        len(dx, dy)
      );

    dx /= d;
    dy /= d;

    shooter.dir =
      dx >= 0
        ? 1
        : -1;

    shooter.cooldown =
      shooter === state.p1
        ? 1
        : 1;

    shooter.recoil = .12;

    state.bullets.push({
      x:
        shooter.x +
        dx * 24,

      y:
        shooter.y +
        dy * 24,

      vx:
        dx * 510,

      vy:
        dy * 510,

      life: 1.6,

      owner: shooter
    });

    for (let i = 0; i < 5; i++) {
      state.particles.push({
        x:
          shooter.x +
          dx * 28,

        y:
          shooter.y +
          dy * 28,

        vx:
          dx *
          (
            120 +
            Math.random() * 120
          ) +
          (
            Math.random() - .5
          ) *
          70,

        vy:
          dy *
          (
            120 +
            Math.random() * 120
          ) +
          (
            Math.random() - .5
          ) *
          70,

        life:
          .18 +
          Math.random() * .16,

        size:
          2 +
          Math.random() * 2
      });
    }
  }

  function damage(
    target,
    amount
  ) {
    if (
      target === state.p2 &&
      bonusState.damage > 0
    ) {
      amount +=
        bonusState.damage;
    }

    target.hp =
      Math.max(
        0,
        target.hp - amount
      );

    target.hurt = .14;

    state.flash = .08;

    for (let i = 0; i < 10; i++) {
      const a =
        Math.random() *
        Math.PI *
        2;

      state.particles.push({
        x: target.x,
        y: target.y,

        vx:
          Math.cos(a) *
          (
            90 +
            Math.random() * 180
          ),

        vy:
          Math.sin(a) *
          (
            90 +
            Math.random() * 180
          ),

        life:
          .25 +
          Math.random() * .25,

        size:
          2 +
          Math.random() * 2.5
      });
    }

    updateHud();
  }

  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;

    if (
      keys.has('w') ||
      keys.has('arrowup')
    )
      dy--;

    if (
      keys.has('s') ||
      keys.has('arrowdown')
    )
      dy++;

    if (
      keys.has('a') ||
      keys.has('arrowleft')
    )
      dx--;

    if (
      keys.has('d') ||
      keys.has('arrowright')
    )
      dx++;

    const d =
      len(dx, dy) || 1;

    state.p1.x +=
      dx / d *
      state.p1.speed *
      dt;

    state.p1.y +=
      dy / d *
      state.p1.speed *
      dt;

    state.p1.x +=
      state.p1.hookVx *
      dt;

    state.p1.y +=
      state.p1.hookVy *
      dt;

    arenaBounds(state.p1);

    state.p1.cooldown =
      Math.max(
        0,
        state.p1.cooldown - dt
      );

    state.p1.hurt =
      Math.max(
        0,
        state.p1.hurt - dt
      );

    state.p1.recoil =
      Math.max(
        0,
        state.p1.recoil - dt
      );

    if (mouse.down) {
      shoot(
        state.p1,
        mouse.x,
        mouse.y
      );
    }
  }

  function updateBot(dt) {
    const b = state.p2;
    const p = state.p1;

    b.cooldown =
      Math.max(
        0,
        b.cooldown - dt
      );

    b.hurt =
      Math.max(
        0,
        b.hurt - dt
      );

    b.recoil =
      Math.max(
        0,
        b.recoil - dt
      );

    b.x +=
      b.hookVx *
      dt;

    b.y +=
      b.hookVy *
      dt;

    const dx = p.x - b.x;
    const dy = p.y - b.y;

    const d =
      Math.max(
        1,
        len(dx, dy)
      );

    state.aiMoveClock -= dt;

    if (
      state.aiMoveClock <= 0
    ) {
      state.aiMoveClock =
        .7 +
        Math.random() * .9;

      state.aiStrafe *= -1;
    }

    const desired =
      d > 360
        ? 1
        : d < 235
          ? -1
          : 0;

    let mx =
      dx / d * desired +
      (-dy / d) *
      state.aiStrafe *
      .72;

    let my =
      dy / d * desired +
      (dx / d) *
      state.aiStrafe *
      .72;

    const ml =
      len(mx, my) || 1;

    b.x +=
      mx / ml *
      b.speed *
      .72 *
      dt;

    b.y +=
      my / ml *
      b.speed *
      .72 *
      dt;

    arenaBounds(b);

    state.aiFireClock -= dt;

    if (
      state.aiFireClock <= 0 &&
      d < 620
    ) {
      state.aiFireClock =
        .32 +
        Math.random() * .38;

      shoot(
        b,
        p.x +
        (
          Math.random() - .5
        ) * 20,

        p.y +
        (
          Math.random() - .5
        ) * 20
      );
    }
  }

  function updateBullets(dt) {
    for (
      let i =
        state.bullets.length - 1;

      i >= 0;

      i--
    ) {
      const b =
        state.bullets[i];

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      b.life -= dt;

      if (
        b.life <= 0 ||
        b.x < 0 ||
        b.y < 0 ||
        b.x > W ||
        b.y > H
      ) {
        state.bullets.splice(i, 1);
        continue;
      }

      const target =
        b.owner === state.p1
          ? state.p2
          : state.p1;

      if (
        dist(b, target) <=
        target.r + 5
      ) {
        damage(target, 25);

        state.bullets.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (
      let i =
        state.particles.length - 1;

      i >= 0;

      i--
    ) {
      const p =
        state.particles[i];

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.vx *= .92;
      p.vy *= .92;

      p.life -= dt;

      if (p.life <= 0) {
        state.particles.splice(i, 1);
      }
    }
  }

  function finish(
    text,
    title
  ) {
    state.running = false;

    resultTitle.textContent =
      title;

    resultText.textContent =
      text;

    overlay.classList.add('show');
  }

  function checkEnd() {
    if (
      state.p1.hp <= 0 &&
      state.p2.hp <= 0
    ) {
      finish(
        'Оба игрока потеряли всё HP.',
        'DRAW'
      );

      return true;
    }

    if (state.p2.hp <= 0) {
      finish(
        'BOT выбыл из раунда.',
        'YOU WIN'
      );

      return true;
    }

    if (state.p1.hp <= 0) {
      finish(
        'Твой персонаж выбыл из раунда.',
        'YOU LOSE'
      );

      return true;
    }

    if (state.time <= 0) {
      if (
        state.p1.hp ===
        state.p2.hp
      ) {
        finish(
          'Время вышло — одинаковое HP.',
          'DRAW'
        );
      } else if (
        state.p1.hp >
        state.p2.hp
      ) {
        finish(
          'Время вышло — у тебя осталось больше HP.',
          'YOU WIN'
        );
      } else {
        finish(
          'Время вышло — у BOT осталось больше HP.',
          'YOU LOSE'
        );
      }

      return true;
    }

    return false;
  }

  function updateHud() {
    p1HpText.textContent =
      Math.ceil(state.p1.hp);

    p2HpText.textContent =
      Math.ceil(state.p2.hp);

    p1Health.style.width =
      state.p1.hp + '%';

    p2Health.style.width =
      state.p2.hp + '%';

    timeEl.textContent =
      state.time.toFixed(1);
  }

  function drawGrid() {
    ctx.fillStyle = '#0b1017';

    ctx.fillRect(
      0,
      0,
      W,
      H
    );

    ctx.strokeStyle =
      'rgba(125,150,190,.08)';

    ctx.lineWidth = 1;

    for (
      let x = 0;
      x <= W;
      x += 48
    ) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    for (
      let y = 0;
      y <= H;
      y += 48
    ) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.strokeStyle =
      'rgba(145,165,195,.28)';

    ctx.lineWidth = 2;

    ctx.strokeRect(
      40,
      40,
      W - 80,
      H - 80
    );

    ctx.setLineDash([7, 9]);

    ctx.strokeStyle =
      'rgba(145,165,195,.14)';

    ctx.beginPath();

    ctx.moveTo(
      W / 2,
      40
    );

    ctx.lineTo(
      W / 2,
      H - 40
    );

    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle =
      'rgba(145,165,195,.055)';

    ctx.beginPath();

    ctx.arc(
      W / 2,
      H / 2,
      95,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.strokeStyle =
      'rgba(145,165,195,.12)';

    ctx.beginPath();

    ctx.arc(
      W / 2,
      H / 2,
      95,
      0,
      Math.PI * 2
    );

    ctx.stroke();
  }

  function drawPlayer(p) {
    ctx.save();

    ctx.translate(
      p.x,
      p.y
    );

    const a =
      Math.atan2(
        (
          p === state.p1
            ? mouse.y
            : p2TargetY()
        ) - p.y,

        (
          p === state.p1
            ? mouse.x
            : p2TargetX()
        ) - p.x
      );

    const recoil =
      p.recoil > 0
        ? -p.recoil * 45
        : 0;

    ctx.rotate(a);

    ctx.fillStyle =
      '#161c25';

    ctx.fillRect(
      10 + recoil,
      -4,
      20,
      8
    );

    ctx.restore();

    ctx.save();

    ctx.beginPath();

    ctx.arc(
      p.x,
      p.y,
      p.r,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      p.hurt > 0
        ? '#ffffff'
        : p.color;

    ctx.shadowColor =
      p.color;

    ctx.shadowBlur = 18;

    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.lineWidth = 3;

    ctx.strokeStyle =
      'rgba(255,255,255,.65)';

    ctx.stroke();

    ctx.restore();
  }

  function p2TargetX() {
    return state.p1.x;
  }

  function p2TargetY() {
    return state.p1.y;
  }

  function drawBullets() {
    for (
      const b of state.bullets
    ) {
      ctx.save();

      ctx.translate(
        b.x,
        b.y
      );

      ctx.rotate(
        Math.atan2(
          b.vy,
          b.vx
        )
      );

      ctx.fillStyle =
        b.owner === state.p1
          ? '#9fc6ff'
          : '#ffb1bb';

      ctx.shadowColor =
        ctx.fillStyle;

      ctx.shadowBlur = 12;

      ctx.fillRect(
        -7,
        -2,
        14,
        4
      );

      ctx.restore();
    }
  }

  function drawParticles() {
    for (
      const p of state.particles
    ) {
      ctx.globalAlpha =
        clamp(
          p.life * 3,
          0,
          1
        );

      ctx.fillStyle =
        '#f4f7fb';

      ctx.fillRect(
        p.x,
        p.y,
        p.size,
        p.size
      );
    }

    ctx.globalAlpha = 1;
  }

  function drawCrosshair() {
    if (!state.running)
      return;

    ctx.save();

    ctx.translate(
      mouse.x,
      mouse.y
    );

    ctx.strokeStyle =
      state.p1.cooldown <= 0
        ? 'rgba(255,255,255,.8)'
        : 'rgba(255,255,255,.25)';

    ctx.lineWidth = 1.5;

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      7,
      0,
      Math.PI * 2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(-12, 0);
    ctx.lineTo(-6, 0);

    ctx.moveTo(6, 0);
    ctx.lineTo(12, 0);

    ctx.moveTo(0, -12);
    ctx.lineTo(0, -6);

    ctx.moveTo(0, 6);
    ctx.lineTo(0, 12);

    ctx.stroke();

    ctx.restore();
  }

  function drawHook() {
    if (!state.hook.active)
      return;

    const h = state.hook;

    const life =
      clamp(
        1 -
        h.age / h.life,
        0,
        1
      );

    const dx =
      h.endX -
      h.startX;

    const dy =
      h.endY -
      h.startY;

    const d =
      Math.max(
        1,
        Math.hypot(dx, dy)
      );

    const nx = -dy / d;
    const ny = dx / d;

    const sway =
      Math.sin(h.age * 8) *
      Math.min(
        4.5,
        2.2 +
        h.power * 1.1
      );

    const points = [
      {
        x: h.startX,
        y: h.startY
      }
    ];

    for (
      const b of h.bend
    ) {
      const wave =
        Math.sin(
          h.age *
          (
            4 +
            b.wave * 2
          ) +
          b.phase
        ) *
        sway *
        Math.sin(
          Math.PI * b.t
        );

      points.push({
        x:
          h.startX +
          dx * b.t +
          nx *
          (
            b.offset +
            wave
          ),

        y:
          h.startY +
          dy * b.t +
          ny *
          (
            b.offset +
            wave
          )
      });
    }

    points.push({
      x: h.endX,
      y: h.endY
    });

    function traceRope() {
      ctx.beginPath();

      ctx.moveTo(
        points[0].x,
        points[0].y
      );

      for (
        let i = 1;
        i < points.length - 1;
        i++
      ) {
        const current =
          points[i];

        const next =
          points[i + 1];

        const midX =
          (
            current.x +
            next.x
          ) * .5;

        const midY =
          (
            current.y +
            next.y
          ) * .5;

        ctx.quadraticCurveTo(
          current.x,
          current.y,
          midX,
          midY
        );
      }

      const last =
        points[
          points.length - 1
        ];

      const prev =
        points[
          points.length - 2
        ];

      ctx.quadraticCurveTo(
        prev.x,
        prev.y,
        last.x,
        last.y
      );
    }

    ctx.save();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.globalAlpha =
      life * .25;

    ctx.strokeStyle =
      '#b8c6dc';

    ctx.lineWidth = 8;

    ctx.shadowColor =
      '#a7bfe8';

    ctx.shadowBlur = 7;

    traceRope();

    ctx.stroke();

    ctx.globalAlpha = life;

    ctx.strokeStyle =
      '#d8e1ed';

    ctx.lineWidth = 2.6;

    ctx.shadowBlur = 2;

    traceRope();

    ctx.stroke();

    ctx.fillStyle =
      '#f3f6fb';

    ctx.shadowBlur = 8;

    ctx.beginPath();

    ctx.arc(
      h.endX,
      h.endY,
      5.5,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }

  function render() {
    drawGrid();

    drawHook();

    drawBullets();

    drawParticles();

    drawPlayer(state.p1);

    drawPlayer(state.p2);

    drawCrosshair();

    if (state.flash > 0) {
      ctx.fillStyle =
        'rgba(255,255,255,' +
        state.flash * 2 +
        ')';

      ctx.fillRect(
        0,
        0,
        W,
        H
      );
    }
  }

  function canvasPoint(e) {
    const r =
      canvas.getBoundingClientRect();

    return {
      x:
        (
          e.clientX -
          r.left
        ) *
        W /
        r.width,

      y:
        (
          e.clientY -
          r.top
        ) *
        H /
        r.height
    };
  }

  window.addEventListener(
    'keydown',
    e => {
      const k =
        e.key.toLowerCase();

      if (
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright'
        ].includes(k)
      ) {
        e.preventDefault();
      }

      keys.add(k);
    }
  );

  window.addEventListener(
    'keyup',
    e => {
      keys.delete(
        e.key.toLowerCase()
      );
    }
  );

  canvas.addEventListener(
    'mousemove',
    e => {
      const p =
        canvasPoint(e);

      mouse.x = p.x;
      mouse.y = p.y;
    }
  );

  canvas.addEventListener(
    'mousedown',
    e => {
      if (e.button === 0) {
        mouse.down = true;

        const p =
          canvasPoint(e);

        mouse.x = p.x;
        mouse.y = p.y;

        shoot(
          state.p1,
          mouse.x,
          mouse.y
        );
      }

      if (e.button === 2) {
        e.preventDefault();

        const p =
          canvasPoint(e);

        mouse.x = p.x;
        mouse.y = p.y;

        launchHook(
          mouse.x,
          mouse.y
        );
      }
    }
  );

  window.addEventListener(
    'mouseup',
    e => {
      if (e.button === 0) {
        mouse.down = false;
      }
    }
  );

  canvas.addEventListener(
    'mouseleave',
    () => {
      mouse.down = false;
    }
  );

  canvas.addEventListener(
    'contextmenu',
    e => {
      e.preventDefault();
    }
  );

  restartBtn.addEventListener(
    'click',
    () => {
      round++;
      reset();
    }
  );

  const bonusStyle =
    document.createElement('style');

  bonusStyle.textContent = `
    #bonusOverlay {
      position:fixed;
      inset:0;
      z-index:9999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:18px;
      background:rgba(5,7,11,.76);
      backdrop-filter:blur(7px);
    }

    #bonusPanel {
      width:min(760px, calc(100vw - 28px));
      border:1px solid #303a4a;
      border-radius:18px;
      padding:22px;
      background:#11161f;
      box-shadow:0 24px 70px rgba(0,0,0,.52);
    }

    #bonusTitle {
      margin:0;
      text-align:center;
      font-size:25px;
      font-weight:900;
    }

    #bonusSubtitle {
      margin:6px 0 18px;
      text-align:center;
      color:#97a2b1;
      font-size:13px;
    }

    #bonusCards {
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:12px;
    }

    .bonusCard {
      min-height:175px;
      padding:16px;
      border:1px solid #334052;
      border-radius:14px;
      background:#171d27;
      color:#eef2f7;
      text-align:left;
      cursor:pointer;
      font:inherit;
      transition:
        transform .14s ease,
        border-color .14s ease,
        background .14s ease;
    }

    .bonusCard:hover {
      transform:translateY(-4px);
      border-color:#6b7f9d;
      background:#1d2633;
    }

    .bonusIcon {
      width:44px;
      height:44px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:12px;
      background:#202a38;
      font-size:23px;
      margin-bottom:13px;
    }

    .bonusName {
      font-size:16px;
      font-weight:900;
      margin-bottom:7px;
    }

    .bonusDesc {
      color:#97a2b1;
      font-size:12px;
      line-height:1.5;
    }

    @media (max-width:720px) {
      #bonusCards {
        grid-template-columns:1fr;
      }

      .bonusCard {
        min-height:0;
      }
    }
  `;

  document.head.appendChild(
    bonusStyle
  );

  const bonusOverlay =
    document.createElement('div');

  bonusOverlay.id =
    'bonusOverlay';

  bonusOverlay.innerHTML = `
    <div id="bonusPanel">
      <h2 id="bonusTitle">
        ВЫБЕРИ УСИЛИТЕЛЬ
      </h2>

      <div id="bonusSubtitle">
        Время остановлено. Выбери один бонус.
      </div>

      <div id="bonusCards"></div>
    </div>
  `;

  document.body.appendChild(
    bonusOverlay
  );

  bonusOverlay.style.display =
    'none';

  document
    .querySelector(
      'meta[data-test="bonus-edit"]'
    )
    ?.remove();

  const bonusCards =
    document.getElementById(
      'bonusCards'
    );

  const bonusState = {
    nextTime: 20,
    paused: false,
    damage: 0,
    fireCooldown: 1,
    bulletSpeed: 510
  };

  const bonusPool = [
    {
      name: 'Усиленный урон',
      icon: '✦',
      desc:
        '+10 урона каждой твоей пулей.',
      apply: () => {
        bonusState.damage += 10;
      }
    },

    {
      name: 'Быстрая стрельба',
      icon: '⚡',
      desc:
        'Кулдаун твоего пистолета уменьшается на 0.25 сек.',
      apply: () => {
        bonusState.fireCooldown =
          Math.max(
            .25,
            bonusState.fireCooldown -
            .25
          );
      }
    },

    {
      name: 'Скорость',
      icon: '➤',
      desc:
        '+30 к скорости движения.',
      apply: () => {
        state.p1.speed += 30;
      }
    },

    {
      name: 'Ремкомплект',
      icon: '♥',
      desc:
        'Восстанавливает 30 HP прямо сейчас.',
      apply: () => {
        state.p1.hp =
          Math.min(
            100,
            state.p1.hp + 30
          );
      }
    },

    {
      name: 'Манёвренность',
      icon: '◉',
      desc:
        'Радиус игрока уменьшается на 3 — по тебе труднее попасть.',
      apply: () => {
        state.p1.r =
          Math.max(
            11,
            state.p1.r - 3
          );
      }
    },

    {
      name: 'Мощный выстрел',
      icon: '●',
      desc:
        '+120 к скорости полёта твоих пуль.',
      apply: () => {
        bonusState.bulletSpeed += 120;
      }
    }
  ];

  const baseReset = reset;

  reset = function() {
    baseReset();

    bonusState.nextTime = 20;
    bonusState.paused = false;
    bonusState.damage = 0;
    bonusState.fireCooldown = 1;
    bonusState.bulletSpeed = 510;

    bonusOverlay.style.display =
      'none';
  };

  const baseDamage = damage;

  damage = function(
    target,
    amount
  ) {
    if (
      target === state.p2 &&
      bonusState.damage > 0
    ) {
      amount +=
        bonusState.damage;
    }

    baseDamage(
      target,
      amount
    );
  };

  const baseShoot = shoot;

  shoot = function(
    shooter,
    targetX,
    targetY
  ) {
    const before =
      state.bullets.length;

    baseShoot(
      shooter,
      targetX,
      targetY
    );

    if (
      shooter === state.p1 &&
      state.bullets.length >
      before
    ) {
      const bullet =
        state.bullets[
          state.bullets.length - 1
        ];

      const factor =
        bonusState.bulletSpeed /
        510;

      bullet.vx *= factor;
      bullet.vy *= factor;

      shooter.cooldown =
        bonusState.fireCooldown;
    }
  };

  function openBonusChoice() {
    if (
      !state.running ||
      bonusState.paused
    )
      return;

    bonusState.paused = true;
    state.running = false;

    statusEl.textContent =
      'CHOOSE BONUS';

    bonusCards.innerHTML = '';

    const choices =
      [...bonusPool]
        .sort(
          () =>
            Math.random() - .5
        )
        .slice(0, 3);

    choices.forEach(
      bonus => {
        const card =
          document.createElement(
            'button'
          );

        card.className =
          'bonusCard';

        card.innerHTML =
          '<div class="bonusIcon">' +
          bonus.icon +
          '</div>' +

          '<div class="bonusName">' +
          bonus.name +
          '</div>' +

          '<div class="bonusDesc">' +
          bonus.desc +
          '</div>';

        card.addEventListener(
          'click',
          () => {
            bonus.apply();

            bonusState.nextTime -= 10;

            bonusState.paused = false;
            state.running = true;

            statusEl.textContent =
              'ROUND ' +
              round;

            bonusOverlay.style.display =
              'none';

            updateHud();
          },
          {
            once: true
          }
        );

        bonusCards.appendChild(
          card
        );
      }
    );

    bonusOverlay.style.display =
      'flex';
  }

  function frame(now) {
    const dt =
      Math.min(
        .033,
        Math.max(
          0,
          (now - last) / 1000
        )
      );

    last = now;

    if (state) {
      if (
        state.running &&
        !bonusState.paused
      ) {
        state.time =
          Math.max(
            0,
            state.time - dt
          );

        state.flash =
          Math.max(
            0,
            state.flash - dt
          );

        updatePlayer(dt);
        updateBot(dt);
        updateHook(dt);
        updateBullets(dt);
        updateParticles(dt);

        checkEnd();

        updateHud();
      }

      render();

      if (
        state.running &&
        !bonusState.paused &&
        state.time <=
        bonusState.nextTime &&
        bonusState.nextTime > 0
      ) {
        openBonusChoice();
      }
    }

    requestAnimationFrame(frame);
  }

  reset();

  requestAnimationFrame(frame);
})();