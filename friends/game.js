let initializeApp;
let getDatabase;
let ref;
let set;
let get;
let update;
let onValue;
let onDisconnect;
let remove;

let db = null;
let firebaseReady = false;

async function loadFirebase() {
    try {
        const firebaseApp =
            await import(
                "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js"
            );

        const firebaseDatabase =
            await import(
                "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js"
            );

        initializeApp =
            firebaseApp.initializeApp;

        getDatabase =
            firebaseDatabase.getDatabase;

        ref =
            firebaseDatabase.ref;

        set =
            firebaseDatabase.set;

        get =
            firebaseDatabase.get;

        update =
            firebaseDatabase.update;

        onValue =
            firebaseDatabase.onValue;

        onDisconnect =
            firebaseDatabase.onDisconnect;

        remove =
            firebaseDatabase.remove;

        const firebaseConfig = {
            apiKey: "AIzaSyA2wzPsyM6XBfbOxUP7JdCrWDyDmB8os",
            authDomain: "friends-66f85.firebaseapp.com",
            databaseURL: "https://friends-66f85-default-rtdb.firebaseio.com",
            projectId: "friends-66f85",
            storageBucket: "friends-66f85.firebasestorage.app",
            messagingSenderId: "841738224372",
            appId: "1:841738224372:web:92954bc9f16d69b176d4a1"
        };

        const app =
            initializeApp(firebaseConfig);

        db =
            getDatabase(app);

        firebaseReady = true;

        console.log(
            "Firebase connected"
        );

    } catch (error) {

        console.error(
            "Firebase loading error:",
            error
        );

        setLobbyStatus(
            "Firebase не загрузился. BOT всё равно доступен."
        );
    }
}

const firebaseConfig = {
    apiKey: "AIzaSyA2wzPsy6M1XBfbOxUP7JdCrWDyDmB8os",
    authDomain: "friends-66f85.firebaseapp.com",
    databaseURL: "https://friends-66f85-default-rtdb.firebaseio.com",
    projectId: "friends-66f85",
    storageBucket: "friends-66f85.firebasestorage.app",
    messagingSenderId: "841738224372",
    appId: "1:841738224372:web:92954bc9f16d69b176d4a1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const lobby = document.getElementById("lobby");
const createRoomButton = document.getElementById("createRoom");
const joinRoomButton = document.getElementById("joinRoom");
const playBotButton = document.getElementById("playBot");

const joinCodeInput =
    document.getElementById("joinCode");

const createdRoom =
    document.getElementById("createdRoom");

const roomCodeElement =
    document.getElementById("roomCode");

const copyCodeButton =
    document.getElementById("copyCode");

const waitingText =
    document.getElementById("waitingText");

const lobbyStatus =
    document.getElementById("lobbyStatus");

const timeEl =
    document.getElementById("time");

const statusEl =
    document.getElementById("status");

const overlay =
    document.getElementById("overlay");

const resultTitle =
    document.getElementById("resultTitle");

const resultText =
    document.getElementById("resultText");

const restartButton =
    document.getElementById("restart");

const backToLobbyButton =
    document.getElementById("backToLobby");

const p1HpText =
    document.getElementById("p1HpText");

const p2HpText =
    document.getElementById("p2HpText");

const p1Health =
    document.getElementById("p1Health");

const p2Health =
    document.getElementById("p2Health");

const enemyName =
    document.getElementById("enemyName");

const W = canvas.width;
const H = canvas.height;

const keys = new Set();

const mouse = {
    x: W / 2,
    y: H / 2,
    down: false
};

const playerId =
    crypto.randomUUID();

let roomCode = null;
let host = false;
let opponentId = null;

let roomUnsubscribe = null;
let shotsUnsubscribe = null;

let state = null;

let lastTime =
    performance.now();

let lastNetworkUpdate = 0;

let shotCounter = 0;

const remote = {
    x: W - 130,
    y: H / 2,
    hp: 100,
    r: 17,
    targetX: W - 130,
    targetY: H / 2,
    hurt: 0,
    recoil: 0
};

playBotButton.addEventListener(
    "click",
    () => {
        startBot();
    }
);

createRoomButton.addEventListener(
    "click",
    () => {
        if (!firebaseReady) {
            setLobbyStatus(
                "Firebase ещё загружается..."
            );
            return;
        }

        createRoom();
    }
);

joinRoomButton.addEventListener(
    "click",
    () => {
        if (!firebaseReady) {
            setLobbyStatus(
                "Firebase ещё загружается..."
            );
            return;
        }

        joinRoom();
    }
);

loadFirebase();

function clamp(v, min, max) {
    return Math.max(
        min,
        Math.min(max, v)
    );
}

function distance(a, b) {
    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}

function createPlayer(
    x,
    y,
    color,
    dir
) {
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

function createState(mode) {

    const playerIsLeft =
        mode === "bot" ||
        host;

    state = {

        mode,

        running: true,

        time: 30,

        bullets: [],

        particles: [],

        remoteBullets: [],

        flash: 0,

        hookCooldown: 0,

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

            restLength: 260
        },

        p1:
            playerIsLeft
                ? createPlayer(
                    130,
                    H / 2,
                    "#67a7ff",
                    1
                )
                : createPlayer(
                    W - 130,
                    H / 2,
                    "#67a7ff",
                    -1
                ),

        p2:
            playerIsLeft
                ? createPlayer(
                    W - 130,
                    H / 2,
                    "#ff6d7f",
                    -1
                )
                : createPlayer(
                    130,
                    H / 2,
                    "#ff6d7f",
                    1
                ),

        aiFireClock: 0,

        aiMoveClock: 0,

        aiStrafe: 1
    };

    remote.x =
        state.p2.x;

    remote.y =
        state.p2.y;

    remote.targetX =
        state.p2.x;

    remote.targetY =
        state.p2.y;

    remote.hp =
        100;

    mouse.x =
        W / 2;

    mouse.y =
        H / 2;

    mouse.down = false;

    overlay.classList.remove("show");

    updateHud();
}

function generateRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (let i = 0; i < 6; i++) {

        result +=
            chars[
                Math.floor(
                    Math.random() *
                    chars.length
                )
            ];
    }

    return result;
}

