import {
    ref,
    onValue,
    update,
    push,
    onChildAdded,
    remove
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";


const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", {
    alpha: false
});

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

let lastFrame = performance.now();

let roomUnsubscribe = null;
let opponentUnsubscribe = null;
let shotUnsubscribe = null;

let networkTimer = 0;
let shotTimer = 0;
let hookTimer = 0;

let gameStartTime = 0;
let remoteGameStartTime = 0;

let localPlayer = null;
let opponent = null;

let bullets = [];
let particles = [];

let remoteBullets = [];

let pendingDamage = 0;

let lastSentX = 0;
let lastSentY = 0;
let lastSentAngle = 0;
let lastSentHp = 100;

let lastRemoteX = 0;
let lastRemoteY = 0;
let lastRemoteAngle = 0;

let opponentTarget = {
    x: 0,
    y: 0,
    angle: 0,
    hp: 100
};


const PLAYER_SPEED = 280;
const BULLET_SPEED = 820;
const FIRE_COOLDOWN = 700;
const HOOK_COOLDOWN = 2000;

const NETWORK_RATE = 1 / 15;

const ROUND_TIME = 30;


function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


function normalize(x, y) {

    const length = Math.hypot(x, y);

    if (length <= 0.0001) {
        return {
            x: 0,
            y: 0
        };
    }

    return {
        x: x / length,
        y: y / length
    };
}


function lerp(a, b, t) {
    return a + (b - a) * t;
}


function angleLerp(a, b, t) {

    let difference =
        ((b - a + Math.PI) %
            (Math.PI * 2)) -
        Math.PI;

    return a + difference * t;
}


function createPlayer(x, y, color) {

    return {

        x,
        y,

        vx: 0,
        vy: 0,

        radius: 16,

        speed: PLAYER_SPEED,

        hp: 100,
        maxHp: 100,

        color,

        angle: 0,

        fireCooldown: FIRE_COOLDOWN,

        hookCooldown: HOOK_COOLDOWN,

        hook: {
            active: false,
            x,
            y,
            life: 0,
            maxLife: .62
        }

    };
}


function resetGame() {

    bullets = [];
    particles = [];
    remoteBullets = [];

    pendingDamage = 0;

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

    localPlayer.angle =
        isHost ? 0 : Math.PI;

    opponent.angle =
        isHost ? Math.PI : 0;

    opponentTarget.x = opponent.x;
    opponentTarget.y = opponent.y;
    opponentTarget.angle = opponent.angle;
    opponentTarget.hp = 100;

    lastSentX = localPlayer.x;
    lastSentY = localPlayer.y;
    lastSentAngle = localPlayer.angle;
    lastSentHp = 100;

    lastRemoteX = opponent.x;
    lastRemoteY = opponent.y;
    lastRemoteAngle = opponent.angle;

    gameOver = false;

    overlay.classList.remove("show");

    statusEl.textContent =
        isHost ? "HOST" : "PLAYER 2";

    updateHud();
}


function canvasPoint(event) {

    const rect =
        canvas.getBoundingClientRect();

    return {

        x:
            (event.clientX - rect.left) *
            W / rect.width,

        y:
            (event.clientY - rect.top) *
            H / rect.height

    };
}


function updateAim() {

    if (!localPlayer) {
        return;
    }

    localPlayer.angle =
        Math.atan2(
            mouse.y - localPlayer.y,
            mouse.x - localPlayer.x
        );
}


