import { changeHierarchy } from './services/hierarchy-service.js';
import { db, auth } from "./firebase-config.js?v=13";
import { collection, getDocs, addDoc, serverTimestamp, query, where, doc, setDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { setupFormValidation } from "./form-validator.js?v=11";
import { loadCategories, populateCategoryDropdown } from "./services/category-service.js?v=11";
import { setupPhoneFormatting, setupPasswordValidation, setupConfirmPasswordValidation } from "./utils.js?v=11";
import { linkPendingListingsByEmail } from "./account-linker.js?v=11";
import { isDemoMode, storeDemoRecord, markDemoActive } from "./demo-mode.js";
import { sendTemplate, notifyAdminNewSubmission, sendBusinessSubmissionConfirmation } from "./email/email-service.js";
import { fetchAllChurches } from "./services/church-service.js";
import { initSpamProtection } from "./utils/spam-protection.js";
import { handleFormError, getFriendlyMessage } from "./utils/error-handler.js";

// ============================================
// PASSWORD VALIDATION (Shared)
// ============================================
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

// ============================================
// URL NORMALIZATION (For business path)
// ============================================
function normalizeUrl(u){
  const s = (u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  try { return new URL("https://" + s).href; } catch(e) { return ""; }
}

// ============================================
// DOM ELEMENTS & INITIALIZATION
// ============================================
function initDirectoryForm() {
console.log('🎯 Initializing directory form');
const form = document.getElementById('directoryForm');
console.log('📝 Form element:', form);

if (!form) {
  console.error('❌ Form not found!');
  return;
}

// New card-based elements
const roleSelectionCards = document.getElementById('roleSelectionCards');
const quickSelectButtons = document.getElementById('quickSelectButtons');
const formCard = document.getElementById('formCard');
const backToRolesBtn = document.getElementById('backToRoles');
const submissionTypeInput = document.getElementById('submissionType');
const submissionTierInput = document.getElementById('submissionTier');
const selectedRoleBadge = document.getElementById('selectedRoleBadge');
const formSectionTitle = document.getElementById('formSectionTitle');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const contextBanner = document.getElementById('contextBanner');
const contextBannerText = document.getElementById('contextBannerText');

// Sections
const memberSection = document.getElementById('memberSection');
const businessSection = document.getElementById('businessSection');
const churchSection = document.getElementById('churchSection');

// Status message
const statusDiv = document.getElementById('statusMessage');
console.log('💬 Status div:', statusDiv);

// Spam protection
const spamProtection = initSpamProtection(form, 'directory_signup');

// ============================================
// HELPER: ENABLE/DISABLE SECTION FIELDS
// (Defined early so selectRole can use it)
// ============================================
function setSectionFieldsEnabled(section, enabled) {
  if (!section) return;
  
  const fields = section.querySelectorAll('input, select, textarea');
  fields.forEach(field => {
    if (enabled) {
      field.disabled = false;
      if (field.type === 'password') {
        field.setAttribute('autocomplete', 'new-password');
      }
    } else {
      field.disabled = true;
      if (field.type === 'password') {
        field.removeAttribute('autocomplete');
      }
    }
  });
  console.log(`📋 Section ${section.id}: fields ${enabled ? 'enabled' : 'disabled'}`);
}

// ============================================
// ROLE/TIER SELECTION FROM CARDS
// ============================================
const roleLabels = {
  member: 'Member',
  business: 'Business Owner',
  church: 'Church Admin'
};

const tierLabels = {
  free: 'Free',
  pro: 'Pro'
};

const formTitles = {
  member: 'Create Your Member Account',
  'business-free': 'List Your Business (Free)',
  'business-pro': 'List Your Business (Pro)',
  church: 'Register Your Church'
};

function selectRole(role, tier = 'free') {
  console.log(`🎯 Role selected: ${role}, Tier: ${tier}`);
  
  // Update hidden inputs
  submissionTypeInput.value = role;
  submissionTierInput.value = tier;
  
  // Update badge - include billing cycle for Pro, hide for church
  if (role === 'church') {
    selectedRoleBadge.textContent = '';
    selectedRoleBadge.classList.add('hidden');
  } else {
    let badgeText = roleLabels[role];
    if (role === 'business') {
      const billingSelect = document.getElementById('billing_cycle');
      const billing = billingSelect ? billingSelect.value : '';
      const billingLabel = billing === 'annual' ? 'Annual' : billing === 'monthly' ? 'Monthly' : '';
      badgeText = tier === 'pro' && billingLabel 
        ? `Business Pro ${billingLabel}` 
        : `${roleLabels[role]} (${tierLabels[tier]})`;
    }
    selectedRoleBadge.textContent = badgeText;
    selectedRoleBadge.className = 'tier-badge ' + tier;
    selectedRoleBadge.classList.remove('hidden');
  }
  
  // Update form title
  const titleKey = role === 'business' ? `business-${tier}` : role;
  formSectionTitle.textContent = formTitles[titleKey] || 'Complete Your Registration';
  
  // Hide role cards and placeholder, show form (keep quick buttons visible for switching)
  roleSelectionCards.classList.add('hidden');
  const wizardPlaceholder = document.getElementById('wizardPlaceholder');
  if (wizardPlaceholder) wizardPlaceholder.classList.add('hidden');
  formCard.classList.remove('hidden');
  
  // Highlight selected button in directory-left
  if (quickSelectButtons) {
    quickSelectButtons.querySelectorAll('.action-card').forEach(btn => {
      btn.classList.remove('selected');
    });
    const selectedBtn = quickSelectButtons.querySelector(`[data-select-role="${role}"]${tier !== 'free' ? `[data-select-tier="${tier}"]` : ':not([data-select-tier="pro"])'}`);
    if (selectedBtn) selectedBtn.classList.add('selected');
  }
  
  // Show appropriate section, hide others
  memberSection.classList.add('conditional-fields');
  businessSection.classList.add('conditional-fields');
  churchSection.classList.add('conditional-fields');
  setSectionFieldsEnabled(memberSection, false);
  setSectionFieldsEnabled(businessSection, false);
  setSectionFieldsEnabled(churchSection, false);
  
  // Show/hide billing cycle section for Pro tier
  const billingCycleSection = document.getElementById('billingCycleSection');
  if (billingCycleSection) {
    if (role === 'business' && tier === 'pro') {
      billingCycleSection.classList.remove('hidden');
    } else {
      billingCycleSection.classList.add('hidden');
    }
  }
  
  if (role === 'member') {
    memberSection.classList.remove('conditional-fields');
    setSectionFieldsEnabled(memberSection, true);
  } else if (role === 'business') {
    businessSection.classList.remove('conditional-fields');
    setSectionFieldsEnabled(businessSection, true);
  } else if (role === 'church') {
    churchSection.classList.remove('conditional-fields');
    setSectionFieldsEnabled(churchSection, true);
  }
  
  // Update breadcrumb data attribute for dynamic breadcrumbs
  document.body.setAttribute('data-current-role', role);
  document.body.setAttribute('data-current-tier', tier);
  
  // Scroll to form
  formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showRoleCards() {
  formCard.classList.add('hidden');
  roleSelectionCards.classList.remove('hidden');
  
  // Show placeholder, clear button selection
  const wizardPlaceholder = document.getElementById('wizardPlaceholder');
  if (wizardPlaceholder) wizardPlaceholder.classList.remove('hidden');
  if (quickSelectButtons) {
    quickSelectButtons.querySelectorAll('.action-card').forEach(btn => {
      btn.classList.remove('selected');
    });
  }
  
  // Clear selection styling
  document.querySelectorAll('.role-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // Reset cinema to landing image
  showLandingCinema();
  const cinemaContainer = document.getElementById('directoryCinema');
  if (cinemaContainer) cinemaContainer.classList.remove('gold-border');
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Cinema images for each role with proper alt tags
const cinemaImages = {
  landing: {
    src: '/assets/images/cinema/landing.png',
    alt: 'Kingdom Connects - Grow the Kingdom together'
  },
  member: {
    src: '/assets/images/cinema/member.png',
    alt: 'Person browsing Kingdom Connects directory on their phone'
  },
  business: {
    src: '/assets/images/cinema/business.png',
    alt: 'Christian business owner welcoming customers at their storefront'
  },
  'business-pro': {
    src: '/assets/images/cinema/business-pro.png',
    alt: 'Successful Christian business with premium featured placement'
  },
  church: {
    src: '/assets/images/cinema/church.png',
    alt: 'Church connecting with local faith-based businesses'
  }
};

// Show landing cinema image on page load
function showLandingCinema() {
  const cinemaImg = document.getElementById('cinemaImage');
  const placeholder = document.getElementById('cinemaPlaceholder');
  if (!cinemaImg || !placeholder) return;
  
  const landingData = cinemaImages.landing;
  cinemaImg.src = landingData.src;
  cinemaImg.alt = landingData.alt;
  cinemaImg.classList.remove('hidden');
  placeholder.classList.add('hidden');
}

// Initialize landing cinema on page load
showLandingCinema();

function updateCinemaImage(role, tier) {
  const cinemaImg = document.getElementById('cinemaImage');
  const placeholder = document.getElementById('cinemaPlaceholder');
  const cinemaContainer = document.getElementById('directoryCinema');
  if (!cinemaImg || !placeholder || !cinemaContainer) return;
  
  const key = (role === 'business' && tier === 'pro') ? 'business-pro' : role;
  const imageData = cinemaImages[key];
  
  // Toggle gold border for Business Pro
  if (key === 'business-pro') {
    cinemaContainer.classList.add('gold-border');
  } else {
    cinemaContainer.classList.remove('gold-border');
  }
  
  if (imageData && imageData.src) {
    cinemaImg.src = imageData.src;
    cinemaImg.alt = imageData.alt;
    cinemaImg.classList.remove('hidden');
    placeholder.classList.add('hidden');
  }
}

// Attach click handlers to role cards and quick buttons
document.querySelectorAll('[data-select-role]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const role = btn.getAttribute('data-select-role');
    const tier = btn.getAttribute('data-select-tier') || 'free';
    
    // Highlight selected card (if inside a card)
    const parentCard = btn.closest('.role-card');
    document.querySelectorAll('.role-card').forEach(card => card.classList.remove('selected'));
    if (parentCard) parentCard.classList.add('selected');
    
    // Update cinema image
    updateCinemaImage(role, tier);
    
    selectRole(role, tier);
  });
});

// Back button handler
if (backToRolesBtn) {
  backToRolesBtn.addEventListener('click', showRoleCards);
}

// ============================================
// SETUP PHONE FORMATTING FOR ALL PATHS
// ============================================
setupPhoneFormatting('phone'); // Member and Church path
setupPhoneFormatting('business_phone'); // Business path
setupPhoneFormatting('church_phone'); // Church administration path
setupPhoneFormatting('nomination_phone'); // Member nomination path
setupPhoneFormatting('member_business_phone'); // Member business info path

// ============================================
// SETUP PASSWORD VALIDATION FOR ALL PATHS
// ============================================
// Setup validation for all three sections on page load (fields exist, just hidden)
console.log('✅ Setting up password validation for all paths');

// Member path
setupPasswordValidation('member_password', 'passwordRequirements');
setupConfirmPasswordValidation('member_password', 'member_confirmPassword', 'confirmPasswordError');

// Business path
setupPasswordValidation('business_password', 'businessPasswordRequirements');
setupConfirmPasswordValidation('business_password', 'business_confirmPassword', 'businessConfirmPasswordError');

// Church path
setupPasswordValidation('church_password', 'churchPasswordRequirements');
setupConfirmPasswordValidation('church_password', 'church_confirmPassword', 'churchConfirmPasswordError');

console.log('✅ Password validation setup complete for all paths');

// ============================================
// LOAD CHURCHES FOR MEMBER PATH
// ============================================
// Load churches for Member path church selector
async function loadChurchesForMember() {
  const churchSelector = document.getElementById('church_selector');
  if (!churchSelector) return;
  
  try {
    const churches = await fetchAllChurches();
    
    const notAffiliatedOption = '<option value="none">Not affiliated with a church</option>';
    const nominateOption = '<option value="nominate">My church isn\'t listed - nominate it</option>';
    
    if (churches.length === 0) {
      churchSelector.innerHTML = notAffiliatedOption + nominateOption;
      return;
    }
    
    let optionsHtml = notAffiliatedOption;
    churches.forEach(church => {
      const location = [church.city, church.state].filter(Boolean).join(', ');
      let displayText = location ? `${church.church_name} (${location})` : church.church_name;
      if (church.listing_status && church.listing_status !== 'active') {
        displayText += ` (${church.listing_status})`;
      }
      optionsHtml += `<option value="${church.id}">${displayText}</option>`;
    });
    optionsHtml += nominateOption;
    
    churchSelector.innerHTML = optionsHtml;
    console.log(`✅ Loaded ${churches.length} churches into Member path dropdown`);
  } catch (error) {
    console.error('Error loading churches:', error);
  }
}

// Call loadChurchesForMember on page load
loadChurchesForMember();

// Show/hide nomination fields based on church selector
const churchSelector = document.getElementById('church_selector');
const nominationFields = document.getElementById('nominationFields');

if (churchSelector && nominationFields) {
  churchSelector.addEventListener('change', () => {
    if (churchSelector.value === 'nominate') {
      nominationFields.classList.remove('hidden');
    } else {
      nominationFields.classList.add('hidden');
    }
  });
}

// Show/hide leader position dropdown based on leadership toggle (nomination path)
const isLeaderYes = document.getElementById('is_leader_yes');
const isLeaderNo = document.getElementById('is_leader_no');
const leaderPositionFields = document.getElementById('leaderPositionFields');

if (isLeaderYes && isLeaderNo && leaderPositionFields) {
  isLeaderYes.addEventListener('change', () => {
    if (isLeaderYes.checked) {
      leaderPositionFields.classList.remove('hidden');
    }
  });
  
  isLeaderNo.addEventListener('change', () => {
    if (isLeaderNo.checked) {
      leaderPositionFields.classList.add('hidden');
    }
  });
}

// Show/hide leader position dropdown based on leadership toggle (church registration path)
const churchLeaderToggle = document.getElementById('church_leader_toggle');
const churchLeaderPositionFields = document.getElementById('churchLeaderPositionFields');

if (churchLeaderToggle && churchLeaderPositionFields) {
  churchLeaderToggle.addEventListener('change', () => {
    if (churchLeaderToggle.checked) {
      churchLeaderPositionFields.classList.remove('hidden');
    } else {
      churchLeaderPositionFields.classList.add('hidden');
    }
  });
}

// Show/hide business fields based on "Do you own a business?" toggle (member path)
const memberOwnsBusinessToggle = document.getElementById('member_owns_business_toggle');
const memberBusinessFields = document.getElementById('memberBusinessFields');

if (memberOwnsBusinessToggle && memberBusinessFields) {
  memberOwnsBusinessToggle.addEventListener('change', () => {
    if (memberOwnsBusinessToggle.checked) {
      memberBusinessFields.classList.remove('hidden');
    } else {
      memberBusinessFields.classList.add('hidden');
    }
  });
}

// ============================================
// PASSWORD FIELD SETUP FOR EACH PATH
// ============================================
function setupPasswordFields(prefix) {
  const passwordInput = document.getElementById(`${prefix}password`);
  const confirmPasswordInput = document.getElementById(`${prefix}confirmPassword`);
  const passwordRequirements = document.getElementById(`${prefix}PasswordRequirements`);
  const confirmPasswordError = document.getElementById(`${prefix}ConfirmPasswordError`);

  if (passwordInput && passwordRequirements) {
    const updatePasswordRequirements = () => {
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
    };
    
    passwordInput.addEventListener('focus', updatePasswordRequirements);
    passwordInput.addEventListener('input', updatePasswordRequirements);
    passwordInput.addEventListener('blur', () => {
      if (passwordInput.value.length === 0) {
        passwordRequirements.classList.add('hidden');
      }
    });
  }

  if (confirmPasswordInput && confirmPasswordError) {
    confirmPasswordInput.addEventListener('input', () => {
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
    });
  }
  
  // Password visibility toggle is handled by js/password-toggle.js
}

// Setup password fields for all three paths
setupPasswordFields('member_'); // Member path
setupPasswordFields('business_'); // Business path
setupPasswordFields('church_'); // Church path

// ============================================
// MULTI-STEP WIZARD NAVIGATION
// ============================================
function setupWizardNavigation(wizardType) {
  const sectionId = wizardType === 'business' ? 'businessSection' : 'churchSection';
  const section = document.getElementById(sectionId);
  if (!section) return;
  
  const steps = section.querySelectorAll('.form-step');
  const progressFill = document.getElementById(`${wizardType}ProgressFill`);
  const progressSteps = document.getElementById(`${wizardType}ProgressSteps`);
  
  let currentStep = 1;
  const totalSteps = steps.length;
  
  function updateProgressBar() {
    const percent = ((currentStep - 1) / (totalSteps - 1)) * 100;
    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }
    
    if (progressSteps) {
      progressSteps.querySelectorAll('.progress-step').forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');
        if (stepNum === currentStep) {
          step.classList.add('active');
        } else if (stepNum < currentStep) {
          step.classList.add('completed');
        }
      });
    }
  }
  
  function showStep(stepNumber) {
    steps.forEach((step, index) => {
      if (index + 1 === stepNumber) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
    
    currentStep = stepNumber;
    updateProgressBar();
    
    // Populate business review on Step 4
    if (wizardType === 'business' && stepNumber === 4) {
      const businessName = document.getElementById('business_name')?.value || '-';
      const ownerName = document.getElementById('owner_name')?.value || '-';
      const email = document.getElementById('business_email')?.value || '-';
      const phone = document.getElementById('business_phone')?.value || '-';
      const categorySelect = document.getElementById('primary_category');
      const category = categorySelect?.options[categorySelect.selectedIndex]?.text || '-';
      const addr1 = document.getElementById('business_address_line1')?.value || '';
      const city = document.getElementById('business_city')?.value || '';
      const state = document.getElementById('business_state')?.value || '';
      const zip = document.getElementById('business_zip_code')?.value || '';
      const address = [addr1, city, state, zip].filter(Boolean).join(', ') || '-';
      const churchSelect = document.getElementById('church_affiliation');
      const church = churchSelect?.options[churchSelect.selectedIndex]?.text || '-';
      
      const reviewName = document.getElementById('businessReviewName');
      const reviewOwner = document.getElementById('businessReviewOwner');
      const reviewEmail = document.getElementById('businessReviewEmail');
      const reviewPhone = document.getElementById('businessReviewPhone');
      const reviewCategory = document.getElementById('businessReviewCategory');
      const reviewAddress = document.getElementById('businessReviewAddress');
      const reviewChurch = document.getElementById('businessReviewChurch');
      
      if (reviewName) reviewName.textContent = businessName;
      if (reviewOwner) reviewOwner.textContent = ownerName;
      if (reviewEmail) reviewEmail.textContent = email;
      if (reviewPhone) reviewPhone.textContent = phone;
      if (reviewCategory) reviewCategory.textContent = category;
      if (reviewAddress) reviewAddress.textContent = address;
      if (reviewChurch) reviewChurch.textContent = church;
    }
    
    // Populate church review on Step 4
    if (wizardType === 'church' && stepNumber === 4) {
      const repName = document.getElementById('representative_name')?.value || '-';
      const email = document.getElementById('church_email')?.value || '-';
      const churchName = document.getElementById('church_church_name')?.value || '-';
      const phone = document.getElementById('church_phone')?.value || '-';
      const addr1 = document.getElementById('church_address_line1')?.value || '';
      const city = document.getElementById('church_city')?.value || '';
      const state = document.getElementById('church_state')?.value || '';
      const zip = document.getElementById('church_zip_code')?.value || '';
      const address = [addr1, city, state, zip].filter(Boolean).join(', ') || '-';
      
      const reviewRepName = document.getElementById('churchReviewRepName');
      const reviewEmail = document.getElementById('churchReviewEmail');
      const reviewChurchName = document.getElementById('churchReviewChurchName');
      const reviewPhone = document.getElementById('churchReviewPhone');
      const reviewAddress = document.getElementById('churchReviewAddress');
      
      if (reviewRepName) reviewRepName.textContent = repName;
      if (reviewEmail) reviewEmail.textContent = email;
      if (reviewChurchName) reviewChurchName.textContent = churchName;
      if (reviewPhone) reviewPhone.textContent = phone;
      if (reviewAddress) reviewAddress.textContent = address;
    }
    
    const formCard = document.getElementById('formCard');
    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  function validateCurrentStep() {
    const currentStepEl = section.querySelector(`.form-step[data-step="${currentStep}"]`);
    if (!currentStepEl) return true;
    
    const requiredFields = currentStepEl.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
      if (!field.disabled && !field.value.trim()) {
        isValid = false;
        field.classList.add('error');
        field.addEventListener('input', () => field.classList.remove('error'), { once: true });
      }
    });
    
    if (currentStep === 1) {
      const passwordField = currentStepEl.querySelector('input[type="password"][id$="_password"]');
      const confirmField = currentStepEl.querySelector('input[type="password"][id$="_confirmPassword"]');
      
      if (passwordField && confirmField) {
        const passwordResult = validatePassword(passwordField.value);
        if (!passwordResult.valid) {
          isValid = false;
          passwordField.classList.add('error');
        }
        
        if (passwordField.value !== confirmField.value) {
          isValid = false;
          confirmField.classList.add('error');
        }
      }
    }
    
    if (!isValid) {
      const firstError = currentStepEl.querySelector('.error');
      if (firstError) {
        firstError.focus();
      }
    }
    
    return isValid;
  }
  
  section.querySelectorAll(`[data-wizard="${wizardType}"]`).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.getAttribute('data-action');
      
      if (action === 'next') {
        if (validateCurrentStep() && currentStep < totalSteps) {
          showStep(currentStep + 1);
        }
      } else if (action === 'prev') {
        if (currentStep > 1) {
          showStep(currentStep - 1);
        }
      } else if (action === 'back-to-selection') {
        showRoleCards();
      }
    });
  });
  
  showStep(1);
  console.log(`✅ Wizard navigation setup for ${wizardType} (${totalSteps} steps)`);
}

