import { db } from "../../js/firebase-config.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireSalesAgent } from "./sales-auth-guard.js";

let currentUser = null;
let allCommissions = [];

requireSalesAgent((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadCommissions();
});

document.getElementById('filterStatus').addEventListener('change', renderCommissions);
document.getElementById('sortBy').addEventListener('change', renderCommissions);
document.getElementById('exportCSV').addEventListener('click', exportToCSV);

async function loadCommissions() {
  try {
    const commissionsQuery = query(
      collection(db, "commission_ledger"),
      where("recipient_type", "==", "salesperson"),
      where("recipient_id", "==", currentUser.uid)
    );
    
    const commissionsSnapshot = await getDocs(commissionsQuery);
    
    if (commissionsSnapshot.empty) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('empty').classList.remove('hidden');
      return;
    }

    const businessLookups = new Map();
    
    commissionsSnapshot.forEach(commissionDoc => {
      const commission = commissionDoc.data();
      const businessId = commission.business_id;
      
      if (businessId && !businessLookups.has(businessId)) {
        businessLookups.set(businessId, {
          businessId: businessId,
          name: 'Unknown Business'
        });
      }
      
      allCommissions.push({
        id: commissionDoc.id,
        businessId: businessId,
        ...commission
      });
    });

    const businessPromises = Array.from(businessLookups.values()).map(item =>
      getDoc(doc(db, "business_listings_public", item.businessId)).catch(e => {
        console.error('Error loading business:', e);
        return null;
      })
    );

    const businessDocs = await Promise.all(businessPromises);
    
    businessDocs.forEach((businessDoc) => {
      if (businessDoc && businessDoc.exists()) {
        const businessId = businessDoc.id;
        businessLookups.get(businessId).name = businessDoc.data().business_name;
      }
    });

    allCommissions = allCommissions.map(commission => ({
      ...commission,
      businessName: commission.businessId 
        ? (businessLookups.get(commission.businessId)?.name || 'Unknown Business')
        : 'Direct Payout'
    }));

    updateSummary();
    renderCommissions();

  } catch (error) {
    console.error('Error loading commissions:', error);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
  }
}

function updateSummary() {
  const totalEarned = allCommissions.reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalPaid = allCommissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalPending = totalEarned - totalPaid;

  document.getElementById('totalEarned').textContent = `$${totalEarned.toFixed(2)}`;
  document.getElementById('totalPaid').textContent = `$${totalPaid.toFixed(2)}`;
  document.getElementById('totalPending').textContent = `$${totalPending.toFixed(2)}`;
  document.getElementById('commissionCount').textContent = allCommissions.length;
}

function renderCommissions() {
  const filterStatus = document.getElementById('filterStatus').value;
  const sortBy = document.getElementById('sortBy').value;

  let filtered = [...allCommissions];

  if (filterStatus === 'paid') {
    filtered = filtered.filter(c => c.status === 'paid');
  } else if (filterStatus === 'pending') {
    filtered = filtered.filter(c => c.status === 'pending');
  }

  filtered.sort((a, b) => {
    if (sortBy === 'date-desc') {
      return (b.billing_date?.toDate() || 0) - (a.billing_date?.toDate() || 0);
    } else if (sortBy === 'date-asc') {
      return (a.billing_date?.toDate() || 0) - (b.billing_date?.toDate() || 0);
    } else if (sortBy === 'amount-desc') {
      return (b.amount || 0) - (a.amount || 0);
    } else if (sortBy === 'amount-asc') {
      return (a.amount || 0) - (b.amount || 0);
    }
    return 0;
  });

  const tbody = document.getElementById('commissionsTableBody');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').classList.add('hidden');
    document.getElementById('empty').classList.remove('hidden');
    return;
  }

  filtered.forEach(commission => {
    const row = document.createElement('tr');
    
    const billingDate = commission.billing_date?.toDate().toLocaleDateString() || 'Unknown';
    const paidDate = commission.status === 'paid' ? billingDate : '-';
    const statusBadge = commission.status === 'paid'
      ? '<span class="status-badge status-paid">Paid</span>'
      : '<span class="status-badge status-pending">Pending</span>';

    row.innerHTML = `
      <td>${escapeHtml(billingDate)}</td>
      <td>${escapeHtml(commission.businessName)}</td>
      <td>$${(commission.pro_amount || 0).toFixed(2)}</td>
      <td>$${(commission.amount || 0).toFixed(2)}</td>
      <td>${statusBadge}</td>
      <td>${escapeHtml(paidDate)}</td>
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

function exportToCSV() {
  if (allCommissions.length === 0) {
    alert('No commissions to export');
    return;
  }

  const headers = ['Date', 'Business', 'Pro Payment', 'Commission', 'Status', 'Paid Date'];
  const rows = allCommissions.map(commission => {
    const billingDate = commission.billing_date?.toDate().toLocaleDateString() || 'Unknown';
    const paidDate = commission.status === 'paid' ? billingDate : '-';
    const status = commission.status === 'paid' ? 'Paid' : 'Pending';
    
    return [
      billingDate,
      `"${(commission.businessName || 'Unknown').replace(/"/g, '""')}"`,
      (commission.pro_amount || 0).toFixed(2),
      (commission.amount || 0).toFixed(2),
      status,
      paidDate
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kingdom-connects-commissions-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
