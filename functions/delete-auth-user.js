const admin = require('firebase-admin');

admin.initializeApp();

const emailToDelete = '357littlesparrow@gmail.com';

async function deleteAuthUser() {
  console.log('Deleting Firebase Auth user for:', emailToDelete);
  
  try {
    const user = await admin.auth().getUserByEmail(emailToDelete);
    console.log('Found user:', user.uid);
    await admin.auth().deleteUser(user.uid);
    console.log('Deleted user from Firebase Auth:', user.uid);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.log('User not found in Firebase Auth');
    } else {
      console.error('Error:', e.message);
    }
  }
  
  process.exit(0);
}

deleteAuthUser();
