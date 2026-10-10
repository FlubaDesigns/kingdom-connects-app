// Kingdom Connects Firebase Cloud Functions
// Email functions only - Stripe functions in separate file when needed
// Updated: 2025-12-31 - Using kingdomconnects.org domain

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { Resend } = require('resend');

admin.initializeApp();
const hierarchyPolicy = require('./hierarchy-policy');
const { createHierarchyService } = require('./hierarchy-service');
const hierarchy = createHierarchyService(admin.firestore(), () => admin.firestore.FieldValue.serverTimestamp());
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');

exports.hierarchyAction = onRequest((req, res) => cors(req, res, async () => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const { user } = await verifyAuth(req);
    const result = await hierarchy.execute(user, req.body);
    if (req.body.action === 'setChurchStatus') await hierarchy.syncChurchBusinesses(result.churchId);
    res.json(result);
  } catch (error) {
    console.error('Hierarchy action failed:', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to save this change.' });
  }
}));

exports.syncChurchAuthority = onDocumentUpdated({ document: 'churches/{churchId}', retry: true }, async event => {
  if (event.data.before.data().listing_status !== event.data.after.data().listing_status) {
    await hierarchy.syncChurchBusinesses(event.params.churchId);
  }
});

const resendApiKey = defineSecret('RESEND_API_KEY');

function getResendClient() {
  const apiKey = resendApiKey.value();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }
  return {
    client: new Resend(apiKey),
    fromEmail: 'Kingdom Connects <support@kingdomconnects.org>'
  };
}

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Auth failed: No bearer token in header');
    throw { status: 401, message: 'Unauthorized: No token provided' };
  }
  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken || idToken.length < 100) {
    console.error('Auth failed: Token appears truncated or invalid, length:', idToken?.length);
    throw { status: 401, message: 'Unauthorized: Invalid token format' };
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('Token verified for user:', decodedToken.email);
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      console.error('User not found in Firestore:', decodedToken.uid);
      throw { status: 403, message: 'Forbidden: User not found' };
    }
    if (hierarchyPolicy.isBlocked(userDoc.data())) throw { status: 403, message: 'Account access is suspended.' };
    return { user: decodedToken, userData: userDoc.data() };
  } catch (authError) {
    console.error('Token verification failed:', authError.message);
    throw { status: authError.status || 401, message: authError.status ? authError.message : 'Unauthorized: Invalid token' };
  }
}

function checkRole(userData, allowedRoles) {
  const userRoles = userData.roles || [userData.role];
  const hasRole = Array.isArray(userRoles)
    ? userRoles.some(role => allowedRoles.includes(role))
    : allowedRoles.includes(userRoles);
  if (!hasRole) {
    throw { status: 403, message: 'Forbidden: Insufficient permissions' };
  }
  return true;
}

// ── In-memory rate limiter (per IP, per path) ─────────────────
const _rateLimitStore = new Map();
function isRateLimited(req, res, max = 20, windowMs = 60000) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const rec = _rateLimitStore.get(key);
  if (!rec || now > rec.reset) {
    _rateLimitStore.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  rec.count++;
  if (rec.count > max) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return true;
  }
  return false;
}

exports.health = onRequest((req, res) => {
  cors(req, res, () => {
    res.json({ status: 'ok', service: 'kingdom-connects-firebase' });
  });
});

exports.sendTemplate = onRequest({ secrets: [resendApiKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (isRateLimited(req, res, 15, 60000)) return;
    try {
      const { templateName, templateSlug, to, variables } = req.body;
      const template_name = templateName || templateSlug;
      if (!template_name || !to) {
        return res.status(400).json({ error: 'Missing required fields: templateName, to' });
      }
      const templateDoc = await admin.firestore()
        .collection('email_templates')
        .where('template_name', '==', template_name)
        .where('is_active', '==', true)
        .limit(1)
        .get();
      if (templateDoc.empty) {
        return res.status(404).json({ error: `Template not found: ${template_name}` });
      }
      const template = templateDoc.docs[0].data();
      let subject = template.subject || 'Welcome to Kingdom Connects';
      let htmlBody = template.html_body || template.body || '';
      if (variables) {
        Object.keys(variables).forEach(key => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          subject = subject.replace(regex, variables[key]);
          htmlBody = htmlBody.replace(regex, variables[key]);
        });
      }
      const { client, fromEmail } = getResendClient();
      console.log('Sending template email from:', fromEmail, 'to:', to, 'subject:', subject);
      const { data, error } = await client.emails.send({
        from: fromEmail,
        to: to,
        subject: subject,
        html: htmlBody
      });
      if (error) {
        console.error('Resend API error:', JSON.stringify(error));
        return res.status(400).json({ error: 'Email send failed', details: error.message || error });
      }
      console.log('Template email sent successfully:', JSON.stringify(data));
      res.json({ success: true, messageId: data?.id });
    } catch (error) {
      console.error('Error sending email:', error.message, error.stack);
      res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
  });
});

