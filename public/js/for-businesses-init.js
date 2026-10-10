import { db } from './firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

async function loadCategoryCount() {
  try {
    const snapshot = await getDocs(collection(db, 'categories'));
    const count = snapshot.size;
    const countElement = document.getElementById('categoryCount');
    if (countElement && count > 0) {
      countElement.textContent = count + '+';
    }
  } catch (error) {
    console.error('Error loading category count:', error);
  }
}

loadCategoryCount();
