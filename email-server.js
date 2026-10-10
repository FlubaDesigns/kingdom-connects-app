// Kingdom Connects Email Server
// Uses Resend connector for transactional emails
// Includes Stripe Connect for sales agent payouts

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const admin = require('firebase-admin');
const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = 3000;

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'kingdom-commerce'
  });
}

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(bodyParser.json());

// Serve static files for presentation viewer (logo, etc.)
app.use('/library', express.static(path.join(__dirname, 'library')));

// ============================================================
// QR Gear Widget Integration - Phase 5
// ============================================================

const QRGEAR_URL = 'https://qrgear-c1ffd.web.app';
const QRGEAR_TOKEN_CACHE = new Map();
const QRGEAR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// QR Gear stores are staged exclusively in functions/index.js.
async function getQRGearToken() { return null; }

async function getCachedQRGearToken(entityType, entityId) {
  const cacheKey = `${entityType}_${entityId}`;
  const cached = QRGEAR_TOKEN_CACHE.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < QRGEAR_CACHE_TTL) {
    return cached.data;
  }
  
  const data = await getQRGearToken(entityType, entityId);
  if (data) {
    QRGEAR_TOKEN_CACHE.set(cacheKey, { data, timestamp: Date.now() });
  }
  return data;
}

function generateQRGearWidgetHtml(token) {
  if (!token) return '';
  
  return `
        <article id="qrgearSection" class="card">
          <h2 class="gold">QR Gear Items</h2>
          <div id="qrgear-widget-container" style="margin: 16px 0;">
            <iframe 
              src="${QRGEAR_URL}/widget?token=${encodeURIComponent(token)}"
              width="100%" 
              height="400" 
              frameborder="0" 
              scrolling="no"
              loading="lazy"
              style="border:none;border-radius:12px;overflow:hidden">
            </iframe>
          </div>
        </article>`;
}

console.log('QR Gear widget integration loaded');

// Get Resend credentials from Replit connector
async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Replit connector environment not available');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings || !connectionSettings.settings?.api_key) {
    throw new Error('Resend not connected - please configure in Replit integrations');
  }
  
  // Always use Resend sandbox for now - user's email domain isn't verified
  const fromEmail = 'onboarding@resend.dev';
  
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: fromEmail
  };
}

// Get fresh Resend client (must be called fresh each time - tokens expire)
async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

// Authentication Middleware - Verify Firebase ID token
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Forbidden: User not found' });
    }
    
    const userData = userDoc.data();
    req.userRole = userData.role || userData.roles;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

// Authorization Middleware - Admin only
function requireAdmin(req, res, next) {
  const allowedRoles = ['admin', 'platform_admin'];
  const userRole = req.userRole;
  
  if (Array.isArray(userRole)) {
    if (!userRole.some(role => allowedRoles.includes(role))) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
  } else {
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
  }
  
  next();
}

// ==============================================
// QR GEAR WIDGET TOKEN GENERATION
// ==============================================

const jwt = require('jsonwebtoken');

// POST /api/qr-widget-token
// Generates a JWT token for QR Gear widget integration
// Requires: Authenticated business owner
app.post('/api/qr-widget-token', (req, res) => {
  res.status(410).json({ error: 'Use the canonical Firebase integration. QR Gear stores are not enabled yet.' });
});

// POST /api/send-email
// Body: { to, subject, htmlBody, textBody, templateVars (optional) }
// Requires: Admin authentication
app.post('/api/send-email', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { to, subject, htmlBody, textBody } = req.body;

    if (!to || !subject || (!htmlBody && !textBody)) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, and htmlBody or textBody' 
      });
    }

    const { client, fromEmail } = await getResendClient();

    const emailData = {
      from: fromEmail,
      to: to,
      subject: subject
    };

    if (htmlBody) {
      emailData.html = htmlBody;
    }
    if (textBody) {
      emailData.text = textBody;
    }

    const result = await client.emails.send(emailData);

    console.log('Email sent successfully:', result);

    res.json({ 
      success: true, 
      messageId: result.id,
      message: 'Email sent successfully' 
    });

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'kingdom-connects-email' });
});

// POST /api/notify-admin-new-submission
// Sends notification to platform admin when new business/church/member is submitted
// Requires: User authentication (not admin - this is for new signups)
const ADMIN_EMAIL = 'perceys@gmail.com';

app.post('/api/notify-admin-new-submission', authenticateUser, async (req, res) => {
  try {
    const { type, name, email, churchName } = req.body;
    
    if (!type || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields: type, name, email' });
    }
    
    const typeLabels = {
      business: 'Business',
      church: 'Church', 
      member: 'Member'
    };
    
    const typeLabel = typeLabels[type] || type;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    
    const subject = `New ${typeLabel} Submission: ${name}`;
    
    let htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #C5A572;">New ${typeLabel} Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${churchName ? `<p><strong>Church Affiliation:</strong> ${churchName}</p>` : ''}
        <p><strong>Submitted:</strong> ${timestamp}</p>
        <p style="margin-top: 20px;">
          <a href="https://kingdomconnects.org/admin" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">
            Review in Admin Dashboard
          </a>
        </p>
      </div>
    `;
    
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: ADMIN_EMAIL,
      subject: subject,
      html: htmlBody
    });
    
    console.log(`Admin notification sent for new ${type}: ${name}`);
    
    res.json({ success: true, messageId: result.id });
    
  } catch (error) {
    console.error('Error sending admin notification:', error);
    res.status(500).json({ error: 'Failed to send notification', details: error.message });
  }
});

// POST /api/send-business-submission-confirmation
// Sends confirmation email to business owner after submission
// Uses Firestore templates: business_submission_pending_church or business_submission_pending_review
app.post('/api/send-business-submission-confirmation', authenticateUser, async (req, res) => {
  try {
    const { businessName, ownerEmail, ownerName, needsChurchApproval, churchName, businessSlug } = req.body;
    
    if (!businessName || !ownerEmail) {
      return res.status(400).json({ error: 'Missing required fields: businessName, ownerEmail' });
    }
    
    const dashboardUrl = 'https://kingdomconnects.org/business-admin';
    const staticPageUrl = businessSlug ? `https://kingdomconnects.org/business/${businessSlug}.htm` : null;
    
    // Template variables for interpolation
    const variables = {
      business_name: businessName,
      owner_name: ownerName || 'Business Owner',
      owner_email: ownerEmail,
      church_name: churchName || '',
      dashboard_url: dashboardUrl,
      static_page_url: staticPageUrl || ''
    };
    
    // Choose template based on approval flow
    const templateSlug = needsChurchApproval && churchName 
      ? 'business_submission_pending_church'
      : 'business_submission_pending_review';
    
    // Try to fetch template from Firestore
    const db = admin.firestore();
    const templateQuery = await db.collection('email_templates')
      .where('slug', '==', templateSlug)
      .where('is_active', '==', true)
      .limit(1)
      .get();
    
    let subject, htmlBody;
    
    if (!templateQuery.empty) {
      // Use Firestore template
      const template = templateQuery.docs[0].data();
      subject = template.subject;
      htmlBody = template.html_body;
      
      // Replace {{variable}} placeholders
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'gi');
        subject = subject.replace(regex, value);
        htmlBody = htmlBody.replace(regex, value);
      });
    } else {
      // Fallback to hardcoded if template not found
      console.log(`Template ${templateSlug} not found, using fallback`);
      
      if (needsChurchApproval && churchName) {
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
          </div>
        `;
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
          </div>
        `;
      }
    }
    
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: ownerEmail,
      subject: subject,
      html: htmlBody
    });
    
    console.log(`Business submission confirmation sent to ${ownerEmail} using template: ${templateSlug}`);
    
    res.json({ success: true, messageId: result.id, template: templateSlug });
    
  } catch (error) {
    console.error('Error sending business confirmation:', error);
    res.status(500).json({ error: 'Failed to send confirmation', details: error.message });
  }
});

