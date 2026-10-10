/**
 * Role Utilities
 * Helper functions for handling user roles with backward compatibility
 * and role-based dashboard access
 */

import { db } from "./firebase-config.js";
import { doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let cachedUserContext = null;
let cachedBusinessData = null;

/**
 * Normalize user roles from Firestore data
 * Handles both old format (role: "string") and new format (roles: [])
 * 
 * @param {Object} userData - User document data from Firestore
 * @returns {Array<string>} - Normalized roles array
 */
export function normalizeUserRoles(userData) {
  if (!userData) {
    return ['member'];
  }

  let roles = userData.roles || [];
  
  // Backward compatibility: convert old single role field to array
  if (roles.length === 0 && userData.role) {
    roles = [userData.role];
  }
  
  // Default to 'member' if no roles found (registered users)
  if (roles.length === 0) {
    roles = ['member'];
  }
  
  return roles;
}

/**
 * Get all available dashboards for a user based on their roles
 * Returns dashboard info with URLs and labels
 * 
 * @param {Array<string>} roles - User's roles array
 * @returns {Array<Object>} - Array of {url, label, icon} objects
 */
export function getUserDashboards(roles) {
  const dashboards = [];
  
  const isAdmin = roles.includes('admin') || roles.includes('platform_admin');
  
  if (isAdmin) {
    dashboards.push({
      url: '/admin/index.html',
      label: 'Admin Dashboard',
      icon: 'shield',
      priority: 1
    });
  }
  
  if (roles.includes('business_owner') || isAdmin) {
    dashboards.push({
      url: '/business-admin/index.html',
      label: 'Business Dashboard',
      icon: 'briefcase',
      priority: 2
    });
  }
  
  if (roles.includes('church_admin') || isAdmin) {
    dashboards.push({
      url: '/church-admin/index.html',
      label: 'Church Dashboard',
      icon: 'church',
      priority: 3
    });
  }
  
  if (roles.includes('sales_agent') || roles.includes('sales_director') || isAdmin) {
    dashboards.push({
      url: '/sales/index.html',
      label: 'Sales Dashboard',
      icon: 'dollar',
      priority: 4
    });
  }
  
  if (roles.includes('marketing_manager') || isAdmin) {
    dashboards.push({
      url: '/marketing-manager/index.html',
      label: 'Marketing Dashboard',
      icon: 'megaphone',
      priority: 5
    });
  }
  
  if (roles.includes('member') || isAdmin) {
    dashboards.push({
      url: '/member/index.html',
      label: 'Member Admin',
      icon: 'user',
      priority: 6
    });
  }
  
  return dashboards.sort((a, b) => a.priority - b.priority);
}

/**
 * Get primary dashboard URL for login redirect
 * Returns highest-priority dashboard based on roles
 * 
 * @param {Array<string>} roles - User's roles array
 * @returns {string} - Dashboard URL
 */
export function getPrimaryDashboard(roles) {
  // Admin always goes to admin dashboard - highest priority
  if (roles.includes('platform_admin') || roles.includes('admin')) {
    return '/admin/index.html';
  }
  
  const dashboards = getUserDashboards(roles);
  const nonMemberDashboards = dashboards.filter(d => d.url !== '/member/index.html');
  
  // If only one non-member dashboard, go there
  if (nonMemberDashboards.length === 1) {
    return nonMemberDashboards[0].url;
  }
  
  // Multiple dashboards - return highest priority (already sorted)
  if (nonMemberDashboards.length > 1) {
    return nonMemberDashboards[0].url;
  }
  
  if (roles.includes('member')) return '/member/index.html';
  return '/';
}

/**
 * Load user context from Firestore
 * Returns user profile with roles and linked entity IDs
 * 
 * @param {Object} firebaseUser - Firebase Auth user object
 * @returns {Promise<Object>} - User context with roles and linked IDs
 */
export async function loadUserContext(firebaseUser) {
  if (!firebaseUser) {
    return null;
  }

  try {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      console.log('⚠️ User document not found for UID:', firebaseUser.uid);
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        roles: ['member'],
        business_id: null,
        managed_church_ids: [],
        home_church_id: null,
        exists: false
      };
    }

    const userData = userDoc.data();
    const roles = normalizeUserRoles(userData);
    const ownedChurches = await getDocs(query(collection(db, 'churches'), where('admin_uid', '==', firebaseUser.uid)));
    const managedChurchIds = ownedChurches.docs.map(church => church.id);

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: userData.name || firebaseUser.displayName || '',
      roles: roles,
      business_id: userData.business_id || null,
      managed_church_ids: managedChurchIds,
      home_church_id: userData.home_church_id || null,
      account_status: userData.account_status || 'active',
      exists: true
    };
  } catch (error) {
    console.error('Error loading user context:', error);
    return null;
  }
}

/**
 * Check if user has a specific role
 * 
 * @param {Object} userContext - User context from loadUserContext
 * @param {string} role - Role to check
 * @returns {boolean}
 */
export function hasRole(userContext, role) {
  if (!userContext || !userContext.roles) return false;
  return userContext.roles.includes(role) || userContext.roles.includes('admin');
}

/**
 * Check if user has access to business admin dashboard
 * 
 * @param {Object} userContext - User context from loadUserContext
 * @returns {boolean}
 */
