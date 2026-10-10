import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence, browserLocalPersistence, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setupFormValidation } from "./form-validator.js";
import { normalizeUserRoles, getPrimaryDashboard } from "./role-utils.js";
import { linkPendingListingsByEmail } from "./account-linker.js";
import { getAuthState } from "./auth/access-control.js";

const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const statusMessage = document.getElementById('statusMessage');
const logoutSection = document.getElementById('logoutSection');
const logoutBtn = document.getElementById('logoutBtn');

(async () => {
  const { isLoggedIn } = await getAuthState();
  if (isLoggedIn && logoutSection) {
    logoutSection.classList.remove('hidden');
  }
})();

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  });
}

// Note: Session persistence is now automatic
// - Regular users: Session-only (logged out when browser closes)
// - Platform admins: Persistent (stay logged in across sessions)

function showStatus(message, type = 'error') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.classList.remove('hidden');
}

function hideStatus() {
  statusMessage.classList.add('hidden');
}

setupFormValidation(loginForm, async (e) => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const rememberMe = document.getElementById('rememberMe')?.checked || false;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';
  hideStatus();

  try {
    // Use Remember Me checkbox - local persistence keeps you logged in
    if (rememberMe) {
      await setPersistence(auth, browserLocalPersistence);
    } else {
      await setPersistence(auth, browserSessionPersistence);
    }

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw new Error('User profile not found. Please contact support.');
    }

    await updateDoc(userDocRef, {
      last_login: serverTimestamp()
    });

    // Link any pending business/church listings on every login (catches historical accounts)
    const linkResults = await linkPendingListingsByEmail(user, email);

    // Re-fetch user data to get updated roles if listings were linked
    const updatedUserDoc = await getDoc(userDocRef);
    const userData = updatedUserDoc.data();
    const roles = normalizeUserRoles(userData);

    // Note: Admins get persistent login based on "Remember me" checkbox like everyone else

    let successMessage = 'Login successful! Redirecting...';
    if (linkResults.businessesLinked > 0 || linkResults.churchesLinked > 0) {
      successMessage = `Welcome back! ${linkResults.businessesLinked + linkResults.churchesLinked} listing(s) linked to your account.`;
    }

    showStatus(successMessage, 'success');

    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');

    setTimeout(() => {
      if (returnUrl) {
        window.location.href = decodeURIComponent(returnUrl);
      } else {
        // Always go to homepage after login - dashboard buttons shown there
        window.location.href = '/';
      }
    }, 1500);

  } catch (error) {
    console.error('Login error:', error);
    
    let errorMessage = 'Failed to login. Please check your credentials.';
    
    switch (error.code) {
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address.';
        break;
      case 'auth/user-disabled':
        errorMessage = 'This account has been disabled.';
        break;
      case 'auth/user-not-found':
        errorMessage = 'No account found with this email.';
        break;
      case 'auth/wrong-password':
        errorMessage = 'Incorrect password.';
        break;
      case 'auth/invalid-credential':
        errorMessage = 'No account found with this email, or the password is incorrect. Please check both and try again.';
        break;
      case 'auth/operation-not-allowed':
        errorMessage = 'Unable to log in. Please contact support or check if email/password login is enabled.';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'Network error. Please check your connection.';
        break;
    }
    
    showStatus(errorMessage, 'error');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});
