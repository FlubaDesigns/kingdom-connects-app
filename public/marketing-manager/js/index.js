/* Kingdom Connects - Marketing Manager Dashboard */
import { db } from "../../js/firebase-config.js";
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";
import { isBusinessPro } from "../../js/role-utils.js";

requireAuth({ roles: ['marketing_manager', 'admin'] }, () => {
  loadDashboardData();
});

async function loadDashboardData() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalRevenue, activeProBusinesses, topPerformers, recentActivity] = await Promise.all([
      calculateTotalRevenue(thirtyDaysAgo),
      getActiveProBusinesses(),
      getTopPerformers(thirtyDaysAgo),
      getRecentActivity()
    ]);

    updateKPIs(totalRevenue, activeProBusinesses);
    populateLeaderboard(topPerformers);
    populateActivityFeed(recentActivity);
  } catch (error) {
    console.error("Error loading dashboard:", error);
    showError("Failed to load dashboard data");
  }
}

async function calculateTotalRevenue(since) {
  const paymentsRef = collection(db, "payments");
  const q = query(
    paymentsRef,
    where("created_at", ">=", since),
    where("status", "==", "succeeded")
  );
  
  const snapshot = await getDocs(q);
  let total = 0;
  snapshot.forEach(doc => {
    const amount = doc.data().amount || 0;
    total += amount;
  });
  
  return total / 100;
}

async function getActiveProBusinesses() {
  const businessesRef = collection(db, "business_listings_public");
  const snapshot = await getDocs(businessesRef);
  
  let count = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    if (isBusinessPro(data)) {
      count++;
    }
  });
  return count;
}

async function getTopPerformers(since) {
  const ledgerRef = collection(db, "commission_ledger");
  const q = query(
    ledgerRef,
    where("created_at", ">=", since),
    where("recipient_type", "in", ["salesperson", "director"])
  );
  
  const snapshot = await getDocs(q);
  const performers = {};
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const recipientId = data.recipient_id;
    
    if (!performers[recipientId]) {
      performers[recipientId] = {
        id: recipientId,
        type: data.recipient_type,
        totalCommission: 0,
        conversions: 0
      };
    }
    
    performers[recipientId].totalCommission += data.commission_amount || 0;
    performers[recipientId].conversions += 1;
  });
  
  const performerArray = Object.values(performers)
    .sort((a, b) => b.totalCommission - a.totalCommission)
    .slice(0, 5);
  
  for (const performer of performerArray) {
    performer.name = await getUserName(performer.id);
  }
  
  return performerArray;
}

async function getUserName(userId) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("uid", "==", userId), limit(1));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();
      return userData.display_name || userData.email || "Unknown";
    }
  } catch (error) {
    console.error("Error fetching user name:", error);
  }
  return "Unknown Agent";
}

async function getRecentActivity() {
  const businessesRef = collection(db, "business_listings_public");
  const q = query(
    businessesRef,
    where("pro_status", "==", "pro"),
    orderBy("pro_start_date", "desc"),
    limit(10)
  );
  
  const snapshot = await getDocs(q);
  const activities = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    activities.push({
      type: "conversion",
      businessName: data.business_name || "Unknown Business",
      timestamp: data.pro_start_date?.toDate() || new Date(),
      salesperson: data.referring_salesperson_id || "Direct"
    });
  });
  
  return activities;
}

function updateKPIs(revenue, proCount) {
  const revenueEl = document.getElementById("totalRevenue");
  const proCountEl = document.getElementById("activeProBiz");
  const conversionEl = document.getElementById("conversionRate");
  const avgDealEl = document.getElementById("avgDealValue");
  
  if (revenueEl) revenueEl.textContent = `$${revenue.toFixed(2)}`;
  if (proCountEl) proCountEl.textContent = proCount;
  
  if (conversionEl) {
    const rate = proCount > 0 ? ((proCount / (proCount + 50)) * 100).toFixed(1) : "0.0";
    conversionEl.textContent = `${rate}%`;
  }
  
  if (avgDealEl) {
    const avg = proCount > 0 ? (revenue / proCount).toFixed(2) : "0.00";
    avgDealEl.textContent = `$${avg}`;
  }
}

function populateLeaderboard(performers) {
  const container = document.getElementById("leaderboardList");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (performers.length === 0) {
    container.innerHTML = '<p class="opacity-60">No sales data available for this period.</p>';
    return;
  }
  
  performers.forEach((performer, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "rank-other";
    
    const item = document.createElement("div");
    item.className = "leaderboard-item";
    item.innerHTML = `
      <div class="rank-badge ${rankClass}">${rank}</div>
      <div class="agent-info">
        <h4>${escapeHtml(performer.name)}</h4>
        <p>${performer.type === "director" ? "Sales Director" : "Sales Agent"}</p>
      </div>
      <div class="performance-metric">
        <div class="value">${performer.conversions}</div>
        <div class="label">Conversions</div>
      </div>
      <div class="performance-metric">
        <div class="value">$${performer.totalCommission.toFixed(2)}</div>
        <div class="label">Commission</div>
      </div>
    `;
    container.appendChild(item);
  });
}

function populateActivityFeed(activities) {
  const container = document.getElementById("activityFeed");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (activities.length === 0) {
    container.innerHTML = '<p class="opacity-60">No recent activity.</p>';
    return;
  }
  
  activities.forEach(activity => {
    const item = document.createElement("div");
    item.className = `activity-item ${activity.type}`;
    
    const timeAgo = getTimeAgo(activity.timestamp);
    
    item.innerHTML = `
      <strong>${escapeHtml(activity.businessName)}</strong> upgraded to Pro
      ${activity.salesperson !== "Direct" ? ` (via salesperson)` : ""}
      <div class="activity-time">${timeAgo}</div>
    `;
    container.appendChild(item);
  });
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
  return date.toLocaleDateString();
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

document.addEventListener("DOMContentLoaded", loadDashboardData);
