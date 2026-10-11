import { adminReady } from './admin-auth-guard.js';
await adminReady;
/* Kingdom Connects - Admin Factoid Manager */
import { db } from '../../js/firebase-config.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const factoidList = document.getElementById('factoidList');
const factoidCount = document.getElementById('factoidCount');
const addForm = document.getElementById('addFactoidForm');
const factoidTextInput = document.getElementById('factoidText');
const charCount = document.getElementById('charCount');

// Character counter
factoidTextInput.addEventListener('input', () => {
  charCount.textContent = factoidTextInput.value.length;
});

// Load all factoids
async function loadFactoids() {
  try {
    const q = query(collection(db, "factoids"), orderBy("created_at", "desc"));
    const snapshot = await getDocs(q);
    const factoids = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    factoidCount.textContent = factoids.length;

    if (factoids.length === 0) {
      factoidList.innerHTML = `
        <p class="status-message empty">
          No factoids yet. Add your first one above!
        </p>
      `;
      return;
    }

    factoidList.innerHTML = factoids.map(f => {
      const createdDate = f.created_at ? new Date(f.created_at).toLocaleDateString() : 'N/A';
      const isActive = f.active !== false;
      
      return `
        <div class="factoid-card">
          <div class="factoid-text">"${escapeHtml(f.text)}"</div>
          <div class="factoid-meta">
            <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
              ${isActive ? '✓ Active' : '✗ Inactive'}
            </span>
            <span>Created: ${createdDate}</span>
          </div>
          <div class="factoid-actions">
            <button class="btn btn-small ${isActive ? 'btn-secondary' : 'btn-gold'}" data-action="toggleActive" data-id="${f.id}" data-value="${isActive}">
              ${isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-small btn-danger" data-action="deleteFactoid" data-id="${f.id}">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error("Error loading factoids:", error);
    factoidList.innerHTML = `
      <div class="error-box">⚠️ Error loading factoids. Please try again.</div>
    `;
  }
}

// Add new factoid
addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = factoidTextInput.value.trim();
  const active = document.getElementById('isActive').checked;

  if (!text) {
    window.showToast('Please enter factoid text.', 'info');
    return;
  }

  try {
    await addDoc(collection(db, "factoids"), {
      text: text,
      active: active,
      created_at: new Date().toISOString()
    });

    addForm.reset();
    charCount.textContent = '0';
    await loadFactoids();
    window.showToast('Factoid added!', 'success');
  } catch (error) {
    console.error("Error adding factoid:", error);
    window.showToast('Error adding factoid: ' + error.message, 'error');
  }
});

// Toggle active status
window.toggleActive = async (id, currentStatus) => {
  try {
    await updateDoc(doc(db, "factoids", id), {
      active: !currentStatus
    });
    await loadFactoids();
  } catch (error) {
    console.error("Error toggling status:", error);
    window.showToast('Error updating status: ' + error.message, 'error');
  }
};

// Delete factoid
window.deleteFactoid = async (id) => {
  if (!confirm('Are you sure you want to delete this factoid? This cannot be undone.')) {
    return;
  }

  try {
    await deleteDoc(doc(db, "factoids", id));
    await loadFactoids();
    window.showToast('Factoid deleted!', 'success');
  } catch (error) {
    console.error("Error deleting factoid:", error);
    window.showToast('Error deleting factoid: ' + error.message, 'error');
  }
};

// HTML escape helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initial load
loadFactoids();

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  const id = button.getAttribute('data-id');
  const value = button.getAttribute('data-value');
  
  switch(action) {
    case 'toggleActive':
      if (typeof toggleActive === 'function') toggleActive(id, value === 'true');
      break;
    case 'deleteFactoid':
      if (typeof deleteFactoid === 'function') deleteFactoid(id);
      break;
  }
});