// ============================================
// MEMBER WIZARD NAVIGATION (Special handling for review step)
// ============================================
function setupMemberWizardNavigation() {
  const section = document.getElementById('memberSection');
  if (!section) return;
  
  const steps = section.querySelectorAll('.form-step');
  const progressFill = document.getElementById('memberProgressFill');
  const progressSteps = document.getElementById('memberProgressSteps');
  
  let currentStep = 1;
  const totalSteps = steps.length;
  
  function updateProgressBar() {
    const percent = ((currentStep - 1) / (totalSteps - 1)) * 100;
    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }
    
    if (progressSteps) {
      progressSteps.querySelectorAll('.progress-step').forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');
        if (stepNum === currentStep) {
          step.classList.add('active');
        } else if (stepNum < currentStep) {
          step.classList.add('completed');
        }
      });
    }
  }
  
  function updateReviewSummary() {
    const nameEl = document.getElementById('reviewName');
    const emailEl = document.getElementById('reviewEmail');
    const churchEl = document.getElementById('reviewChurch');
    
    const name = document.getElementById('member_name')?.value || '-';
    const email = document.getElementById('member_email')?.value || '-';
    const churchSelector = document.getElementById('church_selector');
    let churchText = '-';
    
    if (churchSelector) {
      if (churchSelector.value === 'none') {
        churchText = 'Not affiliated with a church';
      } else if (churchSelector.value === 'nominate') {
        const nominatedName = document.getElementById('nomination_church_name')?.value;
        churchText = nominatedName ? `Nominating: ${nominatedName}` : 'Nominating a church';
      } else if (churchSelector.value) {
        churchText = churchSelector.options[churchSelector.selectedIndex]?.text || '-';
      }
    }
    
    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (churchEl) churchEl.textContent = churchText;
  }
  
  function showStep(stepNumber) {
    steps.forEach((step, index) => {
      if (index + 1 === stepNumber) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
    
    currentStep = stepNumber;
    updateProgressBar();
    
    if (stepNumber === 3) {
      updateReviewSummary();
    }
    
    const formCard = document.getElementById('formCard');
    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  function validateCurrentStep() {
    const currentStepEl = section.querySelector(`.form-step[data-step="${currentStep}"]`);
    if (!currentStepEl) return true;
    
    let isValid = true;
    
    if (currentStep === 1) {
      const nameField = document.getElementById('member_name');
      const emailField = document.getElementById('member_email');
      const passwordField = document.getElementById('member_password');
      const confirmField = document.getElementById('member_confirmPassword');
      
      if (nameField && !nameField.value.trim()) {
        isValid = false;
        nameField.classList.add('error');
        nameField.addEventListener('input', () => nameField.classList.remove('error'), { once: true });
      }
      
      if (emailField && !emailField.value.trim()) {
        isValid = false;
        emailField.classList.add('error');
        emailField.addEventListener('input', () => emailField.classList.remove('error'), { once: true });
      }
      
      if (passwordField) {
        const passwordResult = validatePassword(passwordField.value);
        if (!passwordResult.valid) {
          isValid = false;
          passwordField.classList.add('error');
          passwordField.addEventListener('input', () => passwordField.classList.remove('error'), { once: true });
        }
      }
      
      if (passwordField && confirmField && passwordField.value !== confirmField.value) {
        isValid = false;
        confirmField.classList.add('error');
        confirmField.addEventListener('input', () => confirmField.classList.remove('error'), { once: true });
      }
    }
    
    if (currentStep === 2) {
      const churchSelector = document.getElementById('church_selector');
      const selectedOption = churchSelector?.options[churchSelector.selectedIndex];
      if (churchSelector && (!churchSelector.value || selectedOption?.disabled)) {
        isValid = false;
        churchSelector.classList.add('error');
        churchSelector.addEventListener('change', () => churchSelector.classList.remove('error'), { once: true });
      }
      
      if (churchSelector && churchSelector.value === 'nominate') {
        const nominationName = document.getElementById('nomination_church_name');
        const nominationState = document.getElementById('nomination_state');
        
        if (nominationName && !nominationName.value.trim()) {
          isValid = false;
          nominationName.classList.add('error');
          nominationName.addEventListener('input', () => nominationName.classList.remove('error'), { once: true });
        }
        
        if (nominationState && !nominationState.value) {
          isValid = false;
          nominationState.classList.add('error');
          nominationState.addEventListener('change', () => nominationState.classList.remove('error'), { once: true });
        }
      }
    }
    
    if (!isValid) {
      const firstError = currentStepEl.querySelector('.error');
      if (firstError) {
        firstError.focus();
      }
    }
    
    return isValid;
  }
  
  section.querySelectorAll('[data-wizard="member"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.getAttribute('data-action');
      
      if (action === 'next') {
        if (validateCurrentStep() && currentStep < totalSteps) {
          showStep(currentStep + 1);
        }
      } else if (action === 'prev') {
        if (currentStep > 1) {
          showStep(currentStep - 1);
        }
      } else if (action === 'back-to-selection') {
        showRoleCards();
      }
    });
  });
  
  showStep(1);
  console.log(`✅ Member wizard navigation setup (${totalSteps} steps)`);
}

