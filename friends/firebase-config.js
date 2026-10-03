import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2wzPsy6M1XBkfbOxUPJ7DCrWDyDmB8os",
    authDomain: "friends-66f85.firebaseapp.com",
    projectId: "friends-66f85",
    storageBucket: "friends-66f85.firebasestorage.app",
    messagingSenderId: "841738224372",
    appId: "1:841738224372:web:92954bc9f16d69b176d4a1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };