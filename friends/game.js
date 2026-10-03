import { db } from "./firebase-config.js";

import {
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const game = document.getElementById("game");

const roomInput = document.getElementById("roomInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const statusText = document.getElementById("status");

const roomCodeText = document.getElementById("roomCode");
const hpFill = document.getElementById("hpFill");
const message = document.getElementById("message");

let roomId = null;
let playerId = crypto.randomUUID();

let players = {};

let player = {
    x: 250,
    y: 300,
    hp: 100,
    color: "#4da3ff",
    lastAttack: 0
};

let opponent = null;

const keys = {};

const WORLD_WIDTH = 1400;
const WORLD_HEIGHT = 800;

const SPEED = 4;

const ATTACK_RANGE = 95;
const ATTACK_DAMAGE = 20;
const ATTACK_COOLDOWN = 500;

let cameraX = 0;
let cameraY = 0;

let unsubscribe = null;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousedown", e => {
    if (e.button === 0) {
        attack();
    }
});

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}

function setStatus(text) {
    statusText.textContent = text;
}

function randomSpawn() {
    return {
        x: 250 + Math.random() * (WORLD_WIDTH - 500),
        y: 200 + Math.random() * (WORLD_HEIGHT - 400)
    };
}

async function createRoom() {
    setStatus("Creating room...");

    try {
        let code = generateRoomCode();

        let roomRef = doc(db, "rooms", code);

        let room = await getDoc(roomRef);

        while (room.exists()) {
            code = generateRoomCode();
            roomRef = doc(db, "rooms", code);
            room = await getDoc(roomRef);
        }

        const spawn = {
            x: 300,
            y: WORLD_HEIGHT / 2
        };

        player.x = spawn.x;
        player.y = spawn.y;

        await setDoc(roomRef, {
            host: playerId,
            players: {
                [playerId]: {
                    x: player.x,
                    y: player.y,
                    hp: 100,
                    color: "#4da3ff"
                }
            }
        });

        startGame(code);

    } catch (error) {
        console.error(error);
        setStatus("Firebase error");
    }
}

async function joinRoom() {
    const code = roomInput.value.trim().toUpperCase();

    if (code.length !== 6) {
        setStatus("Enter a 6-character room code");
        return;
    }

    setStatus("Joining...");

    try {
        const roomRef = doc(db, "rooms", code);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            setStatus("Room does not exist");
            return;
        }

        const data = roomSnap.data();
        const roomPlayers = data.players || {};

        if (Object.keys(roomPlayers).length >= 2) {
            setStatus("Room is full");
            return;
        }

        const spawn = {
            x: WORLD_WIDTH - 300,
            y: WORLD_HEIGHT / 2
        };

        player.x = spawn.x;
        player.y = spawn.y;

        await updateDoc(roomRef, {
            [`players.${playerId}`]: {
                x: player.x,
                y: player.y,
                hp: 100,
                color: "#ff4d69"
            }
        });

        startGame(code);

    } catch (error) {
        console.error(error);
        setStatus("Firebase error");
    }
}

function startGame(code) {
    roomId = code;

    roomCodeText.textContent = code;

    menu.style.display = "none";
    game.style.display = "block";

    message.textContent = "";

    listenToRoom();

    requestAnimationFrame(loop);
}