function updateMovement(dt) {

    if (!localPlayer || gameOver) {
        return;
    }


    let moveX = 0;
    let moveY = 0;


    if (
        keys.has("w") ||
        keys.has("arrowup")
    ) {
        moveY -= 1;
    }

    if (
        keys.has("s") ||
        keys.has("arrowdown")
    ) {
        moveY += 1;
    }

    if (
        keys.has("a") ||
        keys.has("arrowleft")
    ) {
        moveX -= 1;
    }

    if (
        keys.has("d") ||
        keys.has("arrowright")
    ) {
        moveX += 1;
    }


    const direction =
        normalize(
            moveX,
            moveY
        );


    localPlayer.vx =
        direction.x *
        localPlayer.speed;

    localPlayer.vy =
        direction.y *
        localPlayer.speed;


    localPlayer.x +=
        localPlayer.vx *
        dt;

    localPlayer.y +=
        localPlayer.vy *
        dt;


    if (
        localPlayer.hook.active
    ) {

        const dx =
            localPlayer.hook.x -
            localPlayer.x;

        const dy =
            localPlayer.hook.y -
            localPlayer.y;

        const distance =
            Math.hypot(dx, dy);


        if (distance > 15) {

            const hookDirection =
                normalize(
                    dx,
                    dy
                );

            const pull =
                650 *
                dt;

            localPlayer.x +=
                hookDirection.x *
                pull;

            localPlayer.y +=
                hookDirection.y *
                pull;

        } else {

            localPlayer.hook.active =
                false;

        }

    }


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


function shoot() {

    if (
        !started ||
        gameOver ||
        !localPlayer
    ) {
        return;
    }


    const now =
        performance.now();


    if (
        now - shotTimer <
        localPlayer.fireCooldown
    ) {
        return;
    }


    shotTimer = now;


    const dx =
        Math.cos(localPlayer.angle);

    const dy =
        Math.sin(localPlayer.angle);


    const startX =
        localPlayer.x +
        dx *
        (localPlayer.radius + 7);

    const startY =
        localPlayer.y +
        dy *
        (localPlayer.radius + 7);


    bullets.push({

        x: startX,

        y: startY,

        vx: dx * BULLET_SPEED,

        vy: dy * BULLET_SPEED,

        life: 1.15,

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
        dx,
        dy
    );

}


async function sendShot(
    x,
    y,
    dx,
    dy
) {

    if (
        !roomId ||
        !db ||
        !playerId
    ) {
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

                timestamp: Date.now()

            }
        );

    } catch (error) {

        console.error(
            "Shot:",
            error
        );

    }

}


function launchHook() {

    if (
        !localPlayer ||
        gameOver
    ) {
        return;
    }


    const now =
        performance.now();


    if (
        now - hookTimer <
        HOOK_COOLDOWN
    ) {
        return;
    }


    hookTimer = now;


    const direction =
        normalize(
            mouse.x - localPlayer.x,
            mouse.y - localPlayer.y
        );


    let maxDistance = 400;


    if (direction.x > 0) {

        maxDistance =
            Math.min(
                maxDistance,
                (W - localPlayer.x) /
                direction.x
            );

    } else if (direction.x < 0) {

        maxDistance =
            Math.min(
                maxDistance,
                -localPlayer.x /
                direction.x
            );

    }


    if (direction.y > 0) {

        maxDistance =
            Math.min(
                maxDistance,
                (H - localPlayer.y) /
                direction.y
            );

    } else if (direction.y < 0) {

        maxDistance =
            Math.min(
                maxDistance,
                -localPlayer.y /
                direction.y
            );

    }


    maxDistance =
        clamp(
            maxDistance,
            70,
            400
        );


    localPlayer.hook.active =
        true;

    localPlayer.hook.x =
        localPlayer.x +
        direction.x *
        maxDistance;

    localPlayer.hook.y =
        localPlayer.y +
        direction.y *
        maxDistance;

    localPlayer.hook.life =
        localPlayer.hook.maxLife;

}


function updateHook(dt) {

    if (
        !localPlayer ||
        !localPlayer.hook.active
    ) {
        return;
    }


    localPlayer.hook.life -=
        dt;


    if (
        localPlayer.hook.life <= 0
    ) {

        localPlayer.hook.active =
            false;

        return;

    }


    const dx =
        localPlayer.hook.x -
        localPlayer.x;

    const dy =
        localPlayer.hook.y -
        localPlayer.y;


    const distance =
        Math.hypot(
            dx,
            dy
        );


    if (distance < 18) {

        localPlayer.hook.active =
            false;

        return;

    }


    const direction =
        normalize(
            dx,
            dy
        );


    const hookSpeed = 620;


    localPlayer.x +=
        direction.x *
        hookSpeed *
        dt;

    localPlayer.y +=
        direction.y *
        hookSpeed *
        dt;


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

        const bullet =
            bullets[i];


        bullet.x +=
            bullet.vx *
            dt;

        bullet.y +=
            bullet.vy *
            dt;

        bullet.life -=
            dt;


        if (
            bullet.life <= 0 ||
            bullet.x < -30 ||
            bullet.x > W + 30 ||
            bullet.y < -30 ||
            bullet.y > H + 30
        ) {

            bullets.splice(i, 1);

            continue;

        }


        if (
            bullet.owner !== playerId &&
            localPlayer
        ) {

            const distance =
                Math.hypot(
                    bullet.x -
                    localPlayer.x,

                    bullet.y -
                    localPlayer.y
                );


            if (
                distance <
                localPlayer.radius + 4
            ) {

                bullets.splice(i, 1);

                applyDamage(
                    10
                );

            }

        }

    }


    for (
        let i = remoteBullets.length - 1;
        i >= 0;
        i--
    ) {

        const bullet =
            remoteBullets[i];


        bullet.x +=
            bullet.vx *
            dt;

        bullet.y +=
            bullet.vy *
            dt;

        bullet.life -=
            dt;


        if (
            bullet.life <= 0
        ) {

            remoteBullets.splice(i, 1);

        }

    }

}


