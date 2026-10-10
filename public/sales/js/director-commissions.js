import { db } from "../../js/firebase-config.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireSalesDirector } from "../../js/auth/access-control.js";

let currentUserId = null;
let teamData = [];

requireSalesDirector((userContext, firebaseUser) => {
  currentUserId = firebaseUser.uid;
  loadDirectorData();
});

async function loadDirectorData() {
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUserId));
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      document.getElementById('directorMonthly').textContent = `$${(data.monthly_commission_total || 0).toFixed(2)}`;
      document.getElementById('directorYTD').textContent = `$${(data.ytd_commission_total || 0).toFixed(2)}`;
      document.getElementById('directorLifetime').textContent = `$${(data.total_sales_director_commission || 0).toFixed(2)}`;
    }

    const teamQuery = query(
      collection(db, 'users'),
      where('sales_director_id', '==', currentUserId)
    );
    
    const teamSnapshot = await getDocs(teamQuery);
    
    if (teamSnapshot.empty) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('emptyState').classList.remove('hidden');
      return;
    }

    teamData = await Promise.all(teamSnapshot.docs.map(async (teamDoc) => {
      const salesperson = teamDoc.data();
      const salespersonId = teamDoc.id;
      
      const businessQuery = query(
        collection(db, 'business_listings_public'),
        where('referring_salesperson_id', '==', salespersonId),
        where('pro_status', '==', true)
      );
      
      const businessSnapshot = await getDocs(businessQuery);
      const activeReferrals = businessSnapshot.size;
      const monthlySales = activeReferrals * 8.99;
      const yourCut = monthlySales * 0.30;
      
      return {
        name: salesperson.display_name || salesperson.email || 'Unknown',
        activeReferrals: activeReferrals,
        monthlySales: monthlySales,
        yourCut: yourCut
      };
    }));

    document.getElementById('teamSize').textContent = teamData.length;
    renderTeamTable();

  } catch (error) {
    console.error('Error loading director data:', error);
    document.getElementById('loading').innerHTML = '<p>Error loading data. Please try again.</p>';
  }
}

function renderTeamTable() {
  const tbody = document.getElementById('teamBody');
  tbody.innerHTML = '';

  teamData.forEach(member => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${member.name}</td>
      <td>${member.activeReferrals}</td>
      <td>$${member.monthlySales.toFixed(2)}</td>
      <td>$${member.yourCut.toFixed(2)}</td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('teamWrapper').classList.remove('hidden');
}
