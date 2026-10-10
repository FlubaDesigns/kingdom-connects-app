export function renderBusinessBenefits(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <article class="card benefits-card">
      <h2 class="gold-metallic text-center m-block-lg">What You Get as a Business Member</h2>
      
      <div class="benefits-grid">
        <div class="benefit-item">
          <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <div class="benefit-text">
            <strong>Directory Listing</strong>
            <p>Your business appears in our searchable Christian business directory, connecting you with faith-minded customers.</p>
          </div>
        </div>

        <div class="benefit-item">
          <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <div class="benefit-text">
            <strong>Community Connection</strong>
            <p>Join a growing network of Christian businesses supporting each other and their local churches.</p>
          </div>
        </div>

        <div class="benefit-item">
          <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
          </svg>
          <div class="benefit-text">
            <strong>Customer Reviews</strong>
            <p>Build trust with verified reviews from members of the Kingdom Connects community.</p>
          </div>
        </div>

        <div class="benefit-item">
          <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
          <div class="benefit-text">
            <strong>Church Affiliation</strong>
            <p>Show your church connection to build instant trust with fellow believers in your community.</p>
          </div>
        </div>

        <div class="benefit-item">
          <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          <div class="benefit-text">
            <strong>Business Dashboard</strong>
            <p>Manage your listing, view analytics, and respond to reviews from your dedicated dashboard.</p>
          </div>
        </div>

        <div class="benefit-item">
          <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <div class="benefit-text">
            <strong>Email Notifications</strong>
            <p>Get notified when customers leave reviews or when your listing needs attention.</p>
          </div>
        </div>
      </div>
    </article>
  `;
}
