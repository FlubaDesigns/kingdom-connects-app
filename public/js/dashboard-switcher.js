/**
 * Dashboard Switcher Component
 * Shows buttons for all dashboards the user has access to
 * Import this into dashboard header files
 */

import { db } from "./firebase-config.js";
import { getCurrentUser, getCurrentUserContext, onAuthChange } from './auth/access-control.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeUserRoles, getUserDashboards } from "./role-utils.js";

// Track if switcher has been initialized to prevent duplicates
let switcherInitialized = false;

/**
 * Initialize dashboard switcher on the page
 * Call this from each dashboard's header.js file
 */
export async function initDashboardSwitcher() {
  // Prevent duplicate initialization
  if (switcherInitialized) {
    return;
  }
  
  const currentUser = getCurrentUser();
  const userContext = getCurrentUserContext();
  
  if (!currentUser) {
    return;
  }

  try {
    // Use cached context if available, otherwise fetch
    let roles;
    if (userContext?.roles) {
      roles = userContext.roles;
    } else {
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        return;
      }
      const userData = userDoc.data();
      roles = normalizeUserRoles(userData);
    }
    
    const dashboards = getUserDashboards(roles);
    
    // Only show switcher if user has multiple dashboards
    if (dashboards.length <= 1) {
      switcherInitialized = true;
      return;
    }

    renderDashboardSwitcher(dashboards);
    switcherInitialized = true;
  } catch (error) {
    console.error('Error loading dashboard switcher:', error);
  }
}

/**
 * Render the dashboard switcher UI using existing dropdown styles
 * @param {Array} dashboards - Array of dashboard objects
 */
function renderDashboardSwitcher(dashboards) {
  const currentPath = window.location.pathname;
  
  const switcherHTML = `
    <li class="has-dropdown">
      <a href="#" class="dropdown-toggle" id="dashboardSwitcherBtn" aria-expanded="false">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        My Dashboards <span class="dropdown-arrow">▾</span>
      </a>
      <ul class="dropdown-menu">
        ${dashboards.map(d => {
          const isActive = currentPath.includes(d.url.split('/')[1]);
          return `<li><a href="${d.url}"${isActive ? ' class="active"' : ''}>${getIconSVG(d.icon)}<span>${d.label}</span></a></li>`;
        }).join('')}
      </ul>
    </li>
  `;
  
  // Insert switcher into nav-links
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    const switcherContainer = document.createElement('div');
    switcherContainer.innerHTML = switcherHTML;
    const switcherElement = switcherContainer.firstElementChild;
    navLinks.insertBefore(switcherElement, navLinks.firstChild);
    
    // Add event listeners using existing dropdown pattern - pass the specific element
    setupSwitcherInteractions(switcherElement);
  }
}

/**
 * Setup click handlers for the switcher using existing dropdown pattern
 * @param {HTMLElement} dropdown - The specific dropdown element to bind to
 */
function setupSwitcherInteractions(dropdown) {
  if (!dropdown) return;
  
  const toggle = dropdown.querySelector('.dropdown-toggle');
  if (!toggle) return;
  
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    dropdown.classList.toggle('active');
    toggle.setAttribute('aria-expanded', dropdown.classList.contains('active'));
  });
  
  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * Get SVG icon for dashboard type
 * @param {string} icon - Icon name
 * @returns {string} - SVG markup
 */
function getIconSVG(icon) {
  const icons = {
    shield: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
    briefcase: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
    church: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 9h4V6h3l-5-5-5 5h3z"></path><path d="M18 22V11l-6-6-6 6v11z"></path></svg>',
    dollar: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
    megaphone: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-5v12L3 13v-2z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>'
  };
  
  return icons[icon] || icons.briefcase;
}

// Auto-initialize on dashboard pages via central auth
onAuthChange((user) => {
  if (user) {
    initDashboardSwitcher();
  }
});
