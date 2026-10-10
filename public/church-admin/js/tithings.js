/* Kingdom Connects - Church Admin Tithings Dashboard */
import { db } from '../../js/firebase-config.js';
import { collection, query, where, getDocs, getDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';

let currentChurchId = null;
let allCommissions = [];

requireAuth({ requireChurch: true }, async (userContext, firebaseUser, churchContext) => {
  console.log('🔐 Tithings: Auth verified, church:', churchContext?.id);
  
  if (churchContext) {
    currentChurchId = churchContext.id;
    await loadEarnings();
  }
});

async function loadEarnings() {
  try {
    const churchDoc = await getDoc(doc(db, 'churches', currentChurchId));
    
    if (churchDoc.exists()) {
      const data = churchDoc.data();
      document.getElementById('monthlyEarnings').textContent = `$${(data.monthly_commission_total || 0).toFixed(2)}`;
      document.getElementById('ytdEarnings').textContent = `$${(data.ytd_commission_total || 0).toFixed(2)}`;
      document.getElementById('lifetimeEarnings').textContent = `$${(data.total_commission_earned || 0).toFixed(2)}`;
      document.getElementById('unpaidBalance').textContent = `$${(data.unpaid_commission_balance || 0).toFixed(2)}`;
    }

    const ledgerQuery = query(
      collection(db, 'commission_ledger'),
      where('recipient_type', '==', 'church'),
      where('recipient_id', '==', currentChurchId)
    );
    
    const ledgerSnapshot = await getDocs(ledgerQuery);
    
    if (ledgerSnapshot.empty) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('emptyState').classList.remove('hidden');
      return;
    }

    allCommissions = await Promise.all(ledgerSnapshot.docs.map(async (ledgerDoc) => {
      const data = ledgerDoc.data();
      
      let businessName = 'Unknown Business';
      if (data.business_id) {
        const businessDoc = await getDoc(doc(db, 'business_listings_public', data.business_id));
        if (businessDoc.exists()) {
          businessName = businessDoc.data().business_name || 'Unknown Business';
        }
      }
      
      return {
        date: data.billing_date?.toDate() || new Date(),
        businessName: businessName,
        proAmount: data.pro_amount || 0,
        churchAmount: data.amount || 0,
        status: data.status || 'pending'
      };
    }));

    renderTable();

  } catch (error) {
    console.error('Error loading earnings:', error);
    document.getElementById('loading').innerHTML = '<p class="status-message error">Error loading earnings. Please try again.</p>';
  }
}

function renderTable() {
  const tbody = document.getElementById('tithesBody');
  tbody.innerHTML = '';

  allCommissions.sort((a, b) => b.date - a.date).forEach(comm => {
    const row = document.createElement('tr');
    const statusBadge = comm.status === 'paid' 
      ? '<span class="status-badge status-paid">Paid</span>'
      : '<span class="status-badge status-pending">Pending</span>';

    row.innerHTML = `
      <td>${comm.date.toLocaleDateString()}</td>
      <td>${comm.businessName}</td>
      <td>$${comm.proAmount.toFixed(2)}</td>
      <td>$${comm.churchAmount.toFixed(2)}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('tableWrapper').classList.remove('hidden');
}

document.getElementById('exportBtn').addEventListener('click', () => {
  if (allCommissions.length === 0) {
    window.showToast('No tithe data to export', 'info');
    return;
  }

  const headers = ['Date', 'Business', 'Pro Payment', 'Church 10%', 'Status'];
  const rows = allCommissions.map(c => [
    c.date.toLocaleDateString(),
    `"${c.businessName.replace(/"/g, '""')}"`,
    c.proAmount.toFixed(2),
    c.churchAmount.toFixed(2),
    c.status
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `church-tithes-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
