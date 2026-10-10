import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

async function checkMaintenanceMode() {
  const currentPage = window.location.pathname;
  
  if (currentPage === '/maintenance' || currentPage === '/maintenance.html' || currentPage.startsWith('/admin/')) {
    return;
  }
  
  try {
    const settingsDoc = await getDoc(doc(db, 'platform_settings', 'default'));
    
    if (settingsDoc.exists() && settingsDoc.data().maintenance_mode === true) {
      window.location.href = '/maintenance';
    }
  } catch (error) {
    console.warn('Could not check maintenance mode:', error);
  }
}

checkMaintenanceMode();
