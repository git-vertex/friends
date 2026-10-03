import {
    ref,
    onValue,
    update,
    set,
    push,
    onChildAdded,
    remove,
    onDisconnect
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";


const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

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


const keys = new Set();

const mouse = {
    x: W / 2,
    y: H / 2,
    down: false,
    rightDown: false
};


let roomId = null;
let playerId = null;
let isHost = false;
let db = null;

let started = false;
let gameOver = false;

let last = performance.now();

let roomUnsubscribe = null;
let playerUnsubscribe = null;
let opponentUnsubscribe = null;
let shotUnsubscribe = null;


let localPlayer = null;
let opponent = null;

let bullets = [];
let particles = [];


let lastNetworkUpdate = 0;
let lastShot = 0;
let lastHook = 0;

let hostLastTime = 0;
let hostEndProcessed = false;


const arena = {
    x: 0,
    y: 0,
    w: W,
    h: H
};


function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


function length(x, y) {
    return Math.hypot(x, y);
}


function normalize(x, y) {

    const l = Math.hypot(x, y);

    if (l === 0) {
        return { x: 0, y: 0 };
    }

    return {
        x: x / l,
        y: y / l
    };

}


function distance(a, b) {
    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}


function createPlayer(x, y, color) {

    return {

        x,
        y,

        vx: 0,
        vy: 0,

        radius: 16,

        speed: 260,

        hp: 100,

        maxHp: 100,

        color,

        angle: 0,

        fireCooldown: 700,

        hookCooldown: 2000,

        hook: {

            active: false,

            x: x,

            y: y,

            life: 0,

            maxLife: .65

        }

    };

}


function resetLocalPlayer() {

    if (!localPlayer) {
        return;
    }


    if (isHost) {

        localPlayer.x = 130;
        localPlayer.y = H / 2;

    } else {

        localPlayer.x = W - 130;
        localPlayer.y = H / 2;

    }


    localPlayer.vx = 0;
    localPlayer.vy = 0;

    localPlayer.hp = 100;

    localPlayer.angle = isHost
        ? 0
        : Math.PI;

    localPlayer.hook.active = false;

}


function resetOpponent() {

    opponent = createPlayer(
        isHost ? W - 130 : 130,
        H / 2,
        "#ff6d7f"
    );

    opponent.hp = 100;

}


function resetGameState() {

    bullets = [];
    particles = [];

    localPlayer = createPlayer(
        isHost ? 130 : W - 130,
        H / 2,
        "#67a7ff"
    );

    opponent = createPlayer(
        isHost ? W - 130 : 130,
        H / 2,
        "#ff6d7f"
    );

    localPlayer.angle = isHost ? 0 : Math.PI;
    opponent.angle = isHost ? Math.PI : 0;

    gameOver = false;

    overlay.classList.remove("show");

    statusEl.textContent =
        isHost ? "HOST" : "PLAYER 2";

}


function canvasPoint(event) {

    const rect =
        canvas.getBoundingClientRect();

    return {

        x:
            (event.clientX - rect.left) *
            (W / rect.width),

        y:
            (event.clientY - rect.top) *
            (H / rect.height)

    };

}


function updateAim() {

    if (!localPlayer) {
        return;
    }

    const dx =
        mouse.x - localPlayer.x;

    const dy =
        mouse.y - localPlayer.y;

    localPlayer.angle =
        Math.atan2(dy, dx);

}


function movePlayer(dt) {

    if (!localPlayer || gameOver) {
        return;
    }


    let x = 0;
    let y = 0;


    if (
        keys.has("w") ||
        keys.has("arrowup")
    ) {
        y -= 1;
    }

    if (
        keys.has("s") ||
        keys.has("arrowdown")
    ) {
        y += 1;
    }

    if (
        keys.has("a") ||
        keys.has("arrowleft")
    ) {
        x -= 1;
    }

    if (
        keys.has("d") ||
        keys.has("arrowright")
    ) {
        x += 1;
    }


    const dir =
        normalize(x, y);


    localPlayer.vx =
        dir.x * localPlayer.speed;

    localPlayer.vy =
        dir.y * localPlayer.speed;


    localPlayer.x +=
        localPlayer.vx * dt;

    localPlayer.y +=
        localPlayer.vy * dt;


    localPlayer.x =
        clamp(
            localPlayer.x,
            localPlayer.radius,
            W - localPlayer.radius
        );

    localPlayer.y =
        clamp(
            localPlayer.y,
            localPlayer.radius,
            H - localPlayer.radius
        );


    if (localPlayer.hook.active) {

        localPlayer.x +=
            (localPlayer.hook.x - localPlayer.x) *
            dt * 7;

        localPlayer.y +=
            (localPlayer.hook.y - localPlayer.y) *
            dt * 7;

    }

}


function shoot() {

    if (!localPlayer || gameOver) {
        return;
    }


    const now = performance.now();


    if (
        now - lastShot <
        localPlayer.fireCooldown
    ) {
        return;
    }


    lastShot = now;


    const dir = {

        x: Math.cos(localPlayer.angle),

        y: Math.sin(localPlayer.angle)

    };


    const startX =
        localPlayer.x +
        dir.x * (localPlayer.radius + 5);

    const startY =
        localPlayer.y +
        dir.y * (localPlayer.radius + 5);


    bullets.push({

        x: startX,

        y: startY,

        vx: dir.x * 760,

        vy: dir.y * 760,

        life: 1.2,

        owner: playerId,

        color: "#ffffff"

    });


    createParticles(
        startX,
        startY,
        "#ffffff",
        4
    );


    sendShot(
        startX,
        startY,
        dir.x,
        dir.y
    );

}


async function sendShot(
    x,
    y,
    dx,
    dy
) {

    if (!roomId || !db) {
        return;
    }


    try {

        await push(
            ref(
                db,
                `rooms/${roomId}/shots`
            ),
            {

                owner: playerId,

                x,
                y,
                dx,
                dy,

                time: Date.now()

            }
        );

    } catch (error) {

        console.error(
            "Shot sync error:",
            error
        );

    }

}


function launchHook() {

    if (!localPlayer || gameOver) {
        return;
    }


    const now =
        performance.now();


    if (
        now - lastHook <
        localPlayer.hookCooldown
    ) {
        return;
    }


    lastHook = now;


    const dx =
        mouse.x - localPlayer.x;

    const dy =
        mouse.y - localPlayer.y;


    const dir =
        normalize(dx, dy);


    let distanceToWall = 250;


    if (dir.x > 0) {
        distanceToWall =
            Math.min(
                distanceToWall,
                (W - localPlayer.x) / dir.x
            );
    }

    if (dir.x < 0) {
        distanceToWall =
            Math.min(
                distanceToWall,
                -localPlayer.x / dir.x
            );
    }

    if (dir.y > 0) {
        distanceToWall =
            Math.min(
                distanceToWall,
                (H - localPlayer.y) / dir.y
            );
    }

    if (dir.y < 0) {
        distanceToWall =
            Math.min(
                distanceToWall,
                -localPlayer.y / dir.y
            );
    }


    distanceToWall =
        clamp(
            distanceToWall,
            60,
            360
        );


    localPlayer.hook.active = true;

    localPlayer.hook.x =
        localPlayer.x +
        dir.x * distanceToWall;

    localPlayer.hook.y =
        localPlayer.y +
        dir.y * distanceToWall;

    localPlayer.hook.life =
        localPlayer.hook.maxLife;

}


function updateHook(dt) {

    if (!localPlayer) {
        return;
    }


    if (!localPlayer.hook.active) {
        return;
    }


    localPlayer.hook.life -= dt;


    if (
        localPlayer.hook.life <= 0
    ) {

        localPlayer.hook.active = false;

        return;

    }


    const dx =
        localPlayer.hook.x -
        localPlayer.x;

    const dy =
        localPlayer.hook.y -
        localPlayer.y;


    const d =
        Math.hypot(dx, dy);


    if (d < 20) {

        localPlayer.hook.active = false;

        return;

    }


    const dir = {

        x: dx / d,

        y: dy / d

    };


    localPlayer.x +=
        dir.x * 520 * dt;

    localPlayer.y +=
        dir.y * 520 * dt;


    localPlayer.x =
        clamp(
            localPlayer.x,
            localPlayer.radius,
            W - localPlayer.radius
        );

    localPlayer.y =
        clamp(
            localPlayer.y,
            localPlayer.radius,
            H - localPlayer.radius
        );

}


function updateBullets(dt) {

    for (
        let i = bullets.length - 1;
        i >= 0;
        i--
    ) {

        const bullet = bullets[i];


        bullet.x +=
            bullet.vx * dt;

        bullet.y +=
            bullet.vy * dt;

        bullet.life -= dt;


        if (
            bullet.life <= 0 ||
            bullet.x < -20 ||
            bullet.x > W + 20 ||
            bullet.y < -20 ||
            bullet.y > H + 20
        ) {

            bullets.splice(i, 1);

            continue;

        }


        if (
            bullet.owner !== playerId &&
            localPlayer
        ) {

            const d =
                Math.hypot(
                    bullet.x - localPlayer.x,
                    bullet.y - localPlayer.y
                );


            if (
                d <
                localPlayer.radius + 4
            ) {

                bullets.splice(i, 1);

                takeDamage(10);

            }

        }

    }

}


function takeDamage(amount) {

    if (!localPlayer || gameOver) {
        return;
    }


    localPlayer.hp =
        clamp(
            localPlayer.hp - amount,
            0,
            localPlayer.maxHp
        );


    createParticles(
        localPlayer.x,
        localPlayer.y,
        "#ff6d7f",
        12
    );


    sendLocalState();


    if (localPlayer.hp <= 0) {

        finishLocalDeath();

    }

}


async function finishLocalDeath() {

    if (gameOver) {
        return;
    }


    gameOver = true;


    const winner =
        isHost
            ? "player2"
            : "player1";


    if (isHost) {

        await update(
            ref(
                db,
                `rooms/${roomId}/game`
            ),
            {

                winner,

                status: "finished",

                finishedAt: Date.now()

            }
        );

    }

}


function createParticles(
    x,
    y,
    color,
    count
) {

    for (let i = 0; i < count; i++) {

        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            30 +
            Math.random() * 150;


        particles.push({

            x,
            y,

            vx:
                Math.cos(angle) *
                speed,

            vy:
                Math.sin(angle) *
                speed,

            life:
                .25 +
                Math.random() * .4,

            maxLife: .65,

            color

        });

    }

}


function updateParticles(dt) {

    for (
        let i = particles.length - 1;
        i >= 0;
        i--
    ) {

        const p =
            particles[i];


        p.x +=
            p.vx * dt;

        p.y +=
            p.vy * dt;


        p.vx *=
            Math.pow(.01, dt);

        p.vy *=
            Math.pow(.01, dt);


        p.life -= dt;


        if (p.life <= 0) {
            particles.splice(i, 1);
        }

    }

}


async function sendLocalState() {

    if (
        !roomId ||
        !playerId ||
        !localPlayer ||
        !db
    ) {
        return;
    }


    const playerPath =
        isHost
            ? "player1"
            : "player2";


    try {

        await update(
            ref(
                db,
                `rooms/${roomId}/players/${playerPath}`
            ),
            {

                id: playerId,

                x: localPlayer.x,

                y: localPlayer.y,

                angle: localPlayer.angle,

                hp: localPlayer.hp,

                connected: true,

                timestamp: Date.now()

            }
        );

    } catch (error) {

        console.error(
            "State sync error:",
            error
        );

    }

}


function updateOpponent(data) {

    if (!data || !opponent) {
        return;
    }


    opponent.x =
        data.x ?? opponent.x;

    opponent.y =
        data.y ?? opponent.y;

    opponent.angle =
        data.angle ?? opponent.angle;

    opponent.hp =
        data.hp ?? opponent.hp;

}


function setupFirebaseListeners() {

    if (!roomId || !db) {
        return;
    }


    const opponentPath =
        isHost
            ? "player2"
            : "player1";


    const localPath =
        isHost
            ? "player1"
            : "player2";


    opponentUnsubscribe = onValue(
        ref(
            db,
            `rooms/${roomId}/players/${opponentPath}`
        ),
        snapshot => {

            if (snapshot.exists()) {

                updateOpponent(
                    snapshot.val()
                );

            }

        }
    );


    playerUnsubscribe = onValue(
        ref(
            db,
            `rooms/${roomId}/players/${localPath}`
        ),
        snapshot => {

            if (!snapshot.exists()) {
                return;
            }

            const data =
                snapshot.val();


            if (
                typeof data.hp === "number" &&
                localPlayer
            ) {

                if (
                    data.hp <
                    localPlayer.hp
                ) {

                    localPlayer.hp =
                        data.hp;

                }

            }

        }
    );


    roomUnsubscribe = onValue(
        ref(
            db,
            `rooms/${roomId}`
        ),
        snapshot => {

            if (!snapshot.exists()) {

                showGameResult(
                    "SERVER CLOSED",
                    "The server no longer exists."
                );

                return;

            }


            const room =
                snapshot.val();


            const game =
                room.game || {};


            if (
                game.status === "finished"
            ) {

                finishFromFirebase(
                    game.winner
                );

                return;

            }


            if (
                room.status === "playing"
            ) {

                statusEl.textContent =
                    "FIGHT";

            }

        }
    );


    shotUnsubscribe = onChildAdded(
        ref(
            db,
            `rooms/${roomId}/shots`
        ),
        snapshot => {

            const shot =
                snapshot.val();


            if (!shot) {
                return;
            }


            if (
                shot.owner === playerId
            ) {
                return;
            }


            processRemoteShot(
                shot
            );

        }
    );

}


function processRemoteShot(shot) {

    if (!localPlayer || gameOver) {
        return;
    }


    const dx =
        localPlayer.x - shot.x;

    const dy =
        localPlayer.y - shot.y;


    const projection =
        dx * shot.dx +
        dy * shot.dy;


    if (
        projection < 0 ||
        projection > 900
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


    const d =
        Math.hypot(
            localPlayer.x - closestX,
            localPlayer.y - closestY
        );


    if (
        d <=
        localPlayer.radius + 5
    ) {

        takeDamage(10);

    }


    createParticles(
        closestX,
        closestY,
        "#ffffff",
        4
    );

}


async function hostGameLoop(dt) {

    if (!isHost || !roomId || !db) {
        return;
    }


    if (gameOver) {
        return;
    }


    const now =
        Date.now();


    if (!hostLastTime) {
        hostLastTime = now;
    }


    const elapsed =
        (now - hostLastTime) / 1000;


    hostLastTime = now;


    const gameRef =
        ref(
            db,
            `rooms/${roomId}/game`
        );


    const currentTime =
        Math.max(
            0,
            (30 - (
                (now -
                (
                    window.duelGameStartTime ||
                    now
                )) / 1000
            ))
        );


    if (
        currentTime <= 0 &&
        !hostEndProcessed
    ) {

        hostEndProcessed = true;


        let winner = null;


        if (
            localPlayer.hp >
            opponent.hp
        ) {

            winner = "player1";

        } else if (
            opponent.hp >
            localPlayer.hp
        ) {

            winner = "player2";

        }


        await update(
            gameRef,
            {

                time: 0,

                status: "finished",

                winner,

                finishedAt: Date.now()

            }
        );


        return;

    }


    if (
        now - lastNetworkUpdate >
        80
    ) {

        lastNetworkUpdate =
            now;


        await update(
            gameRef,
            {

                time:
                    Math.max(
                        0,
                        currentTime
                    )

            }
        );

    }

}


function finishFromFirebase(
    winner
) {

    if (gameOver) {
        return;
    }


    gameOver = true;


    let title;
    let text;


    if (!winner) {

        title = "DRAW";

        text =
            "Time is over.";

    } else {

        const iWon =
            (
                winner === "player1" &&
                isHost
            ) ||
            (
                winner === "player2" &&
                !isHost
            );


        if (iWon) {

            title = "VICTORY";

            text =
                "You won the round.";

        } else {

            title = "DEFEAT";

            text =
                "Your opponent won.";

        }

    }


    showGameResult(
        title,
        text
    );

}


function showGameResult(
    title,
    text
) {

    resultTitle.textContent =
        title;

    resultText.textContent =
        text;

    overlay.classList.add(
        "show"
    );

}


function updateTimer() {

    if (!roomId || !db) {
        return;
    }


    const startTime =
        window.duelGameStartTime;


    if (!startTime) {
        return;
    }


    const remaining =
        Math.max(
            0,
            30 -
            (
                Date.now() -
                startTime
            ) / 1000
        );


    timeEl.textContent =
        remaining.toFixed(1);

}


function updateHud() {

    if (!localPlayer || !opponent) {
        return;
    }


    p1HpText.textContent =
        Math.ceil(
            localPlayer.hp
        );

    p2HpText.textContent =
        Math.ceil(
            opponent.hp
        );


    p1Health.style.width =
        `${clamp(localPlayer.hp,0,100)}%`;

    p2Health.style.width =
        `${clamp(opponent.hp,0,100)}%`;

}


function drawGrid() {

    ctx.fillStyle =
        "#0b0f15";

    ctx.fillRect(
        0,
        0,
        W,
        H
    );


    ctx.strokeStyle =
        "rgba(255,255,255,.035)";

    ctx.lineWidth = 1;


    const size = 40;


    for (
        let x = 0;
        x <= W;
        x += size
    ) {

        ctx.beginPath();

        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);

        ctx.stroke();

    }


    for (
        let y = 0;
        y <= H;
        y += size
    ) {

        ctx.beginPath();

        ctx.moveTo(0, y);
        ctx.lineTo(W, y);

        ctx.stroke();

    }


    ctx.strokeStyle =
        "#283241";

    ctx.lineWidth = 2;

    ctx.strokeRect(
        1,
        1,
        W - 2,
        H - 2
    );

}


function drawPlayer(
    player,
    color,
    isLocal
) {

    if (!player) {
        return;
    }


    ctx.save();

    ctx.translate(
        player.x,
        player.y
    );


    ctx.rotate(
        player.angle
    );


    ctx.shadowBlur = 18;

    ctx.shadowColor =
        color;


    ctx.fillStyle =
        color;


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


    ctx.fillStyle =
        "#ffffff";

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


    if (isLocal) {

        ctx.strokeStyle =
            "rgba(255,255,255,.25)";

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

    for (const bullet of bullets) {

        ctx.save();

        ctx.fillStyle =
            bullet.color;

        ctx.shadowBlur = 12;

        ctx.shadowColor =
            bullet.color;


        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            4,
            0,
            Math.PI * 2
        );

        ctx.fill();


        ctx.restore();

    }

}


function drawParticles() {

    for (const p of particles) {

        const alpha =
            clamp(
                p.life / p.maxLife,
                0,
                1
            );


        ctx.globalAlpha =
            alpha;

        ctx.fillStyle =
            p.color;


        ctx.beginPath();

        ctx.arc(
            p.x,
            p.y,
            2,
            0,
            Math.PI * 2
        );

        ctx.fill();

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


    ctx.save();


    ctx.strokeStyle =
        "rgba(103,167,255,.8)";

    ctx.lineWidth = 2;

    ctx.setLineDash([
        7,
        7
    ]);


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


    ctx.setLineDash([]);


    ctx.fillStyle =
        "#67a7ff";

    ctx.shadowBlur = 16;

    ctx.shadowColor =
        "#67a7ff";


    ctx.beginPath();

    ctx.arc(
        localPlayer.hook.x,
        localPlayer.hook.y,
        7,
        0,
        Math.PI * 2
    );

    ctx.fill();


    ctx.restore();

}


function drawCrosshair() {

    ctx.save();

    ctx.strokeStyle =
        "rgba(255,255,255,.8)";

    ctx.lineWidth = 1;


    ctx.beginPath();

    ctx.moveTo(
        mouse.x - 8,
        mouse.y
    );

    ctx.lineTo(
        mouse.x + 8,
        mouse.y
    );

    ctx.moveTo(
        mouse.x,
        mouse.y - 8
    );

    ctx.lineTo(
        mouse.x,
        mouse.y + 8
    );

    ctx.stroke();


    ctx.fillStyle =
        "#ffffff";

    ctx.beginPath();

    ctx.arc(
        mouse.x,
        mouse.y,
        1.5,
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


function networkTick() {

    if (
        !started ||
        !localPlayer ||
        !roomId
    ) {
        return;
    }


    const now =
        performance.now();


    if (
        now - lastNetworkUpdate >
        80
    ) {

        lastNetworkUpdate =
            now;

        sendLocalState();

    }

}


function frame(now) {

    const dt =
        Math.min(
            .033,
            (now - last) / 1000
        );


    last = now;


    if (
        started &&
        !gameOver
    ) {

        updateAim();

        movePlayer(dt);

        updateHook(dt);

        updateBullets(dt);

        updateParticles(dt);

        networkTick();

        updateTimer();

        updateHud();

        if (isHost) {
            hostGameLoop(dt);
        }

    }


    if (
        !started ||
        gameOver
    ) {

        updateParticles(dt);

    }


    render();


    requestAnimationFrame(
        frame
    );

}


function initializeGame(
    detail
) {

    roomId =
        detail.roomId;

    playerId =
        detail.playerId;

    isHost =
        detail.isHost;

    db =
        window.duelRoom.getDatabase();


    resetGameState();


    window.duelGameStartTime =
        Date.now();


    setupFirebaseListeners();


    sendLocalState();


    started = true;

}


window.addEventListener(
    "duel-game-start",
    event => {

        initializeGame(
            event.detail
        );

    }
);


backToMenu.addEventListener(
    "click",
    () => {

        window.dispatchEvent(
            new Event(
                "duel-return-menu"
            )
        );

    }
);


window.addEventListener(
    "keydown",
    event => {

        const key =
            event.key.toLowerCase();

        keys.add(key);


        if (
            key === " " ||
            key === "arrowup" ||
            key === "arrowdown" ||
            key === "arrowleft" ||
            key === "arrowright"
        ) {

            event.preventDefault();

        }

    }
);


window.addEventListener(
    "keyup",
    event => {

        keys.delete(
            event.key.toLowerCase()
        );

    }
);


canvas.addEventListener(
    "mousemove",
    event => {

        const point =
            canvasPoint(event);

        mouse.x =
            point.x;

        mouse.y =
            point.y;

        updateAim();

    }
);


canvas.addEventListener(
    "mousedown",
    event => {

        event.preventDefault();


        if (
            event.button === 0
        ) {

            mouse.down = true;

            shoot();

        }


        if (
            event.button === 2
        ) {

            mouse.rightDown = true;

            launchHook();

        }

    }
);


window.addEventListener(
    "mouseup",
    event => {

        if (
            event.button === 0
        ) {
            mouse.down = false;
        }

        if (
            event.button === 2
        ) {
            mouse.rightDown = false;
        }

    }
);


canvas.addEventListener(
    "contextmenu",
    event => {
        event.preventDefault();
    }
);


setInterval(
    () => {

        if (
            mouse.down &&
            started &&
            !gameOver
        ) {

            shoot();

        }

    },
    40
);


requestAnimationFrame(
    frame
);