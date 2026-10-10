const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const emailToDelete = '357littlesparrow@gmail.com';

async function deleteRecords() {
  console.log('Deleting records for:', emailToDelete);
  
  // Check users collection
  const usersSnapshot = await db.collection('users').where('email', '==', emailToDelete).get();
  for (const doc of usersSnapshot.docs) {
    console.log('Deleting user:', doc.id);
    await doc.ref.delete();
  }
  
  // Check business_listings
  const bizSnapshot = await db.collection('business_listings_public').where('email', '==', emailToDelete).get();
  for (const doc of bizSnapshot.docs) {
    console.log('Deleting business_listing:', doc.id);
    await doc.ref.delete();
  }
  
  const bizSnapshot2 = await db.collection('business_listings_public').where('contact_email', '==', emailToDelete).get();
  for (const doc of bizSnapshot2.docs) {
    console.log('Deleting business_listing:', doc.id);
    await doc.ref.delete();
  }
  
  // Check churches
  const churchSnapshot = await db.collection('churches').where('email', '==', emailToDelete).get();
  for (const doc of churchSnapshot.docs) {
    console.log('Deleting church:', doc.id);
    await doc.ref.delete();
  }
  
  const churchSnapshot2 = await db.collection('churches').where('contact_email', '==', emailToDelete).get();
  for (const doc of churchSnapshot2.docs) {
    console.log('Deleting church:', doc.id);
    await doc.ref.delete();
  }
  
  // Check reviews
  const reviewSnapshot = await db.collection('reviews').where('user_email', '==', emailToDelete).get();
  for (const doc of reviewSnapshot.docs) {
    console.log('Deleting review:', doc.id);
    await doc.ref.delete();
  }
  
  // Check activity_log
  const activitySnapshot = await db.collection('activity_log').where('email', '==', emailToDelete).get();
  for (const doc of activitySnapshot.docs) {
    console.log('Deleting activity_log:', doc.id);
    await doc.ref.delete();
  }
  
  console.log('Done deleting records for', emailToDelete);
  process.exit(0);
}

deleteRecords().catch(e => { console.error(e); process.exit(1); });
