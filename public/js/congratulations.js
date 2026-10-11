import { db } from "./firebase-config.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuthState } from "./auth/access-control.js";
import { normalizeUserRoles, getPrimaryDashboard } from "./role-utils.js";
import { renderMemberBenefits } from './benefits/member-benefits.js';
import { renderBusinessBenefits } from './benefits/business-benefits.js';
import { renderChurchBenefits } from './benefits/church-benefits.js';

const loadingState = document.getElementById('loadingState');
const congratsContent = document.getElementById('congratsContent');
const errorState = document.getElementById('errorState');

const statusIcon = document.getElementById('statusIcon');
const congratsTitle = document.getElementById('congratsTitle');
const congratsSubtitle = document.getElementById('congratsSubtitle');
const approvedSection = document.getElementById('approvedSection');
const pendingSection = document.getElementById('pendingSection');
const pendingTitle = document.getElementById('pendingTitle');
const pendingMessage = document.getElementById('pendingMessage');
const dashboardBtn = document.getElementById('dashboardBtn');
const cinemaImage = document.getElementById('cinemaImage');
const actionCards = document.getElementById('actionCards');
const benefitsContainer = document.getElementById('benefitsContainer');

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const type = urlParams.get('type') || 'member';
  
  try {
    const { user, isLoggedIn } = await getAuthState();
    
    if (!isLoggedIn || !user) {
      showContent(type, null, 'pending');
      return;
    }

    let userData = null;
    let roles = [];
    let accountStatus = 'pending';
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        userData = userDoc.data();
        roles = normalizeUserRoles(userData);
        accountStatus = userData.account_status || 'pending';
      }
    } catch (userErr) {
      console.error('Error fetching user doc:', userErr);
    }

    let approvalStatus = 'pending';
    let listingData = null;

    if (type === 'business') {
      try {
        const businessResult = await getBusinessStatus(user.uid);
        listingData = businessResult.data;
        approvalStatus = businessResult.status;
      } catch (bizErr) {
        console.error('Error fetching business status:', bizErr);
      }
    } else if (type === 'church') {
      try {
        const churchResult = await getChurchStatus(user.uid, user.email);
        listingData = churchResult.data;
        approvalStatus = churchResult.status;
      } catch (churchErr) {
        console.error('Error fetching church status:', churchErr);
      }
    } else {
      approvalStatus = (accountStatus === 'approved' || accountStatus === 'active') ? 'approved' : 'pending';
    }

    showContent(type, { user: userData, listing: listingData, roles }, approvalStatus);

  } catch (error) {
    console.error('Error loading congratulations page:', error);
    showContent(type, null, 'pending');
  }
}

async function getBusinessStatus(uid) {
  try {
    const q = query(
      collection(db, 'business_listings_private'),
      where('owner_uid', '==', uid)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return { status: 'pending', data: null };
    }

    const businessId = snapshot.docs[0].id;
    
    const publicDoc = await getDoc(doc(db, 'business_listings_public', businessId));
    if (!publicDoc.exists()) {
      return { status: 'pending', data: null };
    }
    
    const data = { id: businessId, ...publicDoc.data() };
    const listingStatus = data.listing_status || 'pending';
    
    const isApproved = listingStatus === 'approved' || listingStatus === 'active';
    return { status: isApproved ? 'approved' : 'pending', data };
  } catch (error) {
    console.error('Error getting business status:', error);
    return { status: 'pending', data: null };
  }
}

async function getChurchStatus(uid, email) {
  try {
    let q = query(
      collection(db, 'churches'),
      where('admin_uid', '==', uid)
    );
    let snapshot = await getDocs(q);
    
    if (snapshot.empty && email) {
      q = query(
        collection(db, 'churches'),
        where('admin_uid', '==', uid)
      );
      snapshot = await getDocs(q);
    }

    if (snapshot.empty) {
      return { status: 'pending', data: null };
    }

    const churchDoc = snapshot.docs[0];
    const data = { id: churchDoc.id, ...churchDoc.data() };
    const listingStatus = data.listing_status || 'pending';
    
    const isApproved = listingStatus === 'approved' || listingStatus === 'active';
    return { status: isApproved ? 'approved' : 'pending', data };
  } catch (error) {
    console.error('Error getting church status:', error);
    return { status: 'pending', data: null };
  }
}

