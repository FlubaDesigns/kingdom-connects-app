import { isBusinessPro } from '../../js/role-utils.js';
import { adminReady } from './admin-auth-guard.js';
await adminReady;
    import { db } from "../../js/firebase-config.js";
    import { onReady } from "../../js/dom-ready.js";
    import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    async function initAnalytics() {
      try {
        const businessesSnap = await getDocs(collection(db, "business_listings_public"));

        const churchesSnap = await getDocs(collection(db, "churches"));
        const usersSnap = await getDocs(collection(db, "users"));

        document.getElementById("totalBusinesses").textContent = businessesSnap.size;
        document.getElementById("proBusinesses").textContent = businessesSnap.docs.filter(doc => isBusinessPro(doc.data())).length;
        document.getElementById("totalChurches").textContent = churchesSnap.size;
        document.getElementById("totalUsers").textContent = usersSnap.size;

      } catch (error) {
        console.error("Analytics error:", error);
        document.querySelectorAll(".stat-value").forEach(node => {node.textContent = "Unavailable";});
      }
    }

    onReady(initAnalytics);
