import { db } from "../../js/firebase-config.js";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin } from "./admin-auth-guard.js";

let currentUser = null;
let directors = [];

requireAdmin((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadDirectors();
  setupEventListeners();
});

async function loadDirectors() {
  try {
    const directorsQuery = query(
      collection(db, "users"),
      where("is_sales_director", "==", true)
    );
    
    const directorsSnapshot = await getDocs(directorsQuery);
    directors = [];
    
    directorsSnapshot.forEach(docSnap => {
      directors.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    
    document.getElementById('totalDirectors').textContent = directors.length;
    
    const agentsQuery = query(
      collection(db, "users"),
      where("role", "==", "sales_agent")
    );
    const agentsSnapshot = await getDocs(agentsQuery);
    document.getElementById('totalAgents').textContent = agentsSnapshot.size;
    
    renderDirectorsList();
    
  } catch (error) {
    console.error('Error loading directors:', error);
    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.remove('hidden');
  }
}

function renderDirectorsList() {
  const listEl = document.getElementById('directorsList');
  const loadingEl = document.getElementById('loadingMessage');
  const contentEl = document.getElementById('directorsContent');
  const emptyEl = document.getElementById('emptyState');
  
  loadingEl.classList.add('hidden');
  
  if (directors.length === 0) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
  
  listEl.innerHTML = '';
  
  directors.forEach(director => {
    const card = document.createElement('div');
    card.className = 'card-list-item flex-between';
    card.innerHTML = `
      <div>
        <div class="text-lg font-bold">${director.display_name || 'No Name'}</div>
        <div class="text-muted">${director.email || 'No email'}</div>
        <div class="text-sm text-muted">Role: ${director.role || 'user'}</div>
      </div>
      <button class="btn btn-danger btn-small" data-id="${director.id}">Remove</button>
    `;
    listEl.appendChild(card);
  });
  
  listEl.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => removeDirector(btn.dataset.id));
  });
}

function setupEventListeners() {
  document.getElementById('btnAddDirector').addEventListener('click', addDirector);
  
  document.getElementById('directorEmail').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addDirector();
  });
}

async function addDirector() {
  const emailInput = document.getElementById('directorEmail');
  const messageEl = document.getElementById('addMessage');
  const email = emailInput.value.trim().toLowerCase();
  
  if (!email) {
    showMessage(messageEl, 'Please enter an email address.', 'error');
    return;
  }
  
  try {
    const usersQuery = query(
      collection(db, "users"),
      where("email", "==", email)
    );
    
    const snapshot = await getDocs(usersQuery);
    
    if (snapshot.empty) {
      showMessage(messageEl, 'User not found with that email.', 'error');
      return;
    }
    
    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();
    
    if (userData.is_sales_director === true) {
      showMessage(messageEl, 'This user is already a Sales Director.', 'warning');
      return;
    }
    
    await updateDoc(doc(db, "users", userDoc.id), {
      is_sales_director: true
    });
    
    showMessage(messageEl, `${userData.display_name || email} is now a Sales Director!`, 'success');
    emailInput.value = '';
    
    await loadDirectors();
    
  } catch (error) {
    console.error('Error adding director:', error);
    showMessage(messageEl, 'Error adding director. Please try again.', 'error');
  }
}

async function removeDirector(userId) {
  if (!confirm('Remove this person as a Sales Director?')) return;
  
  try {
    await updateDoc(doc(db, "users", userId), {
      is_sales_director: false
    });
    
    await loadDirectors();
    
  } catch (error) {
    console.error('Error removing director:', error);
    alert('Error removing director. Please try again.');
  }
}

function showMessage(el, message, type) {
  el.textContent = message;
  el.className = 'mt-sm';
  
  if (type === 'error') {
    el.classList.add('text-error');
  } else if (type === 'success') {
    el.classList.add('text-success');
  } else if (type === 'warning') {
    el.classList.add('text-warning');
  }
  
  el.classList.remove('hidden');
  
  setTimeout(() => {
    el.classList.add('hidden');
  }, 5000);
}