setupWizardNavigation('business');
setupWizardNavigation('church');
setupMemberWizardNavigation();

// ============================================
// CHECK URL PARAMETERS & AUTO-SELECT ROLE
// ============================================
const urlParams = new URLSearchParams(window.location.search);
const roleParam = urlParams.get('role');
const tierParam = urlParams.get('tier') || 'free';
const sourceParam = urlParams.get('source');
const billingParam = urlParams.get('billing');

// Show context banner based on source and billing
if (sourceParam && contextBanner && contextBannerText) {
  let bannerMessage = '';
  let bannerIcon = '';
  let bannerClass = '';
  
  if (sourceParam === 'pricing' && tierParam === 'pro') {
    if (billingParam === 'annual') {
      bannerIcon = '🎁';
      bannerMessage = 'Pro Annual ($74.99/year) — 30-day free trial + FREE t-shirt & cap!';
      bannerClass = 'banner-annual';
    } else if (billingParam === 'monthly') {
      bannerIcon = '⚡';
      bannerMessage = 'Pro Monthly ($8.99/month) — Start your 30-day free trial!';
      bannerClass = 'banner-monthly';
    } else {
      bannerIcon = '✨';
      bannerMessage = 'You selected Pro! Complete your registration to start your free trial.';
      bannerClass = 'banner-pro';
    }
  } else if (sourceParam === 'pricing') {
    bannerIcon = '📋';
    bannerMessage = 'Choose your plan below to get started.';
  } else if (sourceParam === 'homepage') {
    bannerIcon = '👋';
    bannerMessage = 'Welcome! Choose how you\'d like to join Kingdom Connects.';
  } else if (sourceParam === 'directory') {
    bannerIcon = '🔍';
    bannerMessage = 'Ready to be discovered by Christian consumers? Let\'s get you listed!';
  }
  
  if (bannerMessage) {
    contextBannerText.innerHTML = `<span class="banner-icon">${bannerIcon}</span> ${bannerMessage}`;
    if (bannerClass) {
      contextBanner.classList.add(bannerClass);
    }
    contextBanner.classList.remove('hidden');
  }
}

