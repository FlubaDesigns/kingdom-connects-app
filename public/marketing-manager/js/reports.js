/* Kingdom Connects - Marketing Manager Reports */
import { db } from "../../js/firebase-config.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";

requireAuth({ roles: ['marketing_manager', 'admin'] }, () => {
  loadCommissionReport();
});

async function loadCommissionReport() {
  try {
    const ledgerData = await getCommissionLedger();
    displayCommissionTable(ledgerData);
    updateCommissionSummary(ledgerData);
  } catch (error) {
    console.error("Error loading commission report:", error);
    showError("Failed to load commission report");
  }
}

async function getCommissionLedger() {
  const ledgerRef = collection(db, "commission_ledger");
  const q = query(ledgerRef, orderBy("created_at", "desc"));
  const snapshot = await getDocs(q);
  
  const ledger = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const recipientName = await getRecipientName(data.recipient_id, data.recipient_type);
    const businessName = await getBusinessName(data.business_id);
    
    ledger.push({
      id: doc.id,
      businessName,
      recipientName,
      recipientType: data.recipient_type,
      amount: data.commission_amount || 0,
      percentage: data.commission_percentage || 0,
      paymentMonth: data.payment_month || "Unknown",
      paid: data.commission_paid || false,
      createdAt: data.created_at?.toDate() || new Date()
    });
  }
  
  return ledger;
}

async function getRecipientName(recipientId, type) {
  if (type === "church") {
    const churchesRef = collection(db, "churches");
    const q = query(churchesRef, where("church_id", "==", recipientId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data().church_name || "Unknown Church";
    }
  } else {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("uid", "==", recipientId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();
      return userData.display_name || userData.email || "Unknown User";
    }
  }
  return "Unknown";
}

async function getBusinessName(businessId) {
  const businessesRef = collection(db, "business_listings_public");
  const q = query(businessesRef, where("business_id", "==", businessId));
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    return snapshot.docs[0].data().business_name || "Unknown Business";
  }
  return "Unknown Business";
}

function displayCommissionTable(ledger) {
  const tbody = document.getElementById("commissionTableBody");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  if (ledger.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; opacity: 0.6;">No commission records found.</td></tr>';
    return;
  }
  
  ledger.forEach(entry => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(entry.createdAt)}</td>
      <td>${escapeHtml(entry.businessName)}</td>
      <td>${formatRecipientType(entry.recipientType)}</td>
      <td>${escapeHtml(entry.recipientName)}</td>
      <td>$${entry.amount.toFixed(2)}</td>
      <td>${entry.percentage}%</td>
      <td><span class="status-badge ${entry.paid ? 'paid' : 'unpaid'}">${entry.paid ? 'Paid' : 'Pending'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function updateCommissionSummary(ledger) {
  const summary = {
    totalEarned: 0,
    totalPaid: 0,
    totalPending: 0,
    totalEntries: ledger.length
  };
  
  ledger.forEach(entry => {
    summary.totalEarned += entry.amount;
    if (entry.paid) {
      summary.totalPaid += entry.amount;
    } else {
      summary.totalPending += entry.amount;
    }
  });
  
  const totalEarnedEl = document.getElementById("totalEarned");
  const totalPaidEl = document.getElementById("totalPaid");
  const totalPendingEl = document.getElementById("totalPending");
  const totalEntriesEl = document.getElementById("totalEntries");
  
  if (totalEarnedEl) totalEarnedEl.textContent = `$${summary.totalEarned.toFixed(2)}`;
  if (totalPaidEl) totalPaidEl.textContent = `$${summary.totalPaid.toFixed(2)}`;
  if (totalPendingEl) totalPendingEl.textContent = `$${summary.totalPending.toFixed(2)}`;
  if (totalEntriesEl) totalEntriesEl.textContent = summary.totalEntries;
}

function formatRecipientType(type) {
  const types = {
    church: "Church",
    salesperson: "Salesperson",
    director: "Director",
    kc: "Kingdom Connects"
  };
  return types[type] || type;
}

function formatDate(date) {
  if (!date) return "Unknown";
  return date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric" 
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  console.error(message);
  const main = document.querySelector("main");
  if (main) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = message;
    main.insertBefore(errorDiv, main.firstChild);
  }
}

window.generateRevenue = async function() {
  alert("Revenue report generation coming soon!");
};

window.generateCommission = async function() {
  await loadCommissionReport();
};

window.generateTeam = async function() {
  alert("Team performance report generation coming soon!");
};

window.exportCSV = function(reportType) {
  alert(`CSV export for ${reportType} coming soon!`);
};

document.addEventListener("DOMContentLoaded", loadCommissionReport);

// Event listeners for report generation
document.addEventListener('DOMContentLoaded', () => {
  const btnGenerateCommission = document.getElementById('generateCommissionReport');
  const btnGeneratePerformance = document.getElementById('generatePerformanceReport');
  const btnGenerateForecast = document.getElementById('generateForecast');
  const btnGenerateActivity = document.getElementById('generateActivityLog');
  const btnGenerateGoal = document.getElementById('generateGoalReport');
  const btnFilterCommissions = document.getElementById('filterCommissions');
  const btnGenerateCustom = document.getElementById('generateCustomReport');

  if (btnGenerateCommission) btnGenerateCommission.addEventListener('click', () => console.log('Generate Commission Report'));
  if (btnGeneratePerformance) btnGeneratePerformance.addEventListener('click', () => console.log('Generate Performance Report'));
  if (btnGenerateForecast) btnGenerateForecast.addEventListener('click', () => console.log('Generate Forecast'));
  if (btnGenerateActivity) btnGenerateActivity.addEventListener('click', () => console.log('Generate Activity Log'));
  if (btnGenerateGoal) btnGenerateGoal.addEventListener('click', () => console.log('Generate Goal Report'));
  if (btnFilterCommissions) btnFilterCommissions.addEventListener('click', () => console.log('Filter Commissions'));
  if (btnGenerateCustom) btnGenerateCustom.addEventListener('click', () => console.log('Generate Custom Report'));

  document.querySelectorAll('[data-action="exportPDF"]').forEach(btn => {
    btn.addEventListener('click', () => console.log('Export as PDF'));
  });

  document.querySelectorAll('[data-action="exportCSV"]').forEach(btn => {
    btn.addEventListener('click', () => console.log('Export as CSV'));
  });

  document.querySelectorAll('[data-href]').forEach(btn => {
    btn.addEventListener('click', function() {
      window.location.href = this.getAttribute('data-href');
    });
  });
});
