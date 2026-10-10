import { db } from "../js/firebase-config.js";
import { collection, query, where, getDocs, collectionGroup, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireSalesAgent } from "./sales-auth-guard.js";

let currentUser = null;

requireSalesAgent((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadConversions();
});

async function loadConversions() {
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
    const businessLookups = new Map();

    commissionsSnapshot.forEach(commissionDoc => {
      const businessId = commissionDoc.ref.parent.parent.id;
      businessIds.add(businessId);
      
      if (!businessLookups.has(businessId)) {
        businessLookups.set(businessId, {
          ref: commissionDoc.ref.parent.parent,
          commissions: []
        });
      }
      
      businessLookups.get(businessId).commissions.push({
        ...commissionDoc.data(),
        id: commissionDoc.id
      });
    });

    const businessPromises = Array.from(businessLookups.values()).map(item =>
      getDoc(item.ref).catch(e => {
        console.error('Error loading business:', e);
        return null;
      })
    );

    const businessDocs = await Promise.all(businessPromises);
    
    const conversions = [];
    let activeCount = 0;
    let totalMonths = 0;
    
    businessDocs.forEach((businessDoc, index) => {
      if (businessDoc && businessDoc.exists()) {
        const business = businessDoc.data();
        const businessId = businessDoc.id;
        const businessCommissions = businessLookups.get(businessId).commissions;
        
        const totalCommission = businessCommissions.reduce((sum, c) => sum + (c.commission_amount || 0), 0);
        const firstCommission = businessCommissions.sort((a, b) => {
          const dateA = a.created_at?.toDate() || new Date(0);
          const dateB = b.created_at?.toDate() || new Date(0);
          return dateA - dateB;
        })[0];

        if (business.pro_status === true) {
          activeCount++;
        }

        if (business.pro_start_date && business.pro_end_date) {
          const start = business.pro_start_date.toDate();
          const end = business.pro_end_date.toDate();
          const months = (end - start) / (1000 * 60 * 60 * 24 * 30);
          totalMonths += months;
        }

        conversions.push({
          businessId: businessId,
          businessName: business.business_name,
          proStartDate: business.pro_start_date,
          proEndDate: business.pro_end_date,
          proStatus: business.pro_status,
          commission: totalCommission,
          createdAt: firstCommission.created_at
        });
      }
    });

    conversions.sort((a, b) => {
      const dateA = a.createdAt?.toDate() || new Date(0);
      const dateB = b.createdAt?.toDate() || new Date(0);
      return dateB - dateA;
    });

    const totalConversions = conversions.filter(c => c.proStatus === true).length;
    const totalReferrals = conversions.length;
    const conversionRate = totalReferrals > 0 ? (totalConversions / totalReferrals * 100) : 0;
    const avgLength = conversions.length > 0 ? (totalMonths / conversions.length) : 0;

    document.getElementById('conversionRate').textContent = `${conversionRate.toFixed(0)}%`;
    document.getElementById('activeProCount').textContent = activeCount;
    document.getElementById('avgLength').textContent = avgLength.toFixed(1);
    document.getElementById('totalConversions').textContent = totalConversions;

    renderConversions(conversions);

  } catch (error) {
    console.error('Error loading conversions:', error);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
  }
}

function renderConversions(conversions) {
  const container = document.getElementById('conversionsList');
  container.innerHTML = '';

  if (conversions.length === 0) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('empty').classList.remove('hidden');
    return;
  }

  conversions.forEach(conversion => {
    const item = document.createElement('div');
    item.className = 'conversion-item';

    const startDate = conversion.proStartDate?.toDate().toLocaleDateString() || 'Unknown';
    const status = conversion.proStatus ? 'Active' : 'Inactive';

    item.innerHTML = `
      <div class="business-info">
        <h4>${escapeHtml(conversion.businessName)}</h4>
        <p>Upgraded: ${escapeHtml(startDate)}</p>
      </div>
      <div>
        <strong>Commission:</strong><br>
        <span class="text-gold">$${conversion.commission.toFixed(2)}</span>
      </div>
      <div>
        ${status}
      </div>
    `;

    container.appendChild(item);
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