// Pre-select billing cycle if provided (BEFORE selectRole so badge shows correctly)
if (billingParam) {
  const billingSelect = document.getElementById('billing_cycle');
  const billingSection = document.getElementById('billingCycleSection');
  
  if (billingSelect && billingSection) {
    // Set the hidden select value for form submission
    billingSelect.value = billingParam;
    billingSelect.classList.add('hidden');
    
    // Create read-only display instead of dropdown
    const billingDisplay = document.createElement('div');
    billingDisplay.className = 'billing-display';
    
    // Helper to apply billing state (used on load and when switching)
    function applyBillingState(billing) {
      billingSelect.value = billing;
      
      if (billing === 'annual') {
        billingDisplay.innerHTML = `
          <p class="billing-selected"><strong>Annual Billing</strong> — $74.99/year</p>
          <p class="help-text">Includes 30-day free trial + FREE t-shirt & cap!</p>
        `;
        selectedRoleBadge.textContent = 'Business Pro Annual';
        contextBanner.classList.remove('banner-monthly');
        contextBanner.classList.add('banner-annual');
        contextBannerText.innerHTML = '<img src="/assets/promo-swag.png" alt="Free swag" class="banner-swag-icon"> Pro Annual ($74.99/year) — 30-day free trial + FREE t-shirt & cap!';
      } else {
        billingDisplay.innerHTML = `
          <p class="billing-selected"><strong>Monthly Billing</strong> — $8.99/month</p>
          <p class="help-text">Includes 30-day free trial. Cancel anytime.</p>
          <div class="upsell-nudge">
            <img src="/assets/promo-swag.png" alt="Free t-shirt and cap" class="swag-thumbnail">
            <p>💡 <a href="#" id="switchToAnnualLink">Switch to Annual</a> and get a FREE t-shirt & cap!</p>
          </div>
        `;
        selectedRoleBadge.textContent = 'Business Pro Monthly';
        contextBanner.classList.remove('banner-annual');
        contextBanner.classList.add('banner-monthly');
        contextBannerText.innerHTML = '<span class="banner-icon">⚡</span> Pro Monthly ($8.99/month) — Start your 30-day free trial!';
        
        // Attach click handler
        const switchLink = document.getElementById('switchToAnnualLink');
        if (switchLink) {
          switchLink.addEventListener('click', (e) => {
            e.preventDefault();
            applyBillingState('annual');
          });
        }
      }
    }
    
    // Apply initial state
    applyBillingState(billingParam);
    
    // Replace dropdown with display
    const formField = billingSelect.closest('.form-field');
    if (formField) {
      formField.innerHTML = '';
      formField.appendChild(billingDisplay);
      formField.appendChild(billingSelect); // Keep hidden for form submission
    }
    
    // Update section header
    const sectionHeader = billingSection.querySelector('h2');
    if (sectionHeader) {
      sectionHeader.textContent = 'Your Billing Plan';
    }
    
    console.log(`💳 Billing locked: ${billingParam}`);
  }
}

