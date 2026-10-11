import { fetchChurchTithes } from '../../js/services/church-tithes.js';
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
    const tithes = await fetchChurchTithes(currentChurchId);
    for (const [id,key] of [['monthlyEarnings','month'],['ytdEarnings','year'],['lifetimeEarnings','total'],['unpaidBalance','notPaid']]) document.getElementById(id).textContent = '$' + tithes[key].toFixed(2);
    allCommissions = tithes.rows;
    if (!allCommissions.length) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('emptyState').classList.remove('hidden');
      return;
    }
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

    for (const text of [comm.date.toLocaleDateString(),comm.businessName,'$'+comm.proAmount.toFixed(2),'$'+comm.churchAmount.toFixed(2),comm.status === 'paid' ? 'Paid' : 'Recorded']) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
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
    `"${c.businessName.replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`,
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
