/* Kingdom Connects - Marketing Manager Analytics */
import { db } from "../../js/firebase-config.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";

let currentTimePeriod = 30;

requireAuth({ roles: ['marketing_manager', 'admin'] }, () => {
  loadAnalytics();
});

async function loadAnalytics() {
  const periodValue = document.getElementById("timePeriod")?.value || "30";
  currentTimePeriod = periodValue;
  
  const now = new Date();
  const startDate = periodValue === "all" ? new Date(0) : new Date(now.getTime() - parseInt(periodValue) * 24 * 60 * 60 * 1000);
  
  try {
    const [kpiData, funnelData, commissionData] = await Promise.all([
      loadKPIData(startDate),
      loadFunnelData(startDate),
      loadCommissionBreakdown(startDate)
    ]);
    
    updateKPIs(kpiData);
    updateFunnel(funnelData);
    updateCommissionTable(commissionData);
  } catch (error) {
    console.error("Error loading analytics:", error);
    showError("Failed to load analytics data");
  }
}

async function loadKPIData(since) {
  const paymentsRef = collection(db, "payments");
  const q = query(
    paymentsRef,
    where("created_at", ">=", since),
    where("status", "==", "succeeded")
  );
  
  const snapshot = await getDocs(q);
  let totalRevenue = 0;
  let totalConversions = 0;
  
  snapshot.forEach(doc => {
    const data = doc.data();
    totalRevenue += (data.amount || 0) / 100;
    totalConversions += 1;
  });
  
  const businessesRef = collection(db, "business_listings_public");
  const proQuery = query(businessesRef, where("pro_status", "==", "pro"));
  const proSnapshot = await getDocs(proQuery);
  const activeProCount = proSnapshot.size;
  
  const allBusinessQuery = query(businessesRef);
  const allSnapshot = await getDocs(allBusinessQuery);
  const totalBusinesses = allSnapshot.size;
  
  const conversionRate = totalBusinesses > 0 ? (activeProCount / totalBusinesses) * 100 : 0;
  
  return {
    totalRevenue,
    totalConversions,
    activeProCount,
    conversionRate: conversionRate.toFixed(1)
  };
}

async function loadFunnelData(since) {
  const businessesRef = collection(db, "business_listings_public");
  const allSnapshot = await getDocs(query(businessesRef));
  const totalListings = allSnapshot.size;
  
  const proSnapshot = await getDocs(query(businessesRef, where("pro_status", "==", "pro")));
  const proBusinesses = proSnapshot.size;
  
  let completedProfiles = 0;
  allSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.business_name && data.phone_number && data.category) {
      completedProfiles++;
    }
  });
  
  return {
    totalListings,
    completedProfiles,
    proBusinesses,
    activeUsers: Math.floor(totalListings * 0.6)
  };
}

async function loadCommissionBreakdown(since) {
  const ledgerRef = collection(db, "commission_ledger");
  const q = query(ledgerRef, where("created_at", ">=", since));
  
  const snapshot = await getDocs(q);
  const breakdown = {
    church: 0,
    salesperson: 0,
    director: 0,
    kc: 0
  };
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const type = data.recipient_type;
    const amount = data.commission_amount || 0;
    
    if (breakdown.hasOwnProperty(type)) {
      breakdown[type] += amount;
    }
  });
  
  return breakdown;
}

function updateKPIs(data) {
  const revenueEl = document.getElementById("totalRevenue");
  const conversionsEl = document.getElementById("totalConversions");
  const activeProEl = document.getElementById("activePro");
  const conversionRateEl = document.getElementById("conversionRate");
  
  if (revenueEl) revenueEl.textContent = `$${data.totalRevenue.toFixed(2)}`;
  if (conversionsEl) conversionsEl.textContent = data.totalConversions;
  if (activeProEl) activeProEl.textContent = data.activeProCount;
  if (conversionRateEl) conversionRateEl.textContent = `${data.conversionRate}%`;
}

function updateFunnel(data) {
  const stages = [
    { name: "Total Listings", count: data.totalListings, percentage: 100 },
    { name: "Active Users", count: data.activeUsers, percentage: (data.activeUsers / data.totalListings * 100) || 0 },
    { name: "Completed Profiles", count: data.completedProfiles, percentage: (data.completedProfiles / data.totalListings * 100) || 0 },
    { name: "Pro Businesses", count: data.proBusinesses, percentage: (data.proBusinesses / data.totalListings * 100) || 0 }
  ];
  
  const container = document.getElementById("funnelVisualization");
  if (!container) return;
  
  container.innerHTML = "";
  
  stages.forEach(stage => {
    const stageDiv = document.createElement("div");
    stageDiv.className = "funnel-stage";
    stageDiv.innerHTML = `
      <div class="funnel-stage-name">${stage.name}</div>
      <div class="funnel-bar">
        <div class="funnel-bar-fill" style="width: ${stage.percentage}%">
          ${stage.percentage.toFixed(1)}%
        </div>
      </div>
      <div class="funnel-count">${stage.count}</div>
    `;
    container.appendChild(stageDiv);
  });
}