// Auto-select role if provided in URL
if (roleParam) {
  console.log(`📌 URL param detected: role=${roleParam}, tier=${tierParam}`);
  
  // Highlight the matching card
  const matchingCard = document.querySelector(
    roleParam === 'business' && tierParam === 'pro'
      ? '.role-card[data-role="business"][data-tier="pro"]'
      : roleParam === 'business'
        ? '.role-card[data-role="business"][data-tier="free"]'
        : `.role-card[data-role="${roleParam}"]`
  );
  
  if (matchingCard) {
    matchingCard.classList.add('selected');
  }
  
  // Auto-select the role (skip cards, go straight to form)
  selectRole(roleParam, tierParam);
}

// Update badge when billing cycle changes
const billingCycleSelect = document.getElementById('billing_cycle');
if (billingCycleSelect) {
  billingCycleSelect.addEventListener('change', () => {
    const currentTier = submissionTierInput.value;
    const currentRole = submissionTypeInput.value;
    if (currentRole === 'business' && currentTier === 'pro') {
      const billing = billingCycleSelect.value;
      const billingLabel = billing === 'annual' ? 'Annual' : billing === 'monthly' ? 'Monthly' : '';
      selectedRoleBadge.textContent = billingLabel ? `Business Pro ${billingLabel}` : 'Business Owner (Pro)';
    }
  });
}

// ============================================
// LOAD CHURCHES (For business path)
// ============================================
let allChurches = [];

