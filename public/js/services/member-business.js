import { db } from '../firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
// A hidden or removed saved business must not break the rest of the member page.
export async function getMemberBusiness(id) {
  try { return await getDoc(doc(db,'business_listings_public',id)); }
  catch(error) {
    if(!['permission-denied','not-found'].includes(error.code))throw error;
    return {id,exists:()=>false,data:()=>null};
  }
}
