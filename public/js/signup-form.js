import { changeHierarchy } from './services/hierarchy-service.js';
import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setupFormValidation } from "./form-validator.js";
import { linkPendingListingsByEmail } from "./account-linker.js";
import { sendTemplate } from "./email/email-service.js";

const signupForm = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');
const statusMessage = document.getElementById('statusMessage');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const passwordRequirements = document.getElementById('passwordRequirements');
const confirmPasswordError = document.getElementById('confirmPasswordError');
const homeChurchSelect = document.getElementById('homeChurch');

// Load churches for dropdown
async function loadChurches() {
  if (!homeChurchSelect) return;
  
  try {
    const churchesRef = collection(db, "churches");
    const q = query(
      churchesRef,
      where("listing_status", "==", "active")
    );
    
    const snapshot = await getDocs(q);
    
    // Clear loading option
    homeChurchSelect.innerHTML = '<option value="">Not Affiliated</option>';
    
    if (snapshot.empty) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No churches available yet';
      option.disabled = true;
      homeChurchSelect.appendChild(option);
      return;
    }
    
    // Sort churches alphabetically in JavaScript (avoids Firestore index requirement)
    const churches = [];
    snapshot.forEach(doc => {
      const church = doc.data();
      churches.push({
        id: doc.id,
        name: church.church_name,
        city: church.city,
        state: church.state
      });
    });
    
    churches.sort((a, b) => a.name.localeCompare(b.name));
    
    churches.forEach(church => {
      const option = document.createElement('option');
      option.value = church.id;
      option.textContent = `${church.name} - ${church.city}, ${church.state}`;
      homeChurchSelect.appendChild(option);
    });
    
    console.log(`✅ Loaded ${snapshot.size} churches`);
  } catch (error) {
    console.error('Error loading churches:', error);
    homeChurchSelect.innerHTML = '<option value="">Not Affiliated</option>';
  }
}

// Load churches on page load
loadChurches();

function showStatus(message, type = 'error') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.classList.remove('hidden');
}

function hideStatus() {
  statusMessage.classList.add('hidden');
}

function validatePassword(password) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password)
  };
  
  const valid = checks.length && checks.uppercase && checks.number;
  const errors = [];
  
  if (!checks.length) errors.push('At least 8 characters');
  if (!checks.uppercase) errors.push('At least one uppercase letter');
  if (!checks.number) errors.push('At least one number');
  
  return { valid, checks, errors };
}

function updatePasswordRequirements() {
  const password = passwordInput.value;
  const result = validatePassword(password);
  
  passwordRequirements.innerHTML = `
    <div class="password-requirement ${result.checks.length ? 'met' : 'unmet'}">
      ${result.checks.length ? '✓' : '✗'} At least 8 characters
    </div>
    <div class="password-requirement ${result.checks.uppercase ? 'met' : 'unmet'}">
      ${result.checks.uppercase ? '✓' : '✗'} At least one uppercase letter (A-Z)
    </div>
    <div class="password-requirement ${result.checks.number ? 'met' : 'unmet'}">
      ${result.checks.number ? '✓' : '✗'} At least one number (0-9)
    </div>
  `;
  
  passwordRequirements.classList.remove('hidden');
}

function checkPasswordMatch() {
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  if (confirmPassword.length === 0) {
    confirmPasswordError.classList.add('hidden');
    return;
  }
  
  if (password !== confirmPassword) {
    confirmPasswordError.classList.remove('hidden');
  } else {
    confirmPasswordError.classList.add('hidden');
  }
}

// Show requirements on focus
passwordInput.addEventListener('focus', updatePasswordRequirements);

// Update as user types
passwordInput.addEventListener('input', updatePasswordRequirements);

// Hide when field loses focus and is empty
passwordInput.addEventListener('blur', () => {
  if (passwordInput.value.length === 0) {
    passwordRequirements.classList.add('hidden');
  }
});

confirmPasswordInput.addEventListener('input', checkPasswordMatch);

setupFormValidation(signupForm, async (e) => {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const agreeTerms = document.getElementById('agreeTerms').checked;
  const homeChurchId = homeChurchSelect ? homeChurchSelect.value : '';

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    showStatus('Password does not meet requirements: ' + passwordValidation.errors.join(', '), 'error');
    return;
  }

  if (password !== confirmPassword) {
    showStatus('Passwords do not match!', 'error');
    return;
  }

  if (!agreeTerms) {
    showStatus('You must agree to the Terms of Service and Privacy Policy.', 'error');
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = 'Creating Account...';
  hideStatus();

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await updateProfile(user, {
      displayName: name
    });

    const userData = {
      name: name,
      email: email,
      role: "member",
      roles: ["member"],
      account_status: "pending",
      created_at: serverTimestamp(),
      last_login: serverTimestamp()
    };
    
    // Add home_church_id if selected
    if (homeChurchId) {
      // The server assigns the church and approval state.
    }
    
    await setDoc(doc(db, "users", user.uid), userData);
    await changeHierarchy('setMemberChurch', { churchId: homeChurchId || null }, user);

    // Send welcome email to new member
    try {
      console.log('📧 Attempting to send welcome email to:', email);
      const result = await sendTemplate('member_welcome', email, {
        user_name: name,
        dashboard_url: `${window.location.origin}/member/index`,
        base_url: window.location.origin
      });
      console.log('✅ Welcome email response:', result);
    } catch (emailError) {
      console.error('❌ Welcome email error (logged):', emailError);
      // We no longer fail the whole signup if email fails, but we log it better
    }

    // Link any pending business/church listings to this new account
    const linkResults = await linkPendingListingsByEmail(user, email);
    
    let redirectUrl = 'welcome';
    let successMessage = 'Account created successfully!';
    
    // Redirect to appropriate dashboard if listings were linked
    if (linkResults.businessesLinked > 0) {
      redirectUrl = 'business-admin/index';
      successMessage = `Account created! ${linkResults.businessesLinked} business(es) linked. Redirecting to your dashboard...`;
    } else if (linkResults.churchesLinked > 0) {
      redirectUrl = 'church-admin/index';
      successMessage = `Account created! ${linkResults.churchesLinked} church(es) linked. Redirecting to your dashboard...`;
    } else {
      successMessage = 'Account created successfully! Redirecting...';
    }

    showStatus(successMessage, 'success');
    
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 2000);

  } catch (error) {
    console.error('Signup error:', error);
    
    let errorMessage = 'Unable to create account. ';
    
    switch (error.code) {
      case 'auth/email-already-in-use':
        errorMessage = 'This email is already registered. Please login instead.';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address.';
        break;
      case 'auth/weak-password':
        errorMessage = 'Password is too weak. Use at least 6 characters.';
        break;
      case 'auth/operation-not-allowed':
        errorMessage = 'Email/password signup is not enabled. Please contact support.';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'Network error. Please check your connection.';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many attempts. Please wait a few minutes and try again.';
        break;
      case 'auth/invalid-credential':
        errorMessage = 'Invalid credentials provided.';
        break;
      default:
        // Show actual error for debugging unknown issues
        errorMessage += error.message || 'Please try again.';
        break;
    }
    
    showStatus(errorMessage, 'error');
    signupBtn.disabled = false;
    signupBtn.textContent = 'Create Account';
  }
});