function applyDamage(amount) {

    if (
        !localPlayer ||
        gameOver
    ) {
        return;
    }


    localPlayer.hp =
        clamp(
            localPlayer.hp -
            amount,
            0,
            100
        );


    pendingDamage +=
        amount;


    createParticles(
        localPlayer.x,
        localPlayer.y,
        "#ff6d7f",
        10
    );


    updateHud();


    if (
        localPlayer.hp <= 0
    ) {

        localPlayer.hp = 0;

        sendLocalState(true);

        finishDeath();

    }

}


async function finishDeath() {

    if (gameOver) {
        return;
    }


    gameOver = true;


    if (!isHost) {
        return;
    }


    const winner =
        "player1";


    try {

        await update(
            ref(
                db,
                `rooms/${roomId}/game`
            ),
            {

                status: "finished",

                winner,

                time: 0,

                finishedAt: Date.now()

            }
        );

    } catch (error) {

        console.error(
            error
        );

    }

}


function processRemoteShot(shot) {

    if (
        !localPlayer ||
        gameOver
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


    const distance =
        Math.hypot(
            localPlayer.x -
            closestX,

            localPlayer.y -
            closestY
        );


    if (
        distance <=
        localPlayer.radius + 5
    ) {

        applyDamage(10);

    }


    createParticles(
        closestX,
        closestY,
        "#ffffff",
        3
    );

}


function createParticles(
    x,
    y,
    color,
    count
) {

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            30 +
            Math.random() *
            140;


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
                .2 +
                Math.random() *
                .35,

            maxLife: .55,

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
            p.vx *
            dt;

        p.y +=
            p.vy *
            dt;


        p.vx *=
            Math.pow(
                .02,
                dt
            );

        p.vy *=
            Math.pow(
                .02,
                dt
            );


        p.life -=
            dt;


        if (
            p.life <= 0
        ) {

            particles.splice(
                i,
                1
            );

        }

    }

}


async function sendLocalState(
    force = false
) {

    if (
        !roomId ||
        !db ||
        !localPlayer
    ) {
        return;
    }


    const dx =
        localPlayer.x -
        lastSentX;

    const dy =
        localPlayer.y -
        lastSentY;

    const da =
        Math.abs(
            localPlayer.angle -
            lastSentAngle
        );


    const changed =
        force ||
        Math.abs(dx) > 2 ||
        Math.abs(dy) > 2 ||
        da > .025 ||
        localPlayer.hp !==
            lastSentHp;


    if (!changed) {
        return;
    }


    const path =
        isHost
            ? "player1"
            : "player2";


    lastSentX =
        localPlayer.x;

    lastSentY =
        localPlayer.y;

    lastSentAngle =
        localPlayer.angle;

    lastSentHp =
        localPlayer.hp;


    try {

        await update(
            ref(
                db,
                `rooms/${roomId}/players/${path}`
            ),
            {

                x:
                    Math.round(
                        localPlayer.x *
                        10
                    ) / 10,

                y:
                    Math.round(
                        localPlayer.y *
                        10
                    ) / 10,

                angle:
                    localPlayer.angle,

                hp:
                    localPlayer.hp,

                timestamp:
                    Date.now()

            }
        );

    } catch (error) {

        console.error(
            "Network:",
            error
        );

    }

}


