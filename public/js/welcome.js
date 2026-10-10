import { db } from "./firebase-config.js";
import { onAuthChange } from './auth/access-control.js';
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from "./utils.js";

let currentUser = null;

onAuthChange((user) => {
  if (user) {
    currentUser = user;
    const displayName = user.displayName || 'Friend';
    const welcomeTitle = document.getElementById('welcomeTitle');
    if (welcomeTitle) {
      welcomeTitle.textContent = `Welcome, ${displayName}!`;
    }
  } else {
    window.location.href = '/add_to_directory';
  }
});

const roleSelectionForm = document.getElementById('roleSelectionForm');
const continueBtn = document.getElementById('continueBtn');

roleSelectionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentUser) {
    showToast('Please wait while we load your account...', 'info');
    return;
  }

  const selectedRole = document.querySelector('input[name="userRole"]:checked');
  if (!selectedRole) {
    showToast('Please select a role to continue', 'info');
    return;
  }

  const role = selectedRole.value;

  continueBtn.disabled = true;
  continueBtn.textContent = 'Saving...';

  try {
    if (role === 'business_owner') {
      window.location.href = '/add_to_directory?role=business';
    } else if (role === 'church_admin') {
      window.location.href = '/add_to_directory?role=church';
    } else if (role === 'sales_agent') {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        roles: arrayUnion('sales_agent')
      });
      window.location.href = '/sales/';
    } else if (role === 'member') {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        role: 'member'
      });
      window.location.href = '/member/';
    } else {
      window.location.href = '/';
    }

  } catch (error) {
    console.error('Error saving role:', error);
    showToast('Error saving your role. Please try again.', 'error');
    continueBtn.disabled = false;
    continueBtn.textContent = 'Continue to Dashboard';
  }
});
