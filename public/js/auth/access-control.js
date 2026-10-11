/**
 * Centralized Access Control Module
 * ONE place for all authentication and authorization checks
 * 
 * Usage:
 *   import { requireAuth } from '../../js/auth/access-control.js';
 *   requireAuth({ roles: ['admin'] }, (userContext) => { ... });
 */

import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeUserRoles, loadUserContext } from "../role-utils.js";
import { getBusinessForUser } from "../services/business-service.js";

const LOGIN_URL = '/login.html';
const HOME_URL = '/index.html';

/**
 * Main authentication guard - use this for all protected pages
 * 
 * @param {Object} options - Configuration options
 * @param {Array<string>} options.roles - Required roles (user needs ANY of these)
 * @param {string} options.redirectOnFail - Where to redirect if access denied (default: home)
 * @param {boolean} options.requireBusiness - Must own a business listing
 * @param {boolean} options.requireChurch - Must admin a church
 * @param {boolean} options.requireSalesDirector - Must be a sales director
 * @param {Function} onSuccess - Callback with (userContext, firebaseUser) when access granted
 */
export function requireAuth(options = {}, onSuccess) {
  const {
    roles = [],
    redirectOnFail = HOME_URL,
    requireBusiness = false,
    requireChurch = false,
    requireSalesDirector = false
  } = options;

  let hasResolved = false;
  
  console.log('🔒 requireAuth called with options:', { roles, requireBusiness, requireChurch, requireSalesDirector });
  
  // Use central auth state via onAuthChange subscription
  const handleAuthState = async (firebaseUser, cachedContext) => {
    console.log('🔒 Central auth fired, user:', firebaseUser ? firebaseUser.email : 'null');
    
    if (hasResolved) {
      console.log('🔒 Already resolved, skipping');
      return;
    }
    
    if (!firebaseUser) {
      console.log('🔒 No user from central auth, redirecting to login');
      hasResolved = true;
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${LOGIN_URL}?returnUrl=${returnUrl}`;
      return;
    }
    
    hasResolved = true;
    console.log('🔒 User authenticated:', firebaseUser.email);

    try {
      // Use cached context from central auth if available, otherwise load fresh
      const userContext = await loadUserContext(firebaseUser);
      
      if (!userContext) {
        showAccessDenied('Unable to load user profile.');
        redirectTo(redirectOnFail);
        return;
      }

      if (userContext.exists === false) { window.location.href='/add_to_directory?role=member'; return; }
      if (['suspended', 'disabled', 'rejected'].includes(userContext.account_status)) {
        showAccessDenied('Your account access is suspended.');
        redirectTo(HOME_URL);
        return;
      }
      const isAdmin = userContext.roles.includes('admin') || userContext.roles.includes('platform_admin');

      if (roles.length > 0 && !isAdmin) {
        const hasRequiredRole = roles.some(role => userContext.roles.includes(role));
        if (!hasRequiredRole) {
          showAccessDenied('You do not have permission to access this page.');
          redirectTo(redirectOnFail);
          return;
        }
      }

      let businessContext = null;
      if (requireBusiness) {
        businessContext = await getBusinessForUser(firebaseUser.uid);
        if (!businessContext && !isAdmin) {
          showAccessDenied('No business listing found for your account.');
          redirectTo(HOME_URL);
          return;
        }
      }

      if (businessContext && !isAdmin) {
        const requestedId = new URLSearchParams(window.location.search).get('id');
        const eligible = [];
        for (const business of businessContext) {
          const parent = business.church_id ? await getDoc(doc(db, 'churches', business.church_id)) : null;
          if (!['suspended', 'rejected'].includes(business.listing_status) &&
              (!business.church_id || parent?.data()?.listing_status === 'active')) eligible.push(business);
        }
        businessContext = requestedId ? eligible.filter(business => business.id === requestedId) : eligible;
        if (!businessContext.length) {
          showAccessDenied('This business is unavailable or is not owned by your account.');
          redirectTo(HOME_URL);
          return;
        }
      }

      let churchContext = null;
      if (requireChurch) {
        console.log('🔒 Getting church for:', firebaseUser.uid, firebaseUser.email);
        console.log('🔒 User home_church_id:', userContext.home_church_id);
        churchContext = await getChurchForUser(firebaseUser.uid, firebaseUser.email, userContext);
        console.log('🔒 churchContext result:', churchContext ? churchContext.id : 'null');
        if (!churchContext) return;

      }

      if (churchContext && ['suspended', 'rejected'].includes(churchContext.listing_status) && !isAdmin) {
        showAccessDenied('This church is not currently enabled.');
        redirectTo(HOME_URL);
        return;
      }
      if (requireSalesDirector && !isAdmin) {
        const isDirector = await checkIsSalesDirector(firebaseUser.uid);
        if (!isDirector) {
          showAccessDenied('This page is for Sales Directors only.');
          redirectTo('/sales/index');
          return;
        }
      }

      // Pass context objects: businessContext for business pages, churchContext for church pages
      if (typeof onSuccess === 'function') {
        onSuccess(userContext, firebaseUser, businessContext || churchContext);
      }

    } catch (error) {
      console.error('🔒 requireAuth error:', error);
      showAccessDenied('Error verifying access. Please try again.');
      redirectTo(redirectOnFail);
    }
  };
  
  // Subscribe to central auth manager
  onAuthChange(handleAuthState);
}

/**
 * Shorthand for admin-only pages
 */
export function requireAdmin(onSuccess) {
  requireAuth({ roles: ['admin', 'platform_admin'] }, onSuccess);
}

/**
 * Shorthand for business owner pages
 */
export function requireBusinessOwner(onSuccess) {
  requireAuth({ roles: ['business_owner'], requireBusiness: true }, onSuccess);
}

/**
 * Shorthand for church admin pages
 */
export function requireChurchAdmin(onSuccess) {
  requireAuth({ roles: ['church_admin'], requireChurch: true }, onSuccess);
}

/**
 * Shorthand for sales agent pages
 */
export function requireSalesAgent(onSuccess) {
  requireAuth({ roles: ['sales_agent', 'sales_director'] }, onSuccess);
}

/**
 * Shorthand for sales director pages
 */
export function requireSalesDirector(onSuccess) {
  requireAuth({ roles: ['sales_director'], requireSalesDirector: true }, onSuccess);
}

/**
 * Shorthand for member pages (any logged-in user)
 */
export function requireMember(onSuccess, { allowPending = false } = {}) {
  requireAuth({}, (context, user) => {
    if (!allowPending && context.account_status === 'pending') {
      window.location.href = '/member/welcome-pending.html';
      return;
    }
    onSuccess(context, user);
  });
}

/**
 * Get current auth state with session restoration wait
 * Use this on public pages that need to know if user is logged in
 * (e.g., login page showing logout button)
 * 
 * @returns {Promise<{user: Object|null, isLoggedIn: boolean}>}
 */
export function getAuthState() {
  return new Promise((resolve) => {
    // Use central auth - if already initialized, return immediately
    if (authInitialized) {
      resolve({
        user: currentUser,
        isLoggedIn: !!currentUser,
        userContext: currentUserContext
      });
      return;
    }
    
    // Otherwise wait for central auth to initialize
    const unsubscribe = onAuthChange((user, context) => {
      unsubscribe();
      resolve({
        user: user,
        isLoggedIn: !!user,
        userContext: context
      });
    });
  });
}

async function getChurchForUser(uid, email, userContext = null) {
  const isAdmin = userContext?.roles?.some(role => ['admin','platform_admin'].includes(role));
  const requested = new URLSearchParams(window.location.search).get('id');
  let church;
  if (requested) {
    const snapshot = await getDoc(doc(db, 'churches', requested));
    if (!snapshot.exists()) throw Error('Church not found.');
    church = { ...snapshot.data(), id: snapshot.id };
    if (!isAdmin && church.admin_uid !== uid) throw Error('This church is not under your authority.');
  } else {
    const snapshot = await getDocs(isAdmin ? collection(db, 'churches') : query(collection(db, 'churches'), where('admin_uid', '==', uid)));
    if (snapshot.size === 1) church = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id };
    else {
      if (document.getElementById('churchContextSelector')) return null;
      const section = document.createElement('section'); section.id = 'churchContextSelector'; section.className = 'card p-lg';
      const heading = document.createElement('h2'); heading.textContent = snapshot.empty ? 'No church is connected to this account.' : 'Choose a church';
      section.append(heading);
      for (const item of snapshot.docs.sort((a,b) => (a.data().church_name || '').localeCompare(b.data().church_name || ''))) {
        const link = document.createElement('a'); link.className = 'btn btn-secondary m-sm';
        const url = new URL(window.location.href); url.searchParams.set('id', item.id); link.href = url.href;
        link.textContent = (item.data().church_name || 'Unnamed church') + ' (' + (item.data().listing_status || 'pending') + ')'; section.append(link);
      }
      const loading = document.getElementById('loadingMessage'); if (loading) loading.classList.add('hidden');
      (document.querySelector('main') || document.body).append(section);
      return null;
    }
  }
  const current = new URL(window.location.href); current.searchParams.set('id', church.id); window.history.replaceState(null, '', current);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]'); if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin && (url.pathname === '/church-admin' || url.pathname.startsWith('/church-admin/'))) {
      url.searchParams.set('id', church.id); link.href = url.href;
    }
  }, true);
  return church;
}

async function checkIsSalesDirector(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) return false;
    
    const userData = userDoc.data();
    const roles = normalizeUserRoles(userData);
    
    return roles.includes('sales_director') || 
           roles.includes('admin') || 
           userData.is_sales_director === true;
  } catch (error) {
    console.error('Error checking sales director status:', error);
    return false;
  }
}

function showAccessDenied(message) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'error');
  } else {
    console.warn('Access denied:', message);
  }
}

function redirectTo(url, delay = 1500) {
  setTimeout(() => {
    window.location.href = url;
  }, delay);
}

// ============================================
// CENTRAL AUTH STATE MANAGER
// Single source of truth for auth state
// ============================================

let currentUser = null;
let currentUserContext = null;
let authInitialized = false;
const authListeners = [];

/**
 * Subscribe to auth state changes
 * Callback receives (user, userContext) - both null if logged out
 */
export function onAuthChange(callback) {
  authListeners.push(callback);
  
  // If already initialized, call immediately with current state
  if (authInitialized) {
    callback(currentUser, currentUserContext);
  }
  
  // Return unsubscribe function
  return () => {
    const index = authListeners.indexOf(callback);
    if (index > -1) authListeners.splice(index, 1);
  };
}

/**
 * Get current user synchronously (may be null if not initialized yet)
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Get current user context synchronously (may be null)
 */
export function getCurrentUserContext() {
  return currentUserContext;
}

/**
 * Check if auth has been initialized
 */
export function isAuthInitialized() {
  return authInitialized;
}

// Initialize the central auth listener once
onAuthStateChanged(auth, async (firebaseUser) => {
  console.log('🔐 Central auth state:', firebaseUser ? firebaseUser.email : 'logged out');
  
  currentUser = firebaseUser;
  
  if (firebaseUser) {
    try {
      currentUserContext = await loadUserContext(firebaseUser);
    } catch (error) {
      console.error('Failed to load user context:', error);
      currentUserContext = null;
    }
  } else {
    currentUserContext = null;
  }
  
  authInitialized = true;
  
  // Notify all listeners
  authListeners.forEach(callback => {
    try {
      callback(currentUser, currentUserContext);
    } catch (error) {
      console.error('Auth listener error:', error);
    }
  });
});
