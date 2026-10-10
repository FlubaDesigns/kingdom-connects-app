// ============================================================
// Submission Notification Cloud Functions - Kingdom Connects
// Sends emails when businesses/churches/members sign up
// ============================================================

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { Resend } = require('resend');

const resendApiKey = defineSecret('RESEND_API_KEY');
const REGION = 'us-central1';
const ADMIN_EMAIL = 'perceys@gmail.com';
const FROM_EMAIL = 'Kingdom Connects <support@kingdomconnects.org>';
const BASE_URL = 'https://kingdomconnects.org';

// ── Simple in-memory rate limiter ────────────────────────────
const _rl = new Map();
function isRateLimited(req, res, max = 10, windowMs = 60000) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const rec = _rl.get(key);
  if (!rec || now > rec.reset) {
    _rl.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  rec.count++;
  if (rec.count > max) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return true;
  }
  return false;
}

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Unauthorized: No token provided' };
  }
  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken || idToken.length < 100) {
    throw { status: 401, message: 'Unauthorized: Invalid token format' };
  }
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
  if (!userDoc.exists) throw { status: 403, message: 'Forbidden: User not found' };
  return { user: decodedToken, userData: userDoc.data() };
}

// ── POST /api/notify-admin-new-submission ─────────────────────
exports.notifyAdminNewSubmission = onRequest(
  { region: REGION, secrets: [resendApiKey] },
  (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (isRateLimited(req, res, 10, 60000)) return;

    try {
      await verifyAuth(req);
    } catch (e) {
      return res.status(e.status || 401).json({ error: e.message });
    }

    const { type, name, email, churchName } = req.body;
    if (!type || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields: type, name, email' });
    }

    const typeLabels = { business: 'Business', church: 'Church', member: 'Member' };
    const typeLabel = typeLabels[type] || type;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const subject = `New ${typeLabel} Submission: ${name}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #C5A572;">New ${typeLabel} Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${churchName ? `<p><strong>Church Affiliation:</strong> ${churchName}</p>` : ''}
        <p><strong>Submitted:</strong> ${timestamp}</p>
        <p style="margin-top: 20px;">
          <a href="${BASE_URL}/admin" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">
            Review in Admin Dashboard
          </a>
        </p>
      </div>`;

    try {
      const client = new Resend(resendApiKey.value());
      const { data, error } = await client.emails.send({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject, html: htmlBody });
      if (error) return res.status(400).json({ error: 'Email send failed', details: error.message || error });
      console.log(`Admin notification sent for new ${type}: ${name}`);
      res.json({ success: true, messageId: data?.id });
    } catch (err) {
      console.error('notifyAdminNewSubmission error:', err);
      res.status(500).json({ error: 'Failed to send notification', details: err.message });
    }
  })
);

// ── POST /api/send-business-submission-confirmation ───────────
exports.sendBusinessSubmissionConfirmation = onRequest(
  { region: REGION, secrets: [resendApiKey] },
  (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (isRateLimited(req, res, 10, 60000)) return;

    try {
      await verifyAuth(req);
    } catch (e) {
      return res.status(e.status || 401).json({ error: e.message });
    }

    const { businessName, ownerEmail, ownerName, needsChurchApproval, churchName, businessSlug } = req.body;
    if (!businessName || !ownerEmail) {
      return res.status(400).json({ error: 'Missing required fields: businessName, ownerEmail' });
    }

    const dashboardUrl = `${BASE_URL}/business-admin`;
    const staticPageUrl = businessSlug ? `${BASE_URL}/business/${businessSlug}.htm` : null;
    const variables = {
      business_name: businessName,
      owner_name: ownerName || 'Business Owner',
      owner_email: ownerEmail,
      church_name: churchName || '',
      dashboard_url: dashboardUrl,
      static_page_url: staticPageUrl || ''
    };

    const templateSlug = needsChurchApproval && churchName
      ? 'business_submission_pending_church'
      : 'business_submission_pending_review';

    try {
      const db = admin.firestore();
      const templateQuery = await db.collection('email_templates')
        .where('slug', '==', templateSlug)
        .where('is_active', '==', true)
        .limit(1)
        .get();

      let subject, htmlBody;

      if (!templateQuery.empty) {
        const template = templateQuery.docs[0].data();
        subject = template.subject;
        htmlBody = template.html_body;
        Object.entries(variables).forEach(([k, v]) => {
          const rx = new RegExp(`{{${k}}}`, 'gi');
          subject = subject.replace(rx, v);
          htmlBody = htmlBody.replace(rx, v);
        });
      } else if (needsChurchApproval && churchName) {
        subject = `Congratulations! Your Business Application is Submitted`;
        htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #C5A572;">Congratulations, ${variables.owner_name}!</h2>
            <p>Your business <strong>${businessName}</strong> has been submitted to Kingdom Connects.</p>
            <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #C5A572; margin-top: 0;">Next Steps</h3>
              <p><strong>${churchName}</strong> will review your affiliation request. Once they approve, our team will complete the final platform review.</p>
            </div>
            <p><a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">Go to Your Dashboard</a></p>
            <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
          </div>`;
      } else {
        subject = `Congratulations! Welcome to Kingdom Connects`;
        htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #C5A572;">Congratulations, ${variables.owner_name}!</h2>
            <p>Your business <strong>${businessName}</strong> has been submitted to Kingdom Connects.</p>
            <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #C5A572; margin-top: 0;">What Happens Next?</h3>
              <p>Our team will review your listing within 24-48 hours. You'll receive an email when your business goes live!</p>
            </div>
            <p><a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">Go to Your Dashboard</a></p>
            <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
          </div>`;
      }

      const client = new Resend(resendApiKey.value());
      const { data, error } = await client.emails.send({ from: FROM_EMAIL, to: ownerEmail, subject, html: htmlBody });
      if (error) return res.status(400).json({ error: 'Email send failed', details: error.message || error });
      console.log(`Business submission confirmation sent to ${ownerEmail}`);
      res.json({ success: true, messageId: data?.id, template: templateSlug });
    } catch (err) {
      console.error('sendBusinessSubmissionConfirmation error:', err);
      if (err.status) return res.status(err.status).json({ error: err.message });
      res.status(500).json({ error: 'Failed to send confirmation', details: err.message });
    }
  })
);
