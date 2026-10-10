    import { db } from "../../js/firebase-config.js";
    import { collection, getDocs, updateDoc, doc, query, where, collectionGroup, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { requireAdmin } from "./admin-auth-guard.js";

    let currentUser = null;
    let allCommissions = [];
    let allProBusinesses = [];
    let currentTab = 'commissions';

    requireAdmin((userContext, firebaseUser) => {
      currentUser = firebaseUser;
      loadData();
    });

    document.getElementById('filterPaidStatus').addEventListener('change', renderCommissions);
    document.getElementById('exportCommissions').addEventListener('click', exportCommissionsCSV);

    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        currentTab = tabName;
        
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        this.classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
      });
    });

    async function loadData() {
      try {
        await Promise.all([
          loadCommissions(),
          loadProBusinesses()
        ]);

        updateStats();
        renderCommissions();
        renderProBusinesses();

      } catch (error) {
        console.error('Error loading payment data:', error);
        document.getElementById('errorMessage').classList.remove('hidden');
      }
    }

    async function loadCommissions() {
      try {
        const commissionsQuery = query(
          collectionGroup(db, "commissions"),
          orderBy("created_at", "desc")
        );
        
        const commissionsSnapshot = await getDocs(commissionsQuery);

        if (commissionsSnapshot.empty) {
          document.getElementById('commissionsLoading').classList.add('hidden');
          document.getElementById('commissionsEmpty').classList.remove('hidden');
          return;
        }

        const businessLookups = new Map();

        commissionsSnapshot.forEach(commissionDoc => {
          const commission = commissionDoc.data();
          const businessId = commissionDoc.ref.parent.parent.id;
          
          if (!businessLookups.has(businessId)) {
            businessLookups.set(businessId, {
              ref: commissionDoc.ref.parent.parent,
              commissions: []
            });
          }
          
          businessLookups.get(businessId).commissions.push({
            id: commissionDoc.id,
            businessId,
            ...commission
          });
        });

        const businessPromises = Array.from(businessLookups.values()).map(item =>
          item.ref.get().catch(e => {
            console.error('Error loading business:', e);
            return null;
          })
        );

        const businessDocs = await Promise.all(businessPromises);
        
        allCommissions = [];
        businessDocs.forEach((businessDoc, index) => {
          if (businessDoc && businessDoc.exists) {
            const businessData = businessDoc.data();
            const businessId = businessDoc.id;
            const commissions = businessLookups.get(businessId).commissions;
            
            commissions.forEach(commission => {
              allCommissions.push({
                ...commission,
                businessName: businessData.business_name || 'Unknown'
              });
            });
          }
        });

        renderCommissions();
        document.getElementById('commissionsLoading').classList.add('hidden');
        document.getElementById('commissionsContent').classList.remove('hidden');

      } catch (error) {
        console.error('Error loading commissions:', error);
        document.getElementById('commissionsLoading').classList.add('hidden');
        document.getElementById('errorMessage').classList.remove('hidden');
      }
    }

    async function loadProBusinesses() {
      try {
        const proQuery = query(
          collection(db, "business_listings_public"),
          where("pro_status", "==", "pro")
        );
        
        const proSnapshot = await getDocs(proQuery);

        if (proSnapshot.empty) {
          document.getElementById('proLoading').classList.add('hidden');
          document.getElementById('proEmpty').classList.remove('hidden');
          return;
        }

        allProBusinesses = proSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        renderProBusinesses();
        document.getElementById('proLoading').classList.add('hidden');
        document.getElementById('proContent').classList.remove('hidden');

      } catch (error) {
        console.error('Error loading Pro businesses:', error);
        document.getElementById('proLoading').classList.add('hidden');
        document.getElementById('errorMessage').classList.remove('hidden');
      }
    }

    function updateStats() {
      const totalRevenue = allCommissions.reduce((sum, c) => sum + (c.pro_payment_amount || 0), 0);
      const totalCommissions = allCommissions.reduce((sum, c) => sum + (c.commission_amount || 0), 0);
      const totalTithes = allCommissions.reduce((sum, c) => sum + (c.tithe_amount || 0), 0);
      const activeProCount = allProBusinesses.length;
      
      const avgProPayment = totalRevenue / Math.max(1, allCommissions.length);
      const monthlyRecurring = activeProCount * avgProPayment;

      document.getElementById('totalRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
      document.getElementById('activeProBusiness').textContent = activeProCount;
      document.getElementById('totalCommissions').textContent = `$${totalCommissions.toFixed(2)}`;
      document.getElementById('totalTithes').textContent = `$${totalTithes.toFixed(2)}`;
      document.getElementById('monthlyRecurring').textContent = `$${monthlyRecurring.toFixed(2)}`;
    }

    function renderCommissions() {
      const filterStatus = document.getElementById('filterPaidStatus').value;
      let filtered = [...allCommissions];

      if (filterStatus === 'paid') {
        filtered = filtered.filter(c => c.commission_paid === true);
      } else if (filterStatus === 'pending') {
        filtered = filtered.filter(c => c.commission_paid !== true);
      }

      const tbody = document.getElementById('commissionsTableBody');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state-table">No commissions match the filter</td></tr>';
        return;
      }

      filtered.forEach(commission => {
        const tr = document.createElement('tr');
        
        const createdDate = commission.created_at?.toDate ? commission.created_at.toDate().toLocaleDateString() : 'N/A';
        const paidDate = commission.payment_date?.toDate ? commission.payment_date.toDate().toLocaleDateString() : '-';
        const statusClass = commission.commission_paid ? 'status-paid' : 'status-pending';
        const statusText = commission.commission_paid ? 'Paid' : 'Pending';

        tr.innerHTML = `
          <td>${escapeHtml(commission.businessName)}</td>
          <td>${escapeHtml(commission.referrer_display_name || 'Unknown')}</td>
          <td>$${(commission.pro_payment_amount || 0).toFixed(2)}</td>
          <td>$${(commission.commission_amount || 0).toFixed(2)}</td>
          <td>$${(commission.tithe_amount || 0).toFixed(2)}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${createdDate}</td>
          <td>
            ${!commission.commission_paid ? 
              `<button class="btn btn-small btn-gold" data-action="markPaid" data-business-id="${commission.businessId}" data-commission-id="${commission.id}">Mark Paid</button>` :
              `<span class="text-muted">Paid ${paidDate}</span>`
            }
          </td>
        `;
        
        tbody.appendChild(tr);
      });
    }

    function renderProBusinesses() {
      const tbody = document.getElementById('proTableBody');
      tbody.innerHTML = '';

      allProBusinesses.forEach(business => {
        const tr = document.createElement('tr');
        
        const startDate = business.pro_start_date?.toDate ? business.pro_start_date.toDate().toLocaleDateString() : 'N/A';
        const endDate = business.pro_end_date?.toDate ? business.pro_end_date.toDate().toLocaleDateString() : 'N/A';
        const now = new Date();
        const isActive = business.pro_end_date?.toDate ? business.pro_end_date.toDate() > now : false;
        const statusClass = isActive ? 'status-paid' : 'status-pending';
        const statusText = isActive ? 'Active' : 'Expired';

        tr.innerHTML = `
          <td>${escapeHtml(business.business_name || 'Unknown')}</td>
          <td>${escapeHtml(business.email || 'N/A')}</td>
          <td>${startDate}</td>
          <td>${endDate}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${escapeHtml(business.referrer_display_name || '-')}</td>
        `;
        
        tbody.appendChild(tr);
      });
    }

    window.markPaid = async function(businessId, commissionId) {
      if (!confirm('Mark this commission as paid?')) return;

      try {
        await updateDoc(doc(db, "business_listings_public", businessId, "commissions", commissionId), {
          commission_paid: true,
          payment_date: serverTimestamp()
        });
        window.showToast('Commission marked as paid', 'success');
        await loadData();
      } catch (error) {
        console.error('Error marking commission as paid:', error);
        window.showToast('Error: ' + error.message, 'error');
      }
    };

    function exportCommissionsCSV() {
      if (allCommissions.length === 0) {
        window.showToast('No commissions to export', 'info');
        return;
      }

      const headers = ['Business', 'Sales Agent', 'Pro Payment', 'Commission', 'Church Tithe', 'Status', 'Created Date', 'Paid Date'];
      const rows = allCommissions.map(commission => {
        const createdDate = commission.created_at?.toDate().toLocaleDateString() || 'Unknown';
        const paidDate = commission.payment_date?.toDate().toLocaleDateString() || '-';
        const status = commission.commission_paid ? 'Paid' : 'Pending';
        
        return [
          `"${(commission.businessName || 'Unknown').replace(/"/g, '""')}"`,
          `"${(commission.referrer_display_name || 'Unknown').replace(/"/g, '""')}"`,
          (commission.pro_payment_amount || 0).toFixed(2),
          (commission.commission_amount || 0).toFixed(2),
          (commission.tithe_amount || 0).toFixed(2),
          status,
          createdDate,
          paidDate
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kingdom-connects-commissions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  
  if (action === 'markPaid') {
    const businessId = button.getAttribute('data-business-id');
    const commissionId = button.getAttribute('data-commission-id');
    if (window.markPaid) window.markPaid(businessId, commissionId);
  }
});