function updateOpponent(data) {

    if (
        !data ||
        !opponent
    ) {
        return;
    }


    opponentTarget.x =
        Number(data.x) ||
        opponentTarget.x;

    opponentTarget.y =
        Number(data.y) ||
        opponentTarget.y;

    opponentTarget.angle =
        Number(data.angle) ||
        opponentTarget.angle;

    opponentTarget.hp =
        typeof data.hp === "number"
            ? data.hp
            : opponentTarget.hp;


    if (
        Math.abs(
            opponentTarget.x -
            opponent.x
        ) > 180 ||
        Math.abs(
            opponentTarget.y -
            opponent.y
        ) > 180
    ) {

        opponent.x =
            opponentTarget.x;

        opponent.y =
            opponentTarget.y;

    }


    lastRemoteX =
        opponentTarget.x;

    lastRemoteY =
        opponentTarget.y;

    lastRemoteAngle =
        opponentTarget.angle;

}


function interpolateOpponent(dt) {

    if (!opponent) {
        return;
    }


    const smooth =
        1 -
        Math.pow(
            .0001,
            dt
        );


    opponent.x =
        lerp(
            opponent.x,
            opponentTarget.x,
            smooth
        );

    opponent.y =
        lerp(
            opponent.y,
            opponentTarget.y,
            smooth
        );

    opponent.angle =
        angleLerp(
            opponent.angle,
            opponentTarget.angle,
            smooth
        );

    opponent.hp =
        lerp(
            opponent.hp,
            opponentTarget.hp,
            Math.min(
                1,
                dt * 12
            )
        );

}


function setupFirebase() {

    if (
        !roomId ||
        !db
    ) {
        return;
    }


    const opponentPath =
        isHost
            ? "player2"
            : "player1";


    opponentUnsubscribe =
        onValue(
            ref(
                db,
                `rooms/${roomId}/players/${opponentPath}`
            ),
            snapshot => {

                if (
                    snapshot.exists()
                ) {

                    updateOpponent(
                        snapshot.val()
                    );

                }

            }
        );


    roomUnsubscribe =
        onValue(
            ref(
                db,
                `rooms/${roomId}`
            ),
            snapshot => {

                if (
                    !snapshot.exists()
                ) {

                    showGameResult(
                        "SERVER CLOSED",
                        "The server was closed."
                    );

                    return;

                }


                const room =
                    snapshot.val();


                if (
                    room.status ===
                    "playing"
                ) {

                    if (
                        room.startedAt &&
                        !remoteGameStartTime
                    ) {

                        remoteGameStartTime =
                            room.startedAt;

                        if (!gameStartTime) {
                            gameStartTime =
                                room.startedAt;
                        }

                    }

                    statusEl.textContent =
                        "FIGHT";

                }


                const game =
                    room.game;


                if (
                    game &&
                    game.status ===
                    "finished"
                ) {

                    finishFromFirebase(
                        game.winner
                    );

                }

            }
        );


    shotUnsubscribe =
        onChildAdded(
            ref(
                db,
                `rooms/${roomId}/shots`
            ),
            snapshot => {

                const shot =
                    snapshot.val();


                if (
                    !shot ||
                    shot.owner ===
                    playerId
                ) {
                    return;
                }


                processRemoteShot(
                    shot
                );

            }
        );

}


function getTimeLeft() {

    if (!gameStartTime) {
        return ROUND_TIME;
    }


    return clamp(
        ROUND_TIME -
        (
            Date.now() -
            gameStartTime
        ) / 1000,
        0,
        ROUND_TIME
    );

}


let hostFinishSent = false;


async function hostTick() {

    if (
        !isHost ||
        !started ||
        gameOver ||
        !db
    ) {
        return;
    }


    const timeLeft =
        getTimeLeft();


    if (
        timeLeft <= 0 &&
        !hostFinishSent
    ) {

        hostFinishSent =
            true;


        let winner = null;


        if (
            localPlayer.hp >
            opponentTarget.hp
        ) {

            winner =
                "player1";

        } else if (
            opponentTarget.hp >
            localPlayer.hp
        ) {

            winner =
                "player2";

        }


        try {

            await update(
                ref(
                    db,
                    `rooms/${roomId}/game`
                ),
                {

                    status:
                        "finished",

                    winner,

                    time: 0,

                    finishedAt:
                        Date.now()

                }
            );

        } catch (error) {

            console.error(
                error
            );

        }

    }

}


let timeNetworkTimer = 0;


function updateNetwork(dt) {

    networkTimer += dt;


    if (
        networkTimer >=
        NETWORK_RATE
    ) {

        networkTimer = 0;

        sendLocalState();

    }


    timeNetworkTimer += dt;


    if (
        isHost &&
        timeNetworkTimer >= .25
    ) {

        timeNetworkTimer = 0;

        hostTick();

    }

}