async function loadChurches() {
  const churchSelect = document.getElementById("church_affiliation");
  if (!churchSelect) return;
  
  try {
    churchSelect.disabled = true;
    churchSelect.innerHTML = '<option value="">Loading churches...</option>';
    
    const churches = await fetchAllChurches();
    
    allChurches = churches.map(church => {
      const location = [church.city, church.state].filter(Boolean).join(', ');
      let displayName = location ? `${church.church_name} (${location})` : church.church_name;
      if (church.listing_status && church.listing_status !== 'active') {
        displayName += ` (${church.listing_status})`;
      }
      return {
        id: church.id,
        name: church.church_name,
        displayName: displayName
      };
    });
    
    churchSelect.innerHTML = '<option value="">-- Select Your Church --</option>';
    allChurches.forEach(church => {
      const option = document.createElement('option');
      option.value = church.id;
      option.textContent = church.displayName;
      churchSelect.appendChild(option);
    });
    
    churchSelect.disabled = false;
    
  } catch (error) {
    console.error("Error loading churches:", error);
    churchSelect.innerHTML = '<option value="">Error loading churches</option>';
  }
}

// Load churches on page load
loadChurches();

// ============================================
// LOAD CATEGORIES (For business path)
// ============================================
async function initCategories() {
  const categorySelect = document.getElementById('primary_category');
  if (!categorySelect) return;
  
  try {
    categorySelect.innerHTML = '<option value="">Loading categories...</option>';
    await loadCategories();
    
    // Add default option and populate
    categorySelect.innerHTML = '<option value="">-- Select Category --</option>';
    populateCategoryDropdown(categorySelect, { hierarchical: true });
    
    // Re-add the default option at the start (populateCategoryDropdown clears it)
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select Category --';
    categorySelect.insertBefore(defaultOption, categorySelect.firstChild);
    categorySelect.value = '';
    
  } catch (error) {
    console.error('Error loading categories:', error);
    categorySelect.innerHTML = '<option value="">Error loading categories</option>';
  }
}
initCategories();

// ============================================
// CATEGORY SUGGESTION (For business path)
// ============================================
const suggestCategoryBtn = document.getElementById('suggestCategoryBtn');
const categorySuggestionSection = document.getElementById('categorySuggestionSection');
const submitCategoryBtn = document.getElementById('submitCategoryBtn');
const cancelCategoryBtn = document.getElementById('cancelCategoryBtn');

if (suggestCategoryBtn) {
  suggestCategoryBtn.addEventListener('click', () => {
    categorySuggestionSection.classList.toggle('hidden');
  });
}

if (cancelCategoryBtn) {
  cancelCategoryBtn.addEventListener('click', () => {
    categorySuggestionSection.classList.add('hidden');
    document.getElementById('suggested_category').value = '';
  });
}

if (submitCategoryBtn) {
  submitCategoryBtn.addEventListener('click', async () => {
    const suggestedCategory = document.getElementById('suggested_category').value.trim();
    const statusDiv = document.getElementById('categorySuggestionStatus');
    
    if (!suggestedCategory) {
      statusDiv.textContent = 'Please enter a category name';
      statusDiv.classList.remove('hidden', 'status-success');
      statusDiv.classList.add('status-error');
      return;
    }
    
    try {
      statusDiv.textContent = 'Submitting suggestion...';
      statusDiv.classList.remove('hidden', 'status-success', 'status-error');
      statusDiv.classList.add('status-pending');
      
      await addDoc(collection(db, "category_suggestions"), {
        suggested_category: suggestedCategory,
        status: "pending",
        submitted_at: serverTimestamp(),
        submitted_by: auth.currentUser?.uid || "anonymous"
      });
      
      statusDiv.textContent = '✓ Category suggestion submitted! We\'ll review it soon.';
      statusDiv.classList.remove('status-pending');
      statusDiv.classList.add('status-success');
      
      setTimeout(() => {
        categorySuggestionSection.classList.add('hidden');
        document.getElementById('suggested_category').value = '';
        statusDiv.classList.add('hidden');
      }, 2000);
      
    } catch (error) {
      console.error("Error submitting category suggestion:", error);
      statusDiv.textContent = 'Error submitting suggestion. Please try again.';
      statusDiv.classList.remove('status-pending');
      statusDiv.classList.add('status-error');
    }
  });
}

// ============================================
// FORM SUBMISSION
// ============================================
console.log('🔗 About to attach form submit handler...');
console.log('🔗 Calling setupFormValidation...');
setupFormValidation(form, async (e) => {
  console.log('🚀 Form submit handler called');
  
  // Check spam protection first
  const spamCheck = spamProtection.validate();
  if (!spamCheck.valid) {
    statusDiv.classList.remove('hidden', 'status-pending', 'status-success');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = getFriendlyMessage(spamCheck.reason);
    return;
  }
  
  statusDiv.classList.remove('hidden', 'status-success', 'status-error');
  statusDiv.classList.add('status-pending');
  
  // Get role from hidden input (set by card selection)
  const submissionType = submissionTypeInput.value;
  const submissionTier = submissionTierInput.value;
  console.log('📋 Submission type:', submissionType, 'Tier:', submissionTier);
  
  if (!submissionType) {
    statusDiv.textContent = 'Please select a role to continue';
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    return;
  }
  
  // Route to appropriate submission handler
  if (submissionType === 'member') {
    console.log('→ Calling handleMemberSubmission()');
    await handleMemberSubmission();
  } else if (submissionType === 'business') {
    console.log('→ Calling handleBusinessSubmission()');
    await handleBusinessSubmission(submissionTier);
  } else if (submissionType === 'church') {
    console.log('→ Calling handleChurchSubmission()');
    await handleChurchSubmission();
  }
});
console.log('✅ Form validation setup COMPLETE - submit listener attached');

// ============================================
// MEMBER SUBMISSION HANDLER (Full Signup + Optional Church Nomination)
// ============================================
async function handleMemberSubmission() {
  // Get form values
  const name = document.getElementById('member_name').value.trim();
  const email = document.getElementById('member_email').value.trim();
  const password = document.getElementById('member_password').value;
  const confirmPassword = document.getElementById('member_confirmPassword').value;
  const agreeTerms = document.getElementById('agreeTerms').checked;
  const churchSelector = document.getElementById('church_selector').value;
  const memberBusiness = document.getElementById('member_business')?.value.trim() || '';
  const memberBusinessPhone = document.getElementById('member_business_phone')?.value.trim() || '';
  
  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Password does not meet requirements: ' + passwordValidation.errors.join(', ');
    return;
  }
  
  if (password !== confirmPassword) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Passwords do not match!';
    return;
  }
  
  if (!agreeTerms) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'You must agree to the Terms of Service and Privacy Policy.';
    return;
  }
  
  try {
    statusDiv.textContent = 'Creating your account...';
    
    // A retry reuses the already-created signed-in identity instead of creating an orphan.
    let user = auth.currentUser;
    if (!user || user.email?.toLowerCase() !== email.toLowerCase()) {
      user = (await createUserWithEmailAndPassword(auth, email, password)).user;
    }
    await updateProfile(user, { displayName:name });
    const nomination = churchSelector === 'nominate' ? {
      church_name: document.getElementById('nomination_church_name').value.trim(),
      contact_email: document.getElementById('nomination_email').value.trim(),
      contact_phone: document.getElementById('nomination_phone').value.trim(),
      state: document.getElementById('nomination_state').value.trim()
    } : null;
    const result = await changeHierarchy('completeMemberSignup', {
      name, churchId: churchSelector && !['none','nominate'].includes(churchSelector) ? churchSelector : null,
      nomination, businessName:memberBusiness, businessPhone:memberBusinessPhone
    }, user);
    if (isDemoMode()) storeDemoRecord('users', user.uid);
    spamProtection.recordSubmission();
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-success');
    statusDiv.textContent = result.status === 'active' ? 'Account ready. Opening your dashboard…' : 'Account created. Opening your membership status…';
    window.location.href = result.status === 'active' ? '/member/' : '/member/welcome-pending';

  } catch (error) {
    console.error('Member signup error:', error);
    handleFormError(error, form);
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    
    let errorMessage = 'Unable to create account. ';
    
    switch (error.code) {
      case 'auth/email-already-in-use':
        statusDiv.innerHTML = 'This email is already registered. <a href="/login" class="gold-metallic" style="text-decoration:underline;">Login here</a> or <a href="/forgot-password" class="gold-metallic" style="text-decoration:underline;">reset password</a>.';
        return;
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address.';
        break;
      case 'auth/weak-password':
        errorMessage = 'Password is too weak. Use at least 8 characters.';
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
      default:
        errorMessage += error.message || 'Please try again.';
        break;
    }
    
    statusDiv.textContent = errorMessage;
  }
}

