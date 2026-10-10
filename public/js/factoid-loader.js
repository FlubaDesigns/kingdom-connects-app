/* Kingdom Connects - Random Factoid Loader */
import { db } from './firebase-config.js';
import { onReady } from './dom-ready.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function loadRandomFactoid() {
  const factoidCard = document.getElementById('factoidCard');
  const factoidText = document.getElementById('factoidText');
  const desktopFactoid = document.getElementById('desktopFactoid');
  const desktopFactoidText = document.getElementById('desktopFactoidText');
  
  try {
    const snapshot = await getDocs(collection(db, "factoids"));
    
    if (snapshot.empty) {
      if (factoidCard) factoidCard.classList.add('hidden');
      if (desktopFactoid) desktopFactoid.classList.add('hidden');
      return;
    }

    const activeFactoids = snapshot.docs
      .map(doc => doc.data())
      .filter(f => f.active !== false);
    
    if (activeFactoids.length === 0) {
      if (factoidCard) factoidCard.classList.add('hidden');
      if (desktopFactoid) desktopFactoid.classList.add('hidden');
      return;
    }

    const randomFactoid = activeFactoids[Math.floor(Math.random() * activeFactoids.length)];
    
    if (factoidCard && factoidText) {
      factoidText.textContent = randomFactoid.text;
      factoidCard.classList.remove('hidden');
    }
    if (desktopFactoidText) {
      desktopFactoidText.textContent = randomFactoid.text;
    }
  } catch (error) {
    console.error("Error loading factoid:", error);
    if (factoidCard) factoidCard.classList.add('hidden');
    if (desktopFactoid) desktopFactoid.classList.add('hidden');
  }
}

// Load factoid when DOM is ready
onReady(loadRandomFactoid);