function setLobbyStatus(text) {
    lobbyStatus.textContent =
        text;
}

async function createRoom() {

    createRoomButton.disabled = true;

    setLobbyStatus(
        "Создание комнаты..."
    );

    try {

        let code;
        let snapshot;

        do {

            code =
                generateRoomCode();

            snapshot =
                await get(
                    ref(
                        db,
                        `rooms/${code}`
                    )
                );

        } while (
            snapshot.exists()
        );

        roomCode = code;
        host = true;

        await set(
            ref(
                db,
                `rooms/${roomCode}`
            ),
            {
                host: playerId,

                guest: null,

                status: "waiting",

                time: 30,

                createdAt:
                    Date.now(),

                players: {

                    [playerId]: {

                        x: 130,

                        y: H / 2,

                        hp: 100,

                        r: 17,

                        ready: true
                    }
                }
            }
        );

        await onDisconnect(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            )
        ).remove();

        roomCodeElement.textContent =
            roomCode;

        createdRoom.classList.remove(
            "hidden"
        );

        waitingText.textContent =
            "Ждём второго игрока...";

        setLobbyStatus(
            "Отправь этот код другу."
        );

        listenRoom();

    } catch (error) {

        console.error(error);

        setLobbyStatus(
            "Ошибка Firebase: " +
            error.message
        );

        createRoomButton.disabled =
            false;
    }
}

async function joinRoom() {

    const code =
        joinCodeInput.value
            .trim()
            .toUpperCase();

    if (code.length !== 6) {

        setLobbyStatus(
            "Код должен содержать 6 символов."
        );

        return;
    }

    joinRoomButton.disabled =
        true;

    setLobbyStatus(
        "Поиск комнаты..."
    );

    try {

        const roomRef =
            ref(
                db,
                `rooms/${code}`
            );

        const snapshot =
            await get(roomRef);

        if (!snapshot.exists()) {

            setLobbyStatus(
                "Такой комнаты нет."
            );

            joinRoomButton.disabled =
                false;

            return;
        }

        const room =
            snapshot.val();

        if (room.guest) {

            setLobbyStatus(
                "Комната уже заполнена."
            );

            joinRoomButton.disabled =
                false;

            return;
        }

        roomCode =
            code;

        host = false;

        opponentId =
            room.host;

        await update(
            roomRef,
            {
                guest: playerId,

                status: "playing",

                players: {

                    ...(
                        room.players || {}
                    ),

                    [playerId]: {

                        x:
                            W - 130,

                        y:
                            H / 2,

                        hp: 100,

                        r: 17,

                        ready: true
                    }
                }
            }
        );

        await onDisconnect(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            )
        ).remove();

        enemyName.textContent =
            "PLAYER";

        lobby.style.display =
            "none";

        createState("online");

        listenRoom();
        listenShots();

        setLobbyStatus("");

    } catch (error) {

        console.error(error);

        setLobbyStatus(
            "Ошибка: " +
            error.message
        );

        joinRoomButton.disabled =
            false;
    }
}

function startBot() {

    roomCode = null;
    opponentId = null;
    host = false;

    if (roomUnsubscribe)
        roomUnsubscribe();

    if (shotsUnsubscribe)
        shotsUnsubscribe();

    enemyName.textContent =
        "BOT";

    lobby.style.display =
        "none";

    createState("bot");

    statusEl.textContent =
        "BOT";
}