// Internal: Search users by email (for Dave's convenience)
app.get('/api/_internal/search-email', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ results: [], message: 'No query provided' });
    
    const db = admin.firestore();
    const results = { firestore: [], auth: [] };
    
    // Search Firestore users collection
    const usersSnap = await db.collection('users').get();
    usersSnap.forEach(doc => {
      const data = doc.data();
      const email = (data.email || '').toLowerCase();
      if (email.includes(q)) {
        results.firestore.push({ 
          id: doc.id, 
          email: data.email, 
          name: data.display_name || data.name || 'N/A',
          roles: data.roles || []
        });
      }
    });
    
    // Search Firebase Auth users
    try {
      const listResult = await admin.auth().listUsers(1000);
      listResult.users.forEach(u => {
        const email = (u.email || '').toLowerCase();
        if (email.includes(q)) {
          results.auth.push({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || 'N/A',
            disabled: u.disabled
          });
        }
      });
    } catch (authErr) {
      results.authError = authErr.message;
    }
    
    res.json({ query: q, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// STRIPE CONNECT - Routed to dedicated module
// ============================================
const { router: stripeRouter, churchRouter: stripeChurchRouter, initStripe } = require('./routes/stripe.cjs');
initStripe(admin, authenticateUser, requireAdmin);
app.use('/api/stripe', stripeRouter);
app.use('/api/stripe-connect', stripeChurchRouter);

// ============================================
// PRESENTATION TEMPLATES
// ============================================

const PRESENTATION_TEMPLATES = {
  sales_agent: {
    title: 'Sales Agent Opportunity',
    slides: [
      {
        type: 'title',
        title: 'Kingdom Connects',
        subtitle: 'Sales Agent Commission Program'
      },
      {
        type: 'content',
        title: 'What You\'ll Earn',
        bullets: [
          '20% commission on Pro subscriptions you sell',
          'Recurring revenue each month',
          'Unlimited earning potential',
          'Support and marketing materials provided'
        ]
      },
      {
        type: 'content',
        title: 'How It Works',
        bullets: [
          'Sign up as a Sales Agent',
          'Share your unique referral link',
          'Earn 20% when customers subscribe',
          'Track earnings in your dashboard'
        ]
      },
      {
        type: 'content',
        title: 'Why Kingdom Connects?',
        bullets: [
          'Faith-based marketplace for churches and businesses',
          'Growing Christian commerce ecosystem',
          'All profits support local churches (10% tithe)',
          'Professional tools and support'
        ]
      },
      {
        type: 'closing',
        title: 'Ready to Earn?',
        message: 'Sign up today and start earning commissions'
      }
    ]
  },
  church_admin: {
    title: 'Church Admin Dashboard',
    slides: [
      {
        type: 'title',
        title: 'Kingdom Connects',
        subtitle: 'Church Admin Dashboard'
      },
      {
        type: 'content',
        title: 'Manage Your Church',
        bullets: [
          'Create and manage your church listing',
          'Verify affiliated Christian businesses',
          'Approve business partnerships',
          'Access detailed analytics'
        ]
      },
      {
        type: 'content',
        title: 'Business Partnerships',
        bullets: [
          'Churches approve businesses first',
          'Two-step verification process',
          'Support local Christian commerce',
          'Strengthen community relationships'
        ]
      },
      {
        type: 'content',
        title: 'Earn Church Tithes',
        bullets: [
          'Receive 10% tithe from Pro subscriptions',
          'Support your ministry financially',
          'Transparent earnings tracking',
          'Monthly payouts to church account'
        ]
      },
      {
        type: 'closing',
        title: 'Strengthen Your Ministry',
        message: 'Join Kingdom Connects today'
      }
    ]
  },
  business_owner: {
    title: 'Business Owner Guide',
    slides: [
      {
        type: 'title',
        title: 'Kingdom Connects',
        subtitle: 'Business Listing & Growth'
      },
      {
        type: 'content',
        title: 'Your Free Listing',
        bullets: [
          'List your Christian business for free',
          'Share your mission and contact info',
          'Receive customer reviews',
          'Connect with your church community'
        ]
      },
      {
        type: 'content',
        title: 'Go Pro - Unlock Premium Features',
        bullets: [
          'Premium $9/month or $69.99/year',
          'Manage products & services',
          'Share customer testimonials',
          'Run special promotions'
        ]
      },
      {
        type: 'content',
        title: 'Pro Features',
        bullets: [
          'Feature your products & services',
          'Build customer trust with testimonials',
          'Create and manage promotions',
          'Access detailed business analytics'
        ]
      },
      {
        type: 'content',
        title: 'Support Your Church',
        bullets: [
          'Affiliate with your church',
          '10% tithe supports your ministry',
          'Build community within faith',
          'Grow your business with purpose'
        ]
      },
      {
        type: 'closing',
        title: 'Grow Your Kingdom Business',
        message: 'List your business today'
      }
    ]
  },
  member: {
    title: 'Member Features',
    slides: [
      {
        type: 'title',
        title: 'Kingdom Connects',
        subtitle: 'Member Features'
      },
      {
        type: 'content',
        title: 'Discover & Support',
        bullets: [
          'Find trusted Christian businesses',
          'Support your local church community',
          'Read verified customer reviews',
          'Connect faith and commerce'
        ]
      },
      {
        type: 'content',
        title: 'Your Member Benefits',
        bullets: [
          'Search churches and businesses',
          'Save your favorite listings',
          'Write and read reviews',
          'Free to join and use'
        ]
      },
      {
        type: 'content',
        title: 'Support Your Church',
        bullets: [
          'Every Pro subscription supports churches',
          '10% of revenue goes to church tithes',
          'Build stronger faith communities',
          'Shop with purpose'
        ]
      },
      {
        type: 'closing',
        title: 'Join Kingdom Connects',
        message: 'Free membership - Start discovering today'
      }
    ]
  }
};

// Function to generate PowerPoint presentation
async function generatePresentation(role) {
  const template = await getPresentationSlides(role);
  if (!template) {
    throw new Error('Invalid role');
  }

  const pres = new PptxGenJS();
  
  // Set theme colors - Kingdom Connects brand
  const colors = {
    primary: '#2f6bcb',
    primaryDark: '#1e4e9a',
    gold: '#ffd700',
    goldDark: '#b8860b',
    text: '#ffffff',
    textLight: '#e8f3ff',
    dark: '#0a1e34',
    darkBlue: '#0c1e34'
  };

  // Logo path
  const logoPath = path.join(__dirname, 'library', 'kingdom-connects-logo-300.png');

  pres.defineLayout({ name: 'LAYOUT1', width: 10, height: 7.5 });
  pres.author = 'Kingdom Connects';
  pres.company = 'Kingdom Connects';
  pres.subject = template.title;
  pres.title = template.title;

  // Add slides
  for (const slideData of template.slides) {
    const slide = pres.addSlide();

    if (slideData.type === 'title') {
      // Title slide - gradient-style with logo
      slide.background = { fill: colors.primaryDark };
      
      // Top decorative gold bar
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 0, w: 10, h: 0.15,
        fill: { color: colors.gold },
        line: { type: 'none' }
      });
      
      // Add logo centered at top
      if (fs.existsSync(logoPath)) {
        slide.addImage({
          path: logoPath,
          x: 3.5, y: 0.5, w: 3, h: 1.5
        });
      }
      
      slide.addText(slideData.title, {
        x: 0.5, y: 2.3, w: 9, h: 1,
        fontSize: 54,
        bold: true,
        color: colors.gold,
        align: 'center',
        fontFace: 'Arial'
      });
      
      slide.addText(slideData.subtitle, {
        x: 0.5, y: 3.5, w: 9, h: 1,
        fontSize: 28,
        color: colors.text,
        align: 'center',
        fontFace: 'Arial'
      });
      
      // Bottom decorative gold bar
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 7.35, w: 10, h: 0.15,
        fill: { color: colors.gold },
        line: { type: 'none' }
      });

    } else if (slideData.type === 'content') {
      // Content slide with bullets and logo
      slide.background = { fill: colors.darkBlue };
      
      // Top gold bar
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 0, w: 10, h: 0.08,
        fill: { color: colors.gold },
        line: { type: 'none' }
      });
      
      // Left gold accent bar
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 0, w: 0.06, h: 7.5,
        fill: { color: colors.gold },
        line: { type: 'none' }
      });
      
      // Small logo in top right
      if (fs.existsSync(logoPath)) {
        slide.addImage({
          path: logoPath,
          x: 8.3, y: 0.2, w: 1.5, h: 0.75
        });
      }

      slide.addText(slideData.title, {
        x: 0.4, y: 0.25, w: 7.5, h: 0.8,
        fontSize: 36,
        bold: true,
        color: colors.gold,
        fontFace: 'Arial'
      });

      // Horizontal divider line under title
      slide.addShape(pres.ShapeType.rect, {
        x: 0.4, y: 1.1, w: 3, h: 0.03,
        fill: { color: colors.gold },
        line: { type: 'none' }
      });

      let bulletY = 1.5;
      for (const bullet of slideData.bullets) {
        // Gold bullet point
        slide.addText('●', {
          x: 0.5, y: bulletY, w: 0.4, h: 0.6,
          fontSize: 16,
          color: colors.gold,
          valign: 'top'
        });
        // Bullet text
        slide.addText(bullet, {
          x: 1.0, y: bulletY, w: 8.5, h: 0.7,
          fontSize: 22,
          color: colors.text,
          valign: 'top',
          fontFace: 'Arial'
        });
        bulletY += 1.2;
      }

    } else if (slideData.type === 'closing') {
      // Closing slide - gold background with logo
      slide.background = { fill: colors.gold };
      
      // Dark blue top bar
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 0, w: 10, h: 0.15,
        fill: { color: colors.primaryDark },
        line: { type: 'none' }
      });

      // Add logo centered
      if (fs.existsSync(logoPath)) {
        slide.addImage({
          path: logoPath,
          x: 3.5, y: 0.8, w: 3, h: 1.5
        });
      }

      slide.addText(slideData.title, {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 48,
        bold: true,
        color: colors.dark,
        align: 'center',
        fontFace: 'Arial'
      });

      slide.addText(slideData.message, {
        x: 0.5, y: 3.7, w: 9, h: 1.5,
        fontSize: 24,
        color: colors.darkBlue,
        align: 'center',
        valign: 'middle',
        fontFace: 'Arial'
      });
      
      // Website URL at bottom
      slide.addText('www.kingdomconnects.com', {
        x: 0.5, y: 6.2, w: 9, h: 0.5,
        fontSize: 18,
        color: colors.primaryDark,
        align: 'center',
        fontFace: 'Arial'
      });
      
      // Dark blue bottom bar
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 7.35, w: 10, h: 0.15,
        fill: { color: colors.primaryDark },
        line: { type: 'none' }
      });
    }
  }

  return pres;
}

// ============================================
// MAINTENANCE ENDPOINTS - Database Cleanup
// ============================================

// Internal maintenance key (only works from localhost/internal)
const MAINTENANCE_KEY = 'kc-maintenance-2025-cleanup';

function requireMaintenanceAccess(req, res, next) {
  const key = req.headers['x-maintenance-key'];
  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  
  if (key === MAINTENANCE_KEY && isLocal) {
    return next();
  }
  
  return res.status(403).json({ error: 'Maintenance access denied' });
}

