/* Kingdom Connects – Admin Dashboard Header */
(() => {
  const html = document.documentElement;

  const savedTheme = localStorage.getItem('kc-theme');
  if (savedTheme) html.setAttribute('data-theme', savedTheme);

  const savedScale = localStorage.getItem('kc-fontScale');
  if (savedScale) html.style.setProperty('--base-font-size', savedScale + 'px');

  function initHeader() {
    const header = document.getElementById("header");
    if (!header) {
      setTimeout(initHeader, 50);
      return;
    }

    header.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="/" aria-label="Home">
            <img class="site-logo" src="/library/kingdom-connects-logo-300.png" alt="Kingdom Connects logo">
            <h1 class="site-title">Admin Dashboard</h1>
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
                <h4>Notifications</h4>
                <div class="setting-row">
                  <span>Email Updates</span>
                  <button class="theme-toggle" id="emailToggle" aria-label="Toggle email notifications" type="button">
                    <span class="toggle-track"><span class="toggle-thumb"></span></span>
                  </button>
                </div>
              </div>
            </div>

            <button class="menu-toggle" id="menuBtn" aria-haspopup="true" aria-expanded="false" aria-controls="navMenu" title="Open menu" type="button">
              <span class="bar"></span><span class="bar"></span><span class="bar"></span>
            </button>
          </div>

          <ul class="nav-links" id="navMenu">
            <li><a href="#" id="logoutLink">Logout</a></li>
            <li><a href="/admin/index.html">Dashboard</a></li>
            <li><a href="/admin/todo">To-Do List</a></li><li><a href="/admin/members.html">Members</a></li><li><a href="/admin/management.html">Approvals &amp; Access</a></li><li><a href="/admin/review_moderation.html">Review Moderation</a></li><li><a href="/admin/payments.html">Payments</a></li>
            <li class="has-dropdown">
              <span class="dropdown-toggle">Directories ▼</span>
              <ul class="dropdown-menu">
                <li><a href="/admin/businesses.html">Businesses</a></li>
                <li><a href="/admin/churches.html">Churches</a></li>
              </ul>
            </li>
            <li class="has-dropdown">
              <span class="dropdown-toggle">Insights ▼</span>
              <ul class="dropdown-menu">
                <li><a href="/admin/business-insights.html">Business Insights</a></li>
                <li><a href="/admin/church-insights.html">Church Insights</a></li>
                <li><a href="/admin/questionnaire-manager.html">Questionnaires</a></li><li><a href="/admin/church-questionnaire.html">Church Responses</a></li>
              </ul>
            </li>
            <li><a href="/admin/pricing-settings.html">Pricing Settings</a></li>
            <li><a href="/admin/commission-settings.html">Commission Settings</a></li>
            <li><a href="/admin/donations.html">Donations</a></li>
            <li class="has-dropdown">
              <span class="dropdown-toggle">Content ▼</span>
              <ul class="dropdown-menu">
                <li><a href="/admin/manual-editor.html">User Manuals</a></li>
                <li><a href="/admin/email-templates.html">Email Templates</a></li>
                <li><a href="/admin/email-campaigns.html">Email Campaigns</a></li>
                <li><a href="/admin/factoids.html">Factoids</a></li>
              </ul>
            </li>
            <li><a href="/admin/social-sharing.html">Social Sharing</a></li>
            <li><a href="/admin/analytics.html">Analytics</a></li>
            <li class="has-dropdown">
              <span class="dropdown-toggle">Tools ▼</span>
              <ul class="dropdown-menu">
                <li><a href="/admin/activity_log.html">Activity Log</a></li><li><a href="/admin/contact-submissions.html">Contact Submissions</a></li>
              </ul>
            </li>
            <li><a href="/admin/settings.html">Settings</a></li>
            <li><a href="/">View Site</a></li>
          </ul>
        </div>
      </header>
    `;

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

    import('./email-preferences.js').then(({ initEmailToggle }) => {
      initEmailToggle();
    }).catch(err => console.error('Email preferences module failed:', err));

    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    dropdownToggles.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const parent = toggle.parentElement;
        const isOpen = parent.classList.contains('active');
        document.querySelectorAll('.has-dropdown').forEach(item => item.classList.remove('active'));
        if (!isOpen) parent.classList.add('active');
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.has-dropdown').forEach(item => item.classList.remove('active'));
    });

    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      const attachLogout = () => {
        if (window.kcAttachLogoutHandler) {
          window.kcAttachLogoutHandler('logoutLink', '/');
        } else {
          setTimeout(attachLogout, 50);
        }
      };
      attachLogout();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeader);
  } else {
    initHeader();
  }
})();
