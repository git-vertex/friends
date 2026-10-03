import { db } from "./firebase-config.js";

import {
    ref,
    get,
    set,
    update,
    onValue
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const menu = document.getElementById("menu");
const game = document.getElementById("game");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const roomInput = document.getElementById("roomInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const status = document.getElementById("status");

const roomCodeElement = document.getElementById("roomCode");
const hpFill = document.getElementById("hpFill");
const message = document.getElementById("message");

const playerId = crypto.randomUUID();

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 900;
const PLAYER_RADIUS = 22;
const SPEED = 4;

const ATTACK_RANGE = 95;
const ATTACK_DAMAGE = 20;
const ATTACK_COOLDOWN = 2000;

let roomId = null;
let players = {};
let opponent = null;

let player = {
    x: 300,
    y: WORLD_HEIGHT / 2,
    hp: 100,
    color: "#4da3ff"
};

let lastAttack = 0;
let lastNetworkUpdate = 0;

const keys = {};

let cameraX = 0;
let cameraY = 0;

canvas.width = innerWidth;
canvas.height = innerHeight;

window.addEventListener("resize", () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
});

window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousedown", e => {
    if (e.button === 0) attack();
});

function setStatus(text) {
    status.textContent = text;
}

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}

async function createRoom() {
    setStatus("Creating room...");

    try {
        let code = generateRoomCode();
        let roomRef = ref(db, `rooms/${code}`);
        let snapshot = await get(roomRef);

        while (snapshot.exists()) {
            code = generateRoomCode();
            roomRef = ref(db, `rooms/${code}`);
            snapshot = await get(roomRef);
        }

        player.x = 300;
        player.y = WORLD_HEIGHT / 2;
        player.hp = 100;
        player.color = "#4da3ff";

        await set(roomRef, {
            players: {
                [playerId]: player
            }
        });

        startGame(code);

    } catch (error) {
        console.error(error);
        setStatus(error.message);
    }
}

async function joinRoom() {
    const code = roomInput.value.trim().toUpperCase();

    if (code.length !== 6) {
        setStatus("Enter a 6-character code");
        return;
    }

    setStatus("Joining room...");

    try {
        const roomRef = ref(db, `rooms/${code}`);
        const snapshot = await get(roomRef);

        if (!snapshot.exists()) {
            setStatus("Room does not exist");
            return;
        }

        const data = snapshot.val();
        const roomPlayers = data.players || {};

        if (Object.keys(roomPlayers).length >= 2) {
            setStatus("Room is full");
            return;
        }

        player.x = WORLD_WIDTH - 300;
        player.y = WORLD_HEIGHT / 2;
        player.hp = 100;
        player.color = "#ff4d69";

        await update(roomRef, {
            [`players/${playerId}`]: player
        });

        startGame(code);

    } catch (error) {
        console.error(error);
        setStatus(error.message);
    }
}

function startGame(code) {
    roomId = code;

    roomCodeElement.textContent = code;

    menu.style.display = "none";
    game.style.display = "block";

    listenToRoom();

    requestAnimationFrame(loop);
}

function listenToRoom() {
    const roomRef = ref(db, `rooms/${roomId}`);

    onValue(roomRef, snapshot => {
        if (!snapshot.exists()) {
            message.textContent = "ROOM CLOSED";
            return;
        }

        const data = snapshot.val();

        players = data.players || {};
        opponent = null;

        for (const id in players) {
            if (id !== playerId) {
                opponent = players[id];
                break;
            }
        }

        if (players[playerId]) {
            player.hp = players[playerId].hp;
        }

        updateHUD();
    });
}

async function syncPlayer() {
    if (!roomId) return;

    const now = performance.now();

    if (now - lastNetworkUpdate < 50) return;

    lastNetworkUpdate = now;

    try {
        const playerRef = ref(
            db,
            `rooms/${roomId}/players/${playerId}`
        );

        await update(playerRef, {
            x: player.x,
            y: player.y,
            hp: player.hp
        });

    } catch (error) {
        console.error(error);
    }
}

function movePlayer() {
    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["arrowup"]) dy--;
    if (keys["s"] || keys["arrowdown"]) dy++;
    if (keys["a"] || keys["arrowleft"]) dx--;
    if (keys["d"] || keys["arrowright"]) dx++;

    if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy);

        dx /= length;
        dy /= length;

        player.x += dx * SPEED;
        player.y += dy * SPEED;
    }

    player.x = Math.max(
        PLAYER_RADIUS,
        Math.min(WORLD_WIDTH - PLAYER_RADIUS, player.x)
    );

    player.y = Math.max(
        PLAYER_RADIUS,
        Math.min(WORLD_HEIGHT - PLAYER_RADIUS, player.y)
    );
}

