import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * 4-Level Cascading Permission Check for Review Social Sharing
 * 
 * ALL four levels must return TRUE for sharing to be allowed:
 * 1. Platform Admin (master kill switch)
 * 2. Church Admin (per-church toggle)
 * 3. Business Owner (per-business toggle)
 * 4. User (personal preference)
 * 
 * @param {string} userId - User ID who wrote the review
 * @param {string} businessId - Business being reviewed
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
export async function canShareReview(userId, businessId) {
  try {
    const platformDoc = await getDoc(doc(db, "platform_settings", "default"));
    const platformAllows = platformDoc.exists() ? (platformDoc.data().allow_review_sharing !== false) : true;
    
    if (!platformAllows) {
      return { allowed: false, reason: "Platform admin has disabled review sharing" };
    }

    const businessDoc = await getDoc(doc(db, "business_listings_public", businessId));
    if (!businessDoc.exists()) {
      return { allowed: false, reason: "Business not found" };
    }
    
    const businessData = businessDoc.data();
    const businessAllows = businessData.allow_review_sharing !== false;
    
    if (!businessAllows) {
      return { allowed: false, reason: "Business has disabled review sharing" };
    }

    if (businessData.church_id) {
      const churchDoc = await getDoc(doc(db, "churches", businessData.church_id));
      if (churchDoc.exists()) {
        const churchAllows = churchDoc.data().allow_review_sharing !== false;
        
        if (!churchAllows) {
          return { allowed: false, reason: "Church has disabled review sharing for affiliated businesses" };
        }
      }
    }

    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
      const userAllows = userDoc.data().allow_review_sharing !== false;
      
      if (!userAllows) {
        return { allowed: false, reason: "User has disabled review sharing in their settings" };
      }
    }

    return { allowed: true, reason: "All permission levels allow sharing" };

  } catch (error) {
    console.error("Error checking review sharing permissions:", error);
    return { allowed: false, reason: "Error checking permissions" };
  }
}

/**
 * Quick check for platform-level permission only
 * (useful for UI that doesn't have business/user context yet)
 */
export async function isPlatformSharingEnabled() {
  try {
    const platformDoc = await getDoc(doc(db, "platform_settings", "default"));
    return platformDoc.exists() ? (platformDoc.data().allow_review_sharing !== false) : true;
  } catch (error) {
    console.error("Error checking platform sharing setting:", error);
    return false;
  }
}
