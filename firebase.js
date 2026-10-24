import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyDtJ16CNjkyTvhg-N6lyeiZF9Bt8uglCTc",
  authDomain: "grupupa-ad509.firebaseapp.com",
  projectId: "grupupa-ad509",
  storageBucket: "grupupa-ad509.firebasestorage.app",
  messagingSenderId: "82445668380",
  appId: "1:82445668380:web:48c74acd539d188b1e4fd9"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
