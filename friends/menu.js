import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
    getDatabase,
    ref,
    set,
    get,
    update,
    onValue,
    onDisconnect,
    remove
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";


const firebaseConfig = {
    apiKey: "AIzaSyA2wzPsy6M1XBfbOxUP7JdCrWDyDmB8os",
    authDomain: "friends-66f85.firebaseapp.com",
    databaseURL: "https://friends-66f85-default-rtdb.firebaseio.com",
    projectId: "friends-66f85",
    storageBucket: "friends-66f85.firebasestorage.app",
    messagingSenderId: "841738224372",
    appId: "1:841738224372:web:92954bc9f16d69b176d4a1"
};


const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

const db = getDatabase(app);


const mainMenu = document.getElementById("mainMenu");
const joinMenu = document.getElementById("joinMenu");
const roomMenu = document.getElementById("roomMenu");

const createServer = document.getElementById("createServer");
const joinServer = document.getElementById("joinServer");

const roomCodeInput = document.getElementById("roomCodeInput");
const joinButton = document.getElementById("joinButton");
const backFromJoin = document.getElementById("backFromJoin");

const roomCodeElement = document.getElementById("roomCode");
const copyCode = document.getElementById("copyCode");

const player1Name = document.getElementById("player1Name");
const player2Name = document.getElementById("player2Name");
const player2State = document.getElementById("player2State");

const roomStatus = document.getElementById("roomStatus");

const startGame = document.getElementById("startGame");
const leaveRoom = document.getElementById("leaveRoom");

const errorMessage = document.getElementById("errorMessage");

const menu = document.getElementById("menu");
const gameContainer = document.getElementById("gameContainer");


let roomId = null;
let playerId = null;
let isHost = false;

let roomListener = null;
let disconnectRef = null;


function showError(message) {
    errorMessage.textContent = message;

    setTimeout(() => {
        if (errorMessage.textContent === message) {
            errorMessage.textContent = "";
        }
    }, 3500);
}


function showSection(section) {

    mainMenu.classList.add("hidden");
    joinMenu.classList.add("hidden");
    roomMenu.classList.add("hidden");

    section.classList.remove("hidden");

    errorMessage.textContent = "";
}


function generateCode() {

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}


function generatePlayerId() {

    return Math.random().toString(36).slice(2) +
           Date.now().toString(36);
}


async function findFreeRoom() {

    for (let i = 0; i < 10; i++) {

        const code = generateCode();

        const snapshot = await get(
            ref(db, `rooms/${code}`)
        );

        if (!snapshot.exists()) {
            return code;
        }
    }

    throw new Error("Could not generate room code.");
}


function prepareRoomListener() {

    if (!roomId) {
        return;
    }

    const roomRef = ref(db, `rooms/${roomId}`);

    roomListener = onValue(roomRef, snapshot => {

        if (!snapshot.exists()) {

            showError("Room no longer exists.");

            roomId = null;

            showSection(mainMenu);

            return;
        }

        const room = snapshot.val();

        const players = room.players || {};

        const p1 = players.player1;
        const p2 = players.player2;

        player1Name.textContent =
            p1 ? "PLAYER 1" : "EMPTY";

        player2Name.textContent =
            p2 ? "PLAYER 2" : "WAITING...";

        if (p2) {

            player2State.textContent = "READY";

            roomStatus.textContent =
                "Opponent connected.";

        } else {

            player2State.textContent = "EMPTY";

            roomStatus.textContent =
                "Waiting for another player...";

        }


        if (isHost) {

            startGame.disabled = !p2;

            startGame.classList.toggle(
                "disabled",
                !p2
            );

        }


        if (room.status === "playing") {

            startGame.disabled = true;

            startGame.classList.add("disabled");

            startGame.textContent = "GAME STARTED";

            startGameGame();

        }

    });
}


async function createRoom() {

    try {

        createServer.disabled = true;

        roomId = await findFreeRoom();

        playerId = generatePlayerId();

        isHost = true;


        const roomRef = ref(
            db,
            `rooms/${roomId}`
        );


        const initialData = {

            host: playerId,

            status: "waiting",

            createdAt: Date.now(),

            players: {

                player1: {

                    id: playerId,

                    connected: true

                }

            }

        };


        await set(roomRef, initialData);


        disconnectRef = ref(
            db,
            `rooms/${roomId}/players/player1`
        );

        onDisconnect(disconnectRef).remove();


        roomCodeElement.textContent = roomId;

        showSection(roomMenu);

        prepareRoomListener();

    } catch (error) {

        console.error(error);

        showError(
            "Failed to create server."
        );

        roomId = null;

    } finally {

        createServer.disabled = false;

    }
}


async function joinRoom() {

    const code =
        roomCodeInput.value
            .trim()
            .toUpperCase();


    if (code.length !== 6) {

        showError(
            "Enter a valid 6-character code."
        );

        return;
    }


    try {

        joinButton.disabled = true;

        const roomRef =
            ref(db, `rooms/${code}`);

        const snapshot =
            await get(roomRef);


        if (!snapshot.exists()) {

            showError(
                "Server not found."
            );

            return;
        }


        const room = snapshot.val();


        if (room.status !== "waiting") {

            showError(
                "This game has already started."
            );

            return;
        }


        if (room.players?.player2) {

            showError(
                "Server is full."
            );

            return;
        }


        roomId = code;

        playerId = generatePlayerId();

        isHost = false;


        await update(
            ref(db, `rooms/${roomId}/players`),
            {

                player2: {

                    id: playerId,

                    connected: true

                }

            }
        );


        disconnectRef = ref(
            db,
            `rooms/${roomId}/players/player2`
        );

        onDisconnect(disconnectRef).remove();


        roomCodeElement.textContent = roomId;

        showSection(roomMenu);

        prepareRoomListener();

    } catch (error) {

        console.error(error);

        showError(
            "Failed to join server."
        );

    } finally {

        joinButton.disabled = false;

    }
}


async function startRoom() {

    if (!isHost || !roomId) {
        return;
    }


    const snapshot =
        await get(
            ref(db, `rooms/${roomId}`)
        );


    if (!snapshot.exists()) {
        return;
    }


    const room = snapshot.val();


    if (!room.players?.player2) {

        showError(
            "Waiting for player 2."
        );

        return;
    }


    await update(
        ref(db, `rooms/${roomId}`),
        {

            status: "playing",

            startedAt: Date.now(),

            game: {

                time: 30,

                round: 1,

                winner: null

            }

        }
    );

}


async function leaveRoomHandler() {

    if (!roomId) {
        return;
    }


    try {

        if (isHost) {

            await remove(
                ref(db, `rooms/${roomId}`)
            );

        } else {

            await remove(
                ref(
                    db,
                    `rooms/${roomId}/players/player2`
                )
            );

        }

    } catch (error) {

        console.error(error);

    }


    roomId = null;
    playerId = null;
    isHost = false;

    if (roomListener) {
        roomListener();
        roomListener = null;
    }

    showSection(mainMenu);

}


async function startGameGame() {

    menu.classList.add("hidden");
    gameContainer.classList.remove("hidden");


    window.dispatchEvent(
        new CustomEvent("duel-game-start", {
            detail: {
                roomId,
                playerId,
                isHost
            }
        })
    );

}


createServer.addEventListener(
    "click",
    createRoom
);


joinServer.addEventListener(
    "click",
    () => {

        showSection(joinMenu);

        setTimeout(
            () => roomCodeInput.focus(),
            50
        );

    }
);


backFromJoin.addEventListener(
    "click",
    () => {
        showSection(mainMenu);
    }
);


joinButton.addEventListener(
    "click",
    joinRoom
);


roomCodeInput.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {
            joinRoom();
        }

    }
);


roomCodeInput.addEventListener(
    "input",
    () => {

        roomCodeInput.value =
            roomCodeInput.value
                .replace(/[^a-zA-Z0-9]/g, "")
                .toUpperCase();

    }
);


copyCode.addEventListener(
    "click",
    async () => {

        if (!roomId) {
            return;
        }

        try {

            await navigator.clipboard.writeText(
                roomId
            );

            copyCode.textContent =
                "COPIED";

            setTimeout(() => {
                copyCode.textContent =
                    "COPY CODE";
            }, 1200);

        } catch {

            showError(
                `Your code: ${roomId}`
            );

        }

    }
);


startGame.addEventListener(
    "click",
    startRoom
);


leaveRoom.addEventListener(
    "click",
    leaveRoomHandler
);


window.duelRoom = {

    getRoomId() {
        return roomId;
    },

    getPlayerId() {
        return playerId;
    },

    getIsHost() {
        return isHost;
    },

    getDatabase() {
        return db;
    }

};


window.addEventListener(
    "duel-return-menu",
    async () => {

        if (roomId) {

            try {

                await remove(
                    ref(db, `rooms/${roomId}`)
                );

            } catch {}

        }

        location.reload();

    }
);