exports.sendEmail = onRequest({ secrets: [resendApiKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      const { user, userData } = await verifyAuth(req);
      checkRole(userData, ['admin', 'platform_admin']);
      const { to, subject, htmlBody, textBody } = req.body;
      if (!to || !subject || (!htmlBody && !textBody)) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const { client, fromEmail } = getResendClient();
      const emailData = { from: fromEmail, to, subject };
      if (htmlBody) emailData.html = htmlBody;
      if (textBody) emailData.text = textBody;
      console.log('Sending custom email to:', to);
      const { data, error } = await client.emails.send(emailData);
      if (error) {
        console.error('Resend API error:', JSON.stringify(error));
        return res.status(400).json({ error: 'Email send failed', details: error.message || error });
      }
      console.log('Custom email sent:', JSON.stringify(data));
      res.json({ success: true, messageId: data?.id });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('Error sending email:', error.message, error.stack);
      res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
  });
});

exports.sendPresentation = onRequest({ secrets: [resendApiKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      const { user, userData } = await verifyAuth(req);
      checkRole(userData, ['admin', 'platform_admin', 'sales_agent']);
      const { role, email, includePresentation, templateId } = req.body;
      console.log('Presentation request:', { role, email, includePresentation, templateId });
      if (!role || !email) {
        console.log('Missing fields - role:', role, 'email:', email);
        return res.status(400).json({ error: 'Missing required fields: role, email' });
      }
      const ROLE_DEFAULTS = {
        sales_agent: {
          subject: 'Earn 20% Commission with Kingdom Connects',
          headline: 'Join Our Sales Team',
          intro: 'Kingdom Connects is looking for motivated sales agents to help grow our faith-based business directory.',
          highlights: ['Earn 20% commission on all sales', 'Flexible work schedule', 'Make a difference in your community', 'Support Christian businesses']
        },
        church_admin: {
          subject: 'Strengthen Your Ministry Through Kingdom Partnerships',
          headline: 'Partner With Us to Build God\'s Kingdom',
          intro: 'Kingdom Connects creates a powerful connection between your church and the Christian business owners in your congregation. When these businesses thrive, your ministry thrives—because every Pro subscription from an affiliated business tithes 10% directly back to your church.',
          highlights: [
            '<strong>Receive 10% Tithe</strong> from every Pro business subscription affiliated with your church—ongoing, passive support for your ministry',
            '<strong>Help Your Business Owners Flourish</strong>—as they grow, they\'re empowered to give more generously to your church and community',
            '<strong>Guide Your Members</strong> to trusted, faith-aligned businesses they can support with confidence',
            '<strong>Free Church Listing Page</strong>—showcase your service times, address, and mission, or direct visitors straight to your website',
            '<strong>Zero Cost to Join</strong>—register your church today and start building Kingdom connections'
          ]
        },
        business_owner: {
          subject: 'Grow Your Business with Kingdom Connects',
          headline: 'Reach Faith-Based Customers',
          intro: 'Kingdom Connects is the premier directory for Christian businesses.',
          highlights: ['Connect with local churches', 'Reach faith-based customers', 'Support your community', 'Affordable listing options']
        },
        member: {
          subject: 'Welcome to Kingdom Connects',
          headline: 'Find Trusted Christian Businesses',
          intro: 'Kingdom Connects helps you find and support local Christian businesses.',
          highlights: ['Find trusted services', 'Support local businesses', 'Connect with your community', 'Share your favorites']
        }
      };
      const template = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.member;
      const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}h1{color:#1e4e9a}.highlights{background:#f5f5f5;padding:20px;border-radius:8px;margin:20px 0}.highlights li{margin:10px 0}.cta{text-align:center;margin:30px 0}.btn{display:inline-block;background:#c9a227;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;font-weight:bold}</style></head><body><h1>${template.headline}</h1><p>${template.intro}</p><div class="highlights"><ul>${template.highlights.map(h => `<li>${h}</li>`).join('')}</ul></div><div class="cta"><a href="https://kingdomconnects.org" class="btn">Learn More</a></div><p>Best regards,<br>The Kingdom Connects Team</p></body></html>`;
      const { client, fromEmail } = getResendClient();
      console.log('Sending presentation email from:', fromEmail, 'to:', email);
      const { data, error } = await client.emails.send({
        from: fromEmail,
        to: email,
        subject: template.subject,
        html: htmlBody
      });
      if (error) {
        console.error('Resend API error for presentation:', JSON.stringify(error));
        return res.status(400).json({ error: 'Email send failed', details: error.message || error });
      }
      console.log('Presentation email sent successfully:', JSON.stringify(data));
      res.json({ success: true, messageId: data?.id });
    } catch (error) {
      console.error('Error sending presentation:', error.message, error.stack);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Failed to send presentation', details: error.message });
    }
  });
});