async function attack() {
    const now = performance.now();

    if (now - lastAttack < ATTACK_COOLDOWN) return;

    lastAttack = now;

    if (!opponent) return;

    const dx = opponent.x - player.x;
    const dy = opponent.y - player.y;
    const distance = Math.hypot(dx, dy);

    if (distance > ATTACK_RANGE) return;

    const opponentId = Object.keys(players).find(
        id => id !== playerId
    );

    if (!opponentId) return;

    const opponentRef = ref(
        db,
        `rooms/${roomId}/players/${opponentId}`
    );

    const hp = Math.max(
        0,
        opponent.hp - ATTACK_DAMAGE
    );

    await update(opponentRef, { hp });

    if (hp <= 0) {
        setTimeout(async () => {
            const spawnX =
                Math.random() > 0.5
                    ? 300
                    : WORLD_WIDTH - 300;

            await update(opponentRef, {
                hp: 100,
                x: spawnX,
                y: WORLD_HEIGHT / 2
            });
        }, 1000);
    }
}

function updateHUD() {
    hpFill.style.width = `${player.hp}%`;

    if (player.hp <= 0) {
        message.textContent = "RESPAWNING...";
    } else {
        message.textContent = "";
    }
}

function updateCamera() {
    cameraX = player.x - canvas.width / 2;
    cameraY = player.y - canvas.height / 2;

    cameraX = Math.max(
        0,
        Math.min(WORLD_WIDTH - canvas.width, cameraX)
    );

    cameraY = Math.max(
        0,
        Math.min(WORLD_HEIGHT - canvas.height, cameraY)
    );
}

function worldToScreen(x, y) {
    return {
        x: x - cameraX,
        y: y - cameraY
    };
}

function drawGrid() {
    const grid = 50;

    ctx.strokeStyle = "#171a22";
    ctx.lineWidth = 1;

    const offsetX = (-cameraX) % grid;
    const offsetY = (-cameraY) % grid;

    for (let x = offsetX; x < canvas.width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = offsetY; y < canvas.height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawWorld() {
    ctx.fillStyle = "#0d1016";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    const topLeft = worldToScreen(0, 0);

    ctx.strokeStyle = "#343a49";
    ctx.lineWidth = 4;

    ctx.strokeRect(
        topLeft.x,
        topLeft.y,
        WORLD_WIDTH,
        WORLD_HEIGHT
    );
}

function drawPlayer(x, y, color, hp, own) {
    const position = worldToScreen(x, y);

    ctx.beginPath();

    ctx.arc(
        position.x,
        position.y,
        PLAYER_RADIUS,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = "white";
    ctx.lineWidth = own ? 3 : 2;
    ctx.stroke();

    const barWidth = 50;

    ctx.fillStyle = "#252832";

    ctx.fillRect(
        position.x - barWidth / 2,
        position.y - 38,
        barWidth,
        6
    );

    ctx.fillStyle =
        hp > 50
            ? "#43df70"
            : hp > 20
                ? "#ffd447"
                : "#ff4757";

    ctx.fillRect(
        position.x - barWidth / 2,
        position.y - 38,
        barWidth * (hp / 100),
        6
    );

    if (own) {
        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            "YOU",
            position.x,
            position.y + 40
        );
    }
}

function drawAttackRange() {
    const position = worldToScreen(
        player.x,
        player.y
    );

    ctx.beginPath();

    ctx.arc(
        position.x,
        position.y,
        ATTACK_RANGE,
        0,
        Math.PI * 2
    );

    ctx.strokeStyle = "rgba(77,163,255,.08)";
    ctx.lineWidth = 2;
    ctx.stroke();
}

function draw() {
    updateCamera();

    drawWorld();

    drawAttackRange();

    if (opponent) {
        drawPlayer(
            opponent.x,
            opponent.y,
            opponent.color,
            opponent.hp,
            false
        );
    }

    drawPlayer(
        player.x,
        player.y,
        player.color,
        player.hp,
        true
    );
}

async function loop() {
    movePlayer();
    draw();
    await syncPlayer();
    requestAnimationFrame(loop);
}

createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", joinRoom);

roomInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        joinRoom();
    }
});