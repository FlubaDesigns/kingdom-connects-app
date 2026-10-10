import { db } from '../firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const ERROR_COLLECTION = 'client_errors';
const ERROR_QUEUE_KEY = 'kc_error_queue';

export const friendlyMessages = {
  'auth/user-not-found': 'No account found with that email. Would you like to sign up?',
  'auth/wrong-password': 'Incorrect password. Please try again or reset your password.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
  'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Please check your connection and try again.',
  'permission-denied': 'You don\'t have permission to do that. Please log in or contact support.',
  'unavailable': 'Service temporarily unavailable. Please try again in a moment.',
  'deadline-exceeded': 'Request timed out. Please try again.',
  'not-found': 'The requested item was not found.',
  'already-exists': 'This item already exists.',
  'rate_limited': 'Too many submissions. Please wait a moment.',
  'spam_detected': 'Submission blocked for security reasons.',
  'default': 'Something went wrong. Please try again or contact support.'
};

export function getFriendlyMessage(error) {
  if (typeof error === 'string') {
    return friendlyMessages[error] || error;
  }
  
  const code = error?.code || error?.message || '';
  
  for (const [key, message] of Object.entries(friendlyMessages)) {
    if (code.includes(key)) {
      return message;
    }
  }
  
  return friendlyMessages.default;
}

export function showError(message) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'error', 5000);
  } else {
    console.error('Error:', message);
    alert(message);
  }
}

export function showSuccess(message) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'success', 3000);
  } else {
    console.log('Success:', message);
  }
}

export function showWarning(message) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'warning', 4000);
  } else {
    console.warn('Warning:', message);
  }
}

export async function logError(error, context = {}) {
  const errorData = {
    message: error?.message || String(error),
    code: error?.code || null,
    stack: error?.stack?.substring(0, 2000) || null,
    url: window.location.href,
    userAgent: navigator.userAgent.substring(0, 500),
    timestamp: new Date().toISOString(),
    context: {
      ...context,
      referrer: document.referrer?.substring(0, 500) || '',
      screenSize: `${window.innerWidth}x${window.innerHeight}`
    }
  };
  
  try {
    await addDoc(collection(db, ERROR_COLLECTION), {
      ...errorData,
      created_at: serverTimestamp()
    });
  } catch (logError) {
    console.error('Failed to log error to Firestore:', logError);
    queueErrorForLater(errorData);
  }
}

function queueErrorForLater(errorData) {
  try {
    let queue = [];
    const stored = localStorage.getItem(ERROR_QUEUE_KEY);
    if (stored) {
      queue = JSON.parse(stored);
    }
    queue.push(errorData);
    if (queue.length > 10) {
      queue = queue.slice(-10);
    }
    localStorage.setItem(ERROR_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Could not queue error for later');
  }
}

export async function flushErrorQueue() {
  try {
    const stored = localStorage.getItem(ERROR_QUEUE_KEY);
    if (!stored) return;
    
    const queue = JSON.parse(stored);
    if (queue.length === 0) return;
    
    for (const errorData of queue) {
      await addDoc(collection(db, ERROR_COLLECTION), {
        ...errorData,
        created_at: serverTimestamp(),
        queued: true
      });
    }
    
    localStorage.removeItem(ERROR_QUEUE_KEY);
  } catch (e) {
    console.warn('Could not flush error queue');
  }
}

export function initGlobalErrorHandler() {
  window.addEventListener('error', (event) => {
    logError({
      message: event.message,
      stack: event.error?.stack,
      code: 'uncaught_error'
    }, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    logError({
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      code: 'unhandled_rejection'
    });
  });
  
  flushErrorQueue();
}

export function handleFormError(error, formElement) {
  const message = getFriendlyMessage(error);
  showError(message);
  logError(error, { 
    formId: formElement?.id || 'unknown',
    type: 'form_error'
  });
  return message;
}
