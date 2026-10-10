import { db } from '../../js/firebase-config.js';
import { collection, query, orderBy, getDocs, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAdmin } from './admin-auth-guard.js';

let allDonations = [];
let filteredDonations = [];

requireAdmin(() => {
  loadDonations();
});

async function loadDonations() {
  try {
    showLoading(true);

    // Load both completed donations and pending requests
    const [donationsQuery, requestsQuery] = await Promise.all([
      getDocs(query(collection(db, 'donations'), orderBy('created_at', 'desc'))),
      getDocs(query(collection(db, 'donation_requests'), orderBy('created_at', 'desc')))
    ]);

    allDonations = [];

    // Add completed donations
    donationsQuery.forEach(doc => {
      allDonations.push({ id: doc.id, ...doc.data(), collection: 'donations' });
    });

    // Add pending requests
    requestsQuery.forEach(doc => {
      allDonations.push({ id: doc.id, ...doc.data(), collection: 'donation_requests' });
    });

    // Sort by date
    allDonations.sort((a, b) => {
      const aDate = a.created_at?.toDate?.() || new Date(0);
      const bDate = b.created_at?.toDate?.() || new Date(0);
      return bDate - aDate;
    });

    filteredDonations = [...allDonations];

    showLoading(false);
    updateStats();
    renderDonations();

    if (allDonations.length === 0) {
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('dashboardContent').classList.add('hidden');
      document.getElementById('statsSection').classList.add('hidden');
    } else {
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('dashboardContent').classList.remove('hidden');
      document.getElementById('statsSection').classList.remove('hidden');
    }

  } catch (error) {
    console.error('Error loading donations:', error);
    showError('Failed to load donations. Please try again.');
    showLoading(false);
  }
}

function updateStats() {
  const completedDonations = allDonations.filter(d => d.status === 'completed');
  
  const total = completedDonations.reduce((sum, d) => sum + (d.amount || 0), 0);
  const oneTime = completedDonations
    .filter(d => d.frequency === 'one-time')
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const recurring = completedDonations
    .filter(d => d.frequency === 'recurring')
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  
  const uniqueDonors = new Set(completedDonations.map(d => d.donor_email)).size;

  document.getElementById('totalDonations').textContent = `$${total.toFixed(2)}`;
  document.getElementById('oneTimeDonations').textContent = `$${oneTime.toFixed(2)}`;
  document.getElementById('recurringDonations').textContent = `$${recurring.toFixed(2)}/mo`;
  document.getElementById('totalDonors').textContent = uniqueDonors;
}

function renderDonations() {
  const tbody = document.getElementById('donationsTableBody');
  
  if (filteredDonations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No donations found</td></tr>';
    return;
  }

  tbody.innerHTML = filteredDonations.map(donation => {
    const date = donation.created_at?.toDate?.() || new Date();
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    const statusBadge = getStatusBadge(donation.status);
    const typeBadge = donation.frequency === 'recurring' ? 
      '<span class="badge badge-gold">Recurring</span>' : 
      '<span class="badge badge-secondary">One-Time</span>';

    return `
      <tr>
        <td>
          <div>${dateStr}</div>
          <div class="text-muted text-sm">${timeStr}</div>
        </td>
        <td>${donation.donor_name || 'Anonymous'}</td>
        <td>${donation.donor_email || 'N/A'}</td>
        <td class="gold">$${(donation.amount || 0).toFixed(2)}</td>
        <td>${typeBadge}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-small btn-secondary" data-action="view" data-id="${donation.id}">View</button>
        </td>
      </tr>
    `;
  }).join('');
}

function getStatusBadge(status) {
  const badges = {
    completed: '<span class="badge badge-success">Completed</span>',
    pending_stripe_setup: '<span class="badge badge-warning">Pending Setup</span>',
    failed: '<span class="badge badge-danger">Failed</span>',
    refunded: '<span class="badge badge-secondary">Refunded</span>'
  };
  return badges[status] || '<span class="badge badge-secondary">Unknown</span>';
}

function showLoading(show) {
  document.getElementById('loadingMessage').classList.toggle('hidden', !show);
}

function showError(message) {
  document.getElementById('errorText').textContent = message;
  document.getElementById('errorMessage').classList.remove('hidden');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Search
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    filteredDonations = allDonations.filter(d => {
      const name = (d.donor_name || '').toLowerCase();
      const email = (d.donor_email || '').toLowerCase();
      return name.includes(searchTerm) || email.includes(searchTerm);
    });
    renderDonations();
  });

  // Status filter
  document.getElementById('statusFilter')?.addEventListener('change', (e) => {
    const status = e.target.value;
    if (status) {
      filteredDonations = allDonations.filter(d => d.status === status);
    } else {
      filteredDonations = [...allDonations];
    }
    renderDonations();
  });

  // Export CSV
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="export"]');
    if (btn) {
      exportCSV();
    }
  });
});

function exportCSV() {
  const headers = ['Date', 'Donor Name', 'Email', 'Amount', 'Type', 'Status'];
  const rows = filteredDonations.map(d => {
    const date = d.created_at?.toDate?.() || new Date();
    return [
      date.toISOString(),
      d.donor_name || 'Anonymous',
      d.donor_email || 'N/A',
      d.amount || 0,
      d.frequency || 'one-time',
      d.status || 'unknown'
    ];
  });

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donations-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}
