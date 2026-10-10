/* Kingdom Connects - Logout Utilities */
import { auth } from './firebase-config.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { showToast } from './utils.js';

/**
 * Logout user and redirect to homepage
 * @param {string} redirectPath - Path to redirect after logout (default: 'index.html')
 */
export async function logout(redirectPath = '/') {
  try {
    await signOut(auth);
    // Add logout success parameter to URL for user feedback
    const separator = redirectPath.includes('?') ? '&' : '?';
    window.location.href = `${redirectPath}${separator}logout=success`;
  } catch (error) {
    console.error('Logout error:', error);
    showToast('Error logging out. Please try again.', 'error');
  }
}

/**
 * Attach logout handler to a link or button
 * @param {string} elementId - ID of the element to attach logout to
 * @param {string} redirectPath - Path to redirect after logout
 */
export function attachLogoutHandler(elementId, redirectPath = '/') {
  const element = document.getElementById(elementId);
  if (element) {
    element.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout(redirectPath);
    });
  }
}

// Make logout available globally for non-module scripts
window.kcLogout = logout;
window.kcAttachLogoutHandler = attachLogoutHandler;
