const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath || !fs.existsSync(credsPath)) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS / serviceAccount.json');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(credsPath)),
  projectId: process.env.FIREBASE_PROJECT_ID
});
const db = admin.firestore();

(async () => {
  try {
    const seedDir = path.join(process.cwd(), 'seed');
    const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const full = path.join(seedDir, file);
      const payload = JSON.parse(fs.readFileSync(full, 'utf8'));

      const batches = payload.batches ?? [payload];
      for (const batch of batches) {
        const col = batch.collection;
        if (!col || !Array.isArray(batch.docs)) continue;
        console.log(`Seeding ${col} from ${file} (${batch.docs.length} docs)...`);
        for (const d of batch.docs) {
          const ref = d.id ? db.collection(col).doc(d.id) : db.collection(col).doc();
          await ref.set(d.data, { merge: true });
        }
      }
    }
    console.log('✅ Seeding complete.');
  } catch (e) {
    console.error('Seeder error:', e);
    process.exit(1);
  }
})();