export function canAccessBusinessAdmin(userContext) {
  return hasRole(userContext, 'business_owner') && userContext.business_id;
}

/**
 * Check if user has access to church admin dashboard
 * 
 * @param {Object} userContext - User context from loadUserContext
 * @returns {boolean}
 */
export function canAccessChurchAdmin(userContext) {
  return hasRole(userContext, 'church_admin') && 
    userContext.managed_church_ids.length > 0;
}

/**
 * Load business data for a user by email
 * Caches the result for subsequent calls
 * 
 * @param {string} userEmail - User's email address
 * @returns {Promise<Object|null>} - Business data with id, or null if not found
 */
export async function loadBusinessByEmail(userEmail) {
  if (cachedBusinessData && cachedBusinessData.email === userEmail) {
    return cachedBusinessData;
  }

  try {
    // Query private collection by owner_email, then merge with public
    const privateQuery = query(collection(db, "business_listings_private"), where("owner_email", "==", userEmail));
    const privateSnapshot = await getDocs(privateQuery);

    // Find active business (consistent pattern across all files)
    let activeBusiness = null;
    for (const docSnap of privateSnapshot.docs) {
      const privateData = docSnap.data();
      // Get public data to merge
      const publicDoc = await getDoc(doc(db, "business_listings_public", docSnap.id));
      const publicData = publicDoc.exists() ? publicDoc.data() : {};
      const merged = { id: docSnap.id, ...publicData, ...privateData };
      
      if (merged.listing_status === 'active') {
        activeBusiness = merged;
        break;
      }
    }

    if (!activeBusiness) {
      cachedBusinessData = null;
      return null;
    }

    cachedBusinessData = activeBusiness;
    
    console.log('[RoleUtils] Loaded business:', cachedBusinessData.business_name);
    console.log('[RoleUtils] pro_status:', cachedBusinessData.pro_status, '| type:', typeof cachedBusinessData.pro_status);
    
    return cachedBusinessData;
  } catch (error) {
    console.error('[RoleUtils] Error loading business:', error);
    return null;
  }
}

/**
 * Check if a business has Pro status
 * Works with business data object or uses cached data
 * 
 * @param {Object} [business] - Business data object (optional, uses cache if not provided)
 * @returns {boolean}
 */
export function isBusinessPro(business) {
  const biz = business || cachedBusinessData;
  if (!biz) return false;
  
  const status = biz.pro_status;
  const isPro = status === true || status === "pro" || status === "active";
  
  console.log('[RoleUtils] isBusinessPro check:', status, '→', isPro);
  return isPro;
}

/**
 * Get cached business data
 * @returns {Object|null}
 */
export function getCachedBusiness() {
  return cachedBusinessData;
}

/**
 * Clear cached data (call on logout)
 */
export function clearCache() {
  cachedUserContext = null;
  cachedBusinessData = null;
}

/**
 * Apply Pro feature visibility to page elements
 * Centralized function to show/hide Pro features based on business status
 * 
 * @param {boolean} isPro - Whether business has Pro status
 */
export function applyProFeatures(isPro) {
  console.log('[RoleUtils] Applying Pro features, isPro:', isPro);
  
  const proSections = [
    { section: 'socialMediaSection', upgrade: 'socialUpgradePrompt', badge: 'socialProBadge' },
    { section: 'photosSection', upgrade: 'photosUpgradePrompt', badge: 'photosProBadge' },
    { section: 'videosSection', upgrade: 'videosUpgradePrompt', badge: 'videosProBadge' }
  ];

  proSections.forEach(({ section, upgrade, badge }) => {
    const sectionEl = document.getElementById(section);
    const upgradeEl = document.getElementById(upgrade);
    const badgeEl = document.getElementById(badge);

    if (isPro) {
      if (sectionEl) sectionEl.classList.remove('hidden');
      if (upgradeEl) upgradeEl.classList.add('hidden');
      if (badgeEl) badgeEl.classList.remove('hidden');
    } else {
      if (sectionEl) sectionEl.classList.add('hidden');
      if (upgradeEl) upgradeEl.classList.remove('hidden');
    }
  });

  const statusDisplay = document.getElementById('pro_status_display');
  if (statusDisplay) {
    statusDisplay.value = isPro ? 'Pro Member' : 'Free Tier';
  }

  const upgradePrompt = document.getElementById('upgradePrompt');
  if (upgradePrompt) {
    if (isPro) {
      upgradePrompt.classList.add('hidden');
    } else {
      upgradePrompt.classList.remove('hidden');
    }
  }

  console.log('[RoleUtils] Pro features applied successfully');
}

/**
 * Get max subcategories based on Pro status
 * @param {boolean} isPro 
 * @returns {number}
 */
export function getMaxCategories(isPro) {
  return isPro ? 3 : 1;
}

/**
 * Get max photos based on Pro status
 * @param {boolean} isPro 
 * @returns {number}
 */
export function getMaxPhotos(isPro) {
  return isPro ? 10 : 0;
}

/**
 * Get max videos based on Pro status
 * @param {boolean} isPro 
 * @returns {number}
 */
export function getMaxVideos(isPro) {
  return isPro ? 3 : 0;
}
