import { auth } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { setupFormValidation } from "./form-validator.js";

const resetForm = document.getElementById('resetForm');
const resetBtn = document.getElementById('resetBtn');
const statusMessage = document.getElementById('statusMessage');

function showStatus(message, type = 'error') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.classList.remove('hidden');
}

function hideStatus() {
  statusMessage.classList.add('hidden');
}

setupFormValidation(resetForm, async (e) => {
  const email = document.getElementById('email').value.trim();

  resetBtn.disabled = true;
  resetBtn.textContent = 'Sending...';
  hideStatus();

  try {
    await sendPasswordResetEmail(auth, email);

    showStatus('Password reset email sent! Check your inbox.', 'success');
    resetBtn.textContent = 'Email Sent!';
    
    setTimeout(() => {
      window.location.href = '/login';
    }, 3000);

  } catch (error) {
    console.error('Password reset error:', error);
    
    let errorMessage = 'Failed to send reset email. Please try again.';
    
    switch (error.code) {
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address.';
        break;
      case 'auth/user-not-found':
        errorMessage = 'No account found with this email address.';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'Network error. Please check your connection.';
        break;
    }
    
    showStatus(errorMessage, 'error');
    resetBtn.disabled = false;
    resetBtn.textContent = 'Send Reset Link';
  }
});
