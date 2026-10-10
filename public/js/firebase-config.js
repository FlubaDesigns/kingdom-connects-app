// js/firebase-config.js - Auto-configured for Kingdom Connects
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Firebase config embedded for synchronous initialization
const firebaseConfig = {
  apiKey: "AIzaSyD3Im6F3lWgMbJiA7plsDt_Rp9kCLTr6KU",
  authDomain: "kingdom-commerce.firebaseapp.com",
  projectId: "kingdom-commerce",
  storageBucket: "kingdom-commerce.firebasestorage.app",
  messagingSenderId: "926457853462",
  appId: "1:926457853462:web:eba8e9ecb2bb5ff43da737"
};

// Initialize synchronously
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Note: Auth persistence is controlled by login-form.js based on "Remember me" checkbox

// Load logout utilities
import('./logout-utils.js').catch(err => console.warn('Logout utilities not loaded:', err));

export { db, auth, storage };