function listenRoom() {

    if (!roomCode)
        return;

    if (roomUnsubscribe)
        roomUnsubscribe();

    const roomRef =
        ref(
            db,
            `rooms/${roomCode}`
        );

    roomUnsubscribe =
        onValue(
            roomRef,
            snapshot => {

                if (!snapshot.exists()) {

                    if (
                        state &&
                        state.mode ===
                        "online"
                    ) {

                        finish(
                            "Комната была закрыта.",
                            "DISCONNECTED"
                        );
                    }

                    return;
                }

                const room =
                    snapshot.val();

                if (
                    !host &&
                    room.guest ===
                    playerId
                ) {

                    opponentId =
                        room.host;
                }

                if (
                    host &&
                    room.guest
                ) {

                    opponentId =
                        room.guest;

                    if (
                        !state ||
                        state.mode !==
                        "online"
                    ) {

                        createState(
                            "online"
                        );

                        enemyName.textContent =
                            "PLAYER";

                        lobby.style.display =
                            "none";

                        listenShots();
                    }

                    waitingText.textContent =
                        "Игрок подключён!";

                    statusEl.textContent =
                        "ROUND 1";
                }

                if (
                    room.status ===
                    "waiting"
                ) {

                    statusEl.textContent =
                        "WAITING";

                    return;
                }

                if (
                    !state ||
                    state.mode !==
                    "online"
                )
                    return;

                const players =
                    room.players || {};

                const enemy =
                    players[
                        opponentId
                    ];

                if (enemy) {

                    remote.targetX =
                        Number(
                            enemy.x
                        );

                    remote.targetY =
                        Number(
                            enemy.y
                        );

                    remote.hp =
                        Number(
                            enemy.hp
                        );

                    remote.r =
                        Number(
                            enemy.r ||
                            17
                        );

                    state.p2.hp =
                        remote.hp;

                    state.p2.r =
                        remote.r;
                }

                if (
                    room.status ===
                    "finished"
                ) {

                    if (
                        room.winner ===
                        "draw"
                    ) {

                        finish(
                            "Оба игрока потеряли всё HP.",
                            "DRAW"
                        );

                    } else if (
                        room.winner ===
                        playerId
                    ) {

                        finish(
                            "Противник выбыл из раунда.",
                            "YOU WIN"
                        );

                    } else {

                        finish(
                            "Ты выбыл из раунда.",
                            "YOU LOSE"
                        );
                    }
                }
            }
        );
}

function listenShots() {

    if (!roomCode)
        return;

    if (shotsUnsubscribe)
        shotsUnsubscribe();

    const shotsRef =
        ref(
            db,
            `rooms/${roomCode}/shots`
        );

    shotsUnsubscribe =
        onValue(
            shotsRef,
            snapshot => {

                state.remoteBullets =
                    [];

                if (!snapshot.exists())
                    return;

                const shots =
                    snapshot.val();

                for (
                    const id in shots
                ) {

                    const shot =
                        shots[id];

                    if (
                        shot.owner ===
                        playerId
                    )
                        continue;

                    state.remoteBullets.push({

                        x:
                            Number(
                                shot.x
                            ),

                        y:
                            Number(
                                shot.y
                            ),

                        vx:
                            Number(
                                shot.vx
                            ),

                        vy:
                            Number(
                                shot.vy
                            ),

                        life: 1.6
                    });
                }
            }
        );
}

async function sendPlayerState() {

    if (
        !roomCode ||
        !state ||
        state.mode !==
        "online"
    )
        return;

    const now =
        performance.now();

    if (
        now -
        lastNetworkUpdate <
        40
    )
        return;

    lastNetworkUpdate =
        now;

    try {

        await update(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            ),
            {

                x:
                    state.p1.x,

                y:
                    state.p1.y,

                hp:
                    state.p1.hp,

                r:
                    state.p1.r,

                dir:
                    state.p1.dir,

                lastUpdate:
                    Date.now()
            }
        );

    } catch (error) {

        console.error(
            "Network update:",
            error
        );
    }
}

async function sendShot(bullet) {

    if (
        !roomCode ||
        state.mode !==
        "online"
    )
        return;

    const id =
        `${playerId}_${++shotCounter}`;

    try {

        await set(
            ref(
                db,
                `rooms/${roomCode}/shots/${id}`
            ),
            {

                owner:
                    playerId,

                x:
                    bullet.x,

                y:
                    bullet.y,

                vx:
                    bullet.vx,

                vy:
                    bullet.vy,

                createdAt:
                    Date.now()
            }
        );

    } catch (error) {

        console.error(
            "Shot sync:",
            error
        );
    }
}

async function finishOnline(
    winner
) {

    if (
        !roomCode ||
        !host
    )
        return;

    await update(
        ref(
            db,
            `rooms/${roomCode}`
        ),
        {
            status:
                "finished",

            winner
        }
    );
}

function arenaBounds(p) {

    p.x =
        clamp(
            p.x,
            42 + p.r,
            W - 42 - p.r
        );

    p.y =
        clamp(
            p.y,
            42 + p.r,
            H - 42 - p.r
        );
}