function listenToRoom() {
    if (unsubscribe) {
        unsubscribe();
    }

    const roomRef = doc(db, "rooms", roomId);

    unsubscribe = onSnapshot(roomRef, snapshot => {
        if (!snapshot.exists()) {
            message.textContent = "ROOM CLOSED";
            return;
        }

        const data = snapshot.data();

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

let lastSync = 0;

async function syncPlayer() {
    if (!roomId) return;

    const now = performance.now();

    if (now - lastSync < 50) {
        return;
    }

    lastSync = now;

    try {
        const roomRef = doc(db, "rooms", roomId);

        await updateDoc(roomRef, {
            [`players.${playerId}.x`]: player.x,
            [`players.${playerId}.y`]: player.y,
            [`players.${playerId}.hp`]: player.hp
        });

    } catch (error) {
        console.error(error);
    }
}

function movePlayer() {
    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["arrowup"]) {
        dy -= 1;
    }

    if (keys["s"] || keys["arrowdown"]) {
        dy += 1;
    }

    if (keys["a"] || keys["arrowleft"]) {
        dx -= 1;
    }

    if (keys["d"] || keys["arrowright"]) {
        dx += 1;
    }

    if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);

        dx /= length;
        dy /= length;

        player.x += dx * SPEED;
        player.y += dy * SPEED;
    }

    player.x = Math.max(25, Math.min(WORLD_WIDTH - 25, player.x));
    player.y = Math.max(25, Math.min(WORLD_HEIGHT - 25, player.y));
}

async function attack() {
    const now = performance.now();

    if (now - player.lastAttack < ATTACK_COOLDOWN) {
        return;
    }

    player.lastAttack = now;

    if (!opponent) {
        return;
    }

    const dx = opponent.x - player.x;
    const dy = opponent.y - player.y;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > ATTACK_RANGE) {
        return;
    }

    const opponentId = Object.keys(players).find(id => id !== playerId);

    if (!opponentId) {
        return;
    }

    const newHp = Math.max(0, opponent.hp - ATTACK_DAMAGE);

    try {
        const roomRef = doc(db, "rooms", roomId);

        await updateDoc(roomRef, {
            [`players.${opponentId}.hp`]: newHp
        });

        if (newHp <= 0) {
            setTimeout(async () => {
                try {
                    await updateDoc(roomRef, {
                        [`players.${opponentId}.hp`]: 100,
                        [`players.${opponentId}.x`]: Math.random() > 0.5 ? 300 : WORLD_WIDTH - 300,
                        [`players.${opponentId}.y`]: WORLD_HEIGHT / 2
                    });
                } catch {}
            }, 1000);
        }

    } catch (error) {
        console.error(error);
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

    const startX = -cameraX % grid;
    const startY = -cameraY % grid;

    for (let x = startX; x < canvas.width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = startY; y < canvas.height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawWorld() {
    const topLeft = worldToScreen(0, 0);

    ctx.fillStyle = "#0d1016";
    ctx.fillRect(
        topLeft.x,
        topLeft.y,
        WORLD_WIDTH,
        WORLD_HEIGHT
    );

    drawGrid();

    ctx.strokeStyle = "#343a49";
    ctx.lineWidth = 4;

    ctx.strokeRect(
        topLeft.x,
        topLeft.y,
        WORLD_WIDTH,
        WORLD_HEIGHT
    );
}

function drawPlayer(x, y, color, hp, isMe) {
    const pos = worldToScreen(x, y);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);

    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = isMe ? 3 : 2;
    ctx.stroke();

    const barWidth = 50;
    const barHeight = 6;

    ctx.fillStyle = "#252832";

    ctx.fillRect(
        pos.x - barWidth / 2,
        pos.y - 38,
        barWidth,
        barHeight
    );

    ctx.fillStyle = hp > 50 ? "#43e06f" : hp > 20 ? "#ffd447" : "#ff4757";

    ctx.fillRect(
        pos.x - barWidth / 2,
        pos.y - 38,
        barWidth * (hp / 100),
        barHeight
    );

    if (isMe) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText("YOU", pos.x, pos.y + 40);
    }
}

function drawAttackRange() {
    const pos = worldToScreen(player.x, player.y);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ATTACK_RANGE, 0, Math.PI * 2);

    ctx.strokeStyle = "rgba(77,163,255,.08)";
    ctx.lineWidth = 2;
    ctx.stroke();
}

function updateCamera() {
    cameraX = player.x - canvas.width / 2;
    cameraY = player.y - canvas.height / 2;

    cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, cameraX));
    cameraY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, cameraY));
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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