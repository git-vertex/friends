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

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const lobby = document.getElementById("lobby");
const app = document.getElementById("app");

const createRoomButton = document.getElementById("createRoom");
const joinRoomButton = document.getElementById("joinRoom");
const playBotButton = document.getElementById("playBot");
const copyCodeButton = document.getElementById("copyCode");

const createdRoom = document.getElementById("createdRoom");
const roomCodeElement = document.getElementById("roomCode");
const waitingText = document.getElementById("waitingText");
const joinCodeInput = document.getElementById("joinCode");
const lobbyStatus = document.getElementById("lobbyStatus");

const timeElement = document.getElementById("time");
const statusElement = document.getElementById("status");

const p1HpText = document.getElementById("p1HpText");
const p2HpText = document.getElementById("p2HpText");

const p1Health = document.getElementById("p1Health");
const p2Health = document.getElementById("p2Health");

const enemyName = document.getElementById("enemyName");

const overlay = document.getElementById("overlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");

const restartButton = document.getElementById("restart");
const backToLobbyButton = document.getElementById("backToLobby");

const playerId = crypto.randomUUID();

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 215;

const BULLET_SPEED = 650;
const BULLET_RADIUS = 5;

const DAMAGE = 25;

const SHOOT_COOLDOWN = 1;
const HOOK_COOLDOWN = 2;

const ROUND_TIME = 30;

let roomCode = null;
let isHost = false;
let isBot = false;

let roomListener = null;
let shotsListener = null;

let state = null;

let lastSent = 0;
let lastTimeSync = 0;
let lastFrame = performance.now();

const mouse = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    down: false,
    rightDown: false
};

const keys = {};

const firebaseConfig = {
    apiKey: "AIzaSyA2wzPsyM6X1XBfbOxUP7JdCrWDyDmB8os",
    authDomain: "friends-66f85.firebaseapp.com",
    databaseURL: "https://friends-66f85-default-rtdb.firebaseio.com",
    projectId: "friends-66f85",
    storageBucket: "friends-66f85.firebasestorage.app",
    messagingSenderId: "841738224372",
    appId: "1:841738224372:web:92954bc9f16d69b176d4a1"
};

function setLobbyStatus(text) {
    lobbyStatus.textContent = text;
}

async function loadFirebase() {
    try {
        const firebaseApp = await import(
            "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js"
        );

        const firebaseDatabase = await import(
            "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js"
        );

        initializeApp = firebaseApp.initializeApp;
        getDatabase = firebaseDatabase.getDatabase;
        ref = firebaseDatabase.ref;
        set = firebaseDatabase.set;
        get = firebaseDatabase.get;
        update = firebaseDatabase.update;
        onValue = firebaseDatabase.onValue;
        onDisconnect = firebaseDatabase.onDisconnect;
        remove = firebaseDatabase.remove;

        const firebaseAppInstance =
            initializeApp(firebaseConfig);

        db = getDatabase(firebaseAppInstance);

        firebaseReady = true;

        console.log("Firebase connected");

        setLobbyStatus("");
    } catch (error) {
        console.error(
            "Firebase loading error:",
            error
        );

        firebaseReady = false;

        setLobbyStatus(
            "Firebase не загрузился. BOT доступен."
        );
    }
}

function randomRoomCode() {
    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[
            Math.floor(
                Math.random() * chars.length
            )
        ];
    }

    return code;
}

function createState() {
    return {
        mode: isBot ? "bot" : "online",

        time: ROUND_TIME,

        gameOver: false,

        p1: {
            x: 180,
            y: HEIGHT / 2,

            vx: 0,
            vy: 0,

            hp: 100,
            r: PLAYER_RADIUS,

            shootTimer: 0,
            hookTimer: 0,

            color: "#4da6ff"
        },

        p2: {
            x: WIDTH - 180,
            y: HEIGHT / 2,

            vx: 0,
            vy: 0,

            hp: 100,
            r: PLAYER_RADIUS,

            shootTimer: 0,
            hookTimer: 0,

            color: "#ff4d5a"
        },

        bullets: [],
        remoteBullets: [],

        hook: {
            active: false,
            x: 0,
            y: 0,
            restLength: 260
        },

        remoteId: null
    };
}