function canShoot(p) {

    return (
        p.cooldown <= 0 &&
        state &&
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

    const ox =
        x - cx;

    const oy =
        y - cy;

    const b =
        ox * dx +
        oy * dy;

    const c =
        ox * ox +
        oy * oy -
        r * r;

    const h =
        b * b -
        c;

    if (h < 0)
        return Infinity;

    const s =
        Math.sqrt(h);

    const t1 =
        -b - s;

    const t2 =
        -b + s;

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

    let t =
        Infinity;

    if (dx < -.0001)
        t =
            Math.min(
                t,
                (left - x) / dx
            );

    if (dx > .0001)
        t =
            Math.min(
                t,
                (right - x) / dx
            );

    if (dy < -.0001)
        t =
            Math.min(
                t,
                (top - y) / dy
            );

    if (dy > .0001)
        t =
            Math.min(
                t,
                (bottom - y) / dy
            );

    return Math.max(
        0,
        t
    );
}

function createHookBend(
    sx,
    sy,
    ex,
    ey
) {

    const dx =
        ex - sx;

    const dy =
        ey - sy;

    const d =
        Math.max(
            1,
            Math.hypot(
                dx,
                dy
            )
        );

    const strength =
        clamp(
            38 -
            d * .045,
            5,
            38
        );

    const points = [];

    for (
        let i = 1;
        i < 12;
        i++
    ) {

        const t =
            i / 12;

        points.push({

            t,

            offset:
                (
                    Math.random() -
                    .5
                ) *
                2 *
                strength *
                Math.sin(
                    Math.PI * t
                ),

            wave:
                .55 +
                Math.random() *
                1.45,

            phase:
                Math.random() *
                Math.PI *
                2
        });
    }

    return points;
}

function hookImpact(
    x,
    y
) {

    for (
        let i = 0;
        i < 18;
        i++
    ) {

        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            80 +
            Math.random() *
            240;

        state.particles.push({

            x,
            y,

            vx:
                Math.cos(angle) *
                speed,

            vy:
                Math.sin(angle) *
                speed,

            life:
                .22 +
                Math.random() *
                .32,

            size:
                2 +
                Math.random() *
                3
        });
    }

    state.flash =
        .08;
}

function launchHook(
    targetX,
    targetY
) {

    if (
        !state ||
        !state.running ||
        state.hookCooldown > 0
    )
        return;

    const p =
        state.p1;

    let dx =
        targetX -
        p.x;

    let dy =
        targetY -
        p.y;

    const distance =
        Math.max(
            .001,
            Math.hypot(
                dx,
                dy
            )
        );

    dx /= distance;
    dy /= distance;

    const wallDistance =
        Math.min(
            820,
            rayWallDistance(
                p.x,
                p.y,
                dx,
                dy
            )
        );

    const enemy =
        state.mode ===
        "online"
            ? {
                x:
                    remote.x,

                y:
                    remote.y,

                r:
                    remote.r
            }
            : state.p2;

    const enemyDistance =
        rayCircleDistance(
            p.x,
            p.y,
            dx,
            dy,
            enemy.x,
            enemy.y,
            enemy.r + 6
        );

    const hitsEnemy =
        enemyDistance <=
        wallDistance &&
        enemyDistance <=
        820;

    const hitDistance =
        hitsEnemy
            ? enemyDistance
            : wallDistance;

    const endX =
        p.x +
        dx *
        hitDistance;

    const endY =
        p.y +
        dy *
        hitDistance;

    state.hookCooldown =
        2;

    state.hook.active =
        true;

    state.hook.mode =
        hitsEnemy
            ? "player"
            : "wall";

    state.hook.age =
        0;

    state.hook.startX =
        p.x;

    state.hook.startY =
        p.y;

    state.hook.endX =
        endX;

    state.hook.endY =
        endY;

    state.hook.x =
        endX;

    state.hook.y =
        endY;

    state.hook.power =
        clamp(
            .9 +
            Math.pow(
                Math.max(
                    40,
                    hitDistance
                ) / 360,
                1.2
            ),
            1.05,
            3.4
        );

    state.hook.restLength =
        Math.max(
            120,
            Math.min(
                500,
                hitDistance
            )
        );

    state.hook.bend =
        createHookBend(
            p.x,
            p.y,
            endX,
            endY
        );

    if (hitsEnemy) {

        const ex =
            enemy.x -
            p.x;

        const ey =
            enemy.y -
            p.y;

        const d =
            Math.max(
                1,
                Math.hypot(
                    ex,
                    ey
                )
            );

        const ux =
            ex / d;

        const uy =
            ey / d;

        const force =
            720 *
            state.hook.power;

        p.hookVx =
            ux *
            force *
            .86;

        p.hookVy =
            uy *
            force *
            .86;

        if (
            state.mode ===
            "bot"
        ) {

            state.p2.hookVx =
                -ux *
                force;

            state.p2.hookVy =
                -uy *
                force;
        }

        hookImpact(
            enemy.x,
            enemy.y
        );
    } else {

        const force =
            570 *
            state.hook.power;

        p.hookVx =
            dx *
            force;

        p.hookVy =
            dy *
            force;

        hookImpact(
            endX,
            endY
        );
    }
}

function updateHook(dt) {

    state.hookCooldown =
        Math.max(
            0,
            state.hookCooldown -
            dt
        );

    if (
        !state.hook.active
    ) {

        state.p1.hookVx *=
            Math.exp(
                -1.35 * dt
            );

        state.p1.hookVy *=
            Math.exp(
                -1.35 * dt
            );

        return;
    }

    state.hook.age +=
        dt;

    if (
        state.hook.mode ===
        "player"
    ) {

        state.hook.endX =
            state.mode ===
            "online"
                ? remote.x
                : state.p2.x;

        state.hook.endY =
            state.mode ===
            "online"
                ? remote.y
                : state.p2.y;

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

        const ux =
            dx / distance;

        const uy =
            dy / distance;

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

        if (
            state.mode ===
            "bot"
        ) {

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
        }

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

        const ux =
            dx / distance;

        const uy =
            dy / distance;

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

        state.hook.active =
            false;
    }

    state.p1.hookVx *=
        Math.exp(
            -1.35 * dt
        );

    state.p1.hookVy *=
        Math.exp(
            -1.35 * dt
        );

    if (
        state.mode ===
        "bot"
    ) {

        state.p2.hookVx *=
            Math.exp(
                -1.35 * dt
            );

        state.p2.hookVy *=
            Math.exp(
                -1.35 * dt
            );
    }
}

async function shoot(
    shooter,
    targetX,
    targetY
) {

    if (
        !canShoot(shooter)
    )
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
            Math.hypot(
                dx,
                dy
            )
        );

    dx /= d;
    dy /= d;

    shooter.dir =
        dx >= 0
            ? 1
            : -1;

    shooter.cooldown =
        1;

    shooter.recoil =
        .12;

    const bullet = {

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

        life:
            1.6,

        owner:
            shooter
    };

    state.bullets.push(
        bullet
    );

    if (
        state.mode ===
        "online" &&
        shooter ===
        state.p1
    ) {

        await sendShot(
            bullet
        );
    }

    for (
        let i = 0;
        i < 5;
        i++
    ) {

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
                    Math.random() *
                    120
                ),

            vy:
                dy *
                (
                    120 +
                    Math.random() *
                    120
                ),

            life:
                .18 +
                Math.random() *
                .16,

            size:
                2 +
                Math.random() *
                2
        });
    }
}

