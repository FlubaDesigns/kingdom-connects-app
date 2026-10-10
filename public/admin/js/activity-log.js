    import { db } from "../../js/firebase-config.js";
    import { collection, getDocs, query, orderBy, where, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { requireAdmin } from "./admin-auth-guard.js";

    let currentUser = null;
    let allActivities = [];

    requireAdmin((userContext, firebaseUser) => {
      currentUser = firebaseUser;
      loadActivities();
    });

    document.getElementById('filterType').addEventListener('change', renderActivities);
    document.getElementById('filterTarget').addEventListener('change', renderActivities);
    document.getElementById('filterDate').addEventListener('change', renderActivities);

    async function loadActivities() {
      try {
        const activitiesQuery = query(
          collection(db, "activity_log"),
          orderBy("timestamp", "desc"),
          limit(500)
        );
        
        const activitiesSnapshot = await getDocs(activitiesQuery);

        if (activitiesSnapshot.empty) {
          document.getElementById('loadingMessage').classList.add('hidden');
          document.getElementById('emptyState').classList.remove('hidden');
          return;
        }

        allActivities = activitiesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        updateStats();
        renderActivities();

        document.getElementById('loadingMessage').classList.add('hidden');
        document.getElementById('contentArea').classList.remove('hidden');

      } catch (error) {
        console.error('Error loading activities:', error);
        document.getElementById('loadingMessage').classList.add('hidden');
        
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
          document.getElementById('emptyState').classList.remove('hidden');
          document.getElementById('emptyState').innerHTML = `
            <p class="text-gold">Activity logging is not yet configured.</p>
            <p class="text-muted mt-md">The activity_log collection needs to be created and indexed in Firestore.</p>
            <p class="text-muted">Once configured, this page will track all platform actions for security and audit purposes.</p>
          `;
        } else {
          document.getElementById('errorMessage').classList.remove('hidden');
        }
      }
    }

    function updateStats() {
      const totalActivities = allActivities.length;
      
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);

      const todayActivities = allActivities.filter(a => {
        const timestamp = a.timestamp?.toDate();
        return timestamp && timestamp >= startOfToday;
      }).length;

      const weekActivities = allActivities.filter(a => {
        const timestamp = a.timestamp?.toDate();
        return timestamp && timestamp >= startOfWeek;
      }).length;

      document.getElementById('totalActivities').textContent = totalActivities;
      document.getElementById('todayActivities').textContent = todayActivities;
      document.getElementById('weekActivities').textContent = weekActivities;
    }

    function renderActivities() {
      const filterType = document.getElementById('filterType').value;
      const filterTarget = document.getElementById('filterTarget').value;
      const filterDate = document.getElementById('filterDate').value;
      
      let filtered = [...allActivities];

      if (filterType) {
        filtered = filtered.filter(a => a.activity_type === filterType);
      }

      if (filterTarget) {
        filtered = filtered.filter(a => a.target_type === filterTarget);
      }

      if (filterDate) {
        const selectedDate = new Date(filterDate);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        filtered = filtered.filter(a => {
          const timestamp = a.timestamp?.toDate();
          return timestamp && timestamp >= selectedDate && timestamp < nextDay;
        });
      }

      const container = document.getElementById('activitiesList');
      container.innerHTML = '';

      if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state-table">No activities match the selected filters</p>';
        return;
      }

      filtered.forEach(activity => {
        const card = document.createElement('div');
        card.className = 'card p-lg mb-md border-left-gold';

        const timestamp = activity.timestamp?.toDate ? activity.timestamp.toDate().toLocaleString() : 'Unknown time';
        const activityTypeLabel = formatActivityType(activity.activity_type);
        const targetTypeLabel = (activity.target_type || 'unknown').charAt(0).toUpperCase() + (activity.target_type || 'unknown').slice(1);

        card.innerHTML = `
          <div class="flex-between mb-sm flex-wrap gap-sm">
            <div class="font-weight-600 text-gold">${escapeHtml(activityTypeLabel)}</div>
            <div class="text-muted text-sm">${timestamp}</div>
          </div>
          <div class="text-sm line-height-normal">
            ${escapeHtml(activity.details || 'No details provided')}
          </div>
          <div class="mt-sm pt-sm border-top-divider text-xs opacity-70">
            <strong>User:</strong> ${escapeHtml(activity.user_id || 'System')} | 
            <strong>Target:</strong> ${targetTypeLabel} (${escapeHtml(activity.target_id || 'N/A')}) 
            ${activity.ip_address ? `| <strong>IP:</strong> ${escapeHtml(activity.ip_address)}` : ''}
          </div>
        `;

        container.appendChild(card);
      });
    }

    function formatActivityType(type) {
      if (!type) return 'Unknown Activity';
      return type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