function startBot() {
    isBot = true;
    isHost = true;

    roomCode = null;

    if (roomListener) {
        roomListener();
        roomListener = null;
    }

    if (shotsListener) {
        shotsListener();
        shotsListener = null;
    }

    state = createState();

    enemyName.textContent = "BOT";

    lobby.classList.add("hidden");

    overlay.classList.remove("show");

    statusElement.textContent = "FIGHT";

    lastFrame = performance.now();
}

async function createRoom() {
    if (!firebaseReady || !db) {
        setLobbyStatus(
            "Firebase ещё загружается..."
        );

        return;
    }

    isBot = false;
    isHost = true;

    setLobbyStatus(
        "Создаём комнату..."
    );

    let code = null;

    for (let i = 0; i < 10; i++) {
        const candidate =
            randomRoomCode();

        const snapshot =
            await get(
                ref(
                    db,
                    `rooms/${candidate}`
                )
            );

        if (!snapshot.exists()) {
            code = candidate;
            break;
        }
    }

    if (!code) {
        setLobbyStatus(
            "Не удалось создать комнату."
        );

        return;
    }

    roomCode = code;

    const player = {
        x: 180,
        y: HEIGHT / 2,
        hp: 100,
        r: PLAYER_RADIUS,
        ready: true
    };

    try {
        await set(
            ref(
                db,
                `rooms/${roomCode}`
            ),
            {
                host: playerId,
                guest: null,
                status: "waiting",
                time: ROUND_TIME,
                winner: null,
                createdAt: Date.now(),

                players: {
                    [playerId]: player
                },

                shots: {}
            }
        );

        onDisconnect(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            )
        ).remove();

        createdRoom.classList.remove("hidden");

        roomCodeElement.textContent =
            roomCode;

        waitingText.textContent =
            "Ждём второго игрока...";

        setLobbyStatus(
            "Комната создана. Отправь код другу."
        );

        listenRoom();
        listenShots();

    } catch (error) {
        console.error(
            "Create room error:",
            error
        );

        setLobbyStatus(
            "Ошибка создания комнаты."
        );
    }
}

async function joinRoom() {
    if (!firebaseReady || !db) {
        setLobbyStatus(
            "Firebase ещё загружается..."
        );

        return;
    }

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

    setLobbyStatus(
        "Проверяем комнату..."
    );

    const roomRef =
        ref(
            db,
            `rooms/${code}`
        );

    try {
        const snapshot =
            await get(roomRef);

        if (!snapshot.exists()) {
            setLobbyStatus(
                "Комната не найдена."
            );

            return;
        }

        const room =
            snapshot.val();

        if (
            room.guest &&
            room.guest !== playerId
        ) {
            setLobbyStatus(
                "Комната уже заполнена."
            );

            return;
        }

        if (
            room.status === "finished"
        ) {
            setLobbyStatus(
                "Комната уже завершена."
            );

            return;
        }

        roomCode = code;

        isHost = false;
        isBot = false;

        const player = {
            x: WIDTH - 180,
            y: HEIGHT / 2,
            hp: 100,
            r: PLAYER_RADIUS,
            ready: true
        };

        await update(
            roomRef,
            {
                guest: playerId,
                status: "playing",
                time: ROUND_TIME,
                winner: null,

                [`players/${playerId}`]:
                    player
            }
        );

        onDisconnect(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            )
        ).remove();

        state = createState();

        state.remoteId =
            room.host;

        enemyName.textContent =
            "OPPONENT";

        lobby.classList.add("hidden");

        overlay.classList.remove("show");

        statusElement.textContent =
            "FIGHT";

        listenRoom();
        listenShots();

        lastFrame = performance.now();

    } catch (error) {
        console.error(
            "Join room error:",
            error
        );

        setLobbyStatus(
            "Ошибка входа в комнату."
        );
    }
}

