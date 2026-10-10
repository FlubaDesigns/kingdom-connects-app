import { db } from '../../js/firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const defaultContent = {
  hero_title: 'Welcome to Kingdom Connects',
  hero_description: 'Discover and support Christian businesses in your community. Find trusted services from fellow believers.'
};

let editableContent = { ...defaultContent };

async function loadSettings() {
  try {
    const manualDoc = await getDoc(doc(db, 'public_manuals', 'member'));
    if (manualDoc.exists()) {
      editableContent = { ...defaultContent, ...manualDoc.data() };
    }
  } catch (error) {
    // Silently use defaults if not authenticated
  }
  
  updateManualContent();
}

function updateManualContent() {
  const heroTitleEl = document.getElementById('heroTitle');
  if (heroTitleEl) {
    heroTitleEl.textContent = editableContent.hero_title;
  }

  const heroDescEl = document.getElementById('heroDescription');
  if (heroDescEl) {
    heroDescEl.innerHTML = editableContent.hero_description;
  }
}

loadSettings();