function damageLocal(
    target,
    amount
) {

    target.hp =
        Math.max(
            0,
            target.hp -
            amount
        );

    target.hurt =
        .14;

    state.flash =
        .08;

    updateHud();
}

async function updatePlayer(dt) {

    let dx = 0;
    let dy = 0;

    if (
        keys.has("w") ||
        keys.has("arrowup")
    )
        dy--;

    if (
        keys.has("s") ||
        keys.has("arrowdown")
    )
        dy++;

    if (
        keys.has("a") ||
        keys.has("arrowleft")
    )
        dx--;

    if (
        keys.has("d") ||
        keys.has("arrowright")
    )
        dx++;

    const d =
        Math.hypot(
            dx,
            dy
        ) || 1;

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

    arenaBounds(
        state.p1
    );

    state.p1.cooldown =
        Math.max(
            0,
            state.p1.cooldown -
            dt
        );

    state.p1.hurt =
        Math.max(
            0,
            state.p1.hurt -
            dt
        );

    state.p1.recoil =
        Math.max(
            0,
            state.p1.recoil -
            dt
        );

    if (
        mouse.down
    ) {

        shoot(
            state.p1,
            mouse.x,
            mouse.y
        );
    }
}

function updateBot(dt) {

    const bot =
        state.p2;

    const player =
        state.p1;

    bot.cooldown =
        Math.max(
            0,
            bot.cooldown -
            dt
        );

    bot.hurt =
        Math.max(
            0,
            bot.hurt -
            dt
        );

    bot.recoil =
        Math.max(
            0,
            bot.recoil -
            dt
        );

    bot.x +=
        bot.hookVx *
        dt;

    bot.y +=
        bot.hookVy *
        dt;

    const dx =
        player.x -
        bot.x;

    const dy =
        player.y -
        bot.y;

    const d =
        Math.max(
            1,
            Math.hypot(
                dx,
                dy
            )
        );

    state.aiMoveClock -=
        dt;

    if (
        state.aiMoveClock <=
        0
    ) {

        state.aiMoveClock =
            .7 +
            Math.random() *
            .9;

        state.aiStrafe *=
            -1;
    }

    const desired =
        d > 360
            ? 1
            : d < 235
                ? -1
                : 0;

    let mx =
        dx / d *
        desired -
        dy / d *
        state.aiStrafe *
        .72;

    let my =
        dy / d *
        desired +
        dx / d *
        state.aiStrafe *
        .72;

    const ml =
        Math.hypot(
            mx,
            my
        ) || 1;

    bot.x +=
        mx / ml *
        bot.speed *
        .72 *
        dt;

    bot.y +=
        my / ml *
        bot.speed *
        .72 *
        dt;

    arenaBounds(
        bot
    );

    state.aiFireClock -=
        dt;

    if (
        state.aiFireClock <=
        0 &&
        d < 620
    ) {

        state.aiFireClock =
            .32 +
            Math.random() *
            .38;

        shoot(
            bot,
            player.x,
            player.y
        );
    }
}

function updateRemote(dt) {

    if (
        state.mode !==
        "online"
    )
        return;

    remote.x +=
        (
            remote.targetX -
            remote.x
        ) *
        Math.min(
            1,
            dt * 15
        );

    remote.y +=
        (
            remote.targetY -
            remote.y
        ) *
        Math.min(
            1,
            dt * 15
        );

    remote.hurt =
        Math.max(
            0,
            remote.hurt -
            dt
        );

    state.p2.x =
        remote.x;

    state.p2.y =
        remote.y;

    state.p2.hp =
        remote.hp;

    state.p2.r =
        remote.r;
}

