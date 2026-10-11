import { loadCommissionLedger, ledgerTotals } from '../../js/services/commission-ledger.js';
import { watchAdminTasks } from '../../js/services/admin-tasks.js';
    import { db } from "../../js/firebase-config.js";
    import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { requireAdmin } from "../../js/auth/access-control.js";
    import { isBusinessPro } from "../../js/role-utils.js";

    requireAdmin(() => {
      loadStats();
      const unsubscribe = watchAdminTasks(tasks => {
        const count = tasks.filter(task => ['open','in_progress','blocked'].includes(task.status)).length;
        document.getElementById('adminTodoCount').textContent = count + ' active tasks — open your list';
      }, () => { document.getElementById('adminTodoCount').textContent = 'Open your list'; });
      window.addEventListener('pagehide', unsubscribe, {once:true});
    });

    async function loadStats() {
      try {
        const [usersSnap, businessesSnap, reviewsSnap, commissionsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "business_listings_public")),
          getDocs(collection(db, "reviews")),
          loadCommissionLedger()
        ]);

        const totalUsers = usersSnap.size;
        
        let proBusinesses = 0;
        let unchurchedBusinesses = 0;
        businessesSnap.forEach(doc => {
          const data = doc.data();
          if (isBusinessPro(data)) proBusinesses++;
          if (!data.church_id) unchurchedBusinesses++;
        });

        const pendingReviews = reviewsSnap.docs.filter(doc => (doc.data().status || 'pending') === 'pending').length;

        const {platform:totalRevenue, charitable:charitableFund} = ledgerTotals(commissionsSnap);

        document.getElementById('totalRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
        document.getElementById('proBusinesses').textContent = proBusinesses;
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('pendingReviews').textContent = pendingReviews;
        document.getElementById('charitableFund').textContent = `$${charitableFund.toFixed(2)}`;
        document.getElementById('unchurchedBusinesses').textContent = unchurchedBusinesses;

        document.getElementById('statsLoading').classList.add('hidden');
        document.getElementById('statsContent').classList.remove('hidden');

      } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('statsLoading').textContent = 'Error loading statistics';
      }
    }
