'use strict';
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { createContactService } = require('./contact-service');
const submit = createContactService(admin.firestore(), () => admin.firestore.FieldValue.serverTimestamp());
exports.submitContact = onRequest({ region: 'us-central1', maxInstances: 5 }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!req.is('application/json') || Buffer.byteLength(JSON.stringify(req.body || {})) > 16000) {
    return res.status(400).json({ error: 'Invalid message.' });
  }
  try {
    let uid = null;
    if (req.headers.authorization) {
      const header = req.headers.authorization;
      if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Please sign in again.' });
      try { uid = (await admin.auth().verifyIdToken(header.slice(7), true)).uid; }
      catch { return res.status(401).json({ error: 'Please sign in again.' }); }
    }
    const result = await submit(req.body, { ip: req.ip, uid });
    return res.status(201).json(result);
  } catch (error) {
    if (!error.status) console.error('Contact submission failed:', error.code || 'unknown');
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to save message.' });
  }
});
