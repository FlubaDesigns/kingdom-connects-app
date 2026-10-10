/* Kingdom Connects - Account Linker
 * Links pending business/church listings to user accounts by email
 * Called during signup and login to ensure users can access their dashboards
 */

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Links pending businesses and churches to a user account by email
 * @param {Object} user - Firebase auth user object
 * @param {string} userEmail - User's email address
 * @returns {Object} - { businessesLinked: number, churchesLinked: number, rolesGranted: string[] }
 */
export async function linkPendingListingsByEmail(user, userEmail) {
  if (!user || !userEmail) {
    console.warn('⚠️ Account linker: Invalid user or email');
    return { businessesLinked: 0, churchesLinked: 0, rolesGranted: [] };
  }

  const uid = user.uid;
  const results = {
    businessesLinked: 0,
    churchesLinked: 0,
    rolesGranted: []
  };

  try {
    // ========== LINK PENDING BUSINESSES ==========
    const businessQuery = query(
      collection(db, 'business_listings_public'),
      where('contact_email', '==', userEmail),
      where('account_status', '==', 'pending_signup')
    );

    const businessSnap = await getDocs(businessQuery);
    
    for (const businessDoc of businessSnap.docs) {
      try {
        await updateDoc(doc(db, 'business_listings_public', businessDoc.id), {
          admin_uid: uid,
          account_status: 'account_linked',
          owner_email: arrayUnion(userEmail)
        });
        results.businessesLinked++;
        console.log(`✅ Linked business listing: ${businessDoc.id} to user: ${uid}`);
      } catch (error) {
        console.error(`❌ Failed to link business ${businessDoc.id}:`, error);
      }
    }

    // ========== LINK PENDING CHURCHES ==========
    const churchQuery = query(
      collection(db, 'churches'),
      where('email', '==', userEmail),
      where('account_status', '==', 'pending_signup')
    );

    const churchSnap = await getDocs(churchQuery);

    for (const churchDoc of churchSnap.docs) {
      try {
        await updateDoc(doc(db, 'churches', churchDoc.id), {
          admin_uid: uid,
          account_status: 'account_linked'
        });
        results.churchesLinked++;
        console.log(`✅ Linked church listing: ${churchDoc.id} to user: ${uid}`);
      } catch (error) {
        console.error(`❌ Failed to link church ${churchDoc.id}:`, error);
      }
    }

    // ========== GRANT ROLES IF NEEDED ==========
    const rolesToGrant = [];
    
    if (results.businessesLinked > 0) {
      rolesToGrant.push('business_owner');
    }
    
    if (results.churchesLinked > 0) {
      rolesToGrant.push('church_admin');
    }

    if (rolesToGrant.length > 0) {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, {
        roles: arrayUnion(...rolesToGrant)
      });
      results.rolesGranted = rolesToGrant;
      console.log(`✅ Granted roles to user ${uid}:`, rolesToGrant);
    }

    // Log summary
    if (results.businessesLinked > 0 || results.churchesLinked > 0) {
      console.log(`🔗 Account Linker Summary for ${userEmail}:`, results);
    }

    return results;

  } catch (error) {
    console.error('❌ Account linker error:', error);
    return results;
  }
}
