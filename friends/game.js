import {
    ref,
    onValue,
    update,
    push,
    onChildAdded
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const timeEl = document.getElementById("time");
const statusEl = document.getElementById("status");

const overlay = document.getElementById("gameOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const backToMenu = document.getElementById("backToMenu");

const p1HpText = document.getElementById("p1HpText");
const p2HpText = document.getElementById("p2HpText");
const p1Health = document.getElementById("p1Health");
const p2Health = document.getElementById("p2Health");

const W = canvas.width;
const H = canvas.height;

const keys = Object.create(null);

const mouse = {
    x: W * 0.5,
    y: H * 0.5,
    down: false
};

let roomId = null;
let playerId = null;
let isHost = false;
let db = null;

let started = false;
let gameOver = false;

let lastTime = performance.now();

let opponentUnsubscribe = null;
let roomUnsubscribe = null;
let shotUnsubscribe = null;

let networkAccumulator = 0;
let timerAccumulator = 0;

let startTime = 0;

let localPlayer = null;
let opponent = null;

let bullets = [];
let particles = [];

let lastSent = {
    x: 0,
    y: 0,
    angle: 0,
    hp: 100
};

let opponentTarget = {
    x: 0,
    y: 0,
    angle: 0,
    hp: 100
};

let fireTimer = 0;
let hookTimer = 0;
let finishSent = false;

const PLAYER_SPEED = 300;
const BULLET_SPEED = 900;
const FIRE_DELAY = 0.12;
const HOOK_DELAY = 2.0;
const HOOK_SPEED = 850;
const NETWORK_INTERVAL = 0.10;
const ROUND_TIME = 30;

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function normalize(x, y) {
    const length = Math.hypot(x, y);

    if (length < 0.0001) {
        return { x: 0, y: 0 };
    }

    return {
        x: x / length,
        y: y / length
    };
}

function angleLerp(a, b, t) {
    let d = b - a;

    while (d > Math.PI) {
        d -= Math.PI * 2;
    }

    while (d < -Math.PI) {
        d += Math.PI * 2;
    }

    return a + d * t;
}

function createPlayer(x, y, color) {
    return {
        x,
        y,
        vx: 0,
        vy: 0,
        angle: 0,
        radius: 16,
        hp: 100,
        color,
        hook: {
            active: false,
            x: x,
            y: y,
            life: 0
        }
    };
}

function resetGame() {
    bullets.length = 0;
    particles.length = 0;

    localPlayer = createPlayer(
        isHost ? 130 : W - 130,
        H * 0.5,
        "#67a7ff"
    );

    opponent = createPlayer(
        isHost ? W - 130 : 130,
        H * 0.5,
        "#ff6d7f"
    );

    localPlayer.angle = isHost ? 0 : Math.PI;
    opponent.angle = isHost ? Math.PI : 0;

    opponentTarget.x = opponent.x;
    opponentTarget.y = opponent.y;
    opponentTarget.angle = opponent.angle;
    opponentTarget.hp = 100;

    lastSent.x = localPlayer.x;
    lastSent.y = localPlayer.y;
    lastSent.angle = localPlayer.angle;
    lastSent.hp = 100;

    fireTimer = 0;
    hookTimer = 0;
    finishSent = false;
    gameOver = false;

    overlay.classList.remove("show");

    statusEl.textContent = isHost ? "HOST" : "PLAYER 2";

    updateHud();
}

function updateMousePosition(e) {
    const rect = canvas.getBoundingClientRect();

    mouse.x =
        (e.clientX - rect.left) *
        (W / rect.width);

    mouse.y =
        (e.clientY - rect.top) *
        (H / rect.height);
}

function updateAim() {
    if (!localPlayer) {
        return;
    }

    localPlayer.angle = Math.atan2(
        mouse.y - localPlayer.y,
        mouse.x - localPlayer.x
    );
}

function updateMovement(dt) {
    if (!localPlayer || gameOver) {
        return;
    }

    let x = 0;
    let y = 0;

    if (keys.w || keys.arrowup) {
        y -= 1;
    }

    if (keys.s || keys.arrowdown) {
        y += 1;
    }

    if (keys.a || keys.arrowleft) {
        x -= 1;
    }

    if (keys.d || keys.arrowright) {
        x += 1;
    }

    const dir = normalize(x, y);

    localPlayer.vx = dir.x * PLAYER_SPEED;
    localPlayer.vy = dir.y * PLAYER_SPEED;

    localPlayer.x += localPlayer.vx * dt;
    localPlayer.y += localPlayer.vy * dt;

    if (localPlayer.hook.active) {
        const dx = localPlayer.hook.x - localPlayer.x;
        const dy = localPlayer.hook.y - localPlayer.y;

        const dist = Math.hypot(dx, dy);

        if (dist < 18) {
            localPlayer.hook.active = false;
        } else {
            const d = normalize(dx, dy);

            localPlayer.x += d.x * HOOK_SPEED * dt;
            localPlayer.y += d.y * HOOK_SPEED * dt;
        }
    }

    localPlayer.x = clamp(
        localPlayer.x,
        localPlayer.radius,
        W - localPlayer.radius
    );

    localPlayer.y = clamp(
        localPlayer.y,
        localPlayer.radius,
        H - localPlayer.radius
    );
}

function shoot() {
    if (!started || gameOver || !localPlayer) {
        return;
    }

    if (fireTimer > 0) {
        return;
    }

    fireTimer = FIRE_DELAY;

    const dx = Math.cos(localPlayer.angle);
    const dy = Math.sin(localPlayer.angle);

    const x =
        localPlayer.x +
        dx *
        (localPlayer.radius + 7);

    const y =
        localPlayer.y +
        dy *
        (localPlayer.radius + 7);

    bullets.push({
        x,
        y,
        vx: dx * BULLET_SPEED,
        vy: dy * BULLET_SPEED,
        life: 1,
        owner: playerId
    });

    createParticles(x, y, "#ffffff", 3);

    sendShot(x, y, dx, dy);
}

function updateShooting(dt) {
    if (fireTimer > 0) {
        fireTimer -= dt;
    }

    if (mouse.down) {
        shoot();
    }
}

async function sendShot(x, y, dx, dy) {
    if (!db || !roomId || !playerId) {
        return;
    }

    try {
        await push(
            ref(db, `rooms/${roomId}/shots`),
            {
                owner: playerId,
                x,
                y,
                dx,
                dy,
                t: Date.now()
            }
        );
    } catch {}
}

function launchHook() {
    if (!localPlayer || gameOver) {
        return;
    }

    if (hookTimer > 0) {
        return;
    }

    hookTimer = HOOK_DELAY;

    const dir = normalize(
        mouse.x - localPlayer.x,
        mouse.y - localPlayer.y
    );

    let distance = 400;

    if (dir.x > 0) {
        distance = Math.min(
            distance,
            (W - localPlayer.x) / dir.x
        );
    }

    if (dir.x < 0) {
        distance = Math.min(
            distance,
            -localPlayer.x / dir.x
        );
    }

    if (dir.y > 0) {
        distance = Math.min(
            distance,
            (H - localPlayer.y) / dir.y
        );
    }

    if (dir.y < 0) {
        distance = Math.min(
            distance,
            -localPlayer.y / dir.y
        );
    }

    distance = clamp(distance, 80, 400);

    localPlayer.hook.active = true;

    localPlayer.hook.x =
        localPlayer.x +
        dir.x *
        distance;

    localPlayer.hook.y =
        localPlayer.y +
        dir.y *
        distance;

    localPlayer.hook.life = 0.5;
}

function updateHook(dt) {
    if (hookTimer > 0) {
        hookTimer -= dt;
    }

    if (!localPlayer || !localPlayer.hook.active) {
        return;
    }

    localPlayer.hook.life -= dt;

    if (localPlayer.hook.life <= 0) {
        localPlayer.hook.active = false;
        return;
    }

    const dx =
        localPlayer.hook.x -
        localPlayer.x;

    const dy =
        localPlayer.hook.y -
        localPlayer.y;

    const dist = Math.hypot(dx, dy);

    if (dist < 18) {
        localPlayer.hook.active = false;
        return;
    }

    const dir = normalize(dx, dy);

    localPlayer.x += dir.x * HOOK_SPEED * dt;
    localPlayer.y += dir.y * HOOK_SPEED * dt;

    localPlayer.x = clamp(
        localPlayer.x,
        localPlayer.radius,
        W - localPlayer.radius
    );

    localPlayer.y = clamp(
        localPlayer.y,
        localPlayer.radius,
        H - localPlayer.radius
    );
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;

        if (
            b.life <= 0 ||
            b.x < -50 ||
            b.x > W + 50 ||
            b.y < -50 ||
            b.y > H + 50
        ) {
            bullets.splice(i, 1);
            continue;
        }
    }
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 30 + Math.random() * 120;

        particles.push({
            x,
            y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: 0.25 + Math.random() * 0.2,
            color
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.vx *= Math.pow(0.01, dt);
        p.vy *= Math.pow(0.01, dt);

        p.life -= dt;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function updateOpponent(dt) {
    if (!opponent) {
        return;
    }

    const distance = Math.hypot(
        opponentTarget.x - opponent.x,
        opponentTarget.y - opponent.y
    );

    if (distance > 200) {
        opponent.x = opponentTarget.x;
        opponent.y = opponentTarget.y;
    } else {
        const t = 1 - Math.pow(0.00001, dt);

        opponent.x = lerp(
            opponent.x,
            opponentTarget.x,
            t
        );

        opponent.y = lerp(
            opponent.y,
            opponentTarget.y,
            t
        );
    }

    opponent.angle = angleLerp(
        opponent.angle,
        opponentTarget.angle,
        Math.min(1, dt * 15)
    );

    opponent.hp = lerp(
        opponent.hp,
        opponentTarget.hp,
        Math.min(1, dt * 15)
    );
}

function updateHud() {
    if (!localPlayer || !opponent) {
        return;
    }

    const hp1 = clamp(localPlayer.hp, 0, 100);
    const hp2 = clamp(opponent.hp, 0, 100);

    p1HpText.textContent = Math.ceil(hp1);
    p2HpText.textContent = Math.ceil(hp2);

    p1Health.style.width = hp1 + "%";
    p2Health.style.width = hp2 + "%";
}

function getTimeLeft() {
    if (!startTime) {
        return ROUND_TIME;
    }

    return clamp(
        ROUND_TIME -
        (Date.now() - startTime) / 1000,
        0,
        ROUND_TIME
    );
}

function updateTimer(dt) {
    timerAccumulator += dt;

    if (timerAccumulator < 0.05) {
        return;
    }

    timerAccumulator = 0;

    const time = getTimeLeft();

    timeEl.textContent = time.toFixed(1);

    if (time <= 5) {
        timeEl.style.color = "#ff6d7f";
    } else {
        timeEl.style.color = "";
    }

    if (
        isHost &&
        time <= 0 &&
        !finishSent
    ) {
        finishRound();
    }
}

async function finishRound() {
    if (
        finishSent ||
        !isHost ||
        !db ||
        !roomId
    ) {
        return;
    }

    finishSent = true;

    let winner = null;

    if (localPlayer.hp > opponentTarget.hp) {
        winner = "player1";
    } else if (opponentTarget.hp > localPlayer.hp) {
        winner = "player2";
    }

    try {
        await update(
            ref(db, `rooms/${roomId}/game`),
            {
                status: "finished",
                winner,
                time: 0,
                finishedAt: Date.now()
            }
        );
    } catch {}
}

async function sendPlayerState(force = false) {
    if (
        !db ||
        !roomId ||
        !localPlayer
    ) {
        return;
    }

    const dx = localPlayer.x - lastSent.x;
    const dy = localPlayer.y - lastSent.y;
    const da = Math.abs(
        localPlayer.angle -
        lastSent.angle
    );

    if (
        !force &&
        Math.abs(dx) < 2 &&
        Math.abs(dy) < 2 &&
        da < 0.02 &&
        localPlayer.hp === lastSent.hp
    ) {
        return;
    }

    const path =
        isHost
            ? "player1"
            : "player2";

    lastSent.x = localPlayer.x;
    lastSent.y = localPlayer.y;
    lastSent.angle = localPlayer.angle;
    lastSent.hp = localPlayer.hp;

    const data = {
        x: Math.round(localPlayer.x * 10) / 10,
        y: Math.round(localPlayer.y * 10) / 10,
        angle: localPlayer.angle,
        hp: localPlayer.hp,
        t: Date.now()
    };

    try {
        await update(
            ref(
                db,
                `rooms/${roomId}/players/${path}`
            ),
            data
        );
    } catch {}
}

function updateNetwork(dt) {
    networkAccumulator += dt;

    if (networkAccumulator >= NETWORK_INTERVAL) {
        networkAccumulator -= NETWORK_INTERVAL;
        sendPlayerState();
    }
}

function processRemoteShot(shot) {
    if (
        !localPlayer ||
        gameOver ||
        shot.owner === playerId
    ) {
        return;
    }

    const dx =
        localPlayer.x -
        shot.x;

    const dy =
        localPlayer.y -
        shot.y;

    const projection =
        dx * shot.dx +
        dy * shot.dy;

    if (
        projection < 0 ||
        projection > 1000
    ) {
        return;
    }

    const closestX =
        shot.x +
        shot.dx *
        projection;

    const closestY =
        shot.y +
        shot.dy *
        projection;

    const distance = Math.hypot(
        localPlayer.x - closestX,
        localPlayer.y - closestY
    );

    if (
        distance <=
        localPlayer.radius + 5
    ) {
        localPlayer.hp = clamp(
            localPlayer.hp - 10,
            0,
            100
        );

        createParticles(
            localPlayer.x,
            localPlayer.y,
            "#ff6d7f",
            8
        );

        updateHud();

        sendPlayerState(true);

        if (localPlayer.hp <= 0) {
            localPlayer.hp = 0;
            finishDeath();
        }
    }
}

async function finishDeath() {
    if (
        gameOver ||
        !isHost ||
        !db ||
        !roomId
    ) {
        return;
    }

    gameOver = true;

    try {
        await update(
            ref(db, `rooms/${roomId}/game`),
            {
                status: "finished",
                winner: "player1",
                time: 0,
                finishedAt: Date.now()
            }
        );
    } catch {}
}

function setupFirebase() {
    if (!db || !roomId) {
        return;
    }

    const enemy =
        isHost
            ? "player2"
            : "player1";

    opponentUnsubscribe = onValue(
        ref(
            db,
            `rooms/${roomId}/players/${enemy}`
        ),
        snapshot => {
            const data = snapshot.val();

            if (!data) {
                return;
            }

            if (typeof data.x === "number") {
                opponentTarget.x = data.x;
            }

            if (typeof data.y === "number") {
                opponentTarget.y = data.y;
            }

            if (typeof data.angle === "number") {
                opponentTarget.angle = data.angle;
            }

            if (typeof data.hp === "number") {
                opponentTarget.hp = data.hp;
            }
        }
    );

    roomUnsubscribe = onValue(
        ref(db, `rooms/${roomId}`),
        snapshot => {
            const room = snapshot.val();

            if (!room) {
                showGameResult(
                    "SERVER CLOSED",
                    "The server was closed."
                );
                return;
            }

            if (
                room.startedAt &&
                !startTime
            ) {
                startTime = room.startedAt;
            }

            if (
                room.game &&
                room.game.status === "finished"
            ) {
                finishFromFirebase(
                    room.game.winner
                );
            }
        }
    );

    shotUnsubscribe = onChildAdded(
        ref(
            db,
            `rooms/${roomId}/shots`
        ),
        snapshot => {
            const shot = snapshot.val();

            if (!shot) {
                return;
            }

            processRemoteShot(shot);
        }
    );
}

function finishFromFirebase(winner) {
    if (gameOver) {
        return;
    }

    let title;
    let text;

    if (!winner) {
        title = "DRAW";
        text = "Time is over.";
    } else {
        const won =
            (
                winner === "player1" &&
                isHost
            ) ||
            (
                winner === "player2" &&
                !isHost
            );

        if (won) {
            title = "VICTORY";
            text = "You won the duel.";
        } else {
            title = "DEFEAT";
            text = "Your opponent won.";
        }
    }

    showGameResult(title, text);
}

function showGameResult(title, text) {
    if (gameOver) {
        return;
    }

    gameOver = true;

    resultTitle.textContent = title;
    resultText.textContent = text;

    overlay.classList.add("show");
}

function drawBackground() {
    ctx.fillStyle = "#0b0f15";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,.035)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }

    for (let y = 0; y <= H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    ctx.strokeStyle = "#283241";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
}

function drawPlayer(player, color, local) {
    if (!player) {
        return;
    }

    ctx.save();

    ctx.translate(
        player.x,
        player.y
    );

    ctx.rotate(player.angle);

    ctx.shadowBlur = 12;
    ctx.shadowColor = color;

    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.arc(
        0,
        0,
        player.radius,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = "#fff";

    ctx.beginPath();
    ctx.moveTo(
        player.radius + 9,
        0
    );
    ctx.lineTo(
        player.radius - 4,
        -5
    );
    ctx.lineTo(
        player.radius - 4,
        5
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    if (local) {
        ctx.strokeStyle =
            "rgba(255,255,255,.18)";

        ctx.lineWidth = 1;

        ctx.beginPath();

        ctx.arc(
            player.x,
            player.y,
            player.radius + 5,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }
}

function drawBullets() {
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#fff";
    ctx.fillStyle = "#fff";

    for (const b of bullets) {
        ctx.beginPath();
        ctx.arc(
            b.x,
            b.y,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    ctx.shadowBlur = 0;
}

function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = clamp(
            p.life * 4,
            0,
            1
        );

        ctx.fillStyle = p.color;

        ctx.fillRect(
            p.x - 1,
            p.y - 1,
            3,
            3
        );
    }

    ctx.globalAlpha = 1;
}

function drawHook() {
    if (
        !localPlayer ||
        !localPlayer.hook.active
    ) {
        return;
    }

    ctx.strokeStyle =
        "rgba(103,167,255,.8)";

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(
        localPlayer.x,
        localPlayer.y
    );

    ctx.lineTo(
        localPlayer.hook.x,
        localPlayer.hook.y
    );

    ctx.stroke();

    ctx.fillStyle = "#67a7ff";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#67a7ff";

    ctx.beginPath();

    ctx.arc(
        localPlayer.hook.x,
        localPlayer.hook.y,
        6,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.shadowBlur = 0;
}

function drawCrosshair() {
    ctx.strokeStyle =
        "rgba(255,255,255,.75)";

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
        mouse.x - 7,
        mouse.y
    );

    ctx.lineTo(
        mouse.x + 7,
        mouse.y
    );

    ctx.moveTo(
        mouse.x,
        mouse.y - 7
    );

    ctx.lineTo(
        mouse.x,
        mouse.y + 7
    );

    ctx.stroke();

    ctx.fillStyle = "#fff";

    ctx.beginPath();

    ctx.arc(
        mouse.x,
        mouse.y,
        1.5,
        0,
        Math.PI * 2
    );

    ctx.fill();
}

function render() {
    drawBackground();
    drawHook();
    drawBullets();
    drawParticles();

    drawPlayer(
        localPlayer,
        "#67a7ff",
        true
    );

    drawPlayer(
        opponent,
        "#ff6d7f",
        false
    );

    drawCrosshair();
}

function gameLoop(now) {
    const dt = Math.min(
        0.033,
        (now - lastTime) / 1000
    );

    lastTime = now;

    if (started) {
        updateAim();
        updateMovement(dt);
        updateHook(dt);
        updateShooting(dt);
        updateBullets(dt);
        updateOpponent(dt);
        updateParticles(dt);
        updateNetwork(dt);
        updateTimer(dt);
        updateHud();
    } else {
        updateParticles(dt);
    }

    render();

    requestAnimationFrame(gameLoop);
}

window.addEventListener(
    "duel-game-start",
    event => {
        const data = event.detail;

        roomId = data.roomId;
        playerId = data.playerId;
        isHost = data.isHost;

        db =
            window.duelRoom &&
            window.duelRoom.getDatabase
                ? window.duelRoom.getDatabase()
                : null;

        if (!db) {
            console.error(
                "Firebase database is unavailable."
            );
            return;
        }

        resetGame();

        startTime = Date.now();
        started = true;

        setupFirebase();

        sendPlayerState(true);
    }
);

window.addEventListener(
    "keydown",
    e => {
        const key = e.key.toLowerCase();

        keys[key] = true;

        if (
            key === " " ||
            key === "arrowup" ||
            key === "arrowdown" ||
            key === "arrowleft" ||
            key === "arrowright"
        ) {
            e.preventDefault();
        }
    }
);

window.addEventListener(
    "keyup",
    e => {
        keys[e.key.toLowerCase()] = false;
    }
);

window.addEventListener(
    "blur",
    () => {
        for (const key in keys) {
            keys[key] = false;
        }

        mouse.down = false;
    }
);

canvas.addEventListener(
    "mousemove",
    updateMousePosition,
    { passive: true }
);

canvas.addEventListener(
    "mousedown",
    e => {
        e.preventDefault();

        updateMousePosition(e);

        if (e.button === 0) {
            mouse.down = true;
            shoot();
        }

        if (e.button === 2) {
            launchHook();
        }
    }
);

window.addEventListener(
    "mouseup",
    e => {
        if (e.button === 0) {
            mouse.down = false;
        }
    }
);

canvas.addEventListener(
    "contextmenu",
    e => {
        e.preventDefault();
    }
);

backToMenu.addEventListener(
    "click",
    () => {
        started = false;

        if (opponentUnsubscribe) {
            opponentUnsubscribe();
            opponentUnsubscribe = null;
        }

        if (roomUnsubscribe) {
            roomUnsubscribe();
            roomUnsubscribe = null;
        }

        if (shotUnsubscribe) {
            shotUnsubscribe();
            shotUnsubscribe = null;
        }

        window.dispatchEvent(
            new Event("duel-return-menu")
        );
    }
);

requestAnimationFrame(gameLoop);