const RATE_LIMIT_KEY = 'kc_form_submissions';
const RATE_LIMIT_WINDOW = 60000;
const MAX_SUBMISSIONS_PER_WINDOW = 3;

export function createHoneypotField() {
  const field = document.createElement('div');
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:absolute;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
  field.innerHTML = `
    <label for="website_url">Website</label>
    <input type="text" name="website_url" id="website_url" tabindex="-1" autocomplete="off">
  `;
  return field;
}

export function addHoneypotToForm(formElement) {
  if (!formElement) return;
  if (formElement.querySelector('[name="website_url"]')) return;
  const honeypot = createHoneypotField();
  formElement.insertBefore(honeypot, formElement.firstChild);
}

export function isHoneypotFilled(formElement) {
  const honeypot = formElement.querySelector('[name="website_url"]');
  return honeypot && honeypot.value.trim() !== '';
}

export function checkRateLimit(formId = 'default') {
  const now = Date.now();
  let submissions = [];
  
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (stored) {
      submissions = JSON.parse(stored);
    }
  } catch (e) {
    submissions = [];
  }
  
  submissions = submissions.filter(s => now - s.time < RATE_LIMIT_WINDOW);
  const formSubmissions = submissions.filter(s => s.formId === formId);
  
  return {
    allowed: formSubmissions.length < MAX_SUBMISSIONS_PER_WINDOW,
    remaining: MAX_SUBMISSIONS_PER_WINDOW - formSubmissions.length,
    resetIn: formSubmissions.length > 0 ? 
      Math.ceil((RATE_LIMIT_WINDOW - (now - formSubmissions[0].time)) / 1000) : 0
  };
}

export function recordSubmission(formId = 'default') {
  const now = Date.now();
  let submissions = [];
  
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (stored) {
      submissions = JSON.parse(stored);
    }
  } catch (e) {
    submissions = [];
  }
  
  submissions = submissions.filter(s => now - s.time < RATE_LIMIT_WINDOW);
  submissions.push({ formId, time: now });
  
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(submissions));
  } catch (e) {
    console.warn('Could not save rate limit data');
  }
}

export function validateSpamProtection(formElement, formId = 'default') {
  if (isHoneypotFilled(formElement)) {
    console.warn('Honeypot triggered - likely bot submission');
    return { valid: false, reason: 'spam_detected', message: 'Submission blocked.' };
  }
  
  const rateCheck = checkRateLimit(formId);
  if (!rateCheck.allowed) {
    return { 
      valid: false, 
      reason: 'rate_limited', 
      message: `Too many submissions. Please wait ${rateCheck.resetIn} seconds.`
    };
  }
  
  return { valid: true, reason: null, message: null };
}

export function initSpamProtection(formElement, formId = 'default') {
  addHoneypotToForm(formElement);
  return {
    validate: () => validateSpamProtection(formElement, formId),
    recordSubmission: () => recordSubmission(formId)
  };
}