function updateTimer() {

    const time =
        getTimeLeft();


    timeEl.textContent =
        time.toFixed(1);


    if (
        time <= 5
    ) {

        timeEl.style.color =
            "#ff6d7f";

    } else {

        timeEl.style.color =
            "";

    }

}


function updateHud() {

    if (
        !localPlayer ||
        !opponent
    ) {
        return;
    }


    const localHp =
        clamp(
            localPlayer.hp,
            0,
            100
        );

    const enemyHp =
        clamp(
            opponent.hp,
            0,
            100
        );


    p1HpText.textContent =
        Math.ceil(localHp);

    p2HpText.textContent =
        Math.ceil(enemyHp);


    p1Health.style.width =
        `${localHp}%`;

    p2Health.style.width =
        `${enemyHp}%`;

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


    const gridSize = 40;


    for (
        let x = 0;
        x <= W;
        x += gridSize
    ) {

        ctx.beginPath();

        ctx.moveTo(
            x,
            0
        );

        ctx.lineTo(
            x,
            H
        );

        ctx.stroke();

    }


    for (
        let y = 0;
        y <= H;
        y += gridSize
    ) {

        ctx.beginPath();

        ctx.moveTo(
            0,
            y
        );

        ctx.lineTo(
            W,
            y
        );

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
    local
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


    if (local) {

        ctx.strokeStyle =
            "rgba(255,255,255,.2)";

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

    for (
        const bullet of bullets
    ) {

        ctx.fillStyle =
            "#ffffff";

        ctx.shadowBlur = 10;

        ctx.shadowColor =
            "#ffffff";


        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            4,
            0,
            Math.PI * 2
        );

        ctx.fill();

    }


    for (
        const bullet of remoteBullets
    ) {

        ctx.fillStyle =
            "#ff6d7f";

        ctx.shadowBlur = 10;

        ctx.shadowColor =
            "#ff6d7f";


        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            4,
            0,
            Math.PI * 2
        );

        ctx.fill();

    }


    ctx.shadowBlur = 0;

}


function drawParticles() {

    for (
        const p of particles
    ) {

        const alpha =
            clamp(
                p.life /
                p.maxLife,
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
        "rgba(103,167,255,.85)";

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

    ctx.shadowBlur = 15;

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

    ctx.strokeStyle =
        "rgba(255,255,255,.75)";

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


function showGameResult(
    title,
    text
) {

    if (gameOver) {
        return;
    }


    gameOver = true;


    resultTitle.textContent =
        title;

    resultText.textContent =
        text;

    overlay.classList.add(
        "show"
    );

}


function finishFromFirebase(
    winner
) {

    if (gameOver) {
        return;
    }


    let title;
    let text;


    if (!winner) {

        title = "DRAW";

        text =
            "Time is over.";

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

            text =
                "You won the duel.";

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


function frame(now) {

    const dt =
        Math.min(
            .033,
            (now - lastFrame) /
            1000
        );


    lastFrame = now;


    if (
        started &&
        !gameOver
    ) {

        updateAim();

        updateMovement(dt);

        updateHook(dt);

        updateBullets(dt);

        interpolateOpponent(dt);

        updateParticles(dt);

        updateNetwork(dt);

        updateTimer();

        updateHud();

    } else {

        updateParticles(dt);

    }


    render();


    requestAnimationFrame(
        frame
    );

}


window.addEventListener(
    "duel-game-start",
    event => {

        const data =
            event.detail;


        roomId =
            data.roomId;

        playerId =
            data.playerId;

        isHost =
            data.isHost;

        db =
            window.duelRoom
                .getDatabase();


        resetGame();


        gameStartTime =
            Date.now();


        remoteGameStartTime =
            gameStartTime;


        started = true;


        setupFirebase();


        sendLocalState(
            true
        );

    }
);


backToMenu.addEventListener(
    "click",
    async () => {

        if (
            roomId &&
            db
        ) {

            try {

                await remove(
                    ref(
                        db,
                        `rooms/${roomId}/shots`
                    )
                );

            } catch {}

        }


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


window.addEventListener(
    "blur",
    () => {

        keys.clear();

        mouse.down = false;

        mouse.rightDown = false;

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
    30
);


requestAnimationFrame(
    frame
);