// Migrate legacy field names in business_listings
app.post('/api/maintenance/normalize-fields', requireMaintenanceAccess, async (req, res) => {
  try {
    const db = admin.firestore();
    const dryRun = req.query.dryRun === 'true';
    
    const FIELD_MIGRATIONS = {
      contact_email: 'email',
      contact_phone: 'phone',
      phone_number: 'phone',
      address: 'address_line1',
      zip: 'zip_code',
      your_name: 'owner_name'
    };
    
    const snapshot = await db.collection('business_listings_public').get();
    let migrated = 0;
    let skipped = 0;
    const details = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates = {};
      const deletes = {};
      let needsUpdate = false;
      
      for (const [oldField, newField] of Object.entries(FIELD_MIGRATIONS)) {
        if (data[oldField] !== undefined) {
          if (data[newField] === undefined) {
            updates[newField] = data[oldField];
          }
          deletes[oldField] = admin.firestore.FieldValue.delete();
          needsUpdate = true;
        }
      }
      
      if (data.categories !== undefined) {
        if (data.subcategories === undefined) {
          const primaryCat = data.primary_category || '';
          const subcats = Array.isArray(data.categories) 
            ? data.categories.filter(c => c !== primaryCat)
            : [];
          updates.subcategories = subcats;
        }
        deletes.categories = admin.firestore.FieldValue.delete();
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        if (!dryRun) {
          await db.collection('business_listings_public').doc(doc.id).update({
            ...updates,
            ...deletes
          });
        }
        migrated++;
        details.push({ id: doc.id, name: data.business_name, fields: Object.keys(deletes) });
      } else {
        skipped++;
      }
    }
    
    res.json({
      success: true,
      dryRun,
      migrated,
      skipped,
      details: details.slice(0, 20)
    });
    
  } catch (error) {
    console.error('Field normalization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete deprecated collections
app.delete('/api/maintenance/deprecated-collections', requireMaintenanceAccess, async (req, res) => {
  try {
    const db = admin.firestore();
    const dryRun = req.query.dryRun === 'true';
    const results = { business_submissions: 0, church_submissions: 0 };
    
    for (const collectionName of ['business_submissions', 'church_submissions']) {
      const snapshot = await db.collection(collectionName).get();
      
      if (!snapshot.empty) {
        const batch = db.batch();
        let count = 0;
        
        for (const doc of snapshot.docs) {
          if (!dryRun) {
            batch.delete(doc.ref);
          }
          count++;
          
          if (count % 400 === 0 && !dryRun) {
            await batch.commit();
          }
        }
        
        if (!dryRun && count % 400 !== 0) {
          await batch.commit();
        }
        
        results[collectionName] = count;
      }
    }
    
    res.json({
      success: true,
      dryRun,
      deleted: results
    });
    
  } catch (error) {
    console.error('Collection deletion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN USER MANAGEMENT - Firebase Auth Delete
// ============================================

// Delete user from Firebase Auth (called after Firestore deletion)
// Requires platform admin authentication
app.delete('/api/admin/user/:uid', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    
    if (!uid) {
      return res.status(400).json({ error: 'User UID required' });
    }
    
    // Verify the target user exists in Firebase Auth
    let targetUser;
    try {
      targetUser = await admin.auth().getUser(uid);
    } catch (authError) {
      if (authError.code === 'auth/user-not-found') {
        return res.json({ success: true, message: 'User already deleted from Auth' });
      }
      throw authError;
    }
    
    // Prevent self-deletion
    if (uid === req.user.uid) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    // Delete from Firebase Auth
    await admin.auth().deleteUser(uid);
    
    console.log(`[ADMIN] User ${targetUser.email} (${uid}) deleted from Firebase Auth by ${req.user.email}`);
    
    res.json({ 
      success: true, 
      message: `User ${targetUser.email} deleted from Firebase Auth`,
      deletedEmail: targetUser.email
    });
    
  } catch (error) {
    console.error('Admin user deletion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get legacy field stats
app.get('/api/maintenance/legacy-stats', requireMaintenanceAccess, async (req, res) => {
  try {
    const db = admin.firestore();
    const legacyFields = ['contact_email', 'contact_phone', 'phone_number', 'address', 'zip', 'your_name', 'categories'];
    const stats = { total_businesses: 0, with_legacy_fields: 0, legacy_field_counts: {}, deprecated_collections: {} };
    
    const businessSnapshot = await db.collection('business_listings_public').get();
    stats.total_businesses = businessSnapshot.size;
    
    for (const doc of businessSnapshot.docs) {
      const data = doc.data();
      let hasLegacy = false;
      
      for (const field of legacyFields) {
        if (data[field] !== undefined) {
          stats.legacy_field_counts[field] = (stats.legacy_field_counts[field] || 0) + 1;
          hasLegacy = true;
        }
      }
      
      if (hasLegacy) stats.with_legacy_fields++;
    }
    
    const bizSubSnapshot = await db.collection('business_submissions').get();
    stats.deprecated_collections.business_submissions = bizSubSnapshot.size;
    
    const churchSubSnapshot = await db.collection('church_submissions').get();
    stats.deprecated_collections.church_submissions = churchSubSnapshot.size;
    
    res.json(stats);
    
  } catch (error) {
    console.error('Legacy stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PRESENTATION ENDPOINTS
// ============================================

// Default email content templates for each role (compelling intro text)
// These can be overridden by Firestore presentation_templates collection
const DEFAULT_EMAIL_CONTENT = {
  sales_agent: {
    subject: 'Earn 20% Commission with Kingdom Connects',
    headline: 'Turn Your Network Into Income',
    intro: 'Kingdom Connects is building the largest faith-based business directory, and we want YOU to help us grow. As a Sales Agent, you\'ll earn recurring commissions just by connecting Christian businesses with our platform.',
    highlights: [
      'Earn 20% commission on every Pro subscription you bring in',
      'Recurring monthly income - you earn as long as they stay subscribed',
      'No cap on earnings - the more you sell, the more you make',
      'Marketing materials and sales dashboard provided'
    ],
    cta: 'See the full opportunity details in our presentation below.'
  },
  church_admin: {
    subject: 'Partner with Kingdom Connects - Support Your Ministry',
    headline: 'Strengthen Your Church & Community',
    intro: 'Kingdom Connects helps churches build stronger connections with local Christian businesses. As a Church Admin, you\'ll manage your church\'s presence, verify affiliated businesses, and earn tithes that support your ministry.',
    highlights: [
      'Receive 10% tithe from every Pro subscription by affiliated businesses',
      'Verify and approve businesses connected to your church',
      'Build a directory of trusted Christian vendors for your congregation',
      'Access analytics to track your church\'s impact'
    ],
    cta: 'Learn how to set up your church dashboard in our presentation.'
  },
  business_owner: {
    subject: 'List Your Business on Kingdom Connects - Free to Start',
    headline: 'Grow Your Business in the Christian Community',
    intro: 'Kingdom Connects connects Christian-owned businesses with customers who share their values. List your business for free and reach thousands of families looking to support faith-based commerce.',
    highlights: [
      'Free basic listing with your business info and contact details',
      'Pro features starting at just $9/month - showcase products, run promotions',
      '10% of your subscription tithes back to your affiliated church',
      'Build trust with customer reviews and testimonials'
    ],
    cta: 'See all the benefits and features in our presentation.'
  },
  member: {
    subject: 'Welcome to Kingdom Connects - Discover Christian Businesses',
    headline: 'Find & Support Christian Businesses Near You',
    intro: 'Kingdom Connects makes it easy to discover and support Christian-owned businesses in your community. Save your favorites, leave reviews, and help build a thriving faith-based economy.',
    highlights: [
      'Search local Christian businesses and churches',
      'Save your favorites for quick access',
      'Leave reviews to help others find great businesses',
      'Support businesses that share your values'
    ],
    cta: 'Learn all the ways to use Kingdom Connects in our presentation.'
  }
};

// Get email content from Firestore or fall back to defaults
async function getEmailContent(role) {
  try {
    const docRef = db.collection('presentation_templates').doc(role);
    const doc = await docRef.get();
    
    if (doc.exists && doc.data().email) {
      console.log('Using Firestore template for:', role);
      return doc.data().email;
    }
  } catch (error) {
    console.log('Firestore template not found, using default for:', role);
  }
  
  return DEFAULT_EMAIL_CONTENT[role];
}

// Get presentation slides from Firestore or fall back to defaults
async function getPresentationSlides(role) {
  try {
    const docRef = db.collection('presentation_templates').doc(role);
    const doc = await docRef.get();
    
    if (doc.exists && doc.data().slides) {
      console.log('Using Firestore slides for:', role);
      return {
        title: PRESENTATION_TEMPLATES[role].title,
        slides: doc.data().slides
      };
    }
  } catch (error) {
    console.log('Firestore slides not found, using default for:', role);
  }
  
  return PRESENTATION_TEMPLATES[role];
}

// Generate beautiful HTML email
function generateEmailHTML(content, viewUrl, downloadUrl) {
  // Use production URL if available, otherwise Replit dev domain
  const baseUrl = process.env.PRODUCTION_URL || 
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://kingdomconnects.com');
  const logoUrl = `${baseUrl}/library/kingdom-connects-logo-300.png`;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header with logo and text side by side -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e4e9a 0%, #2f6bcb 100%); padding: 20px 30px;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 15px;">
                    <img src="${logoUrl}" alt="Kingdom Connects" width="60" style="width: 60px; height: auto;">
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-size: 24px; font-weight: bold; color: #ffd700;">Kingdom Connects</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Gold accent bar -->
          <tr>
            <td style="background-color: #ffd700; height: 6px;"></td>
          </tr>
          
          <!-- Main content -->
          <tr>
            <td style="padding: 40px 30px;">
              <!-- Headline -->
              <h1 style="margin: 0 0 20px 0; color: #1e4e9a; font-size: 28px; font-weight: bold;">
                ${content.headline}
              </h1>
              
              <!-- Intro paragraph -->
              <p style="margin: 0 0 25px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${content.intro}
              </p>
              
              <!-- Highlights box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 15px 0; color: #1e4e9a; font-size: 16px; font-weight: bold;">
                      Here's what you'll get:
                    </p>
                    ${content.highlights.map(h => `
                    <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; line-height: 1.5; padding-left: 20px;">
                      <span style="color: #ffd700; font-weight: bold;">●</span> ${h}
                    </p>
                    `).join('')}
                  </td>
                </tr>
              </table>
              
              <!-- CTA text -->
              <p style="margin: 0 0 30px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${content.cta}
              </p>
              
              <!-- Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 15px;">
                    <a href="${viewUrl}" style="display: inline-block; background-color: #1e4e9a; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      View Presentation Online
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${downloadUrl}" style="display: inline-block; background-color: #ffd700; color: #1e4e9a; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      Download PowerPoint
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #0a1e34; padding: 25px 30px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #ffffff; font-size: 14px;">
                Kingdom Connects - Faith-Based Business Directory
              </p>
              <p style="margin: 0; color: #888888; font-size: 12px;">
                <a href="https://kingdomconnects.com" style="color: #ffd700; text-decoration: none;">www.kingdomconnects.com</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Generate email HTML without presentation buttons (email only)
function generateEmailHTMLNoPresentation(content, role) {
  // Use production URL if available, otherwise Replit dev domain
  const baseUrl = process.env.PRODUCTION_URL || 
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://kingdomconnects.com');
  const logoUrl = `${baseUrl}/library/kingdom-connects-logo-300.png`;
  
  // Role-specific onboarding URLs
  const onboardingUrls = {
    sales_agent: `${baseUrl}/for-agents.html`,
    church_admin: `${baseUrl}/for-churches.html`,
    business_owner: `${baseUrl}/for-businesses.html`,
    member: `${baseUrl}/why-join.html`
  };
  const onboardingUrl = onboardingUrls[role] || baseUrl;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header with logo and text side by side -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e4e9a 0%, #2f6bcb 100%); padding: 20px 30px;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 15px;">
                    <img src="${logoUrl}" alt="Kingdom Connects" width="60" style="width: 60px; height: auto;">
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-size: 24px; font-weight: bold; color: #ffd700;">Kingdom Connects</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Gold accent bar -->
          <tr>
            <td style="background-color: #ffd700; height: 6px;"></td>
          </tr>
          
          <!-- Main content -->
          <tr>
            <td style="padding: 40px 30px;">
              <!-- Headline -->
              <h1 style="margin: 0 0 20px 0; color: #1e4e9a; font-size: 28px; font-weight: bold;">
                ${content.headline}
              </h1>
              
              <!-- Intro paragraph -->
              <p style="margin: 0 0 25px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${content.intro}
              </p>
              
              <!-- Highlights box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 15px 0; color: #1e4e9a; font-size: 16px; font-weight: bold;">
                      Here's what you'll get:
                    </p>
                    ${content.highlights.map(h => `
                    <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; line-height: 1.5; padding-left: 20px;">
                      <span style="color: #ffd700; font-weight: bold;">●</span> ${h}
                    </p>
                    `).join('')}
                  </td>
                </tr>
              </table>
              
              <!-- CTA text -->
              <p style="margin: 0 0 30px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${content.cta}
              </p>
              
              <!-- Onboarding info button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${onboardingUrl}" style="display: inline-block; background-color: #1e4e9a; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      Learn More
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #0a1e34; padding: 25px 30px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #ffffff; font-size: 14px;">
                Kingdom Connects - Faith-Based Business Directory
              </p>
              <p style="margin: 0; color: #888888; font-size: 12px;">
                <a href="https://kingdomconnects.com" style="color: #ffd700; text-decoration: none;">www.kingdomconnects.com</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Generate rich email HTML with single button (for transactional emails)
function generateRichEmailHTML(content) {
  const baseUrl = process.env.PRODUCTION_URL || 
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://kingdomconnects.com');
  const logoUrl = `${baseUrl}/library/kingdom-connects-logo-300.png`;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header with logo and text side by side -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e4e9a 0%, #2f6bcb 100%); padding: 20px 30px;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 15px;">
                    <img src="${logoUrl}" alt="Kingdom Connects" width="60" style="width: 60px; height: auto;">
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-size: 24px; font-weight: bold; color: #ffd700;">Kingdom Connects</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Gold accent bar -->
          <tr>
            <td style="background-color: #ffd700; height: 6px;"></td>
          </tr>
          
          <!-- Main content -->
          <tr>
            <td style="padding: 40px 30px;">
              <!-- Headline -->
              <h1 style="margin: 0 0 20px 0; color: #1e4e9a; font-size: 28px; font-weight: bold;">
                ${content.headline}
              </h1>
              
              <!-- Intro paragraph -->
              <p style="margin: 0 0 25px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${content.intro}
              </p>
              
              <!-- Highlights box -->
              ${content.highlights && content.highlights.length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 15px 0; color: #1e4e9a; font-size: 16px; font-weight: bold;">
                      Here's what you'll get:
                    </p>
                    ${content.highlights.map(h => `
                    <p style="margin: 0 0 12px 0; color: #333333; font-size: 15px; line-height: 1.5; padding-left: 20px;">
                      <span style="color: #ffd700; font-weight: bold;">●</span> ${h}
                    </p>
                    `).join('')}
                  </td>
                </tr>
              </table>
              ` : ''}
              
              <!-- CTA text -->
              <p style="margin: 0 0 30px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${content.cta}
              </p>
              
              <!-- Button -->
              ${content.buttonText && content.buttonUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${content.buttonUrl}" style="display: inline-block; background-color: #ffd700; color: #1e4e9a; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      ${content.buttonText}
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #0a1e34; padding: 25px 30px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #ffffff; font-size: 14px;">
                Kingdom Connects - Faith-Based Business Directory
              </p>
              <p style="margin: 0; color: #888888; font-size: 12px;">
                <a href="https://kingdomconnects.com" style="color: #ffd700; text-decoration: none;">www.kingdomconnects.com</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// POST /api/email-templates/preview - Generate preview for rich email editor
app.post('/api/email-templates/preview', authenticateUser, requireAdmin, (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || !content.headline) {
      return res.status(400).json({ error: 'Content with headline required' });
    }
    
    const html = generateRichEmailHTML(content);
    res.json({ html });
    
  } catch (error) {
    console.error('Rich email preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate web viewer HTML page
function generateViewerHTML(role) {
  const template = PRESENTATION_TEMPLATES[role];
  const logoUrl = '/library/kingdom-connects-logo-300.png';
  
  const slidesHTML = template.slides.map((slide, index) => {
    if (slide.type === 'title') {
      return `
        <div class="slide title-slide">
          <img src="${logoUrl}" alt="Kingdom Connects" class="slide-logo">
          <h1>${slide.title}</h1>
          <p class="subtitle">${slide.subtitle}</p>
        </div>
      `;
    } else if (slide.type === 'content') {
      return `
        <div class="slide content-slide">
          <h2>${slide.title}</h2>
          <ul>
            ${slide.bullets.map(b => `<li>${b}</li>`).join('')}
          </ul>
        </div>
      `;
    } else if (slide.type === 'closing') {
      return `
        <div class="slide closing-slide">
          <img src="${logoUrl}" alt="Kingdom Connects" class="slide-logo">
          <h1>${slide.title}</h1>
          <p class="message">${slide.message}</p>
          <p class="website">www.kingdomconnects.com</p>
        </div>
      `;
    }
    return '';
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.title} - Kingdom Connects</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      background: #0a1e34;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      margin-bottom: 20px;
    }
    .header img {
      max-width: 200px;
      height: auto;
    }
    .slide {
      background: #0c1e34;
      border-radius: 12px;
      padding: 40px 30px;
      margin-bottom: 20px;
      border-left: 4px solid #ffd700;
    }
    .title-slide, .closing-slide {
      text-align: center;
      background: linear-gradient(135deg, #1e4e9a 0%, #2f6bcb 100%);
      border-left: none;
      border-top: 4px solid #ffd700;
      border-bottom: 4px solid #ffd700;
    }
    .slide-logo {
      max-width: 150px;
      margin-bottom: 20px;
    }
    .slide h1 {
      color: #ffd700;
      font-size: 2rem;
      margin-bottom: 15px;
    }
    .slide h2 {
      color: #ffd700;
      font-size: 1.5rem;
      margin-bottom: 25px;
      padding-bottom: 15px;
      border-bottom: 2px solid #ffd700;
      display: inline-block;
    }
    .subtitle, .message {
      color: #ffffff;
      font-size: 1.2rem;
      line-height: 1.6;
    }
    .website {
      color: #ffd700;
      font-size: 1rem;
      margin-top: 20px;
    }
    .content-slide ul {
      list-style: none;
      padding-left: 0;
    }
    .content-slide li {
      color: #ffffff;
      font-size: 1.1rem;
      line-height: 1.8;
      padding: 10px 0 10px 30px;
      position: relative;
    }
    .content-slide li:before {
      content: "●";
      color: #ffd700;
      position: absolute;
      left: 0;
      font-size: 0.9rem;
    }
    .closing-slide {
      background: #ffd700;
    }
    .closing-slide h1 {
      color: #0a1e34;
    }
    .closing-slide .message {
      color: #1e4e9a;
    }
    .closing-slide .website {
      color: #1e4e9a;
    }
    .closing-slide .slide-logo {
      filter: none;
    }
    .download-bar {
      background: #1e4e9a;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      margin-top: 30px;
    }
    .download-bar a {
      display: inline-block;
      background: #ffd700;
      color: #0a1e34;
      text-decoration: none;
      padding: 14px 30px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 1rem;
    }
    .download-bar a:hover {
      background: #e6c200;
    }
    @media (max-width: 600px) {
      body { padding: 10px; }
      .slide { padding: 25px 20px; }
      .slide h1 { font-size: 1.6rem; }
      .slide h2 { font-size: 1.3rem; }
      .content-slide li { font-size: 1rem; padding-left: 25px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="Kingdom Connects">
    </div>
    ${slidesHTML}
    <div class="download-bar">
      <p style="color: #ffffff; margin-bottom: 15px;">Want to save or share this presentation?</p>
      <a href="/presentations/download/${role}">Download PowerPoint File</a>
    </div>
  </div>
</body>
</html>
  `;
}

// GET /api/presentations/preview/:role - Get presentation preview data
app.get('/api/presentations/preview/:role', async (req, res) => {
  try {
    const role = req.params.role;
    const templateId = req.query.templateId;
    
    let template;
    
    // If templateId provided, fetch from Firestore
    if (templateId && admin) {
      try {
        const doc = await admin.firestore().collection('presentation_templates').doc(templateId).get();
        if (doc.exists) {
          template = doc.data();
          console.log('Using saved template:', templateId);
        }
      } catch (err) {
        console.error('Error fetching template from Firestore:', err);
      }
    }
    
    // Fall back to default template
    if (!template) {
      template = PRESENTATION_TEMPLATES[role];
    }
    
    if (!template) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    res.json({ template });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /presentations/view/:role - Web viewer for presentation (no auth required for email links)
app.get('/presentations/view/:role', (req, res) => {
  try {
    const role = req.params.role;
    
    if (!PRESENTATION_TEMPLATES[role]) {
      return res.status(404).send('Presentation not found');
    }
    
    const html = generateViewerHTML(role);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('View error:', error);
    res.status(500).send('Error loading presentation');
  }
});

// GET /presentations/download/:role - Download PowerPoint file (no auth required for email links)
app.get('/presentations/download/:role', async (req, res) => {
  try {
    const role = req.params.role;
    
    if (!PRESENTATION_TEMPLATES[role]) {
      return res.status(404).send('Presentation not found');
    }
    
    console.log('Generating download for role:', role);
    
    const pres = generatePresentation(role);
    const filename = `kingdom-connects-${role.replace('_', '-')}-presentation.pptx`;
    const filepath = path.join('/tmp', filename);
    
    await pres.writeFile({ fileName: filepath });
    
    const fileBuffer = fs.readFileSync(filepath);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
    
    // Clean up
    fs.unlinkSync(filepath);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Error generating presentation');
  }
});

// POST /api/presentations/send - Generate and send presentation
app.post('/api/presentations/send', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { role, email, phone, sendEmail, sendSms, includePresentation = true, templateId } = req.body;
    
    if (!role || !PRESENTATION_TEMPLATES[role]) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Build URLs for the email
    let baseUrl;
    if (process.env.PRODUCTION_URL) {
      baseUrl = process.env.PRODUCTION_URL;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else {
      baseUrl = 'https://kingdomconnects.com';
    }
    const viewUrl = `${baseUrl}/presentations/view/${role}`;
    const downloadUrl = `${baseUrl}/presentations/download/${role}`;
    
    console.log('Presentation send request:');
    console.log('  - Include Presentation:', includePresentation);
    console.log('  - Template ID:', templateId || 'default');
    if (includePresentation) {
      console.log('  - View:', viewUrl);
      console.log('  - Download:', downloadUrl);
    }
    
    // Send email if requested
    if (sendEmail && email) {
      try {
        const { client, fromEmail } = await getResendClient();
        
        // Get email content from saved template or default
        let emailContent;
        if (templateId && admin) {
          try {
            const doc = await admin.firestore().collection('presentation_templates').doc(templateId).get();
            if (doc.exists) {
              const savedTemplate = doc.data();
              emailContent = savedTemplate.email;
              console.log('Using saved template for email:', templateId);
            }
          } catch (err) {
            console.error('Error fetching template:', err);
          }
        }
        
        // Fall back to default if no saved template
        if (!emailContent) {
          emailContent = await getEmailContent(role);
        }
        
        console.log('Sending presentation email:');
        console.log('  - From:', fromEmail);
        console.log('  - To:', email);
        console.log('  - Role:', role);
        console.log('  - Subject:', emailContent.subject);
        console.log('  - Include Presentation:', includePresentation);
        
        // Generate email with or without presentation buttons
        const htmlEmail = includePresentation 
          ? generateEmailHTML(emailContent, viewUrl, downloadUrl)
          : generateEmailHTMLNoPresentation(emailContent, role);
        
        const emailResult = await client.emails.send({
          from: fromEmail,
          to: email,
          subject: emailContent.subject,
          html: htmlEmail
        });
        
        console.log('Resend API response:', JSON.stringify(emailResult));
      } catch (emailError) {
        console.error('Email send error:', emailError);
        return res.status(500).json({ error: 'Failed to send email: ' + emailError.message });
      }
    }
    
    // Send SMS if requested (with download link)
    if (sendSms && phone) {
      console.log(`SMS would be sent to ${phone} with view link: ${viewUrl}`);
      // TODO: Add Twilio integration for actual SMS
    }
    
    res.json({
      success: true,
      message: 'Presentation sent successfully',
      email: sendEmail ? email : null,
      phone: sendSms ? phone : null,
      viewUrl: viewUrl,
      downloadUrl: downloadUrl
    });
    
  } catch (error) {
    console.error('Presentation send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SOCIAL MEDIA PREVIEW ENDPOINTS
// These serve proper Open Graph meta tags for social sharing
// ============================================

const BASE_URL = process.env.BASE_URL || 'https://kingdomconnects.org';
const DEFAULT_IMAGE = `${BASE_URL}/assets/og-kingdom-connects.png`;

function generatePreviewHTML(options) {
  const {
    title,
    description,
    image,
    url,
    type = 'website',
    siteName = 'Kingdom Connects'
  } = options;

  const safeTitle = (title || 'Kingdom Connects').replace(/"/g, '&quot;');
  const safeDesc = (description || 'Faith-based business and church directory').replace(/"/g, '&quot;').substring(0, 200);
  const safeImage = image || DEFAULT_IMAGE;
  const safeUrl = url || BASE_URL;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${siteName}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:url" content="${safeUrl}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">
  
  <!-- Canonical URL -->
  <link rel="canonical" href="${safeUrl}">
  
  <!-- Redirect after crawlers get meta tags -->
  <meta http-equiv="refresh" content="0; url=${safeUrl}">
  <script>window.location.replace("${safeUrl}");</script>
</head>
<body>
  <p>Redirecting to <a href="${safeUrl}">${safeTitle}</a>...</p>
</body>
</html>`;
}

// Business preview endpoint for social sharing
app.get('/preview/business/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const db = admin.firestore();
    let businessData = null;
    let businessId = null;
    
    // Try slug first
    const slugQuery = await db.collection('business_listings_public')
      .where('slug', '==', idOrSlug)
      .where('listing_status', '==', 'active')
      .limit(1)
      .get();
    
    if (!slugQuery.empty) {
      businessId = slugQuery.docs[0].id;
      businessData = slugQuery.docs[0].data();
    } else {
      // Try direct ID lookup
      const docRef = await db.collection('business_listings_public').doc(idOrSlug).get();
      if (docRef.exists && docRef.data().listing_status === 'active') {
        businessId = docRef.id;
        businessData = docRef.data();
      }
    }
    
    if (!businessData) {
      return res.status(404).send(generatePreviewHTML({
        title: 'Business Not Found - Kingdom Connects',
        description: 'This business listing could not be found.',
        url: `${BASE_URL}/business_directory.html`
      }));
    }
    
    const canonicalUrl = businessData.slug 
      ? `${BASE_URL}/business.html?slug=${businessData.slug}`
      : `${BASE_URL}/business.html?id=${businessId}`;
    
    const businessImage = (businessData.photos && businessData.photos.length > 0)
      ? businessData.photos[0]
      : DEFAULT_IMAGE;
    
    const ratingText = businessData.average_rating 
      ? ` | ${businessData.average_rating.toFixed(1)}★` 
      : '';
    
    res.send(generatePreviewHTML({
      title: `${businessData.business_name} - Kingdom Connects`,
      description: businessData.description || `${businessData.business_name} is a Christian business in ${businessData.city || ''}, ${businessData.state || ''}. ${businessData.primary_category || ''}${ratingText}`,
      image: businessImage,
      url: canonicalUrl,
      type: 'business.business'
    }));
    
  } catch (error) {
    console.error('Business preview error:', error);
    res.status(500).send(generatePreviewHTML({
      title: 'Kingdom Connects',
      description: 'Connect with faith-based businesses in your community.',
      url: BASE_URL
    }));
  }
});

// Church preview endpoint for social sharing
app.get('/preview/church/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const db = admin.firestore();
    let churchData = null;
    let churchId = null;
    
    // Try slug first
    const slugQuery = await db.collection('churches')
      .where('slug', '==', idOrSlug)
      .where('listing_status', '==', 'active')
      .limit(1)
      .get();
    
    if (!slugQuery.empty) {
      churchId = slugQuery.docs[0].id;
      churchData = slugQuery.docs[0].data();
    } else {
      // Try direct ID lookup
      const docRef = await db.collection('churches').doc(idOrSlug).get();
      if (docRef.exists && docRef.data().listing_status === 'active') {
        churchId = docRef.id;
        churchData = docRef.data();
      }
    }
    
    if (!churchData) {
      return res.status(404).send(generatePreviewHTML({
        title: 'Church Not Found - Kingdom Connects',
        description: 'This church profile could not be found.',
        url: `${BASE_URL}/church_directory.html`
      }));
    }
    
    const canonicalUrl = churchData.slug 
      ? `${BASE_URL}/church.html?slug=${churchData.slug}`
      : `${BASE_URL}/church.html?id=${churchId}`;
    
    const churchImage = churchData.hero_image || churchData.logo || DEFAULT_IMAGE;
    
    const location = [churchData.city, churchData.state].filter(Boolean).join(', ');
    const denomination = churchData.denomination ? ` | ${churchData.denomination}` : '';
    
    res.send(generatePreviewHTML({
      title: `${churchData.church_name} - Kingdom Connects`,
      description: churchData.description || `${churchData.church_name} is a church${location ? ` in ${location}` : ''}${denomination}. Join our community of faith.`,
      image: churchImage,
      url: canonicalUrl,
      type: 'place'
    }));
    
  } catch (error) {
    console.error('Church preview error:', error);
    res.status(500).send(generatePreviewHTML({
      title: 'Kingdom Connects',
      description: 'Connect with churches in your community.',
      url: BASE_URL
    }));
  }
});

console.log('Social preview endpoints registered: /preview/business/:id, /preview/church/:id');

// ============================================================
// SEO: Server-Side Rendered Pages with Clean URLs
// ============================================================

// Generate SEO-friendly slug from name and location
// Falls back to document ID if slug would be empty
function generateSlug(name, city, state, docId = null) {
  const parts = [name, city, state].filter(Boolean);
  const slug = parts.join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to hyphens
    .replace(/-+/g, '-')           // Multiple hyphens to single
    .replace(/^-|-$/g, '')         // Trim hyphens
    .substring(0, 80);             // Limit length
  
  // If slug is empty or too short, fall back to document ID
  if (!slug || slug.length < 3) {
    return docId || 'listing';
  }
  return slug;
}

// Helper to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Safe JSON serialization for embedding in script tags (prevents XSS)
function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
}

// Generate full SSR business page
function generateBusinessPage(business, businessId, qrgearToken = null) {
  const name = escapeHtml(business.business_name);
  const description = escapeHtml(business.description || '');
  const category = escapeHtml(business.primary_category || '');
  const city = escapeHtml(business.city || '');
  const state = escapeHtml(business.state || '');
  const phone = escapeHtml(business.phone || '');
  const email = escapeHtml(business.email || '');
  const address = escapeHtml([business.address_line1, business.city, business.state, business.zip_code].filter(Boolean).join(', '));
  const image = business.photos?.[0] || DEFAULT_IMAGE;
  const rating = business.average_rating ? `${business.average_rating.toFixed(1)} stars` : '';
  const reviewCount = business.review_count || 0;
  
  const slug = business.slug || generateSlug(business.business_name, business.city, business.state, businessId);
  const canonicalUrl = `${BASE_URL}/business/${slug}.htm`;
  
  // Structured data for Google
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": business.business_name,
    "description": business.description || '',
    "address": {
      "@type": "PostalAddress",
      "streetAddress": business.address_line1 || '',
      "addressLocality": business.city || '',
      "addressRegion": business.state || '',
      "postalCode": business.zip_code || ''
    },
    "telephone": business.phone || '',
    "url": canonicalUrl,
    "image": image
  };
  
  if (business.average_rating) {
    structuredData.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": business.average_rating,
      "reviewCount": reviewCount
    };
  }

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  
  <title>${name} - ${category} in ${city}, ${state} | Kingdom Connects</title>
  <meta name="description" content="${description.substring(0, 160) || `${name} is a Christian ${category} in ${city}, ${state}. Find contact info, reviews, and more on Kingdom Connects.`}">
  <meta name="robots" content="index, follow">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="business.business">
  <meta property="og:site_name" content="Kingdom Connects">
  <meta property="og:title" content="${name} - Kingdom Connects">
  <meta property="og:description" content="${description.substring(0, 200) || `${name} is a Christian business in ${city}, ${state}.`}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${canonicalUrl}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${name} - Kingdom Connects">
  <meta name="twitter:description" content="${description.substring(0, 200) || `${name} is a Christian business in ${city}, ${state}.`}">
  <meta name="twitter:image" content="${image}">
  
  <!-- Canonical URL -->
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" href="/assets/favicon.ico" type="image/x-icon">
  
  <!-- Structured Data for Google -->
  <script type="application/ld+json">${safeJsonForScript(structuredData)}</script>
  
  <!-- Stylesheets -->
  <link rel="stylesheet" href="/styles/layout.css?v=8">
  <link rel="stylesheet" href="/styles/theme.css?v=8">
  <link rel="stylesheet" href="/styles/buttons.css?v=8">
  <link rel="stylesheet" href="/styles/forms.css?v=8">
  <link rel="stylesheet" href="/styles/components/business-cards.css?v=8">
  <link rel="stylesheet" href="/styles/overrides.css?v=8">
  
  <!-- Pre-load data for client hydration (XSS-safe) -->
  <script>
    window.__KC_INITIAL_DATA__ = ${safeJsonForScript({
      type: 'business',
      id: businessId,
      slug: slug,
      data: business
    })};
  </script>
</head>
<body>
  <a id="top"></a>
  <div class="page-wrap">
    <div id="header"></div>
    <div id="breadcrumbs"></div>

    <main class="page-content" id="main">
      <div id="loadingMessage" class="hidden"></div>
      <div id="errorMessage" class="hidden"></div>

      <div id="businessContent">
        <div class="m-block">
          <a href="/business_directory.html" class="btn btn-small">← Back to Directory</a>
        </div>

        <article class="card">
          ${business.is_pro ? '<div id="proBadge" class="mb-sm"><span class="badge badge-gold">PRO BUSINESS</span></div>' : ''}
          
          <h1 id="businessName" class="gold-metallic mb-sm">${name}</h1>
          
          <div id="businessCategory" class="business-meta">${category}</div>
          
          ${rating ? `<div id="ratingDisplay" class="mb-md">${rating} (${reviewCount} reviews)</div>` : ''}
          
          <div id="businessDescription" class="mb-md">${description}</div>
        </article>

        <article class="card">
          <h2 class="gold">Contact Information</h2>
          <div class="grid-2 gap-md">
            <div>
              <h3 class="text-md mb-sm">Address</h3>
              <p id="businessAddress">${address}</p>
            </div>
            <div>
              <h3 class="text-md mb-sm">Contact</h3>
              ${phone ? `<p id="businessPhone" class="mb-sm"><a href="tel:${phone}">${phone}</a></p>` : ''}
              ${email ? `<p id="businessEmail" class="mb-sm"><a href="mailto:${email}">${email}</a></p>` : ''}
            </div>
          </div>
        </article>

        <article id="mediaSection" class="card hidden">
          <h2 class="gold">Photos & Videos</h2>
          <div id="photoGallery" class="photo-gallery mb-md"></div>
          <div id="videoGallery"></div>
        </article>

        <article id="promotionsSection" class="card hidden">
          <h2 class="gold">Current Promotions</h2>
          <div id="promotionsList"></div>
        </article>

        <article id="productsServicesSection" class="card hidden">
          <h2 class="gold">Products & Services</h2>
          <div id="productsServicesList"></div>
        </article>

        <article id="testimonialsSection" class="card hidden">
          <h2 class="gold">Customer Testimonials</h2>
          <div id="testimonialsList"></div>
        </article>

        ${generateQRGearWidgetHtml(qrgearToken)}

        <article id="socialMediaSection" class="card hidden">
          <h2 class="gold">Follow Us</h2>
          <div id="socialMediaLinks" class="social-links-row"></div>
        </article>

        <article id="shareSection" class="card">
          <div id="socialShareButtons"></div>
        </article>

        <article class="card">
          <h2 class="gold">Customer Reviews</h2>
          <div id="reviewsStats" class="mb-md"></div>
          <div id="noReviews" class="text-center p-md text-muted">Loading reviews...</div>
          <div id="reviewsList"></div>
          <div id="submitReviewContainer" class="mt-md text-center">
            <a id="submitReviewBtn" href="/submit_review.html?business=${businessId}" class="btn btn-gold">Write a Review</a>
          </div>
        </article>
      </div>
    </main>

    <div id="footer"></div>
  </div>

  <script src="/js/maintenance-check.js" type="module"></script>
  <script src="/js/components.js" defer></script>
  <script src="/js/button-effects.js" defer></script>
  <script src="/js/breadcrumbs.js" defer></script>
  <script type="module" src="/js/business.js"></script>
</body>
</html>`;
}

// Generate full SSR church page
function generateChurchPage(church, churchId, qrgearToken = null) {
  const name = escapeHtml(church.church_name);
  const description = escapeHtml(church.description || '');
  const denomination = escapeHtml(church.denomination || '');
  const city = escapeHtml(church.city || '');
  const state = escapeHtml(church.state || '');
  const phone = escapeHtml(church.phone || '');
  const email = escapeHtml(church.email || '');
  const address = escapeHtml([church.address_line1, church.city, church.state, church.zip_code].filter(Boolean).join(', '));
  const image = church.hero_image || church.logo || DEFAULT_IMAGE;
  
  const slug = church.slug || generateSlug(church.church_name, church.city, church.state, churchId);
  const canonicalUrl = `${BASE_URL}/church/${slug}.htm`;
  
  // Structured data for Google
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Church",
    "name": church.church_name,
    "description": church.description || '',
    "address": {
      "@type": "PostalAddress",
      "streetAddress": church.address_line1 || '',
      "addressLocality": church.city || '',
      "addressRegion": church.state || '',
      "postalCode": church.zip_code || ''
    },
    "telephone": church.phone || '',
    "url": canonicalUrl,
    "image": image
  };

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  
  <title>${name}${denomination ? ` - ${denomination}` : ''} in ${city}, ${state} | Kingdom Connects</title>
  <meta name="description" content="${description.substring(0, 160) || `${name} is a ${denomination || 'church'} in ${city}, ${state}. Join our community of faith.`}">
  <meta name="robots" content="index, follow">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="place">
  <meta property="og:site_name" content="Kingdom Connects">
  <meta property="og:title" content="${name} - Kingdom Connects">
  <meta property="og:description" content="${description.substring(0, 200) || `${name} is a church in ${city}, ${state}. Join our community.`}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${canonicalUrl}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${name} - Kingdom Connects">
  <meta name="twitter:description" content="${description.substring(0, 200) || `${name} is a church in ${city}, ${state}.`}">
  <meta name="twitter:image" content="${image}">
  
  <!-- Canonical URL -->
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" href="/assets/favicon.ico" type="image/x-icon">
  
  <!-- Structured Data for Google -->
  <script type="application/ld+json">${safeJsonForScript(structuredData)}</script>
  
  <!-- Stylesheets -->
  <link rel="stylesheet" href="/styles/layout.css?v=7">
  <link rel="stylesheet" href="/styles/theme.css?v=7">
  <link rel="stylesheet" href="/styles/buttons.css?v=7">
  <link rel="stylesheet" href="/styles/forms.css?v=7">
  <link rel="stylesheet" href="/styles/overrides.css?v=7">
  <link rel="stylesheet" href="/styles/components/church.css">
  
  <!-- Pre-load data for client hydration (XSS-safe) -->
  <script>
    window.__KC_INITIAL_DATA__ = ${safeJsonForScript({
      type: 'church',
      id: churchId,
      slug: slug,
      data: church
    })};
  </script>
</head>
<body>
  <a id="top"></a>
  <div class="page-wrap">
    <div id="header"></div>
    <div id="breadcrumbs" class="breadcrumb-container"></div>

    <main class="page-content" id="main">
      <div id="loadingMessage" class="hidden"></div>
      <div id="errorMessage" class="hidden"></div>

      <div id="churchProfile">
        <article class="card" id="heroSection">
          ${church.hero_image ? `<img id="heroImage" class="church-hero-image" src="${church.hero_image}" alt="${name} banner">` : ''}
          <div class="flex-between mb-sm">
            <div>
              <h1 id="churchName" class="gold-metallic">${name}</h1>
              ${denomination ? `<p id="churchDenomination" class="text-muted">${denomination}</p>` : ''}
            </div>
            <button id="favoriteBtn" class="btn btn-gold btn-small hidden">Save</button>
          </div>
          <p id="churchDescription" class="line-height-relaxed">${description}</p>
          ${church.welcome_message ? `<p id="welcomeMessage" class="welcome-message">${escapeHtml(church.welcome_message)}</p>` : ''}
        </article>

        <article id="shareSection" class="card">
          <div id="socialShareButtons"></div>
        </article>

        ${generateQRGearWidgetHtml(qrgearToken)}

        <article class="card" id="contactCard">
          <h2 class="gold">Contact Information</h2>
          <div id="contactInfo" class="contact-info-grid">
            ${address ? `<p><strong>Address:</strong> ${address}</p>` : ''}
            ${phone ? `<p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
            ${email ? `<p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>` : ''}
          </div>
        </article>

        <article class="card">
          <a href="/church_directory.html" class="btn btn-gold">Back to Church Directory</a>
        </article>
      </div>
    </main>

    <div id="footer"></div>
  </div>

  <script src="/js/maintenance-check.js" type="module"></script>
  <script src="/js/header_public.js" type="module"></script>
  <script src="/js/footer_public.js" defer></script>
  <script src="/js/breadcrumbs.js" defer></script>
  <script type="module" src="/js/church.js"></script>
</body>
</html>`;
}

// SSR Business Page: /business/:slug.htm
app.get('/business/:slug.htm', async (req, res) => {
  try {
    const slug = req.params.slug;
    const db = admin.firestore();
    let businessData = null;
    let businessId = null;
    
    // Try slug lookup first
    const slugQuery = await db.collection('business_listings_public')
      .where('slug', '==', slug)
      .where('listing_status', '==', 'active')
      .limit(1)
      .get();
    
    if (!slugQuery.empty) {
      businessId = slugQuery.docs[0].id;
      businessData = slugQuery.docs[0].data();
    } else {
      // Try matching generated slug pattern
      const allActive = await db.collection('business_listings_public')
        .where('listing_status', '==', 'active')
        .get();
      
      for (const doc of allActive.docs) {
        const data = doc.data();
        const generatedSlug = generateSlug(data.business_name, data.city, data.state, doc.id);
        if (generatedSlug === slug) {
          businessId = doc.id;
          businessData = data;
          break;
        }
      }
    }
    
    if (!businessData) {
      res.status(404);
      return res.send(`<!DOCTYPE html>
<html><head><title>Business Not Found - Kingdom Connects</title>
<meta http-equiv="refresh" content="3; url=/business_directory.html">
</head><body>
<h1>Business Not Found</h1>
<p>Redirecting to <a href="/business_directory.html">Business Directory</a>...</p>
</body></html>`);
    }
    
    // Fetch QR Gear widget token (non-blocking - fails gracefully)
    const qrgearData = await getCachedQRGearToken('business', businessId);
    const qrgearToken = qrgearData?.token || null;
    
    res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.send(generateBusinessPage(businessData, businessId, qrgearToken));
    
  } catch (error) {
    console.error('SSR Business error:', error);
    res.status(500).send('Server error');
  }
});

// SSR Church Page: /church/:slug.htm
app.get('/church/:slug.htm', async (req, res) => {
  try {
    const slug = req.params.slug;
    const db = admin.firestore();
    let churchData = null;
    let churchId = null;
    
    // Try slug lookup first
    const slugQuery = await db.collection('churches')
      .where('slug', '==', slug)
      .where('listing_status', '==', 'active')
      .limit(1)
      .get();
    
    if (!slugQuery.empty) {
      churchId = slugQuery.docs[0].id;
      churchData = slugQuery.docs[0].data();
    } else {
      // Try matching generated slug pattern
      const allActive = await db.collection('churches')
        .where('listing_status', '==', 'active')
        .get();
      
      for (const doc of allActive.docs) {
        const data = doc.data();
        const generatedSlug = generateSlug(data.church_name, data.city, data.state, doc.id);
        if (generatedSlug === slug) {
          churchId = doc.id;
          churchData = data;
          break;
        }
      }
    }
    
    if (!churchData) {
      res.status(404);
      return res.send(`<!DOCTYPE html>
<html><head><title>Church Not Found - Kingdom Connects</title>
<meta http-equiv="refresh" content="3; url=/church_directory.html">
</head><body>
<h1>Church Not Found</h1>
<p>Redirecting to <a href="/church_directory.html">Church Directory</a>...</p>
</body></html>`);
    }
    
    // Fetch QR Gear widget token (non-blocking - fails gracefully)
    const qrgearData = await getCachedQRGearToken('church', churchId);
    const qrgearToken = qrgearData?.token || null;
    
    res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.send(generateChurchPage(churchData, churchId, qrgearToken));
    
  } catch (error) {
    console.error('SSR Church error:', error);
    res.status(500).send('Server error');
  }
});

// Sitemap.xml - Lists all active businesses and churches for search engines
app.get('/sitemap.xml', async (req, res) => {
  try {
    const db = admin.firestore();
    const now = new Date().toISOString();
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/business_directory.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${BASE_URL}/church_directory.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${BASE_URL}/for-businesses.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE_URL}/for-churches.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    
    // Add all active businesses
    const businesses = await db.collection('business_listings_public')
      .where('listing_status', '==', 'active')
      .get();
    
    for (const doc of businesses.docs) {
      const data = doc.data();
      const slug = data.slug || generateSlug(data.business_name, data.city, data.state, doc.id);
      const lastMod = data.updated_at?.toDate?.()?.toISOString() || now;
      xml += `  <url>
    <loc>${BASE_URL}/business/${slug}.htm</loc>
    <lastmod>${lastMod.split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
    }
    
    // Add all active churches
    const churches = await db.collection('churches')
      .where('listing_status', '==', 'active')
      .get();
    
    for (const doc of churches.docs) {
      const data = doc.data();
      const slug = data.slug || generateSlug(data.church_name, data.city, data.state, doc.id);
      const lastMod = data.updated_at?.toDate?.()?.toISOString() || now;
      xml += `  <url>
    <loc>${BASE_URL}/church/${slug}.htm</loc>
    <lastmod>${lastMod.split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
    }
    
    xml += `</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600'); // 1 hour cache
    res.send(xml);
    
  } catch (error) {
    console.error('Sitemap error:', error);
    res.status(500).send('<?xml version="1.0"?><error>Failed to generate sitemap</error>');
  }
});

// API endpoint to get/generate slug for a business or church
app.get('/api/slug/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const db = admin.firestore();
    
    const collection = type === 'business' ? 'business_listings_public' : 'churches';
    const nameField = type === 'business' ? 'business_name' : 'church_name';
    
    const doc = await db.collection(collection).doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    const data = doc.data();
    const slug = data.slug || generateSlug(data[nameField], data.city, data.state);
    
    res.json({
      id: id,
      slug: slug,
      url: `${BASE_URL}/${type}/${slug}.htm`
    });
    
  } catch (error) {
    console.error('Slug API error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('SSR endpoints registered: /business/:slug.htm, /church/:slug.htm, /sitemap.xml');

// ============================================================
// Automatic Search Engine Sitemap Pinging
// ============================================================

// Track last ping time to avoid spamming (ping at most once per hour)
let lastPingTime = 0;
const PING_COOLDOWN = 60 * 60 * 1000; // 1 hour

async function pingSitemapToSearchEngines() {
  const now = Date.now();
  if (now - lastPingTime < PING_COOLDOWN) {
    console.log('Sitemap ping skipped - cooldown active');
    return { skipped: true, reason: 'cooldown' };
  }
  
  lastPingTime = now;
  const sitemapUrl = encodeURIComponent(`${BASE_URL}/sitemap.xml`);
  const results = { google: null, bing: null };
  
  try {
    // Ping Google
    const googlePing = await fetch(`https://www.google.com/ping?sitemap=${sitemapUrl}`);
    results.google = googlePing.ok ? 'success' : 'failed';
    console.log(`Google sitemap ping: ${results.google}`);
  } catch (err) {
    results.google = 'error';
    console.error('Google ping error:', err.message);
  }
  
  try {
    // Ping Bing (also covers Yahoo)
    const bingPing = await fetch(`https://www.bing.com/ping?sitemap=${sitemapUrl}`);
    results.bing = bingPing.ok ? 'success' : 'failed';
    console.log(`Bing sitemap ping: ${results.bing}`);
  } catch (err) {
    results.bing = 'error';
    console.error('Bing ping error:', err.message);
  }
  
  return results;
}

// Endpoint to manually trigger sitemap ping (admin use)
app.post('/api/ping-sitemap', async (req, res) => {
  try {
    const results = await pingSitemapToSearchEngines();
    res.json({ success: true, results });
  } catch (error) {
    console.error('Sitemap ping error:', error);
    res.status(500).json({ error: 'Ping failed' });
  }
});

// Auto-ping on server startup (after a delay to ensure everything is ready)
setTimeout(async () => {
  console.log('Performing initial sitemap ping to search engines...');
  await pingSitemapToSearchEngines();
}, 10000); // Wait 10 seconds after startup

console.log('Search engine ping endpoint registered: POST /api/ping-sitemap');

// =========================================================
// STORAGE MANAGEMENT ENDPOINTS (Admin only)
// =========================================================

// Initialize storage bucket
let storageBucket = null;
try {
  const serviceAccount = require('./firebase-service-account.json');
  if (!admin.apps.find(app => app.name === 'storage')) {
    const storageApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'kingdom-commerce.firebasestorage.app'
    }, 'storage');
    storageBucket = storageApp.storage().bucket();
  }
} catch (err) {
  console.log('Storage management: Service account not available');
}

// List files in storage
app.get('/api/storage/list', authenticateUser, requireAdmin, async (req, res) => {
  if (!storageBucket) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  
  try {
    const prefix = req.query.prefix || '';
    const [files] = await storageBucket.getFiles({ prefix, maxResults: 500 });
    
    const fileList = await Promise.all(files.map(async (file) => {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 3600000
      });
      return {
        name: file.name.split('/').pop(),
        path: file.name,
        size: parseInt(file.metadata.size) || 0,
        contentType: file.metadata.contentType,
        created: file.metadata.timeCreated,
        url
      };
    }));
    
    res.json({ files: fileList });
  } catch (error) {
    console.error('Storage list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete files from storage
app.post('/api/storage/delete', authenticateUser, requireAdmin, async (req, res) => {
  if (!storageBucket) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  
  try {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'No paths provided' });
    }
    
    const results = [];
    for (const path of paths) {
      try {
        await storageBucket.file(path).delete();
        results.push({ path, success: true });
      } catch (err) {
        results.push({ path, success: false, error: err.message });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Storage delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('Storage management endpoints registered');

// ============ UPLOAD TEST STATUS ============
app.get('/api/upload-test-status', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('upload_tests').doc('latest').get();
    if (!doc.exists) {
      return res.json({ status: 'NO_TEST', message: 'No test has been run yet' });
    }
    const data = doc.data();
    res.json({
      status: data.status || 'UNKNOWN',
      message: data.message || '',
      elapsed: data.elapsed || '',
      timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
      logs: data.logs || ''
    });
  } catch (error) {
    console.error('Upload test status error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('Upload test status endpoint registered');

// ============ AUTOMATED UPLOAD TEST ============
// Server-side upload test - no browser needed
app.post('/api/test-upload', async (req, res) => {
  const logs = [];
  const startTime = Date.now();
  
  function log(msg) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push(`[${elapsed}s] ${msg}`);
    console.log(`[UPLOAD-TEST] ${msg}`);
  }
  
  try {
    log('Starting server-side upload test...');
    
    if (!storageBucket) {
      log('FAIL: Storage bucket not configured');
      return res.json({ status: 'FAIL', message: 'Storage not configured', logs: logs.join('\n') });
    }
    
    log('Storage bucket available');
    
    // Create a simple test image (1x1 red PNG)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
      0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
      0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
      0xAE, 0x42, 0x60, 0x82
    ]);
    
    log(`Test image created: ${pngBuffer.length} bytes`);
    
    const testId = `SERVER_TEST_${Date.now()}`;
    const filePath = `businesses/${testId}/test-image.png`;
    
    log(`Uploading to: ${filePath}`);
    
    const file = storageBucket.file(filePath);
    
    await file.save(pngBuffer, {
      metadata: {
        contentType: 'image/png'
      },
      resumable: false
    });
    
    log('Upload complete');
    
    // Get download URL
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 3600000
    });
    
    log(`URL generated: ${url.substring(0, 60)}...`);
    
    // Delete test file
    log('Deleting test file...');
    await file.delete();
    log('Test file deleted');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    
    // Save result to Firestore
    await admin.firestore().collection('upload_tests').doc('latest').set({
      status: 'PASS',
      message: 'Server-side upload successful',
      elapsed: elapsed,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      logs: logs.join('\n'),
      source: 'server'
    });
    
    log('PASS - Test complete');
    
    res.json({ 
      status: 'PASS', 
      message: 'Upload successful',
      elapsed: elapsed,
      logs: logs.join('\n')
    });
    
  } catch (error) {
    log(`FAIL: ${error.message}`);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    
    // Save failure to Firestore
    try {
      await admin.firestore().collection('upload_tests').doc('latest').set({
        status: 'FAIL',
        message: error.message,
        elapsed: elapsed,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        logs: logs.join('\n'),
        source: 'server'
      });
    } catch (e) {
      log(`Could not save to Firestore: ${e.message}`);
    }
    
    res.json({ 
      status: 'FAIL', 
      message: error.message,
      elapsed: elapsed,
      logs: logs.join('\n')
    });
  }
});

console.log('Automated upload test endpoint registered: POST /api/test-upload');

// ============ BROWSER-BASED UPLOAD TEST (Puppeteer) ============
// Launches headless browser, logs in, runs UploadTester on actual page
app.post('/api/browser-upload-test', async (req, res) => {
  const logs = [];
  const startTime = Date.now();
  let browser = null;
  
  function log(msg) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push(`[${elapsed}s] ${msg}`);
    console.log(`[BROWSER-TEST] ${msg}`);
  }
  
  try {
    log('Launching headless browser...');
    
    // Find Chromium
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/chromium/bin/chromium';
    const { execSync } = require('child_process');
    let actualChromiumPath;
    try {
      actualChromiumPath = execSync('which chromium').toString().trim();
    } catch {
      actualChromiumPath = chromiumPath;
    }
    
    log(`Using Chromium: ${actualChromiumPath}`);
    
    browser = await puppeteer.launch({
      executablePath: actualChromiumPath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    const page = await browser.newPage();
    
    // Capture console logs
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('STORAGE') || text.includes('UPLOAD')) {
        log(`Console: ${text}`);
      }
    });
    
    // Test on local dev server instead of production to avoid CORS/redirect issues
    const baseUrl = (req.body && req.body.useProduction) ? 'https://kingdomconnects.org' : 'http://localhost:5000';
    log(`Using base URL: ${baseUrl}`);
    
    log('Navigating to login page...');
    await page.goto(`${baseUrl}/login.html`, { 
      waitUntil: 'load',
      timeout: 60000 
    });
    
    // Wait for page to fully load
    await new Promise(r => setTimeout(r, 5000));
    
    // Capture page state for debugging
    const pageTitle = await page.title();
    log(`Page title: ${pageTitle}`);
    const pageUrl = page.url();
    log(`Page URL: ${pageUrl}`);
    
    log('Entering test credentials...');
    const testEmail = process.env.TEST_USER_EMAIL || 'perceys@gmail.com';
    const testPassword = process.env.FIREBASE_TEST_PASSWORD;
    
    if (!testPassword) {
      throw new Error('FIREBASE_TEST_PASSWORD not set');
    }
    
    // Wait for form elements with longer timeout
    log('Waiting for email field...');
    await page.waitForSelector('#email', { timeout: 20000 });
    await page.type('#email', testEmail);
    await page.type('#password', testPassword);
    
    log('Clicking login...');
    await page.click('button[type="submit"]');
    
    // Wait for auth to settle (don't wait for navigation, just timeout)
    await new Promise(r => setTimeout(r, 5000));
    
    log('Navigating to edit-listing page...');
    await page.goto(`${baseUrl}/business-admin/edit-listing.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait for page to load
    await new Promise(r => setTimeout(r, 5000));
    
    log('Looking for upload test button...');
    const testBtn = await page.$('#testUploadBtn');
    
    if (!testBtn) {
      throw new Error('Upload test button not found on page');
    }
    
    log('Clicking upload test button...');
    await testBtn.click();
    
    // Wait for test to complete (max 30 seconds)
    log('Waiting for test to complete...');
    await page.waitForFunction(() => {
      const logEl = document.getElementById('uploadTestLog');
      return logEl && (logEl.textContent.includes('PASS') || logEl.textContent.includes('FAIL'));
    }, { timeout: 30000 });
    
    // Get test result
    const testResult = await page.evaluate(() => {
      const logEl = document.getElementById('uploadTestLog');
      return logEl ? logEl.textContent : 'No result found';
    });
    
    log('Test result captured');
    log(testResult);
    
    const isPassed = testResult.includes('PASS');
    
    await browser.close();
    browser = null;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    
    // Save to Firestore
    try {
      await admin.firestore().collection('upload_tests').doc('browser_latest').set({
        status: isPassed ? 'PASS' : 'FAIL',
        message: isPassed ? 'Browser upload test passed' : 'Browser upload test failed',
        elapsed: elapsed,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        logs: logs.join('\n'),
        browserLogs: testResult,
        source: 'browser-puppeteer'
      });
    } catch (e) {
      log(`Firestore save failed: ${e.message}`);
    }
    
    res.json({
      status: isPassed ? 'PASS' : 'FAIL',
      message: isPassed ? 'Browser upload test passed' : 'Browser upload test failed',
      elapsed: elapsed,
      logs: logs.join('\n'),
      browserResult: testResult
    });
    
  } catch (error) {
    log(`FAIL: ${error.message}`);
    
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    
    res.json({
      status: 'FAIL',
      message: error.message,
      elapsed: elapsed,
      logs: logs.join('\n')
    });
  }
});

console.log('Browser upload test endpoint registered: POST /api/browser-upload-test');

// ============================================
// MIGRATION: Split business_listings into public/private
// Admin only, with dry-run support
// ============================================
const PUBLIC_FIELDS = [
  'business_name', 'slug', 'description', 'primary_category', 'category', 'subcategories', 'secondary_categories',
  'address', 'address_line1', 'address_line2', 'city', 'state', 'zip_code', 'country',
  'phone', 'phone_number', 'email', 'website', 'website_url',
  'hours', 'hours_of_operation', 'logo', 'logo_url', 'photos', 'videos', 'video_files',
  'referring_church_id', 'church_id', 'church_affiliation_status',
  'pro_status', 'subscription_tier', 'featured', 'is_featured',
  'average_rating', 'rating_average', 'review_count',
  'created_at', 'updated_at', 'is_visible', 'listing_status',
  'social_media', 'show_social_media',
  'allow_reviews', 'allow_social_sharing', 'allow_review_sharing',
  'show_phone', 'show_email', 'show_address', 'show_website'
];

const PRIVATE_FIELDS = [
  'owner_uid', 'owner_email', 'submitter_uid', 'submitter_email',
  'your_name', 'phone_ext',
  'stripe_customer_id', 'stripeCustomerId', 'stripe_subscription_id', 'stripeSubscriptionId',
  'stripe_product_id', 'pro_expires_at', 'billing_cycle', 'trial_status', 'trial_ends', 'subscription_start',
  'referring_salesperson_id',
  'admin_notes', 'moderation_notes', 'internal_flags', 'is_demo',
  'submission_date', 'approved_at', 'approved_by'
];

app.post('/api/admin/migrate-business-split', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { dryRun = true } = req.body;
    const db = admin.firestore();
    
    console.log(`Migration started - dryRun: ${dryRun}`);
    
    const snapshot = await db.collection('business_listings_public').get();
    const results = {
      total: snapshot.size,
      processed: 0,
      skipped: 0,
      errors: [],
      samples: []
    };
    
    const batchSize = 400;
    let batch = db.batch();
    let batchCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;
      
      const publicData = {};
      const privateData = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (PRIVATE_FIELDS.includes(key)) {
          privateData[key] = value;
        } else if (PUBLIC_FIELDS.includes(key)) {
          publicData[key] = value;
        } else {
          privateData[key] = value;
        }
      }
      
      publicData.is_visible = data.listing_status === 'active';
      privateData.owner_uid = data.owner_uid || data.submitter_uid || null;
      privateData.owner_email = data.owner_email || data.submitter_email || data.email || null;
      
      if (results.samples.length < 3) {
        results.samples.push({
          id,
          publicFields: Object.keys(publicData),
          privateFields: Object.keys(privateData)
        });
      }
      
      if (!dryRun) {
        const publicRef = db.collection('business_listings_public').doc(id);
        const privateRef = db.collection('business_listings_private').doc(id);
        
        batch.set(publicRef, publicData, { merge: true });
        batch.set(privateRef, privateData, { merge: true });
        batchCount += 2;
        
        if (batchCount >= batchSize) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
      
      results.processed++;
    }
    
    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }
    
    console.log('Migration complete:', results);
    
    res.json({
      success: true,
      dryRun,
      message: dryRun ? 'Dry run complete - no data written' : 'Migration complete',
      results
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
});

console.log('Migration endpoint registered: POST /api/admin/migrate-business-split');

// Localhost-only dry-run endpoint (no auth required, for testing)
app.get('/api/_internal/migrate-dryrun', async (req, res) => {
  // Only allow from localhost
  const ip = req.ip || req.connection.remoteAddress;
  if (!ip.includes('127.0.0.1') && !ip.includes('::1')) {
    return res.status(403).json({ error: 'Localhost only' });
  }
  
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('business_listings_public').get();
    
    const results = {
      total: snapshot.size,
      processed: 0,
      publicFieldCount: {},
      privateFieldCount: {},
      samples: []
    };
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;
      
      const publicData = {};
      const privateData = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (PRIVATE_FIELDS.includes(key)) {
          privateData[key] = value;
          results.privateFieldCount[key] = (results.privateFieldCount[key] || 0) + 1;
        } else if (PUBLIC_FIELDS.includes(key)) {
          publicData[key] = value;
          results.publicFieldCount[key] = (results.publicFieldCount[key] || 0) + 1;
        } else {
          privateData[key] = value;
          results.privateFieldCount[key] = (results.privateFieldCount[key] || 0) + 1;
        }
      }
      
      publicData.is_visible = data.listing_status === 'active';
      privateData.owner_uid = data.owner_uid || data.submitter_uid || null;
      
      if (results.samples.length < 5) {
        results.samples.push({
          id,
          business_name: data.business_name,
          publicFieldsCount: Object.keys(publicData).length,
          privateFieldsCount: Object.keys(privateData).length,
          is_visible: publicData.is_visible,
          has_owner_uid: !!privateData.owner_uid,
          listing_status: data.listing_status
        });
      }
      
      results.processed++;
    }
    
    res.json({
      success: true,
      dryRun: true,
      message: 'Dry run complete - no data written',
      results
    });
    
  } catch (error) {
    console.error('Dry-run error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('Localhost dry-run endpoint: GET /api/_internal/migrate-dryrun');

// Localhost-only LIVE migration endpoint (no auth required, for testing)
app.post('/api/_internal/migrate-live', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!ip.includes('127.0.0.1') && !ip.includes('::1')) {
    return res.status(403).json({ error: 'Localhost only' });
  }
  
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('business_listings_public').get();
    
    const results = {
      total: snapshot.size,
      processed: 0,
      errors: []
    };
    
    const batchSize = 400;
    let batch = db.batch();
    let batchCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;
      
      const publicData = {};
      const privateData = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (PRIVATE_FIELDS.includes(key)) {
          privateData[key] = value;
        } else if (PUBLIC_FIELDS.includes(key)) {
          publicData[key] = value;
        } else {
          privateData[key] = value;
        }
      }
      
      publicData.is_visible = data.listing_status === 'active';
      privateData.owner_uid = data.owner_uid || data.submitter_uid || null;
      privateData.owner_email = data.owner_email || data.submitter_email || data.email || null;
      
      const publicRef = db.collection('business_listings_public').doc(id);
      const privateRef = db.collection('business_listings_private').doc(id);
      
      batch.set(publicRef, publicData, { merge: true });
      batch.set(privateRef, privateData, { merge: true });
      batchCount += 2;
      
      if (batchCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
      
      results.processed++;
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log('LIVE Migration complete:', results);
    
    res.json({
      success: true,
      dryRun: false,
      message: 'Migration complete - data written to public/private collections',
      results
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('Localhost LIVE migration endpoint: POST /api/_internal/migrate-live');

// ============================================
// NEXUS API - Routed to dedicated module
// ============================================
const { router: nexusRouter, initNexus } = require('./routes/nexus.cjs');
initNexus(admin, authenticateUser, requireAdmin);
app.use('/api/nexus', nexusRouter);

// ============================================
// BRAIN API - Universal Brain connector (Fluba)
// ============================================
const { router: brainRouter, initBrain } = require('./routes/brain.cjs');
initBrain();
app.use('/api/brain', brainRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kingdom Connects Email Server running on port ${PORT}`);
  console.log('Stripe Connect endpoints available');
  console.log('Presentation generation endpoints available');
  console.log('Social media preview endpoints available');
  console.log('SEO/SSR endpoints available');
  console.log('Search engine auto-ping enabled');
});