exports.presentationPreview = onRequest((req, res) => {
  cors(req, res, async () => {
    // Parse role from path (/api/presentations/preview/church_admin) or query param
    const pathParts = req.path.split('/').filter(p => p);
    const roleFromPath = pathParts[pathParts.length - 1];
    const role = (roleFromPath && roleFromPath !== 'preview') ? roleFromPath : (req.query.role || 'sales_agent');
    const PRESENTATIONS = {
      sales_agent: {
        title: 'Kingdom Connects Sales Opportunity',
        slides: [
          { title: 'Join Our Team', content: 'Earn 20% commission connecting Christian businesses with their community' },
          { title: 'Your Potential', content: 'Flexible schedule, meaningful work, unlimited earning potential' },
          { title: 'Get Started', content: 'Sign up today and start earning immediately' }
        ]
      },
      church_admin: {
        title: 'Kingdom Connects Church Partnership',
        slides: [
          { title: 'Receive 10% Tithe', content: 'Every Pro business affiliated with your church tithes 10% of their subscription directly to your ministry—ongoing, passive support' },
          { title: 'Help Businesses Grow', content: 'When the Christian businesses in your congregation flourish, they\'re able to give more generously to your church and community' },
          { title: 'Guide Your Members', content: 'Help your congregation find trusted, faith-based businesses to support with their purchases' },
          { title: 'Free Church Listing', content: 'Get a beautiful listing page with your service times, address, and mission—or direct visitors to your website' },
          { title: 'Join Free Today', content: 'Zero cost to register. Start building Kingdom connections now.' }
        ]
      },
      business_owner: {
        title: 'Kingdom Connects Business Listing',
        slides: [
          { title: 'Reach Your Audience', content: 'Connect with faith-based customers actively seeking Christian businesses' },
          { title: 'Support Churches', content: 'Tithe a portion to your chosen church partner' },
          { title: 'Get Listed', content: 'Affordable plans starting at just $29/month' }
        ]
      },
      member: {
        title: 'Welcome to Kingdom Connects',
        slides: [
          { title: 'Find Trusted Services', content: 'Discover Christian-owned businesses in your area' },
          { title: 'Support Your Community', content: 'Your patronage supports local churches' },
          { title: 'Join Today', content: 'Free membership for individuals' }
        ]
      }
    };
    const presentation = PRESENTATIONS[role] || PRESENTATIONS.sales_agent;
    
    // Return JSON for client-side rendering
    const template = {
      title: presentation.title,
      slides: presentation.slides.map(s => ({
        type: s.type || 'content',
        title: s.title,
        subtitle: s.subtitle || '',
        bullets: s.content ? [s.content] : (s.bullets || []),
        message: s.message || s.content || ''
      }))
    };
    
    res.set('Content-Type', 'application/json');
    res.json({ template });
  });
});

const widgetJwtSecret = defineSecret('WIDGET_JWT_SECRET');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');

function getStripeClient() {
  const secretKey = stripeSecretKey.value();
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia'
  });
}

// Staged integration: enabling this requires a verified QR Gear deployment contract.
// A platform setting and the parent's permission must BOTH permit a store.
exports.generateQrGearToken = onRequest({ secrets: [widgetJwtSecret] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
    try {
      const { user, userData } = await verifyAuth(req);
      const { entityType, entityId } = hierarchyPolicy.entityIdentity(req.body.entityType, req.body.entityId);
      const db = admin.firestore();
      const collection = { member: 'users', church: 'churches', business: 'business_listings_public' }[entityType];
      const entityDoc = await db.collection(collection).doc(entityId).get();
      if (!entityDoc.exists) return res.status(404).json({ error: 'Record not found.' });
      const entity = entityDoc.data();
      let ownerUid = entityType === 'member' ? entityId : entity.admin_uid;
      if (entityType === 'business') {
        const owner = await db.collection('business_listings_private').doc(entityId).get();
        ownerUid = owner.data()?.owner_uid;
      }
      if (ownerUid !== user.uid && !hierarchyPolicy.isAdmin(userData)) return res.status(403).json({ error: 'You do not own this store.' });
      const churchId = entityType === 'member' ? entity.home_church_id : entity.church_id;
      const church = churchId ? (await db.collection('churches').doc(churchId).get()).data() : null;
      // Deliberately disabled until the three-group integration is tested end to end.
      hierarchyPolicy.assertStoreAllowed({ type: entityType, entity, church, settings: { enabled: false } });
      const identity = hierarchyPolicy.entityIdentity(entityType, entityId);
      const returnUrl = entityType === 'member'
        ? 'https://kingdomconnects.org/member/index'
        : `https://kingdomconnects.org/${entityType}?id=${encodeURIComponent(entityId)}`;
      const payload = { ...identity, partnerId: 'kingdom-connects',
        storeId: `${entityType}:${entityId}`, target: { channelId: identity.channelId },
        entityName: entity.business_name || entity.church_name || entity.display_name || entity.name || '',
        entityLogoUrl: entity.logo_url || entity.profile_photo_url || null,
        mode: 'public', viewType: 'channel_products', placement: 'profile', returnUrl,
        capabilities: { canCreate: false, canManage: false } };
      const token = jwt.sign(payload, widgetJwtSecret.value(), { expiresIn: '10m' });
      res.set('Cache-Control', 'no-store');
      res.json({ token, expiresIn: 600, storeId: payload.storeId, channelId: payload.channelId });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to prepare store access.' });
    }
  });
});