// ============================================
// BUSINESS SUBMISSION HANDLER
// ============================================
async function handleBusinessSubmission() {
  statusDiv.textContent = 'Submitting business...';
  
  const email = document.getElementById('business_email').value.trim();
  const password = document.getElementById('business_password').value;
  const confirmPassword = document.getElementById('business_confirmPassword').value;
  
  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Password does not meet requirements: ' + passwordValidation.errors.join(', ');
    return;
  }
  
  if (password !== confirmPassword) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Passwords do not match!';
    return;
  }
  
  const businessName = document.getElementById('business_name').value.trim();
  const description = document.getElementById('description').value.trim();
  const primaryCategory = document.getElementById('primary_category').value.trim();
  const businessPhone = document.getElementById('business_phone').value.trim();
  
  // Validate business phone is provided
  if (!businessPhone) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Business phone number is required.';
    return;
  }
  
  const addressLine1 = document.getElementById('business_address_line1').value.trim();
  const addressLine2 = document.getElementById('business_address_line2').value.trim();
  const city = document.getElementById('business_city').value.trim();
  const state = document.getElementById('business_state').value.trim();
  const zipCode = document.getElementById('business_zip_code').value.trim();
  const website = normalizeUrl(document.getElementById('website').value);
  const churchAffiliation = document.getElementById('church_affiliation').value.trim();
  const ownerName = document.getElementById('owner_name').value.trim();
  const billingCycle = document.getElementById('billing_cycle')?.value || 'monthly';
  const tier = submissionTierInput?.value || 'free';
  
  // Create or login Firebase account
  let currentUser = auth.currentUser;
  
  if (!currentUser) {
    try {
      statusDiv.textContent = "Creating your account...";
      
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;
        
        await updateProfile(currentUser, {
          displayName: ownerName
        });
        
        await setDoc(doc(db, "users", currentUser.uid), {
          name: ownerName,
          email: email,
          roles: ["member", "business_owner"],
          account_status: "pending",
          church_membership_status: "pending",
          created_at: serverTimestamp(),
          last_login: serverTimestamp()
        });
        
        console.log('✅ Account created successfully');
        
      } catch (createError) {
        if (createError.code === 'auth/email-already-in-use') {
          statusDiv.textContent = "Account exists - logging you in...";
          
          try {
            const loginCredential = await signInWithEmailAndPassword(auth, email, password);
            currentUser = loginCredential.user;
            console.log('✅ Logged in successfully');
          } catch (loginError) {
            statusDiv.classList.remove('status-pending');
            statusDiv.classList.add('status-error');
            statusDiv.innerHTML = 'Account exists but password is incorrect. <a href="/login" class="gold-metallic" style="text-decoration:underline;">Login here</a> or <a href="/forgot-password" class="gold-metallic" style="text-decoration:underline;">reset password</a>.';
            return;
          }
        } else {
          throw createError;
        }
      }
      
    } catch (error) {
      console.error('Account creation/login error:', error);
      statusDiv.classList.remove('status-pending');
      statusDiv.classList.add('status-error');
      statusDiv.textContent = 'Failed to create account: ' + (error.message || 'Unknown error');
      return;
    }
  }
  
  // Pro trial tracking - dates will be set on approval by admin
  // This ensures trial starts when the listing actually goes live
  const isProTier = tier === 'pro';
  
  // PUBLIC collection data - visible in directory when approved
  const publicData = {
    business_name: businessName,
    description: description,
    primary_category: primaryCategory,
    phone_number: businessPhone,
    address_line1: addressLine1,
    address_line2: addressLine2,
    city: city,
    state: state,
    zip_code: zipCode,
    website_url: website,
    email: email,
    church_id: null,
    created_by_uid: currentUser.uid,
    platform_approved: false,
    church_approved: false,
    listing_status: "pending",
    is_visible: false,
    subscription_tier: "free",
    pro_status: null,
    created_at: serverTimestamp()
  };
  
  // PRIVATE collection data - owner/admin only
  const privateData = {
    owner_uid: currentUser?.uid,
    owner_email: email,
    your_name: ownerName,
    billing_cycle: isProTier ? billingCycle : null,
    trial_status: isProTier ? 'pending_approval' : null,
    submission_date: serverTimestamp(),
    created_at: serverTimestamp()
  };
  
  // Mark as demo if in demo mode
  if (isDemoMode()) {
    publicData.is_demo = true;
    privateData.is_demo = true;
  }
  
  try {
    statusDiv.textContent = 'Submitting business...';
    
    // Generate a new document ID
    const newDocRef = doc(collection(db, "business_listings_public"));
    const businessId = newDocRef.id;
    
    // Write to both collections with the same ID
    const submission = writeBatch(db);
    submission.set(doc(db, 'business_listings_public', businessId), publicData);
    submission.set(doc(db, 'business_listings_private', businessId), privateData);
    await submission.commit();
    await changeHierarchy('syncEntityRole', { entityType: 'business', entityId: businessId }, currentUser);
    if (churchAffiliation && churchAffiliation !== 'none') {
      await changeHierarchy('requestAffiliation', { businessId, churchId: churchAffiliation }, currentUser);
    }
    
    // Track demo record for cleanup
    if (isDemoMode()) {
      storeDemoRecord('business_listings_public', businessId);
      storeDemoRecord('business_listings_private', businessId);
    }
    
    // Use businessId for further operations
    const docRef = { id: businessId };
    
    // Notify admin of new submission
    try {
      let affiliatedChurchName = null;
      if (churchAffiliation) {
        const churchDoc = await getDoc(doc(db, 'churches', churchAffiliation));
        if (churchDoc.exists()) {
          affiliatedChurchName = churchDoc.data().church_name;
        }
      }
      await notifyAdminNewSubmission('business', businessName, email, affiliatedChurchName, currentUser);
      console.log('Admin notified of new business submission');
    } catch (notifyError) {
      console.error('Failed to notify admin (non-blocking):', notifyError);
    }
    
    // For Pro tier, redirect to Stripe checkout
    if (isProTier) {
      statusDiv.textContent = 'Redirecting to payment...';
      
      try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch('/api/createCheckoutSession', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            businessId: docRef.id,
            billingCycle: billingCycle
          })
        });
        
        const data = await response.json();
        
        if (data.url) {
          window.location.href = data.url;
          return;
        } else {
          throw new Error(data.error || 'Failed to create checkout session');
        }
      } catch (checkoutError) {
        console.error('Checkout error:', checkoutError);
        statusDiv.classList.remove('status-pending');
        statusDiv.classList.add('status-error');
        statusDiv.textContent = 'Error starting payment. Please try again or contact support.';
        return;
      }
    }
    
    // Free tier: show success and redirect
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-success');
    statusDiv.textContent = '✓ Business submitted! Your listing is pending approval.';
    
    form.reset();
    
    // Check if church requires manual approval
    let needsChurchApproval = false;
    let churchName = '';
    if (churchAffiliation) {
      try {
        const churchDoc = await getDoc(doc(db, 'churches', churchAffiliation));
        if (churchDoc.exists()) {
          const churchData = churchDoc.data();
          churchName = churchData.church_name || '';
          needsChurchApproval = churchData.auto_approve_businesses === false;
        }
      } catch (e) {
        console.log('Could not check church approval setting');
      }
    }
    
    // Send confirmation email to business owner
    try {
      await sendBusinessSubmissionConfirmation({
        businessName: businessName,
        ownerEmail: email,
        ownerName: ownerName,
        needsChurchApproval: needsChurchApproval,
        churchName: churchName
      }, currentUser);
      console.log('Business submission confirmation email sent');
    } catch (emailError) {
      console.error('Failed to send confirmation email (non-blocking):', emailError);
    }
    
    spamProtection.recordSubmission();
    
    setTimeout(() => {
      window.location.href = '/congratulations.html?type=business';
    }, 2000);
    
  } catch (error) {
    console.error("Error submitting business:", error);
    handleFormError(error, form);
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = getFriendlyMessage(error);
  }
}

