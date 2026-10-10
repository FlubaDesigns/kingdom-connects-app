/* Kingdom Connects – Marketing Manager Dashboard Header */
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
            <h1 class="site-title">Marketing Manager</h1>
          </a>

          <div class="header-actions">
            <div class="gear-wrap">
              <button id="settingsBtn" class="gear-btn" aria-haspopup="menu" aria-expanded="false" title="Display & theme settings" type="button">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19.14,12.94a7.43,7.43,0,0,0,.05-.94,7.43,7.43,0,0,0-.05-.94l2.11-1.65a.5.5,0,0,0,.12-.64l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.34,7.34,0,0,0-1.63-.94l-.38-2.65A.5.5,0,0,0,13,0H11a.5.5,0,0,0-.49.41L10.13,3.06a7.34,7.34,0,0,0-1.63.94l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.64L3.65,11.06a7.43,7.43,0,0,0-.05.94,7.43,7.43,0,0,0,.05.94L1.54,14.59a.5.5,0,0,0-.12.64l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.34,7.34,0,0,0,1.63.94l.38,2.65A.5.5,0,0,0,11,22h2a.5.5,0,0,0,.49-.41l.38-2.65a7.34,7.34,0,0,0,1.63-.94l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0-.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
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

            <button class="menu-toggle" id="menuBtn" aria-haspopup="true" aria-expanded="false" aria-controls="navMenu" title="Open menu" type="button">
              <span class="bar"></span><span class="bar"></span><span class="bar"></span>
            </button>
          </div>

          <ul class="nav-links" id="navMenu">
            <li><a href="#" id="logoutLink">Logout</a></li>
            <li><a href="index.html">Dashboard</a></li>
            <li><a href="team.html">Sales Team</a></li>
            <li><a href="analytics.html">Analytics</a></li>
            <li><a href="reports.html">Reports</a></li>
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
