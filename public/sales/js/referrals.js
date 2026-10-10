import { db } from "../js/firebase-config.js";
import { collection, query, where, getDocs, collectionGroup, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireSalesAgent } from "./sales-auth-guard.js";

let currentUser = null;

requireSalesAgent((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadReferrals();
});

async function loadReferrals() {
  try {
    const commissionsQuery = query(
      collectionGroup(db, "commissions"),
      where("referrer_id", "==", currentUser.uid)
    );
    
    const commissionsSnapshot = await getDocs(commissionsQuery);
    
    if (commissionsSnapshot.empty) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('empty').classList.remove('hidden');
      return;
    }

    const businessIds = new Set();
    commissionsSnapshot.forEach(commissionDoc => {
      const businessId = commissionDoc.ref.parent.parent.id;
      businessIds.add(businessId);
    });

    const businessPromises = Array.from(businessIds).map(businessId =>
      getDoc(doc(db, "business_listings_public", businessId)).catch(e => {
        console.error('Error loading business:', e);
        return null;
      })
    );

    const businessDocs = await Promise.all(businessPromises);

    const referrals = businessDocs
      .filter(businessDoc => businessDoc && businessDoc.exists())
      .map(businessDoc => ({
        id: businessDoc.id,
        ...businessDoc.data()
      }));

    referrals.sort((a, b) => {
      const dateA = a.created_at?.toDate() || new Date(0);
      const dateB = b.created_at?.toDate() || new Date(0);
      return dateB - dateA;
    });

    const totalReferrals = referrals.length;
    const proReferrals = referrals.filter(r => r.pro_status === true).length;
    const activeReferrals = referrals.filter(r => r.listing_status === 'active').length;

    document.getElementById('totalReferrals').textContent = totalReferrals;
    document.getElementById('proReferrals').textContent = proReferrals;
    document.getElementById('activeReferrals').textContent = activeReferrals;

    renderReferrals(referrals);

  } catch (error) {
    console.error('Error loading referrals:', error);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
  }
}

function renderReferrals(referrals) {
  const tbody = document.getElementById('referralsTableBody');
  tbody.innerHTML = '';

  if (referrals.length === 0) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('empty').classList.remove('hidden');
    return;
  }

  referrals.forEach(referral => {
    const row = document.createElement('tr');

    const createdDate = referral.created_at?.toDate().toLocaleDateString() || 'Unknown';
    const tierBadge = referral.pro_status 
      ? '<span class="pro-badge">PRO</span>'
      : '<span class="free-badge">Free</span>';
    const statusText = referral.listing_status === 'active' ? 'Active' : 'Inactive';

    row.innerHTML = `
      <td><strong>${escapeHtml(referral.business_name || 'Unknown')}</strong></td>
      <td>${escapeHtml(referral.primary_category || 'Uncategorized')}</td>
      <td>${escapeHtml(statusText)}</td>
      <td>${tierBadge}</td>
      <td>${escapeHtml(createdDate)}</td>
    `;

    tbody.appendChild(row);
  });

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('content').classList.remove('hidden');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
