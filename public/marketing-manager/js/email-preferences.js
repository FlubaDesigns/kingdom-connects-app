/* Kingdom Connects - Email Notification Preferences */
import { db } from '../../js/firebase-config.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAdmin } from '../../js/auth/access-control.js';

export function initEmailToggle() {
  const emailToggle = document.getElementById("emailToggle");
  if (!emailToggle) return;

  requireAdmin(async (userContext, firebaseUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!userDoc.exists()) return;

      const notificationsEnabled = userDoc.data().notifications_enabled !== false;
      emailToggle.classList.toggle("is-on", notificationsEnabled);

      emailToggle.addEventListener("click", async () => {
        const currentState = emailToggle.classList.contains("is-on");
        const newState = !currentState;
        emailToggle.classList.toggle("is-on", newState);

        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            notifications_enabled: newState
          });
        } catch (error) {
          console.error("Error updating email preferences:", error);
          emailToggle.classList.toggle("is-on", !newState);
        }
      });
    } catch (error) {
      console.error("Error loading email preferences:", error);
    }
  });
}