function showContent(type, context, approvalStatus) {
  loadingState.classList.add('hidden');
  congratsContent.classList.remove('hidden');

  const isApproved = approvalStatus === 'approved';

  const config = {
    member: {
      title: 'Welcome to Kingdom Connects!',
      subtitle: 'Your member account has been created successfully.',
      cinema: '/assets/images/cinema/member.png',
      dashboard: '/member/index',
      pendingTitle: 'Account Pending Approval',
      pendingMessage: 'Our team will review your account within 24-48 hours. You\'ll receive an email when approved.',
      renderBenefits: renderMemberBenefits
    },
    business: {
      title: 'Your Business is Registered!',
      subtitle: 'Your business listing has been submitted successfully.',
      cinema: '/assets/images/cinema/business.png',
      dashboard: '/business-admin/index',
      pendingTitle: 'Listing Pending Approval',
      pendingMessage: 'Your business listing is being reviewed. This typically takes 24-48 hours. You\'ll receive an email when approved.',
      renderBenefits: renderBusinessBenefits
    },
    church: {
      title: 'Your Church is Registered!',
      subtitle: 'Your church profile has been submitted successfully.',
      cinema: '/assets/images/cinema/church.png',
      dashboard: '/church-admin/index',
      pendingTitle: 'Profile Pending Approval',
      pendingMessage: 'Your church profile is being reviewed by our team. You\'ll receive an email when approved.',
      renderBenefits: renderChurchBenefits
    }
  };

  const c = config[type] || config.member;

  congratsTitle.textContent = c.title;
  congratsSubtitle.textContent = c.subtitle;
  cinemaImage.src = c.cinema;
  cinemaImage.alt = `Kingdom Connects ${type}`;

  if (isApproved) {
    statusIcon.textContent = '✓';
    statusIcon.style.color = '#4CAF50';
    approvedSection.classList.remove('hidden');
    pendingSection.classList.add('hidden');
    
    if (context && context.roles) {
      dashboardBtn.href = getPrimaryDashboard(context.roles);
    } else {
      dashboardBtn.href = c.dashboard;
    }
  } else {
    statusIcon.textContent = '⏳';
    statusIcon.style.color = '#C5A572';
    approvedSection.classList.add('hidden');
    pendingSection.classList.remove('hidden');
    pendingTitle.textContent = c.pendingTitle;
    pendingMessage.textContent = c.pendingMessage;
  }

  buildActionCards(type, isApproved, c.dashboard);

  if (c.renderBenefits) {
    try {
      c.renderBenefits('benefitsContainer');
    } catch (err) {
      console.error('Error rendering benefits:', err);
    }
  }
}

function buildActionCards(type, isApproved, dashboardUrl) {
  let cards = '';

  if (isApproved) {
    cards += `
      <a href="${dashboardUrl}" class="action-card action-card-gold">
        <div class="action-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
        </div>
        <span class="action-card-title">Dashboard</span>
        <span class="action-card-desc">Manage your account</span>
      </a>
    `;
  } else {
    cards += `
      <a href="/login" class="action-card">
        <div class="action-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
          </svg>
        </div>
        <span class="action-card-title">Log In</span>
        <span class="action-card-desc">Access your account</span>
      </a>
    `;
  }

  cards += `
    <a href="/business_directory" class="action-card">
      <div class="action-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <span class="action-card-title">Businesses</span>
      <span class="action-card-desc">Browse the directory</span>
    </a>
    <a href="/church_directory" class="action-card">
      <div class="action-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2L12 6M12 6L8 10V22H16V10L12 6Z"/>
          <path d="M8 22H16"/>
          <path d="M10 14H14V22H10V14Z"/>
        </svg>
      </div>
      <span class="action-card-title">Churches</span>
      <span class="action-card-desc">Find a church home</span>
    </a>
    <a href="/" class="action-card">
      <div class="action-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
      <span class="action-card-title">Home</span>
      <span class="action-card-desc">Back to main site</span>
    </a>
  `;

  actionCards.innerHTML = cards;
}

init();
