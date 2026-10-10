/* Kingdom Connects - Marketing Manager Team Management */
import { db } from "../../js/firebase-config.js";
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { isBusinessPro } from "../../js/role-utils.js";
import { requireAuth } from "../../js/auth/access-control.js";

let allDirectors = [];

requireAuth({ roles: ['marketing_manager', 'admin'] }, () => {
  loadTeamData();
});

async function loadTeamData() {
  try {
    const salespeople = await getSalesTeam();
    const directors = await getSalesDirectors();
    allDirectors = directors;
    
    displayTeamMembers([...directors, ...salespeople]);
    updateTeamStats(salespeople.length, directors.length);
    populateDirectorSelect(directors);
  } catch (error) {
    console.error("Error loading team data:", error);
    showError("Failed to load team data");
  }
}

function populateDirectorSelect(directors) {
  const select = document.getElementById('directorSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">-- Select Director --</option>';
  directors.forEach(d => {
    const option = document.createElement('option');
    option.value = d.id;
    option.textContent = d.name;
    select.appendChild(option);
  });
}

async function getSalesTeam() {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("role", "==", "sales_agent"));
  const snapshot = await getDocs(q);
  
  const team = [];
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const stats = await getSalespersonStats(data.uid);
    
    team.push({
      id: data.uid,
      name: data.display_name || data.email || "Unknown",
      email: data.email,
      role: "Sales Agent",
      joinDate: data.created_at?.toDate() || new Date(),
      directorId: data.sales_director_id || null,
      directorName: data.sales_director_name || null,
      stats
    });
  }
  
  return team;
}

async function getSalesDirectors() {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("role", "==", "sales_director"));
  const snapshot = await getDocs(q);
  
  const directors = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const stats = await getDirectorStats(data.uid);
    
    directors.push({
      id: data.uid,
      name: data.display_name || data.email || "Unknown",
      email: data.email,
      role: "Sales Director",
      joinDate: data.created_at?.toDate() || new Date(),
      stats
    });
  }
  
  return directors;
}

async function getSalespersonStats(userId) {
  const businessesRef = collection(db, "business_listings_public");
  const q = query(businessesRef, where("referring_salesperson_id", "==", userId));
  const snapshot = await getDocs(q);
  
  let totalReferrals = 0;
  let proConversions = 0;
  let totalCommission = 0;
  
  snapshot.forEach(doc => {
    const data = doc.data();
    totalReferrals++;
    if (isBusinessPro(data)) {
      proConversions++;
    }
  });
  
  const ledgerRef = collection(db, "commission_ledger");
  const commissionQuery = query(
    ledgerRef,
    where("recipient_id", "==", userId),
    where("recipient_type", "in", ["salesperson", "sales_agent"])
  );
  const commissionSnapshot = await getDocs(commissionQuery);
  
  commissionSnapshot.forEach(doc => {
    totalCommission += doc.data().commission_amount || 0;
  });
  
  const conversionRate = totalReferrals > 0 ? (proConversions / totalReferrals * 100) : 0;
  
  return {
    totalReferrals,
    proConversions,
    totalCommission,
    conversionRate: conversionRate.toFixed(1)
  };
}

async function getDirectorStats(userId) {
  const businessesRef = collection(db, "business_listings_public");
  const q = query(businessesRef, where("sales_director_id", "==", userId));
  const snapshot = await getDocs(q);
  
  let teamSize = 0;
  let totalRevenue = 0;
  let totalCommission = 0;
  
  const teamMemberIds = new Set();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.referring_salesperson_id) {
      teamMemberIds.add(data.referring_salesperson_id);
    }
  });
  teamSize = teamMemberIds.size;
  
  const ledgerRef = collection(db, "commission_ledger");
  const commissionQuery = query(
    ledgerRef,
    where("recipient_id", "==", userId),
    where("recipient_type", "==", "director")
  );
  const commissionSnapshot = await getDocs(commissionQuery);
  
  commissionSnapshot.forEach(doc => {
    const data = doc.data();
    totalCommission += data.commission_amount || 0;
    totalRevenue += data.pro_payment_amount || 0;
  });
  
  return {
    teamSize,
    totalRevenue,
    totalCommission,
    conversionRate: "N/A"
  };
}