exports.createCheckoutSession = onRequest({ secrets: [stripeSecretKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { user } = await verifyAuth(req);
      const { priceId, successUrl, cancelUrl, businessId, billingCycle } = req.body;
      
      if (businessId) {
        hierarchyPolicy.entityIdentity('business', businessId);
        const ownership = await admin.firestore().collection('business_listings_private').doc(businessId).get();
        if (ownership.data()?.owner_uid !== user.uid) return res.status(403).json({ error: 'You do not own this business.' });
      }
      const stripe = getStripeClient();
      
      const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
      const userData = userDoc.data();
      let customerId = userData?.stripeCustomerId;
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { firebaseUid: user.uid }
        });
        customerId = customer.id;
        await admin.firestore().collection('users').doc(user.uid).update({
          stripeCustomerId: customerId
        });
      }
      
      // Pro Business checkout with dynamic pricing (businessId + billingCycle)
      if (businessId && billingCycle) {
        if (!['monthly', 'annual'].includes(billingCycle)) {
          return res.status(400).json({ error: 'billingCycle must be "monthly" or "annual"' });
        }
        
        const pricingDoc = await admin.firestore().doc('pricing_settings/default').get();
        const pricing = pricingDoc.exists ? pricingDoc.data() : {};
        const monthlyPrice = pricing.monthly_price || 8.99;
        const annualPrice = pricing.annual_price || 74.99;
        const trialDays = pricing.free_trial_days || 30;
        
        const isMonthly = billingCycle === 'monthly';
        const priceAmount = isMonthly ? Math.round(monthlyPrice * 100) : Math.round(annualPrice * 100);
        
        const priceData = {
          currency: 'usd',
          product_data: {
            name: isMonthly ? 'Kingdom Connects Pro (Monthly)' : 'Kingdom Connects Pro (Annual)',
            description: isMonthly 
              ? 'Pro business listing with premium features - billed monthly'
              : 'Pro business listing with premium features - billed annually + FREE swag!'
          },
          unit_amount: priceAmount,
          recurring: { interval: isMonthly ? 'month' : 'year' }
        };
        
        const sessionConfig = {
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price_data: priceData, quantity: 1 }],
          mode: 'subscription',
          success_url: `https://kingdomconnects.org/thank_you_pro?billing=${billingCycle}&business_id=${businessId}`,
          cancel_url: `https://kingdomconnects.org/business-admin/index.html?pro_cancelled=true`,
          metadata: {
            businessId: businessId,
            billingCycle: billingCycle,
            type: 'pro_subscription'
          }
        };
        
        if (isMonthly && trialDays > 0) {
          sessionConfig.subscription_data = {
            trial_period_days: trialDays,
            metadata: { businessId, billingCycle }
          };
        } else {
          sessionConfig.subscription_data = {
            metadata: { businessId, billingCycle }
          };
        }
        
        const session = await stripe.checkout.sessions.create(sessionConfig);
        
        await admin.firestore().collection('business_listings_public').doc(businessId).update({
          listing_status: 'pending_payment',
          stripe_checkout_session_id: session.id
        });
        
        return res.json({ url: session.url, sessionId: session.id });
      }
      
      // Standard checkout with pre-configured priceId
      if (!priceId) {
        return res.status(400).json({ error: 'Missing priceId or businessId+billingCycle' });
      }
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: successUrl || 'https://kingdomconnects.org/dashboard.htm?payment=success',
        cancel_url: cancelUrl || 'https://kingdomconnects.org/pricing.htm?payment=cancelled'
      });
      
      res.json({ url: session.url, sessionId: session.id });
      
    } catch (error) {
      console.error('Checkout error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });
});

// One-time or recurring donation checkout (no auth required)
exports.createDonationSession = onRequest({ secrets: [stripeSecretKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { amount, successUrl, cancelUrl, email, recurring } = req.body;
      
      // Amount in cents, minimum $5
      const donationAmount = Math.max(500, parseInt(amount) || 1000);
      
      const stripe = getStripeClient();
      
      const priceData = {
        currency: 'usd',
        product_data: {
          name: recurring ? 'Kingdom Connects Monthly Support' : 'Kingdom Connects Donation',
          description: 'Support faith-aligned commerce and ministry tithing'
        },
        unit_amount: donationAmount
      };
      
      if (recurring) {
        priceData.recurring = { interval: 'month' };
      }
      
      const sessionConfig = {
        payment_method_types: ['card'],
        line_items: [{
          price_data: priceData,
          quantity: 1
        }],
        mode: recurring ? 'subscription' : 'payment',
        success_url: successUrl || 'https://kingdomconnects.org/?donation=success',
        cancel_url: cancelUrl || 'https://kingdomconnects.org/?donation=cancelled'
      };
      
      if (email) {
        sessionConfig.customer_email = email;
      }
      
      const session = await stripe.checkout.sessions.create(sessionConfig);
      
      res.json({ url: session.url, sessionId: session.id });
      
    } catch (error) {
      console.error('Donation checkout error:', error);
      res.status(500).json({ error: 'Failed to create donation session' });
    }
  });
});

