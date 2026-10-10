const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const email = '357littlesparrow@gmail.com';

async function cleanAll() {
  // Check Auth
  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log('Auth user still exists:', user.uid, '- deleting...');
    await admin.auth().deleteUser(user.uid);
    console.log('Deleted from Auth');
  } catch (e) {
    console.log('Auth: User not found (good)');
  }

  // Check Firestore users
  const users = await db.collection('users').where('email', '==', email).get();
  if (!users.empty) {
    for (const doc of users.docs) {
      console.log('Found in users:', doc.id, '- deleting...');
      await doc.ref.delete();
    }
  } else {
    console.log('Firestore users: None found (good)');
  }

  // Check business_listings
  const biz = await db.collection('business_listings_public').where('email', '==', email).get();
  const biz2 = await db.collection('business_listings_public').where('contact_email', '==', email).get();
  for (const doc of [...biz.docs, ...biz2.docs]) {
    console.log('Found in business_listings:', doc.id, '- deleting...');
    await doc.ref.delete();
  }
  if (biz.empty && biz2.empty) console.log('Firestore business_listings: None found (good)');

  console.log('\n357littlesparrow@gmail.com is completely cleared. Ready for fresh signup.');
  process.exit(0);
}
cleanAll();
