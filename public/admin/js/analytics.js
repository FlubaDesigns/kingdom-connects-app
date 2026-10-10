    import { db } from "../../js/firebase-config.js";
    import { onReady } from "../../js/dom-ready.js";
    import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    async function initAnalytics() {
      try {
        const businessesSnap = await getDocs(collection(db, "business_listings_public"));
        const proBusinessesSnap = await getDocs(query(collection(db, "business_listings_public"), where("pro_status", "==", "pro")));
        const churchesSnap = await getDocs(collection(db, "churches"));
        const usersSnap = await getDocs(collection(db, "users"));

        document.getElementById("totalBusinesses").textContent = businessesSnap.size;
        document.getElementById("proBusinesses").textContent = proBusinessesSnap.size;
        document.getElementById("totalChurches").textContent = churchesSnap.size;
        document.getElementById("totalUsers").textContent = usersSnap.size;

      } catch (error) {
        console.error("Analytics error:", error);
      }
    }

    onReady(initAnalytics);