exports.createPortalSession = onRequest({ secrets: [stripeSecretKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { user } = await verifyAuth(req);
      const { returnUrl } = req.body;
      
      const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
      const userData = userDoc.data();
      
      if (!userData?.stripeCustomerId) {
        return res.status(400).json({ error: 'No Stripe customer found' });
      }
      
      const stripe = getStripeClient();
      const session = await stripe.billingPortal.sessions.create({
        customer: userData.stripeCustomerId,
        return_url: returnUrl || 'https://kingdomconnects.org/dashboard.htm'
      });
      
      res.json({ url: session.url });
      
    } catch (error) {
      console.error('Portal error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });
});

exports.stripeWebhook = onRequest({ secrets: [stripeWebhookSecret, stripeSecretKey, resendApiKey] }, (req, res) => {
  const rawBody = req.rawBody;
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature' });
  }
  
  (async () => {
    try {
      const stripe = getStripeClient();
      const webhookSecret = stripeWebhookSecret.value();
      
      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET not configured');
      }
      
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
      
      console.log('Stripe webhook event:', event.type);
      
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          
          const usersRef = admin.firestore().collection('users');
          const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
          
          if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            await userDoc.ref.update({
              stripeSubscriptionId: subscription.id,
              subscription_status: subscription.status,
              subscription_plan: subscription.items?.data?.[0]?.price?.id || null
            });
          }
          break;
        }
        
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          
          const usersRef = admin.firestore().collection('users');
          const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
          
          if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            await userDoc.ref.update({
              subscription_status: 'cancelled',
              stripeSubscriptionId: null,
              subscription_plan: null
            });
          }
          break;
        }
        
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          console.log('Payment succeeded for invoice:', invoice.id);
          
          // Track tithe for Pro subscriptions
          if (invoice.subscription && invoice.amount_paid > 0) {
            const customerId = invoice.customer;
            const amountPaid = invoice.amount_paid / 100; // Convert cents to dollars
            const titheAmount = amountPaid * 0.10; // 10% tithe
            
            try {
              // Find the business by Stripe customer ID
              const businessRef = admin.firestore().collection('business_listings_public');
              const bizSnapshot = await businessRef.where('stripe_customer_id', '==', customerId).get();
              
              let churchId = null;
              let businessId = null;
              let businessName = null;
              
              if (!bizSnapshot.empty) {
                const bizDoc = bizSnapshot.docs[0];
                const bizData = bizDoc.data();
                businessId = bizDoc.id;
                businessName = bizData.business_name || 'Unknown Business';
                churchId = bizData.church_id || null;
              }
              
              // Record tithe payment
              await admin.firestore().collection('tithes').add({
                invoice_id: invoice.id,
                stripe_customer_id: customerId,
                business_id: businessId,
                business_name: businessName,
                church_id: churchId, // null = common fund
                amount_paid: amountPaid,
                tithe_amount: titheAmount,
                destination: churchId ? 'church' : 'common_fund',
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                period_start: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
                period_end: invoice.period_end ? new Date(invoice.period_end * 1000) : null
              });
              
              console.log(`✅ Tithe recorded: $${titheAmount.toFixed(2)} → ${churchId ? `Church ${churchId}` : 'Common Fund'}`);
              
              // Update church tithe totals if applicable
              if (churchId) {
                const churchRef = admin.firestore().collection('churches').doc(churchId);
                await churchRef.update({
                  total_tithe_received: admin.firestore.FieldValue.increment(titheAmount),
                  last_tithe_date: admin.firestore.FieldValue.serverTimestamp()
                });
              }
              
            } catch (titheError) {
              console.error('Error recording tithe:', titheError);
              // Don't fail the webhook for tithe errors
            }
          }
          break;
        }
        
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          console.log('Payment failed for invoice:', invoice.id);
          break;
        }
        
        case 'checkout.session.completed': {
          const session = event.data.object;
          
          // Check if this is a Pro subscription
          const isProSubscription = session.metadata?.type === 'pro_subscription';
          
          if (isProSubscription) {
            const businessId = session.metadata?.businessId;
            const billingCycle = session.metadata?.billingCycle;
            
            if (businessId) {
              try {
                // Get the business document
                const businessRef = admin.firestore().collection('business_listings_public').doc(businessId);
                const businessDoc = await businessRef.get();
                
                if (businessDoc.exists) {
                  const businessData = businessDoc.data();
                  const churchId = businessData.church_id;
                  const church = churchId ? (await admin.firestore().collection('churches').doc(churchId).get()).data() : null;
                  const approvalState = hierarchyPolicy.businessState(businessData, church);
                  const autoApprove = approvalState.is_visible;

                  // Calculate trial dates for monthly subscriptions
                  const now = new Date();
                  const isMonthly = billingCycle === 'monthly';
                  
                  // Get trial days from pricing settings
                  const pricingDoc = await admin.firestore().doc('pricing_settings/default').get();
                  const trialDays = pricingDoc.exists ? (pricingDoc.data().free_trial_days || 30) : 30;
                  
                  const trialEndDate = isMonthly 
                    ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
                    : null;
                  
                  const updateData = {
                    stripe_subscription_id: session.subscription,
                    stripe_customer_id: session.customer,
                    is_pro: true,
                    pro_status: 'pro',
                    subscription_tier: 'pro',
                    billing_cycle: billingCycle,
                    pro_activated_at: admin.firestore.FieldValue.serverTimestamp(),
                    trial_start_date: isMonthly ? now : null,
                    trial_end_date: trialEndDate
                  };
                  
                  // Re-read inside a transaction: checkout must not undo a concurrent suspension.
                  await admin.firestore().runTransaction(async tx => {
                    const latest = await tx.get(businessRef);
                    const parentId = latest.data().church_id;
                    const parent = parentId ? await tx.get(admin.firestore().collection('churches').doc(parentId)) : null;
                    tx.update(businessRef, { ...updateData, ...hierarchyPolicy.businessState(latest.data(), parent?.data()) });
                  });

                  console.log(`✅ Pro subscription activated for business ${businessId}, auto_approve: ${autoApprove}`);
                  
                  // Send confirmation email
                  const ownerEmail = businessData.email;
                  if (ownerEmail) {
                    const { client, fromEmail } = getResendClient();
                    
                    const statusMessage = autoApprove 
                      ? 'Your Pro business listing is now live! Visit your dashboard to manage your listing.'
                      : 'Your payment has been received. Your listing still requires its outstanding church or platform approval. You\'ll receive an email once your listing is live.';
                    
                    const proWelcomeHtml = `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                          <h1 style="color: #d4af37; margin: 0;">Welcome to Pro!</h1>
                        </div>
                        
                        <p style="font-size: 16px; line-height: 1.6;">
                          Thank you for upgrading <strong>${businessData.business_name}</strong> to Kingdom Connects Pro!
                        </p>
                        
                        <p style="font-size: 16px; line-height: 1.6;">
                          ${statusMessage}
                        </p>
                        
                        <p style="font-size: 16px; line-height: 1.6;">
                          <strong>Your Pro benefits include:</strong>
                        </p>
                        <ul style="font-size: 16px; line-height: 1.8;">
                          <li>Featured placement in search results</li>
                          <li>Up to 5 business categories</li>
                          <li>Photo gallery and custom page</li>
                          <li>10% of your subscription tithes to your church</li>
                        </ul>
                        
                        ${autoApprove ? `
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="https://kingdomconnects.org/business-admin/index.html" style="background: linear-gradient(135deg, #d4af37, #f5d76e); color: #1a1a2e; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Go to Your Dashboard</a>
                        </div>
                        ` : ''}
                        
                        <p style="font-size: 16px; line-height: 1.6;">
                          With gratitude,<br>
                          <strong>The Kingdom Connects Team</strong>
                        </p>
                      </div>
                    `;
                    
                    await client.emails.send({
                      from: fromEmail,
                      to: ownerEmail,
                      subject: autoApprove ? 'Your Pro Listing is Live!' : 'Pro Payment Received - Pending Approval',
                      html: proWelcomeHtml
                    });
                    
                    console.log(`✅ Pro welcome email sent to ${ownerEmail}`);
                  }
                }
              } catch (proError) {
                console.error('Error processing Pro subscription:', proError);
              }
            }
            break;
          }
          
          // Donation handling (original logic)
          const isDonation = session.metadata?.type === 'donation' || 
            (session.mode === 'payment' && !session.customer) ||
            (session.mode === 'subscription' && !session.customer);
          
          // Check if this looks like a donation by product name
          const productName = session.line_items?.data?.[0]?.description || '';
          const looksLikeDonation = productName.includes('Donation') || productName.includes('Monthly Support');
          
          if (isDonation || looksLikeDonation) {
            const email = session.customer_email || session.customer_details?.email;
            const amount = (session.amount_total || 0) / 100;
            const isRecurring = session.mode === 'subscription';
            
            if (email && amount > 0) {
              try {
                const { client, fromEmail } = getResendClient();
                
                const thankYouHtml = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                      <h1 style="color: #d4af37; margin: 0;">Thank You!</h1>
                    </div>
                    
                    <p style="font-size: 16px; line-height: 1.6;">
                      Your generous ${isRecurring ? 'monthly' : ''} donation of <strong>$${amount.toFixed(2)}</strong> to Kingdom Connects has been received.
                    </p>
                    
                    <p style="font-size: 16px; line-height: 1.6;">
                      Your support helps us connect churches and Christian businesses across the nation, building sustainable Kingdom commerce and funding ministry outreach.
                    </p>
                    
                    ${isRecurring ? `
                    <p style="font-size: 14px; color: #666; line-height: 1.6;">
                      As a monthly supporter, your card will be charged automatically each month. You can cancel anytime using the link in your Stripe receipt.
                    </p>
                    ` : ''}
                    
                    <p style="font-size: 16px; line-height: 1.6;">
                      May God bless you abundantly for your generosity!
                    </p>
                    
                    <p style="font-size: 16px; line-height: 1.6;">
                      With gratitude,<br>
                      <strong>The Kingdom Connects Team</strong>
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    
                    <p style="font-size: 12px; color: #999; text-align: center;">
                      Kingdom Connects is operated by Fluba Designs LLC.<br>
                      Donations are not tax-deductible as charitable contributions.
                    </p>
                  </div>
                `;
                
                await client.emails.send({
                  from: fromEmail,
                  to: email,
                  subject: `Thank you for your ${isRecurring ? 'monthly ' : ''}donation to Kingdom Connects!`,
                  html: thankYouHtml
                });
                
                console.log(`✅ Donation thank-you email sent to ${email} for $${amount}`);
                
                // Log to Firestore
                await admin.firestore().collection('donations').add({
                  email: email,
                  amount: amount,
                  recurring: isRecurring,
                  stripe_session_id: session.id,
                  thank_you_sent: true,
                  created_at: admin.firestore.FieldValue.serverTimestamp()
                });
                
              } catch (emailError) {
                console.error('Error sending donation thank-you email:', emailError);
              }
            }
          }
          break;
        }
      }
      
      res.json({ received: true });
      
    } catch (error) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  })();
});

exports.getProducts = onRequest({ secrets: [stripeSecretKey] }, (req, res) => {
  cors(req, res, async () => {
    try {
      const stripe = getStripeClient();
      
      const products = await stripe.products.list({
        active: true,
        expand: ['data.default_price']
      });
      
      const productsWithPrices = await Promise.all(
        products.data.map(async (product) => {
          const prices = await stripe.prices.list({
            product: product.id,
            active: true
          });
          return { ...product, prices: prices.data };
        })
      );
      
      res.json({ products: productsWithPrices });
      
    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });
});

exports.sendVerificationEmail = onRequest({ secrets: [resendApiKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { user, userData } = await verifyAuth(req);
      
      const verificationLink = await admin.auth().generateEmailVerificationLink(user.email, {
        url: 'https://kingdom-commerce.web.app/member/?verified=true'
      });
      
      const displayName = userData.display_name || user.email.split('@')[0];
      
      const { client, fromEmail } = getResendClient();
      
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background-color: #1a1a2e; color: #ffffff; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 30px; border: 1px solid #c9a227;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #c9a227; margin: 0; font-size: 24px;">Kingdom Connects</h1>
    </div>
    
    <h2 style="color: #ffffff; margin-bottom: 16px;">Verify Your Email, ${displayName}</h2>
    
    <p style="color: #cccccc; line-height: 1.6; margin-bottom: 24px;">
      Thank you for joining Kingdom Connects! Please verify your email address to unlock all member features and complete your profile.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationLink}" style="display: inline-block; background: linear-gradient(135deg, #c9a227 0%, #8b7355 100%); color: #1a1a2e; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
        Verify My Email
      </a>
    </div>
    
    <p style="color: #888888; font-size: 14px; line-height: 1.6;">
      If you didn't create an account with Kingdom Connects, you can safely ignore this email.
    </p>
    
    <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;">
    
    <p style="color: #666666; font-size: 12px; text-align: center;">
      Kingdom Connects - Building Christian Commerce Together<br>
      <a href="https://kingdomconnects.org" style="color: #c9a227;">kingdomconnects.org</a>
    </p>
  </div>
</body>
</html>`;

      const { data, error } = await client.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Verify Your Email - Kingdom Connects',
        html: htmlBody
      });
      
      if (error) {
        console.error('Resend API error:', JSON.stringify(error));
        return res.status(400).json({ error: 'Email send failed', details: error.message || error });
      }
      
      console.log('Verification email sent to:', user.email, 'messageId:', data?.id);
      res.json({ success: true, messageId: data?.id });
      
    } catch (error) {
      console.error('Send verification email error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Failed to send verification email', details: error.message });
    }
  });
});

