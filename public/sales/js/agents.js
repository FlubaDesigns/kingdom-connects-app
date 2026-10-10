import { db } from "../js/firebase-config.js";
import { collection, query, where, getDocs, collectionGroup, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireSalesAgent } from "./sales-auth-guard.js";

let currentUser = null;

requireSalesAgent((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadAgentData();
});

async function loadAgentData() {
  try {
    const commissionsQuery = query(
      collectionGroup(db, "commissions"),
      where("referrer_id", "==", currentUser.uid)
    );
    
    const commissionsSnapshot = await getDocs(commissionsQuery);
    
    let totalCommissions = 0;
    let paidCommissions = 0;
    let pendingCommissions = 0;
    let activeClients = new Set();

    commissionsSnapshot.forEach(doc => {
      const commission = doc.data();
      const amount = commission.commission_amount || 0;
      
      totalCommissions += amount;
      
      if (commission.commission_paid) {
        paidCommissions += amount;
      } else {
        pendingCommissions += amount;
      }

      const businessId = doc.ref.parent.parent.id;
      activeClients.add(businessId);
    });

    renderAgentCard({
      name: currentUser.displayName || currentUser.email || 'You',
      totalCommissions: totalCommissions,
      paidCommissions: paidCommissions,
      pendingCommissions: pendingCommissions,
      activeClients: activeClients.size,
      totalReferrals: commissionsSnapshot.size
    });

  } catch (error) {
    console.error('Error loading agent data:', error);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
  }
}

function renderAgentCard(agent) {
  const container = document.getElementById('agentsList');
  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'agent-card';

  card.innerHTML = `
    <h3>${escapeHtml(agent.name)}</h3>
    <div class="agent-stat">
      <label>Total Earned:</label>
      <value>$${agent.totalCommissions.toFixed(2)}</value>
    </div>
    <div class="agent-stat">
      <label>Paid Out:</label>
      <value class="text-gold">$${agent.paidCommissions.toFixed(2)}</value>
    </div>
    <div class="agent-stat">
      <label>Pending:</label>
      <value class="text-orange">$${agent.pendingCommissions.toFixed(2)}</value>
    </div>
    <div class="agent-stat">
      <label>Active Clients:</label>
      <value>${agent.activeClients}</value>
    </div>
    <div class="agent-stat">
      <label>Total Referrals:</label>
      <value>${agent.totalReferrals}</value>
    </div>
  `;

  container.appendChild(card);

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('content').classList.remove('hidden');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