function updateBullets(dt) {

    for (
        let i =
            state.bullets.length - 1;

        i >= 0;

        i--
    ) {

        const bullet =
            state.bullets[i];

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
            bullet.x < 0 ||
            bullet.y < 0 ||
            bullet.x > W ||
            bullet.y > H
        ) {

            state.bullets.splice(
                i,
                1
            );

            continue;
        }

        if (
            state.mode ===
            "bot"
        ) {

            if (
                distance(
                    bullet,
                    state.p2
                ) <=
                state.p2.r + 5
            ) {

                damageLocal(
                    state.p2,
                    25
                );

                state.bullets.splice(
                    i,
                    1
                );
            }
        }
    }

    if (
        state.mode !==
        "online"
    )
        return;

    for (
        let i =
            state.remoteBullets.length - 1;

        i >= 0;

        i--
    ) {

        const bullet =
            state.remoteBullets[i];

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
            bullet.x < 0 ||
            bullet.y < 0 ||
            bullet.x > W ||
            bullet.y > H
        ) {

            state.remoteBullets.splice(
                i,
                1
            );

            continue;
        }

        if (
            distance(
                bullet,
                state.p1
            ) <=
            state.p1.r + 5
        ) {

            state.p1.hp =
                Math.max(
                    0,
                    state.p1.hp -
                    25
                );

            state.p1.hurt =
                .14;

            state.remoteBullets.splice(
                i,
                1
            );

            updateHud();

            if (
                state.p1.hp <= 0
            ) {

                finishOnline(
                    opponentId
                );
            }
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

        const particle =
            state.particles[i];

        particle.x +=
            particle.vx *
            dt;

        particle.y +=
            particle.vy *
            dt;

        particle.vx *=
            .92;

        particle.vy *=
            .92;

        particle.life -=
            dt;

        if (
            particle.life <=
            0
        ) {

            state.particles.splice(
                i,
                1
            );
        }
    }
}

function checkEnd() {

    if (
        state.p1.hp <= 0 &&
        state.p2.hp <= 0
    ) {

        if (
            state.mode ===
            "online"
        ) {

            finishOnline(
                "draw"
            );

        } else {

            finish(
                "Оба игрока потеряли всё HP.",
                "DRAW"
            );
        }

        return true;
    }

    if (
        state.p2.hp <= 0
    ) {

        if (
            state.mode ===
            "online"
        ) {

            finishOnline(
                playerId
            );

        } else {

            finish(
                "BOT выбыл из раунда.",
                "YOU WIN"
            );
        }

        return true;
    }

    if (
        state.p1.hp <= 0
    ) {

        if (
            state.mode ===
            "online"
        ) {

            finishOnline(
                opponentId
            );

        } else {

            finish(
                "Твой персонаж выбыл из раунда.",
                "YOU LOSE"
            );
        }

        return true;
    }

    if (
        state.time <= 0
    ) {

        if (
            state.p1.hp ===
            state.p2.hp
        ) {

            finish(
                "Время вышло — одинаковое HP.",
                "DRAW"
            );

        } else if (
            state.p1.hp >
            state.p2.hp
        ) {

            finish(
                "Время вышло — у тебя больше HP.",
                "YOU WIN"
            );

        } else {

            finish(
                "Время вышло — у противника больше HP.",
                "YOU LOSE"
            );
        }

        return true;
    }

    return false;
}

function finish(
    text,
    title
) {

    state.running =
        false;

    resultTitle.textContent =
        title;

    resultText.textContent =
        text;

    overlay.classList.add(
        "show"
    );
}

function updateHud() {

    if (!state)
        return;

    p1HpText.textContent =
        Math.ceil(
            state.p1.hp
        );

    p2HpText.textContent =
        Math.ceil(
            state.p2.hp
        );

    p1Health.style.width =
        state.p1.hp +
        "%";

    p2Health.style.width =
        state.p2.hp +
        "%";

    timeEl.textContent =
        Math.max(
            0,
            state.time
        ).toFixed(1);
}