// Send Pro welcome email (different content for annual vs monthly)
exports.sendProWelcomeEmail = onRequest({ secrets: [resendApiKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { user, userData } = await verifyAuth(req);
      const { businessId, billingCycle } = req.body;
      
      if (!businessId) {
        return res.status(400).json({ error: 'Missing businessId' });
      }
      
      // Get business details
      const businessDoc = await admin.firestore().collection('business_listings_public').doc(businessId).get();
      if (!businessDoc.exists) {
        return res.status(404).json({ error: 'Business not found' });
      }
      
      const business = businessDoc.data();
      const businessName = business.business_name || 'Your Business';
      const displayName = userData.display_name || user.email.split('@')[0];
      const isAnnual = billingCycle === 'annual';
      
      const { client, fromEmail } = getResendClient();
      
      // Different content for annual vs monthly
      const swagSection = isAnnual ? `
        <div style="background: linear-gradient(135deg, #c9a227 0%, #8b7355 100%); padding: 20px; border-radius: 8px; margin: 24px 0;">
          <h3 style="color: #1a1a2e; margin: 0 0 12px 0;">FREE Swag Coming Your Way!</h3>
          <p style="color: #1a1a2e; margin: 0; line-height: 1.6;">
            As an annual member, you get a FREE Kingdom Connects t-shirt and baseball cap! 
            <strong>Reply to this email</strong> with your preferred size (S/M/L/XL/2XL) and cap color preference (black or navy), 
            and we'll ship your merchandise to your business address.
          </p>
        </div>
      ` : `
        <div style="background: rgba(201, 162, 39, 0.1); border: 1px solid #c9a227; padding: 20px; border-radius: 8px; margin: 24px 0;">
          <h3 style="color: #c9a227; margin: 0 0 12px 0;">Your 30-Day Free Trial Has Started</h3>
          <p style="color: #cccccc; margin: 0; line-height: 1.6;">
            Enjoy all Pro features free for 30 days. We'll send you a reminder email 3 days before your first charge. 
            You can cancel anytime from your dashboard if Pro isn't right for you.
          </p>
        </div>
      `;
      
      const subject = isAnnual 
        ? `Welcome to Pro, ${displayName}! Your swag is waiting`
        : `Welcome to Pro, ${displayName}! Your 30-day trial has started`;
      
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background-color: #1a1a2e; color: #ffffff; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 30px; border: 1px solid #c9a227;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #c9a227; margin: 0; font-size: 24px;">Kingdom Connects</h1>
    </div>
    
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 48px; color: #c9a227;">★</span>
    </div>
    
    <h2 style="color: #ffffff; margin-bottom: 16px; text-align: center;">Welcome to Business Pro!</h2>
    
    <p style="color: #cccccc; line-height: 1.6; margin-bottom: 16px;">
      Congratulations, ${displayName}! Your business <strong style="color: #c9a227;">${businessName}</strong> is now a Pro member of Kingdom Connects.
    </p>
    
    ${swagSection}
    
    <h3 style="color: #c9a227; margin-top: 32px;">Your Pro Features Include:</h3>
    <ul style="color: #cccccc; line-height: 1.8; padding-left: 20px;">
      <li>Featured placement in search results</li>
      <li>Photo gallery and video showcase</li>
      <li>Promotions and special offers</li>
      <li>Products & services showcase</li>
      <li>Customer testimonials display</li>
      <li>Respond to customer reviews</li>
      <li>QR code for offline marketing</li>
      <li>Analytics and insights</li>
    </ul>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://kingdomconnects.org/business-admin/" style="display: inline-block; background: linear-gradient(135deg, #c9a227 0%, #8b7355 100%); color: #1a1a2e; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
        Go to Your Dashboard
      </a>
    </div>
    
    <p style="color: #cccccc; line-height: 1.6;">
      Thank you for supporting Christian commerce. 10% of your Pro subscription goes directly to supporting churches and ministries.
    </p>
    
    <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;">
    
    <p style="color: #666666; font-size: 12px; text-align: center;">
      Kingdom Connects - Building Christian Commerce Together<br>
      <a href="https://kingdomconnects.org" style="color: #c9a227;">kingdomconnects.org</a>
    </p>
  </div>
</body>
</html>`;

      const { data, error } = await client.emails.send({
        from: fromEmail,
        to: user.email,
        subject: subject,
        html: htmlBody
      });
      
      if (error) {
        console.error('Resend API error:', JSON.stringify(error));
        return res.status(400).json({ error: 'Email send failed', details: error.message || error });
      }
      
      // Mark that welcome email was sent
      await admin.firestore().collection('business_listings_public').doc(businessId).update({
        pro_welcome_email_sent: true,
        pro_welcome_email_sent_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('Pro welcome email sent to:', user.email, 'billing:', billingCycle, 'messageId:', data?.id);
      res.json({ success: true, messageId: data?.id });
      
    } catch (error) {
      console.error('Send pro welcome email error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Failed to send pro welcome email', details: error.message });
    }
  });
});

exports.updateProductPrice = onRequest({ secrets: [stripeSecretKey] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      await verifyAuth(req);
      const { productId, newPriceAmount, oldPriceId } = req.body;
      
      if (!productId || !newPriceAmount) {
        return res.status(400).json({ error: 'Missing productId or newPriceAmount' });
      }
      
      const stripe = getStripeClient();
      
      const newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: Math.round(newPriceAmount * 100),
        currency: 'usd',
        recurring: { interval: 'month' }
      });
      
      await stripe.products.update(productId, {
        default_price: newPrice.id
      });
      
      if (oldPriceId) {
        await stripe.prices.update(oldPriceId, { active: false });
      }
      
      res.json({ 
        success: true, 
        newPriceId: newPrice.id,
        amount: newPriceAmount
      });
      
    } catch (error) {
      console.error('Update price error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Failed to update price' });
    }
  });
});

// Admin: Delete User from Firebase Auth
exports.deleteUser = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { user, userData } = await verifyAuth(req);
      checkRole(userData, ['platform_admin', 'admin']);
      
      // Get userId from URL path or body
      const urlParts = req.path.split('/');
      const userId = urlParts[urlParts.length - 1] || req.body.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }
      
      // Prevent self-deletion
      if (userId === user.uid) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      
      // Delete from Firebase Auth
      await admin.auth().deleteUser(userId);
      console.log('Deleted user from Firebase Auth:', userId);
      
      res.json({ success: true, message: 'User deleted from Firebase Auth' });
      
    } catch (error) {
      console.error('Delete user error:', error);
      if (error.code === 'auth/user-not-found') {
        return res.json({ success: true, message: 'User not found in Auth (already deleted)' });
      }
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Failed to delete user', details: error.message });
    }
  });
});

// ── Brain Connector (Fluba) ───────────────────────────────────
const brain = require('./brain');
exports.brainProxy  = brain.brainProxy;
exports.brainStatus = brain.brainStatus;
exports.brainHealth = brain.brainHealth;

// ── SSR Pages (Business & Church profiles) ────────────────────
const ssr = require('./ssr');
exports.businessProfile = ssr.businessProfile;
exports.churchProfile   = ssr.churchProfile;

// ── Submission Notifications ──────────────────────────────────
const submissions = require('./submissions');
exports.notifyAdminNewSubmission           = submissions.notifyAdminNewSubmission;
exports.sendBusinessSubmissionConfirmation = submissions.sendBusinessSubmissionConfirmation;

// ── Sitemap + Slug Lookup ─────────────────────────────────────
const sitemap = require('./sitemap');
exports.sitemapXml  = sitemap.sitemapXml;
exports.slugLookup  = sitemap.slugLookup;
exports.pingSitemap = sitemap.pingSitemap;