function updateCommissionTable(breakdown) {
  const tbody = document.getElementById("commissionTableBody");
  if (!tbody) return;
  
  const total = breakdown.church + breakdown.salesperson + breakdown.director + breakdown.kc;
  
  const rows = [
    { label: "Churches (10%)", amount: breakdown.church, expected: 0.10 },
    { label: "Salespeople (5%)", amount: breakdown.salesperson, expected: 0.05 },
    { label: "Directors (30%)", amount: breakdown.director, expected: 0.30 },
    { label: "Kingdom Connects (55%)", amount: breakdown.kc, expected: 0.55 }
  ];
  
  tbody.innerHTML = "";
  
  rows.forEach(row => {
    const actualPercent = total > 0 ? (row.amount / total * 100) : 0;
    const variance = actualPercent - (row.expected * 100);
    const badge = Math.abs(variance) < 1 ? "metric-excellent" : Math.abs(variance) < 3 ? "metric-good" : "metric-needs-improvement";
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.label}</td>
      <td>$${row.amount.toFixed(2)}</td>
      <td>${actualPercent.toFixed(1)}%</td>
      <td><span class="metric-badge ${badge}">${variance >= 0 ? '+' : ''}${variance.toFixed(1)}%</span></td>
    `;
    tbody.appendChild(tr);
  });
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

window.updateAnalytics = loadAnalytics;

// Kingdom Connects Chart Theme
const kcChartTheme = {
  gold: '#c9a227',
  goldLight: 'rgba(201, 162, 39, 0.3)',
  purple: '#9b59b6',
  purpleLight: 'rgba(155, 89, 182, 0.3)',
  teal: '#1abc9c',
  tealLight: 'rgba(26, 188, 156, 0.3)',
  text: '#f5f5f5',
  textMuted: 'rgba(245, 245, 245, 0.6)',
  gridLines: 'rgba(255, 255, 255, 0.1)',
  background: '#1a1a2e'
};

let revenueChart = null;
let monthlyTrendsChart = null;

function initCharts() {
  Chart.defaults.color = kcChartTheme.text;
  Chart.defaults.borderColor = kcChartTheme.gridLines;
  
  initRevenueChart();
  initMonthlyTrendsChart();
}

function initRevenueChart() {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  
  if (revenueChart) {
    revenueChart.destroy();
  }
  
  const last6Months = getLast6Months();
  
  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: last6Months.labels,
      datasets: [{
        label: 'Revenue',
        data: last6Months.revenue,
        borderColor: kcChartTheme.gold,
        backgroundColor: kcChartTheme.goldLight,
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: kcChartTheme.gold,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: kcChartTheme.gold,
          bodyColor: kcChartTheme.text,
          borderColor: kcChartTheme.gold,
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: function(context) {
              return '$' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: kcChartTheme.gridLines
          },
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function initMonthlyTrendsChart() {
  const ctx = document.getElementById('monthlyTrendsChart');
  if (!ctx) return;
  
  if (monthlyTrendsChart) {
    monthlyTrendsChart.destroy();
  }
  
  const last6Months = getLast6Months();
  
  monthlyTrendsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: last6Months.labels,
      datasets: [
        {
          label: 'Signups',
          data: last6Months.signups,
          backgroundColor: kcChartTheme.teal,
          borderColor: kcChartTheme.teal,
          borderWidth: 0,
          borderRadius: 6,
          barPercentage: 0.6
        },
        {
          label: 'Pro Conversions',
          data: last6Months.conversions,
          backgroundColor: kcChartTheme.gold,
          borderColor: kcChartTheme.gold,
          borderWidth: 0,
          borderRadius: 6,
          barPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: kcChartTheme.gold,
          bodyColor: kcChartTheme.text,
          borderColor: kcChartTheme.gold,
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: kcChartTheme.gridLines
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function getLast6Months() {
  const months = [];
  const revenue = [];
  const signups = [];
  const conversions = [];
  
  const now = new Date();
  
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(date.toLocaleDateString('en-US', { month: 'short' }));
    
    revenue.push(Math.floor(Math.random() * 2000) + 500);
    signups.push(Math.floor(Math.random() * 30) + 10);
    conversions.push(Math.floor(Math.random() * 15) + 3);
  }
  
  return {
    labels: months,
    revenue: revenue,
    signups: signups,
    conversions: conversions
  };
}

document.addEventListener("DOMContentLoaded", () => {
  loadAnalytics();
  
  if (typeof Chart !== 'undefined') {
    initCharts();
  } else {
    setTimeout(initCharts, 500);
  }
});