function drawGrid() {

    ctx.fillStyle =
        "#0b1017";

    ctx.fillRect(
        0,
        0,
        W,
        H
    );

    ctx.strokeStyle =
        "rgba(125,150,190,.08)";

    ctx.lineWidth = 1;

    for (
        let x = 0;
        x <= W;
        x += 48
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
        y += 48
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
        "rgba(145,165,195,.28)";

    ctx.lineWidth = 2;

    ctx.strokeRect(
        40,
        40,
        W - 80,
        H - 80
    );

    ctx.setLineDash([
        7,
        9
    ]);

    ctx.strokeStyle =
        "rgba(145,165,195,.14)";

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
        "rgba(145,165,195,.055)";

    ctx.beginPath();

    ctx.arc(
        W / 2,
        H / 2,
        95,
        0,
        Math.PI * 2
    );

    ctx.fill();
}

function drawPlayer(player) {

    ctx.save();

    ctx.translate(
        player.x,
        player.y
    );

    const targetX =
        player === state.p1
            ? mouse.x
            : state.p1.x;

    const targetY =
        player === state.p1
            ? mouse.y
            : state.p1.y;

    const angle =
        Math.atan2(
            targetY -
            player.y,

            targetX -
            player.x
        );

    ctx.rotate(angle);

    ctx.fillStyle =
        "#161c25";

    ctx.fillRect(
        10 -
        player.recoil * 45,
        -4,
        20,
        8
    );

    ctx.restore();

    ctx.save();

    ctx.beginPath();

    ctx.arc(
        player.x,
        player.y,
        player.r,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        player.hurt > 0
            ? "#ffffff"
            : player.color;

    ctx.shadowColor =
        player.color;

    ctx.shadowBlur = 18;

    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.lineWidth = 3;

    ctx.strokeStyle =
        "rgba(255,255,255,.65)";

    ctx.stroke();

    ctx.restore();
}

function drawBullets() {

    for (
        const bullet of
        state.bullets
    ) {

        ctx.save();

        ctx.translate(
            bullet.x,
            bullet.y
        );

        ctx.rotate(
            Math.atan2(
                bullet.vy,
                bullet.vx
            )
        );

        ctx.fillStyle =
            "#9fc6ff";

        ctx.shadowColor =
            "#67a7ff";

        ctx.shadowBlur = 12;

        ctx.fillRect(
            -7,
            -2,
            14,
            4
        );

        ctx.restore();
    }

    for (
        const bullet of
        state.remoteBullets
    ) {

        ctx.save();

        ctx.translate(
            bullet.x,
            bullet.y
        );

        ctx.rotate(
            Math.atan2(
                bullet.vy,
                bullet.vx
            )
        );

        ctx.fillStyle =
            "#ffb1bb";

        ctx.shadowColor =
            "#ff6d7f";

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
        const particle of
        state.particles
    ) {

        ctx.globalAlpha =
            clamp(
                particle.life * 3,
                0,
                1
            );

        ctx.fillStyle =
            "#f4f7fb";

        ctx.fillRect(
            particle.x,
            particle.y,
            particle.size,
            particle.size
        );
    }

    ctx.globalAlpha = 1;
}

function drawCrosshair() {

    if (
        !state.running
    )
        return;

    ctx.save();

    ctx.translate(
        mouse.x,
        mouse.y
    );

    ctx.strokeStyle =
        state.p1.cooldown <= 0
            ? "rgba(255,255,255,.8)"
            : "rgba(255,255,255,.25)";

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

    if (
        !state.hook.active
    )
        return;

    const hook =
        state.hook;

    const life =
        clamp(
            1 -
            hook.age /
            hook.life,
            0,
            1
        );

    const dx =
        hook.endX -
        hook.startX;

    const dy =
        hook.endY -
        hook.startY;

    const d =
        Math.max(
            1,
            Math.hypot(
                dx,
                dy
            )
        );

    const nx =
        -dy / d;

    const ny =
        dx / d;

    const points = [
        {
            x:
                hook.startX,

            y:
                hook.startY
        }
    ];

    for (
        const bend of
        hook.bend
    ) {

        const wave =
            Math.sin(
                hook.age *
                (
                    4 +
                    bend.wave * 2
                ) +
                bend.phase
            ) *
            3 *
            Math.sin(
                Math.PI *
                bend.t
            );

        points.push({

            x:
                hook.startX +
                dx *
                bend.t +
                nx *
                (
                    bend.offset +
                    wave
                ),

            y:
                hook.startY +
                dy *
                bend.t +
                ny *
                (
                    bend.offset +
                    wave
                )
        });
    }

    points.push({
        x:
            hook.endX,

        y:
            hook.endY
    });

    function trace() {

        ctx.beginPath();

        ctx.moveTo(
            points[0].x,
            points[0].y
        );

        for (
            let i = 1;
            i <
            points.length - 1;
            i++
        ) {

            const a =
                points[i];

            const b =
                points[i + 1];

            const mx =
                (
                    a.x +
                    b.x
                ) * .5;

            const my =
                (
                    a.y +
                    b.y
                ) * .5;

            ctx.quadraticCurveTo(
                a.x,
                a.y,
                mx,
                my
            );
        }

        const last =
            points[
                points.length - 1
            ];

        const previous =
            points[
                points.length - 2
            ];

        ctx.quadraticCurveTo(
            previous.x,
            previous.y,
            last.x,
            last.y
        );
    }

    ctx.save();

    ctx.globalAlpha =
        life * .3;

    ctx.strokeStyle =
        "#b8c6dc";

    ctx.lineWidth = 8;

    ctx.lineCap =
        "round";

    trace();

    ctx.stroke();

    ctx.globalAlpha =
        life;

    ctx.strokeStyle =
        "#d8e1ed";

    ctx.lineWidth =
        2.6;

    trace();

    ctx.stroke();

    ctx.fillStyle =
        "#f3f6fb";

    ctx.beginPath();

    ctx.arc(
        hook.endX,
        hook.endY,
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

    drawPlayer(
        state.p1
    );

    drawPlayer(
        state.p2
    );

    drawCrosshair();

    if (
        state.flash > 0
    ) {

        ctx.fillStyle =
            `rgba(255,255,255,${state.flash * 2})`;

        ctx.fillRect(
            0,
            0,
            W,
            H
        );
    }
}

function canvasPoint(e) {

    const rect =
        canvas.getBoundingClientRect();

    return {

        x:
            (
                e.clientX -
                rect.left
            ) *
            W /
            rect.width,

        y:
            (
                e.clientY -
                rect.top
            ) *
            H /
            rect.height
    };
}

function update(dt) {

    if (
        !state ||
        !state.running
    )
        return;

    if (
        state.mode ===
        "online"
    ) {

        if (host) {

            state.time =
                Math.max(
                    0,
                    state.time -
                    dt
                );
        }

        updatePlayer(dt);

        updateRemote(dt);

        updateHook(dt);

        updateBullets(dt);

        updateParticles(dt);

    } else {

        state.time =
            Math.max(
                0,
                state.time -
                dt
            );

        updatePlayer(dt);

        updateBot(dt);

        updateHook(dt);

        updateBullets(dt);

        updateParticles(dt);
    }

    state.flash =
        Math.max(
            0,
            state.flash -
            dt
        );

    checkEnd();

    updateHud();
}

function frame(now) {

    const dt =
        Math.min(
            (now -
                lastTime) /
                1000,

            .033
        );

    lastTime =
        now;

    update(dt);

    if (state) {

        render();

        sendPlayerState();
    }

    requestAnimationFrame(
        frame
    );
}

joinCodeInput.addEventListener(
    "input",
    () => {

        joinCodeInput.value =
            joinCodeInput.value
                .toUpperCase()
                .replace(
                    /[^A-Z0-9]/g,
                    ""
                )
                .slice(
                    0,
                    6
                );
    }
);

copyCodeButton.addEventListener(
    "click",
    async () => {

        if (!roomCode)
            return;

        try {

            await navigator.clipboard.writeText(
                roomCode
            );

            waitingText.textContent =
                "Код скопирован.";

        } catch {

            waitingText.textContent =
                "Код: " +
                roomCode;
        }
    }
);

canvas.addEventListener(
    "mousemove",
    e => {

        const point =
            canvasPoint(e);

        mouse.x =
            point.x;

        mouse.y =
            point.y;
    }
);

canvas.addEventListener(
    "mousedown",
    e => {

        if (
            e.button === 0
        ) {

            mouse.down =
                true;

            const point =
                canvasPoint(e);

            mouse.x =
                point.x;

            mouse.y =
                point.y;

            shoot(
                state.p1,
                mouse.x,
                mouse.y
            );
        }

        if (
            e.button === 2
        ) {

            e.preventDefault();

            const point =
                canvasPoint(e);

            mouse.x =
                point.x;

            mouse.y =
                point.y;

            launchHook(
                mouse.x,
                mouse.y
            );
        }
    }
);

window.addEventListener(
    "mouseup",
    e => {

        if (
            e.button === 0
        ) {

            mouse.down =
                false;
        }
    }
);

canvas.addEventListener(
    "contextmenu",
    e => {

        e.preventDefault();
    }
);

canvas.addEventListener(
    "mouseleave",
    () => {

        mouse.down =
            false;
    }
);

window.addEventListener(
    "keydown",
    e => {

        const key =
            e.key.toLowerCase();

        if (
            [
                "w",
                "a",
                "s",
                "d",
                "arrowup",
                "arrowdown",
                "arrowleft",
                "arrowright"
            ].includes(key)
        ) {

            e.preventDefault();
        }

        keys.add(key);
    }
);

window.addEventListener(
    "keyup",
    e => {

        keys.delete(
            e.key.toLowerCase()
        );
    }
);

restartButton.addEventListener(
    "click",
    async () => {

        if (
            state?.mode ===
            "online"
        ) {

            if (!host)
                return;

            await update(
                ref(
                    db,
                    `rooms/${roomCode}`
                ),
                {
                    status:
                        "playing",

                    winner:
                        null,

                    time:
                        30
                }
            );

            state.p1.hp =
                100;

            state.p2.hp =
                100;

            state.p1.x =
                130;

            state.p1.y =
                H / 2;

            state.p2.x =
                W - 130;

            state.p2.y =
                H / 2;

            state.running =
                true;

            overlay.classList.remove(
                "show"
            );

            updateHud();

        } else {

            createState("bot");
        }
    }
);

backToLobbyButton.addEventListener(
    "click",
    async () => {

        if (
            roomCode
        ) {

            try {

                await remove(
                    ref(
                        db,
                        `rooms/${roomCode}/players/${playerId}`
                    )
                );

                if (host) {

                    await remove(
                        ref(
                            db,
                            `rooms/${roomCode}`
                        )
                    );
                }

            } catch {}
        }

        if (roomUnsubscribe)
            roomUnsubscribe();

        if (shotsUnsubscribe)
            shotsUnsubscribe();

        roomCode = null;
        opponentId = null;
        host = false;

        overlay.classList.remove(
            "show"
        );

        createdRoom.classList.add(
            "hidden"
        );

        joinCodeInput.value =
            "";

        createRoomButton.disabled =
            false;

        joinRoomButton.disabled =
            false;

        lobby.style.display =
            "flex";

        statusEl.textContent =
            "WAITING";
    }
);

window.addEventListener(
    "beforeunload",
    () => {

        if (
            roomCode
        ) {

            remove(
                ref(
                    db,
                    `rooms/${roomCode}/players/${playerId}`
                )
            );
        }
    }
);

requestAnimationFrame(
    frame
);