function listenRoom() {
    if (!db || !roomCode) {
        return;
    }

    if (roomListener) {
        roomListener();
    }

    roomListener =
        onValue(
            ref(
                db,
                `rooms/${roomCode}`
            ),
            snapshot => {
                if (!snapshot.exists()) {
                    if (!isBot) {
                        setLobbyStatus(
                            "Комната удалена."
                        );
                    }

                    return;
                }

                const room =
                    snapshot.val();

                if (!state) {
                    if (
                        room.status ===
                        "playing"
                    ) {
                        state =
                            createState();
                    } else {
                        return;
                    }
                }

                if (
                    isHost &&
                    room.guest
                ) {
                    state.remoteId =
                        room.guest;

                    if (
                        lobby.classList.contains(
                            "hidden"
                        ) === false
                    ) {
                        lobby.classList.add(
                            "hidden"
                        );
                    }

                    enemyName.textContent =
                        "OPPONENT";

                    statusElement.textContent =
                        "FIGHT";
                }

                if (
                    !isHost &&
                    room.host
                ) {
                    state.remoteId =
                        room.host;
                }

                const players =
                    room.players || {};

                const remoteId =
                    state.remoteId;

                if (
                    remoteId &&
                    players[remoteId]
                ) {
                    const remote =
                        players[remoteId];

                    const remotePlayer =
                        isHost
                            ? state.p2
                            : state.p1;

                    remotePlayer.x =
                        remote.x ??
                        remotePlayer.x;

                    remotePlayer.y =
                        remote.y ??
                        remotePlayer.y;

                    remotePlayer.hp =
                        remote.hp ??
                        remotePlayer.hp;
                }

                if (
                    typeof room.time ===
                    "number" &&
                    !isHost
                ) {
                    state.time =
                        room.time;
                }

                if (
                    room.status ===
                    "waiting"
                ) {
                    statusElement.textContent =
                        "WAITING";

                    waitingText.textContent =
                        "Ждём второго игрока...";
                }

                if (
                    room.status ===
                    "playing"
                ) {
                    statusElement.textContent =
                        "FIGHT";
                }

                if (
                    room.status ===
                    "finished" &&
                    !state.gameOver
                ) {
                    state.gameOver = true;

                    if (
                        room.winner ===
                        playerId
                    ) {
                        showResult(
                            "YOU WIN",
                            "Ты победил!"
                        );
                    } else if (
                        room.winner
                    ) {
                        showResult(
                            "YOU LOSE",
                            "Ты проиграл."
                        );
                    } else {
                        showResult(
                            "DRAW",
                            "Ничья."
                        );
                    }
                }
            }
        );
}

function listenShots() {
    if (!db || !roomCode) {
        return;
    }

    if (shotsListener) {
        shotsListener();
    }

    shotsListener =
        onValue(
            ref(
                db,
                `rooms/${roomCode}/shots`
            ),
            snapshot => {
                if (
                    !state ||
                    isBot
                ) {
                    return;
                }

                const data =
                    snapshot.val() || {};

                const now =
                    Date.now();

                state.remoteBullets =
                    Object.entries(data)
                        .map(
                            ([id, bullet]) => ({
                                id,

                                x: bullet.x,
                                y: bullet.y,

                                vx: bullet.vx,
                                vy: bullet.vy,

                                owner:
                                    bullet.owner,

                                createdAt:
                                    bullet.createdAt,

                                life:
                                    1.6 -
                                    (
                                        now -
                                        bullet.createdAt
                                    ) / 1000
                            })
                        )
                        .filter(
                            bullet =>
                                bullet.life > 0
                        );
            }
        );
}

async function sendPlayerState() {
    if (
        isBot ||
        !firebaseReady ||
        !db ||
        !roomCode ||
        !state ||
        state.gameOver
    ) {
        return;
    }

    const now =
        performance.now();

    if (
        now - lastSent <
        40
    ) {
        return;
    }

    lastSent = now;

    const player =
        isHost
            ? state.p1
            : state.p2;

    try {
        await update(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            ),
            {
                x: player.x,
                y: player.y,
                hp: player.hp,
                r: player.r
            }
        );
    } catch (error) {
        console.error(
            "Player sync error:",
            error
        );
    }
}

async function syncRoomTime() {
    if (
        !isHost ||
        isBot ||
        !firebaseReady ||
        !db ||
        !roomCode ||
        !state
    ) {
        return;
    }

    const now =
        performance.now();

    if (
        now - lastTimeSync <
        100
    ) {
        return;
    }

    lastTimeSync = now;

    try {
        await update(
            ref(
                db,
                `rooms/${roomCode}`
            ),
            {
                time:
                    Math.max(
                        0,
                        state.time
                    )
            }
        );
    } catch (error) {
        console.error(
            "Time sync error:",
            error
        );
    }
}

