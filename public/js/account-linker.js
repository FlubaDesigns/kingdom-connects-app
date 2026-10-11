// Ownership comes from permanent IDs. Public contact email never grants access.
import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { changeHierarchy } from './services/hierarchy-service.js';
export async function linkPendingListingsByEmail(user) {
  const result={businessesLinked:0,churchesLinked:0,rolesGranted:[]};
  if(!user)return result;
  for(const [collectionName,field,entityType,count,role] of [
    ['business_listings_private','owner_uid','business','businessesLinked','business_owner'],
    ['churches','admin_uid','church','churchesLinked','church_admin']
  ]) {
    try {
      const owned=await getDocs(query(collection(db,collectionName),where(field,'==',user.uid)));
      if(!owned.empty) {
        await changeHierarchy('syncEntityRole',{entityType,entityId:owned.docs[0].id},user);
        result[count]=owned.size;result.rolesGranted.push(role);
      }
    }catch(error){console.warn('Unable to refresh owned entity roles:',error.message);}
  }
  return result;
}
