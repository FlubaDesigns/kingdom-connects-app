import { db } from "../../js/firebase-config.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireSalesAgent } from "../../js/auth/access-control.js";
import { isBusinessPro } from "../../js/role-utils.js";

const API_BASE = '';

let currentUser = null;
let userRole = null;

requireSalesAgent(async (userContext, firebaseUser) => {
  currentUser = firebaseUser;
  
  const onboardingComplete = await checkStripeOnboarding();
  if (!onboardingComplete) {
    window.location.href = "/sales/onboarding";
    return;
  }
  
  await checkUserRole();
  await loadDashboardStats();
});

async function checkStripeOnboarding() {
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${API_BASE}/api/stripe/account-status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error('Failed to check Stripe status');
      return true;
    }

    const data = await response.json();
    
    if (!data.hasAccount) {
      return true;
    }
    
    return data.onboardingComplete;
  } catch (error) {
    console.error('Error checking Stripe onboarding:', error);
    return true;
  }
}

async function checkUserRole() {
  try {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      userRole = userData.role || 'user';
      
      const directorRoles = ['sales_director', 'marketing_manager', 'admin'];
      if (directorRoles.includes(userRole) || userData.is_sales_director === true) {
        const directorTile = document.getElementById('director-tile');
        if (directorTile) directorTile.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.error('Error checking user role:', error);
  }
}

async function loadDashboardStats() {
  try {
    const referralsQuery = query(
      collection(db, "business_listings_public"),
      where("referring_salesperson_id", "==", currentUser.uid)
    );
    
    const referralsSnapshot = await getDocs(referralsQuery);
    
    if (referralsSnapshot.empty) {
      showEmptyState();
      return;
    }

    let totalReferrals = 0;
    let activeProClients = 0;
    let pendingApproval = 0;
    
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let newThisMonth = 0;

    referralsSnapshot.forEach(businessDoc => {
      const business = businessDoc.data();
      totalReferrals++;
      
      if (isBusinessPro(business)) {
        activeProClients++;
      }
      
      if (business.status === 'pending') {
        pendingApproval++;
      }
      
      const createdAt = business.created_at?.toDate();
      if (createdAt && createdAt >= firstOfMonth) {
        newThisMonth++;
      }
    });

    const commissionsQuery = query(
      collection(db, "commission_ledger"),
      where("recipient_type", "==", "salesperson"),
      where("recipient_id", "==", currentUser.uid)
    );
    
    const commissionsSnapshot = await getDocs(commissionsQuery);
    
    let totalEarned = 0;
    let totalPaid = 0;
    let totalPending = 0;

    commissionsSnapshot.forEach(commissionDoc => {
      const commission = commissionDoc.data();
      const amount = commission.amount || 0;
      
      totalEarned += amount;
      
      if (commission.status === 'paid') {
        totalPaid += amount;
      } else {
        totalPending += amount;
      }
    });

    const totalEarnedEl = document.getElementById('totalEarned');
    const paidStatusEl = document.getElementById('paidStatus');
    const activeClientsEl = document.getElementById('activeClients');
    const monthlyRevenueEl = document.getElementById('monthlyRevenue');
    const newConversionsEl = document.getElementById('newConversions');

    if (totalEarnedEl) totalEarnedEl.textContent = `$${totalEarned.toFixed(2)}`;
    if (paidStatusEl) paidStatusEl.textContent = `$${totalPaid.toFixed(2)} paid | $${totalPending.toFixed(2)} pending`;
    if (activeClientsEl) activeClientsEl.textContent = activeProClients;
    if (monthlyRevenueEl) monthlyRevenueEl.textContent = `${totalReferrals} referrals`;
    if (newConversionsEl) newConversionsEl.textContent = newThisMonth;

    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading dashboard stats:', error);
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) errorEl.classList.remove('hidden');
  }
}

function showEmptyState() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.classList.add('hidden');
}