async function sendShot(bullet) {
    if (
        isBot ||
        !firebaseReady ||
        !db ||
        !roomCode
    ) {
        return;
    }

    const id =
        `${playerId}_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;

    try {
        await set(
            ref(
                db,
                `rooms/${roomCode}/shots/${id}`
            ),
            {
                x: bullet.x,
                y: bullet.y,

                vx: bullet.vx,
                vy: bullet.vy,

                owner: playerId,

                createdAt: Date.now()
            }
        );

        setTimeout(
            () => {
                if (
                    db &&
                    roomCode
                ) {
                    remove(
                        ref(
                            db,
                            `rooms/${roomCode}/shots/${id}`
                        )
                    ).catch(() => {});
                }
            },
            1700
        );

    } catch (error) {
        console.error(
            "Shot sync error:",
            error
        );
    }
}

function shoot(
    player,
    targetX,
    targetY
) {
    if (
        !state ||
        state.gameOver
    ) {
        return;
    }

    if (
        player.shootTimer > 0
    ) {
        return;
    }

    const dx =
        targetX - player.x;

    const dy =
        targetY - player.y;

    const length =
        Math.hypot(
            dx,
            dy
        ) || 1;

    const bullet = {
        x: player.x,
        y: player.y,

        vx:
            dx /
            length *
            BULLET_SPEED,

        vy:
            dy /
            length *
            BULLET_SPEED,

        life: 1.6,

        owner:
            player === state.p1
                ? 1
                : 2
    };

    state.bullets.push(
        bullet
    );

    player.shootTimer =
        SHOOT_COOLDOWN;

    const isLocal =
        isBot
            ? player === state.p1
            : (
                isHost
                    ? player === state.p1
                    : player === state.p2
            );

    if (
        state.mode === "online" &&
        isLocal
    ) {
        sendShot(bullet);
    }
}

function useHook(
    player,
    targetX,
    targetY
) {
    if (
        !state ||
        state.gameOver
    ) {
        return;
    }

    if (
        player.hookTimer > 0
    ) {
        return;
    }

    const dx =
        targetX - player.x;

    const dy =
        targetY - player.y;

    const distance =
        Math.hypot(
            dx,
            dy
        );

    if (
        distance <= 0 ||
        distance > 500
    ) {
        player.hookTimer =
            HOOK_COOLDOWN;

        return;
    }

    state.hook.active = true;

    state.hook.x =
        player.x +
        dx / distance *
        distance;

    state.hook.y =
        player.y +
        dy / distance *
        distance;

    state.hook.restLength =
        Math.max(
            120,
            Math.min(
                500,
                distance
            )
        );

    player.hookTimer =
        HOOK_COOLDOWN;

    setTimeout(
        () => {
            if (state) {
                state.hook.active =
                    false;
            }
        },
        300
    );
}

function updatePlayer(
    player,
    dt,
    local
) {
    let dx = 0;
    let dy = 0;

    if (local) {
        if (
            keys.w ||
            keys.ArrowUp
        ) {
            dy -= 1;
        }

        if (
            keys.s ||
            keys.ArrowDown
        ) {
            dy += 1;
        }

        if (
            keys.a ||
            keys.ArrowLeft
        ) {
            dx -= 1;
        }

        if (
            keys.d ||
            keys.ArrowRight
        ) {
            dx += 1;
        }
    }

    if (
        dx !== 0 ||
        dy !== 0
    ) {
        const length =
            Math.hypot(
                dx,
                dy
            );

        dx /= length;
        dy /= length;

        player.vx =
            dx * PLAYER_SPEED;

        player.vy =
            dy * PLAYER_SPEED;
    } else {
        player.vx *=
            Math.pow(
                0.001,
                dt
            );

        player.vy *=
            Math.pow(
                0.001,
                dt
            );
    }

    player.x +=
        player.vx * dt;

    player.y +=
        player.vy * dt;

    player.x =
        Math.max(
            player.r,
            Math.min(
                WIDTH -
                player.r,
                player.x
            )
        );

    player.y =
        Math.max(
            player.r,
            Math.min(
                HEIGHT -
                player.r,
                player.y
            )
        );

    player.shootTimer =
        Math.max(
            0,
            player.shootTimer - dt
        );

    player.hookTimer =
        Math.max(
            0,
            player.hookTimer - dt
        );
}

function updateBullets(dt) {
    if (!state) {
        return;
    }

    for (
        let i =
            state.bullets.length - 1;
        i >= 0;
        i--
    ) {
        const bullet =
            state.bullets[i];

        bullet.x +=
            bullet.vx * dt;

        bullet.y +=
            bullet.vy * dt;

        bullet.life -= dt;

        if (
            bullet.life <= 0 ||
            bullet.x < -30 ||
            bullet.x >
                WIDTH + 30 ||
            bullet.y < -30 ||
            bullet.y >
                HEIGHT + 30
        ) {
            state.bullets.splice(
                i,
                1
            );

            continue;
        }

        const target =
            bullet.owner === 1
                ? state.p2
                : state.p1;

        const distance =
            Math.hypot(
                bullet.x -
                    target.x,
                bullet.y -
                    target.y
            );

        if (
            distance <
            target.r +
            BULLET_RADIUS
        ) {
            if (
                state.mode ===
                    "online" &&
                !isHost
            ) {
                if (
                    target ===
                    state.p2
                ) {
                    state.bullets.splice(
                        i,
                        1
                    );

                    continue;
                }
            }

            damage(
                target,
                DAMAGE
            );

            state.bullets.splice(
                i,
                1
            );
        }
    }

    for (
        let i =
            state.remoteBullets.length - 1;
        i >= 0;
        i--
    ) {
        const bullet =
            state.remoteBullets[i];

        bullet.x +=
            bullet.vx * dt;

        bullet.y +=
            bullet.vy * dt;

        bullet.life -= dt;

        if (
            bullet.life <= 0 ||
            bullet.x < -30 ||
            bullet.x >
                WIDTH + 30 ||
            bullet.y < -30 ||
            bullet.y >
                HEIGHT + 30
        ) {
            state.remoteBullets.splice(
                i,
                1
            );

            continue;
        }

        const localPlayer =
            isHost
                ? state.p1
                : state.p2;

        const distance =
            Math.hypot(
                bullet.x -
                    localPlayer.x,
                bullet.y -
                    localPlayer.y
            );

        if (
            bullet.owner !==
                playerId &&
            distance <
                localPlayer.r +
                BULLET_RADIUS
        ) {
            if (
                isHost
            ) {
                damage(
                    localPlayer,
                    DAMAGE
                );
            }

            state.remoteBullets.splice(
                i,
                1
            );
        }
    }
}

function damage(
    player,
    amount
) {
    if (
        !state ||
        state.gameOver
    ) {
        return;
    }

    if (
        state.mode ===
            "online" &&
        !isHost
    ) {
        return;
    }

    player.hp =
        Math.max(
            0,
            player.hp - amount
        );

    if (
        state.mode ===
        "online"
    ) {
        const localPlayer =
            isHost
                ? state.p1
                : state.p2;

        update(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            ),
            {
                hp:
                    localPlayer.hp
            }
        ).catch(() => {});

        if (
            state.remoteId
        ) {
            const remotePlayer =
                isHost
                    ? state.p2
                    : state.p1;

            update(
                ref(
                    db,
                    `rooms/${roomCode}/players/${state.remoteId}`
                ),
                {
                    hp:
                        remotePlayer.hp
                }
            ).catch(() => {});
        }
    }

    checkEnd();
}

function checkEnd() {
    if (
        !state ||
        state.gameOver
    ) {
        return;
    }

    let winner = null;

    if (
        state.p1.hp <= 0 ||
        state.p2.hp <= 0
    ) {
        if (
            state.p1.hp <= 0 &&
            state.p2.hp <= 0
        ) {
            winner = null;
        } else if (
            state.p2.hp <= 0
        ) {
            winner = 1;
        } else {
            winner = 2;
        }
    }

    if (
        winner !== null ||
        state.time <= 0
    ) {
        if (
            state.time <= 0 &&
            winner === null
        ) {
            if (
                state.p1.hp >
                state.p2.hp
            ) {
                winner = 1;
            } else if (
                state.p2.hp >
                state.p1.hp
            ) {
                winner = 2;
            }
        }

        if (
            state.mode ===
                "online"
        ) {
            if (isHost) {
                finishOnline(
                    winner === 1
                        ? playerId
                        : winner === 2
                            ? state.remoteId
                            : null
                );
            }

            return;
        }

        finishLocal(
            winner === 1
                ? "YOU WIN"
                : winner === 2
                    ? "YOU LOSE"
                    : "DRAW"
        );
    }
}

async function finishOnline(
    winnerId
) {
    if (
        !state ||
        state.gameOver ||
        !db ||
        !roomCode
    ) {
        return;
    }

    state.gameOver = true;

    try {
        await update(
            ref(
                db,
                `rooms/${roomCode}`
            ),
            {
                status: "finished",
                winner:
                    winnerId || null,
                time:
                    Math.max(
                        0,
                        state.time
                    )
            }
        );
    } catch (error) {
        console.error(
            "Finish error:",
            error
        );

        state.gameOver = false;
    }
}

function finishLocal(
    result
) {
    if (
        !state ||
        state.gameOver
    ) {
        return;
    }

    state.gameOver = true;

    if (
        result === "YOU WIN"
    ) {
        showResult(
            "YOU WIN",
            "Ты победил!"
        );
    } else if (
        result === "YOU LOSE"
    ) {
        showResult(
            "YOU LOSE",
            "Ты проиграл."
        );
    } else {
        showResult(
            "DRAW",
            "Ничья."
        );
    }
}

function showResult(
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

    statusElement.textContent =
        "FINISHED";
}

async function restartGame() {
    if (!state) {
        return;
    }

    if (isBot) {
        startBot();

        return;
    }

    if (!isHost) {
        return;
    }

    if (
        !db ||
        !roomCode
    ) {
        return;
    }

    try {
        const snapshot =
            await get(
                ref(
                    db,
                    `rooms/${roomCode}`
                )
            );

        if (!snapshot.exists()) {
            backToLobby();

            return;
        }

        const room =
            snapshot.val();

        if (!room.guest) {
            setLobbyStatus(
                "Второй игрок вышел."
            );

            return;
        }

        state =
            createState();

        state.mode =
            "online";

        state.remoteId =
            room.guest;

        overlay.classList.remove(
            "show"
        );

        statusElement.textContent =
            "FIGHT";

        await update(
            ref(
                db,
                `rooms/${roomCode}`
            ),
            {
                status: "playing",
                time: ROUND_TIME,
                winner: null,

                [`players/${playerId}`]: {
                    x: 180,
                    y: HEIGHT / 2,
                    hp: 100,
                    r: PLAYER_RADIUS,
                    ready: true
                },

                [`players/${room.guest}`]: {
                    x:
                        WIDTH - 180,
                    y:
                        HEIGHT / 2,
                    hp: 100,
                    r:
                        PLAYER_RADIUS,
                    ready: true
                },

                shots: {}
            }
        );

    } catch (error) {
        console.error(
            "Restart error:",
            error
        );
    }
}

function backToLobby() {
    if (
        roomListener
    ) {
        roomListener();
        roomListener = null;
    }

    if (
        shotsListener
    ) {
        shotsListener();
        shotsListener = null;
    }

    if (
        db &&
        roomCode
    ) {
        remove(
            ref(
                db,
                `rooms/${roomCode}/players/${playerId}`
            )
        ).catch(() => {});
    }

    state = null;

    roomCode = null;

    isBot = false;
    isHost = false;

    overlay.classList.remove(
        "show"
    );

    createdRoom.classList.add(
        "hidden"
    );

    joinCodeInput.value = "";

    roomCodeElement.textContent =
        "------";

    waitingText.textContent =
        "Ждём второго игрока...";

    statusElement.textContent =
        "WAITING";

    timeElement.textContent =
        "30.0";

    p1HpText.textContent =
        "100";

    p2HpText.textContent =
        "100";

    p1Health.style.width =
        "100%";

    p2Health.style.width =
        "100%";

    enemyName.textContent =
        "OPPONENT";

    setLobbyStatus("");

    lobby.classList.remove(
        "hidden"
    );
}

function updateBot(dt) {
    if (
        !state ||
        !isBot ||
        state.gameOver
    ) {
        return;
    }

    const bot =
        state.p2;

    const player =
        state.p1;

    const dx =
        player.x - bot.x;

    const dy =
        player.y - bot.y;

    const distance =
        Math.hypot(
            dx,
            dy
        );

    if (
        distance > 260
    ) {
        bot.vx =
            dx /
            Math.max(
                1,
                distance
            ) *
            PLAYER_SPEED *
            0.55;

        bot.vy =
            dy /
            Math.max(
                1,
                distance
            ) *
            PLAYER_SPEED *
            0.55;
    } else {
        bot.vx *= 0.9;
        bot.vy *= 0.9;
    }

    bot.x +=
        bot.vx * dt;

    bot.y +=
        bot.vy * dt;

    bot.x =
        Math.max(
            bot.r,
            Math.min(
                WIDTH -
                    bot.r,
                bot.x
            )
        );

    bot.y =
        Math.max(
            bot.r,
            Math.min(
                HEIGHT -
                    bot.r,
                bot.y
            )
        );

    bot.shootTimer =
        Math.max(
            0,
            bot.shootTimer - dt
        );

    bot.hookTimer =
        Math.max(
            0,
            bot.hookTimer - dt
        );

    if (
        bot.shootTimer <= 0 &&
        distance < 700
    ) {
        shoot(
            bot,
            player.x,
            player.y
        );
    }
}

function update(dt) {
    if (
        !state ||
        state.gameOver
    ) {
        return;
    }

    state.time =
        Math.max(
            0,
            state.time - dt
        );

    const localPlayer =
        isBot || isHost
            ? state.p1
            : state.p2;

    updatePlayer(
        localPlayer,
        dt,
        true
    );

    if (isBot) {
        updateBot(dt);
    }

    updateBullets(dt);

    if (
        state.mode ===
        "online"
    ) {
        sendPlayerState();

        if (isHost) {
            syncRoomTime();
        }
    }

    checkEnd();
}

function drawBackground() {
    ctx.fillStyle =
        "#080a0f";

    ctx.fillRect(
        0,
        0,
        WIDTH,
        HEIGHT
    );

    ctx.strokeStyle =
        "rgba(255,255,255,0.035)";

    ctx.lineWidth = 1;

    const grid = 40;

    for (
        let x = 0;
        x <= WIDTH;
        x += grid
    ) {
        ctx.beginPath();

        ctx.moveTo(
            x,
            0
        );

        ctx.lineTo(
            x,
            HEIGHT
        );

        ctx.stroke();
    }

    for (
        let y = 0;
        y <= HEIGHT;
        y += grid
    ) {
        ctx.beginPath();

        ctx.moveTo(
            0,
            y
        );

        ctx.lineTo(
            WIDTH,
            y
        );

        ctx.stroke();
    }

    ctx.strokeStyle =
        "rgba(255,255,255,0.12)";

    ctx.strokeRect(
        1,
        1,
        WIDTH - 2,
        HEIGHT - 2
    );
}

function drawPlayer(
    player
) {
    ctx.beginPath();

    ctx.arc(
        player.x,
        player.y,
        player.r,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        player.color;

    ctx.fill();

    ctx.beginPath();

    ctx.arc(
        player.x,
        player.y,
        player.r + 4,
        0,
        Math.PI * 2
    );

    ctx.strokeStyle =
        "rgba(255,255,255,0.12)";

    ctx.lineWidth = 1;

    ctx.stroke();

    ctx.beginPath();

    ctx.arc(
        player.x,
        player.y,
        4,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        "#ffffff";

    ctx.fill();
}

function drawBullets() {
    if (!state) {
        return;
    }

    for (
        const bullet of
        state.bullets
    ) {
        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            BULLET_RADIUS,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            bullet.owner === 1
                ? "#65b5ff"
                : "#ff626d";

        ctx.fill();
    }

    for (
        const bullet of
        state.remoteBullets
    ) {
        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            BULLET_RADIUS,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            bullet.owner === playerId
                ? "#65b5ff"
                : "#ff626d";

        ctx.fill();
    }
}

function drawHook() {
    if (
        !state ||
        !state.hook.active
    ) {
        return;
    }

    const player =
        isBot || isHost
            ? state.p1
            : state.p2;

    ctx.beginPath();

    ctx.moveTo(
        player.x,
        player.y
    );

    ctx.lineTo(
        state.hook.x,
        state.hook.y
    );

    ctx.strokeStyle =
        "rgba(255,255,255,0.65)";

    ctx.lineWidth = 2;

    ctx.stroke();

    ctx.beginPath();

    ctx.arc(
        state.hook.x,
        state.hook.y,
        7,
        0,
        Math.PI * 2
    );

    ctx.strokeStyle =
        "#ffffff";

    ctx.stroke();
}

function drawAim() {
    if (!state) {
        return;
    }

    const player =
        isBot || isHost
            ? state.p1
            : state.p2;

    const dx =
        mouse.x - player.x;

    const dy =
        mouse.y - player.y;

    const length =
        Math.hypot(
            dx,
            dy
        ) || 1;

    const endX =
        player.x +
        dx / length *
        45;

    const endY =
        player.y +
        dy / length *
        45;

    ctx.beginPath();

    ctx.moveTo(
        player.x,
        player.y
    );

    ctx.lineTo(
        endX,
        endY
    );

    ctx.strokeStyle =
        "rgba(255,255,255,0.18)";

    ctx.lineWidth = 2;

    ctx.stroke();
}

function render() {
    drawBackground();

    if (!state) {
        return;
    }

    drawHook();
    drawBullets();

    drawPlayer(
        state.p1
    );

    drawPlayer(
        state.p2
    );

    drawAim();

    p1HpText.textContent =
        Math.ceil(
            Math.max(
                0,
                state.p1.hp
            )
        );

    p2HpText.textContent =
        Math.ceil(
            Math.max(
                0,
                state.p2.hp
            )
        );

    p1Health.style.width =
        `${Math.max(
            0,
            state.p1.hp
        )}%`;

    p2Health.style.width =
        `${Math.max(
            0,
            state.p2.hp
        )}%`;

    timeElement.textContent =
        state.time.toFixed(1);
}

function frame(now) {
    const dt =
        Math.min(
            0.05,
            (now - lastFrame) /
                1000
        );

    lastFrame = now;

    update(dt);
    render();

    requestAnimationFrame(
        frame
    );
}

canvas.addEventListener(
    "mousemove",
    event => {
        const rect =
            canvas.getBoundingClientRect();

        mouse.x =
            (event.clientX -
                rect.left) *
            WIDTH /
            rect.width;

        mouse.y =
            (event.clientY -
                rect.top) *
            HEIGHT /
            rect.height;
    }
);

canvas.addEventListener(
    "mousedown",
    event => {
        if (
            !state ||
            state.gameOver
        ) {
            return;
        }

        const player =
            isBot || isHost
                ? state.p1
                : state.p2;

        if (
            event.button === 0
        ) {
            mouse.down = true;

            shoot(
                player,
                mouse.x,
                mouse.y
            );
        }

        if (
            event.button === 2
        ) {
            mouse.rightDown = true;

            useHook(
                player,
                mouse.x,
                mouse.y
            );
        }
    }
);

canvas.addEventListener(
    "contextmenu",
    event => {
        event.preventDefault();
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

window.addEventListener(
    "keydown",
    event => {
        keys[event.key] = true;

        if (
            [
                "w",
                "a",
                "s",
                "d",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                " "
            ].includes(
                event.key
            )
        ) {
            event.preventDefault();
        }
    }
);

window.addEventListener(
    "keyup",
    event => {
        keys[event.key] = false;
    }
);

createRoomButton.addEventListener(
    "click",
    () => {
        createRoom();
    }
);

joinRoomButton.addEventListener(
    "click",
    () => {
        joinRoom();
    }
);

playBotButton.addEventListener(
    "click",
    () => {
        startBot();
    }
);

copyCodeButton.addEventListener(
    "click",
    async () => {
        if (!roomCode) {
            return;
        }

        try {
            await navigator.clipboard.writeText(
                roomCode
            );

            waitingText.textContent =
                "Код скопирован!";
        } catch {
            waitingText.textContent =
                `Код: ${roomCode}`;
        }
    }
);

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

joinCodeInput.addEventListener(
    "keydown",
    event => {
        if (
            event.key ===
            "Enter"
        ) {
            joinRoom();
        }
    }
);

restartButton.addEventListener(
    "click",
    () => {
        restartGame();
    }
);

backToLobbyButton.addEventListener(
    "click",
    () => {
        backToLobby();
    }
);

window.addEventListener(
    "beforeunload",
    () => {
        if (
            db &&
            roomCode
        ) {
            remove(
                ref(
                    db,
                    `rooms/${roomCode}/players/${playerId}`
                )
            ).catch(() => {});
        }
    }
);

loadFirebase();

requestAnimationFrame(
    frame
);