// ============================================
// CHURCH SUBMISSION HANDLER
// ============================================
async function handleChurchSubmission() {
  console.log('⛪ handleChurchSubmission() called');
  statusDiv.textContent = 'Submitting church...';
  
  const email = document.getElementById('church_email').value.trim();
  const password = document.getElementById('church_password').value;
  const confirmPassword = document.getElementById('church_confirmPassword').value;
  
  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Password does not meet requirements: ' + passwordValidation.errors.join(', ');
    return;
  }
  
  if (password !== confirmPassword) {
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Passwords do not match!';
    return;
  }
  
  const churchName = document.getElementById('church_church_name').value.trim();
  const addressLine1 = document.getElementById('church_address_line1').value.trim();
  const addressLine2 = document.getElementById('church_address_line2').value.trim();
  const city = document.getElementById('church_city').value.trim();
  const state = document.getElementById('church_state').value.trim();
  const zipCode = document.getElementById('church_zip_code').value.trim();
  const phone = document.getElementById('church_phone').value.trim();
  const representativeName = document.getElementById('representative_name').value.trim();
  const representativeTitle = document.getElementById('representative_title').value.trim();
  
  // Create or login Firebase account
  let currentUser = auth.currentUser;
  
  if (!currentUser) {
    try {
      statusDiv.textContent = "Creating your account...";
      
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;
        
        await updateProfile(currentUser, {
          displayName: representativeName
        });
        
        await setDoc(doc(db, "users", currentUser.uid), {
          name: representativeName,
          email: email,
          roles: ["member", "church_admin"],
          account_status: "pending",
          church_membership_status: "pending",
          created_at: serverTimestamp(),
          last_login: serverTimestamp()
        });
        
        console.log('✅ Account created successfully');
        
      } catch (createError) {
        if (createError.code === 'auth/email-already-in-use') {
          statusDiv.textContent = "Account exists - logging you in and granting church admin access...";
          
          try {
            const loginCredential = await signInWithEmailAndPassword(auth, email, password);
            currentUser = loginCredential.user;
            console.log('✅ Logged in successfully');
          } catch (loginError) {
            statusDiv.classList.remove('status-pending');
            statusDiv.classList.add('status-error');
            statusDiv.innerHTML = 'Account exists but password is incorrect. <a href="/login" class="gold-metallic" style="text-decoration:underline;">Login here</a> or <a href="/forgot-password" class="gold-metallic" style="text-decoration:underline;">reset password</a>.';
            return;
          }
        } else {
          throw createError;
        }
      }
      
    } catch (error) {
      console.error('Account creation/login error:', error);
      statusDiv.classList.remove('status-pending');
      statusDiv.classList.add('status-error');
      statusDiv.textContent = 'Failed to create account: ' + (error.message || 'Unknown error');
      return;
    }
  }
  
  const churchData = {
    church_name: churchName,
    address_line1: addressLine1,
    address_line2: addressLine2,
    city: city,
    state: state,
    zip_code: zipCode,
    contact_phone: phone,
    contact_email: email,
    submission_type: 'pastor_registration',
    representative_name: representativeName,
    representative_title: representativeTitle,
    listing_status: "pending",
    submission_date: serverTimestamp(),
    admin_uid: currentUser?.uid,
    submitter_email: email,
    membership_approval_mode: 'automatic',
    auto_approve_businesses: true
  };
  
  // Mark as demo if in demo mode
  if (isDemoMode()) {
    churchData.is_demo = true;
  }
  
  try {
    statusDiv.textContent = 'Submitting church...';
    const docRef = await addDoc(collection(db, "churches"), churchData);
    await changeHierarchy('syncEntityRole', { entityType: 'church', entityId: docRef.id }, currentUser);
    
    // Track demo record for cleanup
    if (isDemoMode()) {
      storeDemoRecord('churches', docRef.id);
    }
    
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-success');
    statusDiv.textContent = '✓ Account created! Church submitted for approval.';
    
    spamProtection.recordSubmission();
    
    form.reset();
    
    setTimeout(() => {
      window.location.href = '/congratulations.html?type=church';
    }, 2000);
    
  } catch (error) {
    console.error("Error submitting church:", error);
    handleFormError(error, form);
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = getFriendlyMessage(error);
  }
}

} // End initDirectoryForm

// ============================================
// CALL INITIALIZATION
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDirectoryForm);
} else {
  initDirectoryForm();
}
