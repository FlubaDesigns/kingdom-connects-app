import { onAuthChange } from './auth/access-control.js';
import { getPrimaryDashboard } from './role-utils.js';

(function() {
  const html = document.documentElement;

  const savedTheme = localStorage.getItem('kc-theme');
  if (savedTheme) html.setAttribute('data-theme', savedTheme);

  const savedScale = localStorage.getItem('kc-fontScale');
  if (savedScale) html.style.setProperty('--base-font-size', savedScale + 'px');

  function getLoginUrl() {
    const currentPage = window.location.pathname.split('/').pop();
    const roleMap = {
      'for-businesses': '/login?role=business',
      'for-businesses.html': '/login?role=business',
      'for-churches': '/login?role=church',
      'for-churches.html': '/login?role=church',
      'for-agents': '/login?role=agent',
      'for-agents.html': '/login?role=agent'
    };
    return roleMap[currentPage] || '/login';
  }

  function initHeader() {
    const header = document.getElementById("header");
    if (!header) {
      setTimeout(initHeader, 50);
      return;
    }

    const loginUrl = getLoginUrl();
    header.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="/" aria-label="Home">
            <img class="site-logo" src="/library/kingdom-connects-logo-300.png" alt="Kingdom Connects logo">
            <div class="brand-text">
              <h1 class="site-title"><span>Kingdom</span> <span>Connects</span></h1>
              <span class="tagline">Grow the Kingdom!</span>
            </div>
          </a>

          <div class="header-actions">
            <div class="gear-wrap">
              <button id="settingsBtn" class="gear-btn" aria-haspopup="menu" aria-expanded="false" title="Change appearance" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>

              <div id="settingsMenu" role="menu" aria-label="Display & theme settings">
                <h4>Display</h4>
                <div class="setting-row">
                  <span>Theme</span>
                  <button class="theme-toggle" id="themeToggle" aria-label="Toggle light/dark" type="button">
                    <span class="toggle-track"><span class="toggle-thumb"></span></span>
                  </button>
                </div>
                <div class="setting-row">
                  <span>Font size</span>
                  <div class="font-size-controls">
                    <button type="button" id="fontMinus" aria-label="Decrease font size">–</button>
                    <button type="button" id="fontPlus" aria-label="Increase font size">+</button>
                  </div>
                </div>
              </div>
            </div>

            <div id="userStatus" class="user-status"></div>

            <button class="menu-toggle" id="menuBtn" aria-haspopup="true" aria-expanded="false" aria-controls="navMenu" title="Open menu" type="button">
              <span class="bar"></span><span class="bar"></span><span class="bar"></span>
            </button>
          </div>

          <ul class="nav-links" id="navMenu">
            <li id="navAuthLink"></li>
            <li><a href="/">Home</a></li>
            <li class="has-dropdown">
              <button class="dropdown-toggle" aria-haspopup="true" aria-expanded="false" type="button">Kingdom <span class="dropdown-arrow">▾</span></button>
              <ul class="dropdown-menu">
                <li><a href="/for-members">For Members</a></li>
                <li><a href="/for-businesses">For Businesses</a></li>
                <li><a href="/for-churches">For Churches</a></li>
              </ul>
            </li>
            <li class="has-dropdown">
              <button class="dropdown-toggle" aria-haspopup="true" aria-expanded="false" type="button">Directory <span class="dropdown-arrow">▾</span></button>
              <ul class="dropdown-menu">
                <li><a href="/business_directory">Businesses</a></li>
                <li><a href="/church_directory">Churches</a></li>
              </ul>
            </li>
            <li><a href="/add_to_directory">Join</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
        </div>
      </header>
    `;

    setupEventHandlers(loginUrl);
  }

  function setupEventHandlers(loginUrl) {
    const menuBtn = document.getElementById("menuBtn");
    const navMenu = document.getElementById("navMenu");
    if (menuBtn && navMenu) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = navMenu.classList.toggle("open");
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("click", (e) => {
        if (!navMenu.contains(e.target) && !menuBtn.contains(e.target)) {
          navMenu.classList.remove("open");
          menuBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    const dropdowns = document.querySelectorAll('.has-dropdown');
    dropdowns.forEach(dropdown => {
      const toggle = dropdown.querySelector('.dropdown-toggle');
      
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdowns.forEach(other => {
          if (other !== dropdown) other.classList.remove('active');
        });
        dropdown.classList.toggle('active');
        toggle.setAttribute('aria-expanded', dropdown.classList.contains('active'));
      });
      
      toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle.click();
        }
      });
      
      if (window.matchMedia('(min-width: 769px)').matches) {
        dropdown.addEventListener('mouseenter', () => {
          dropdown.classList.add('active');
          toggle.setAttribute('aria-expanded', 'true');
        });
        dropdown.addEventListener('mouseleave', (e) => {
          if (!dropdown.contains(e.relatedTarget)) {
            dropdown.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
          }
        });
      }
      
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
          dropdown.classList.remove('active');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    });

    const settingsBtn = document.getElementById("settingsBtn");
    const settingsMenu = document.getElementById("settingsMenu");
    if (settingsBtn && settingsMenu) {
      settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle("open");
        settingsBtn.setAttribute("aria-expanded", settingsMenu.classList.contains("open"));
      });
      document.addEventListener("click", (e) => {
        if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
          settingsMenu.classList.remove("open");
          settingsBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) {
      themeToggle.classList.toggle("is-on", (html.getAttribute("data-theme") || "dark") === "light");
      themeToggle.addEventListener("click", () => {
        const current = html.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        html.setAttribute("data-theme", next);
        try { localStorage.setItem("kc-theme", next); } catch(_) {}
        themeToggle.classList.toggle("is-on", next === "light");
      });
    }

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const getBase = () => parseFloat(getComputedStyle(html).getPropertyValue("--base-font-size").trim()) || 16;
    const setBase = (px) => {
      html.style.setProperty("--base-font-size", px + "px");
      try { localStorage.setItem("kc-fontScale", String(px)); } catch(_) {}
    };
    const fontMinus = document.getElementById("fontMinus");
    const fontPlus = document.getElementById("fontPlus");
    if (fontMinus) fontMinus.addEventListener("click", () => setBase(clamp(getBase() - 1, 14, 22)));
    if (fontPlus) fontPlus.addEventListener("click", () => setBase(clamp(getBase() + 1, 14, 22)));

    const userStatus = document.getElementById("userStatus");
    const navAuthLink = document.getElementById("navAuthLink");
    const dashboardSection = document.getElementById('dashboardAccess');
    const dashboardBtn = document.getElementById('dashboardBtn');

    // Door-open icon (login) - arrow entering door
    const doorOpenIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
      <path d="M14 22h5a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-5"/>
      <path d="M3 12h12"/>
      <path d="M11 16l4-4-4-4"/>
    </svg>`;
    
    // Door-closed icon (logout) - arrow exiting door
    const doorClosedIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
      <path d="M10 22H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5"/>
      <path d="M17 16l4-4-4-4"/>
      <path d="M21 12H9"/>
    </svg>`;

    // Set initial logged-out state
    if (userStatus) {
      userStatus.innerHTML = `<a href="${loginUrl}" class="login-btn" title="Login">${doorOpenIcon}</a>`;
    }
    if (navAuthLink) {
      navAuthLink.innerHTML = `<a href="${loginUrl}">Login / Sign Up</a>`;
    }

    console.log('🏠 Header init - dashboardSection:', !!dashboardSection, 'dashboardBtn:', !!dashboardBtn);

    // Subscribe to central auth engine
    onAuthChange((user, userContext) => {
      console.log('🏠 Header auth callback - user:', user?.email, 'context:', userContext);
      
      if (user) {
        // Update header login button to logout
        if (userStatus) {
          userStatus.innerHTML = `<a href="#" id="headerLogoutBtn" class="login-btn" title="Logout">${doorClosedIcon}</a>`;
          const attachLogout = () => {
            if (window.kcAttachLogoutHandler) {
              window.kcAttachLogoutHandler('headerLogoutBtn', '/');
            } else {
              setTimeout(attachLogout, 50);
            }
          };
          attachLogout();
        }

        // Update mobile nav to logout
        if (navAuthLink) {
          navAuthLink.innerHTML = `<a href="#" id="mobileLogoutLink">Logout</a>`;
          const attachMobileLogout = () => {
            if (window.kcAttachLogoutHandler) {
              window.kcAttachLogoutHandler('mobileLogoutLink', '/');
            } else {
              setTimeout(attachMobileLogout, 50);
            }
          };
          attachMobileLogout();
        }

        // Show homepage dashboard access if on homepage
        console.log('🏠 Dashboard check - section:', !!dashboardSection, 'btn:', !!dashboardBtn, 'context:', !!userContext);
        if (dashboardSection && dashboardBtn) {
          const roles = userContext?.roles || ['member'];
          console.log('🏠 User roles:', roles);
          const dashboardPath = getPrimaryDashboard(roles);
          console.log('🏠 Dashboard path:', dashboardPath);
          dashboardBtn.href = dashboardPath;
          dashboardSection.classList.remove('hidden');
        }
      } else {
        // Logged out state
        if (userStatus) {
          userStatus.innerHTML = `<a href="${loginUrl}" class="login-btn" title="Login">${doorOpenIcon}</a>`;
        }
        if (navAuthLink) {
          navAuthLink.innerHTML = `<a href="${loginUrl}">Login / Sign Up</a>`;
        }
        if (dashboardSection) {
          dashboardSection.classList.add('hidden');
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeader);
  } else {
    initHeader();
  }
})();