function displayTeamMembers(team) {
  const container = document.getElementById("agentsContainer");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (team.length === 0) {
    container.innerHTML = '<p class="opacity-60">No team members found.</p>';
    return;
  }
  
  team.sort((a, b) => b.stats.totalCommission - a.stats.totalCommission);
  
  team.forEach(member => {
    const card = document.createElement("div");
    card.className = "agent-card";
    
    const initials = getInitials(member.name);
    
    card.innerHTML = `
      <div class="agent-avatar">${initials}</div>
      <div class="agent-info">
        <h3>${escapeHtml(member.name)}</h3>
        <div class="agent-meta">
          <span>📧 ${escapeHtml(member.email)}</span>
          <span>📅 Joined ${formatDate(member.joinDate)}</span>
          <span class="role-badge">${member.role}</span>
        </div>
        <div class="agent-stats">
          ${member.role === "Sales Agent" ? `
            <div class="stat-item">
              <div class="stat-value">${member.stats.totalReferrals}</div>
              <div class="stat-label">Referrals</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${member.stats.proConversions}</div>
              <div class="stat-label">Pro Conversions</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${member.stats.conversionRate}%</div>
              <div class="stat-label">Conv. Rate</div>
            </div>
          ` : `
            <div class="stat-item">
              <div class="stat-value">${member.stats.teamSize}</div>
              <div class="stat-label">Team Size</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">$${member.stats.totalRevenue.toFixed(2)}</div>
              <div class="stat-label">Team Revenue</div>
            </div>
          `}
          <div class="stat-item">
            <div class="stat-value">$${member.stats.totalCommission.toFixed(2)}</div>
            <div class="stat-label">Total Commission</div>
          </div>
        </div>
      </div>
      <div class="agent-actions">
        <button class="btn-secondary" data-action="viewAgentDetails" data-agent-id="${member.id}">View Details</button>
        ${member.role === "Sales Agent" ? `
          <button class="btn-secondary" data-action="assignDirector" data-agent-id="${member.id}" data-agent-name="${escapeHtml(member.name)}">
            ${member.directorId ? 'Change Director' : 'Assign Director'}
          </button>
        ` : ''}
      </div>
      ${member.role === "Sales Agent" && member.directorName ? `
        <div class="agent-director-badge">Director: ${escapeHtml(member.directorName)}</div>
      ` : ''}
    `;
    
    container.appendChild(card);
  });
}

function updateTeamStats(salesCount, directorCount) {
  const totalTeamEl = document.getElementById("totalTeam");
  const activeAgentsEl = document.getElementById("activeAgents");
  
  if (totalTeamEl) totalTeamEl.textContent = salesCount + directorCount;
  if (activeAgentsEl) activeAgentsEl.textContent = salesCount;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatDate(date) {
  if (!date) return "Unknown";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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

window.viewAgentDetails = function(agentId) {
  console.log("View details for agent:", agentId);
  alert("Agent details view coming soon!");
};

document.addEventListener("DOMContentLoaded", loadTeamData);

// Event listeners for modal controls
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-action="closeQuotaModal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('quotaModal').classList.remove('active');
    });
  });
  
  document.querySelectorAll('[data-action="closeAssignModal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('assignDirectorModal').classList.remove('active');
    });
  });

  // Event delegation for dynamically created buttons
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-action="viewAgentDetails"]')) {
      const agentId = e.target.getAttribute('data-agent-id');
      console.log('View agent details:', agentId);
    }
    
    if (e.target.matches('[data-action="assignDirector"]')) {
      const agentId = e.target.getAttribute('data-agent-id');
      const agentName = e.target.getAttribute('data-agent-name');
      openAssignDirectorModal(agentId, agentName);
    }
  });

  // Quota form submission
  const quotaForm = document.getElementById('quotaForm');
  if (quotaForm) {
    quotaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const agentId = document.getElementById('quotaAgentId').value;
      const quotaValue = parseInt(document.getElementById('quotaValue').value) || 10;
      
      if (!agentId) {
        alert('No agent selected.');
        return;
      }
      
      try {
        await updateDoc(doc(db, "users", agentId), {
          monthly_quota: quotaValue
        });
        
        alert('Quota updated successfully!');
        document.getElementById('quotaModal').classList.remove('active');
        await loadTeamData();
        
      } catch (error) {
        console.error('Error updating quota:', error);
        alert('Error updating quota. Please try again.');
      }
    });
  }
  
  // Assign Director form submission
  const assignForm = document.getElementById('assignDirectorForm');
  if (assignForm) {
    assignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const agentId = document.getElementById('assignAgentId').value;
      const directorId = document.getElementById('directorSelect').value;
      
      if (!agentId || !directorId) {
        alert('Please select a director.');
        return;
      }
      
      const director = allDirectors.find(d => d.id === directorId);
      
      try {
        await updateDoc(doc(db, "users", agentId), {
          sales_director_id: directorId,
          sales_director_name: director ? director.name : 'Unknown'
        });
        
        alert('Director assigned successfully!');
        document.getElementById('assignDirectorModal').classList.remove('active');
        await loadTeamData();
        
      } catch (error) {
        console.error('Error assigning director:', error);
        alert('Error assigning director. Please try again.');
      }
    });
  }
});

function openAssignDirectorModal(agentId, agentName) {
  document.getElementById('assignAgentId').value = agentId;
  document.getElementById('assignAgentName').textContent = agentName;
  document.getElementById('directorSelect').value = '';
  document.getElementById('assignDirectorModal').classList.add('active');
}
