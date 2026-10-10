const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

let admin = null;
let authenticateUser = null;
let requireAdmin = null;

function initStripe(firebaseAdmin, authMiddleware, adminMiddleware) {
  admin = firebaseAdmin;
  authenticateUser = authMiddleware;
  requireAdmin = adminMiddleware;
}

async function getStripeCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Stripe credentials not available - Replit connection not configured');
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', 'stripe');
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings || !connectionSettings.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    secret: connectionSettings.settings.secret,
    publishable: connectionSettings.settings.publishable,
    environment: targetEnvironment
  };
}

async function getStripeClient() {
  const creds = await getStripeCredentials();
  return new Stripe(creds.secret, {
    apiVersion: '2024-12-18.acacia'
  });
}

function requireSalesOrAdmin(req, res, next) {
  const allowedRoles = ['sales_agent', 'sales_director', 'marketing_manager', 'admin', 'platform_admin'];
  const userRole = req.userRole;
  
  if (Array.isArray(userRole)) {
    if (!userRole.some(role => allowedRoles.includes(role))) {
      return res.status(403).json({ error: 'Forbidden: Sales agent access required' });
    }
  } else {
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Sales agent access required' });
    }
  }
  next();
}

function requireMarketingOrAdmin(req, res, next) {
  const allowedRoles = ['marketing_manager', 'admin', 'platform_admin'];
  const userRole = req.userRole;
  
  if (Array.isArray(userRole)) {
    if (!userRole.some(role => allowedRoles.includes(role))) {
      return res.status(403).json({ error: 'Forbidden: Marketing manager access required' });
    }
  } else {
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Marketing manager access required' });
    }
  }
  next();
}

router.get('/status', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  try {
    const startTime = Date.now();
    const checks = [];
    
    try {
      const creds = await getStripeCredentials();
      checks.push({
        name: 'stripe-credentials',
        status: 'pass',
        details: `Stripe ${creds.environment} credentials available`,
        evidence: { environment: creds.environment, hasPublishable: !!creds.publishable }
      });
    } catch (err) {
      checks.push({
        name: 'stripe-credentials',
        status: 'fail',
        details: 'Stripe credentials not available: ' + err.message,
        evidence: { error: err.message }
      });
    }
    
    try {
      const stripe = await getStripeClient();
      const balance = await stripe.balance.retrieve();
      checks.push({
        name: 'stripe-api-connection',
        status: 'pass',
        details: 'Stripe API responding',
        evidence: { 
          availableBalance: balance.available.map(b => `${b.amount/100} ${b.currency}`),
          pendingBalance: balance.pending.map(b => `${b.amount/100} ${b.currency}`)
        }
      });
    } catch (err) {
      checks.push({
        name: 'stripe-api-connection',
        status: 'fail',
        details: 'Stripe API error: ' + err.message,
        evidence: { error: err.message }
      });
    }
    
    const salesAgentsSnap = await admin.firestore().collection('users')
      .where('stripe_connect_id', '!=', null)
      .get();
    
    const agentStats = { total: 0, active: 0, pending: 0 };
    salesAgentsSnap.docs.forEach(doc => {
      const data = doc.data();
      agentStats.total++;
      if (data.stripe_connect_status === 'active') agentStats.active++;
      else agentStats.pending++;
    });
    
    checks.push({
      name: 'sales-agent-accounts',
      status: 'pass',
      details: `${agentStats.total} sales agent Stripe accounts`,
      evidence: agentStats
    });
    
    const churchesSnap = await admin.firestore().collection('churches')
      .where('stripe_connect_id', '!=', null)
      .get();
    
    const churchStats = { total: 0, active: 0, pending: 0 };
    churchesSnap.docs.forEach(doc => {
      const data = doc.data();
      churchStats.total++;
      if (data.stripe_connect_status === 'active') churchStats.active++;
      else churchStats.pending++;
    });
    
    checks.push({
      name: 'church-accounts',
      status: 'pass',
      details: `${churchStats.total} church Stripe accounts`,
      evidence: churchStats
    });
    
    const failCount = checks.filter(c => c.status === 'fail').length;
    const status = failCount > 0 ? 'fail' : 'pass';
    
    res.json({
      engine: { id: 'stripe-health', version: '1.0.0' },
      status,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      summary: {
        totalChecks: checks.length,
        passed: checks.filter(c => c.status === 'pass').length,
        failed: failCount
      },
      checks,
      salesAgents: agentStats,
      churches: churchStats
    });
    
  } catch (error) {
    console.error('[STRIPE] Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/create-connect-account', (req, res, next) => authenticateUser(req, res, next), requireMarketingOrAdmin, async (req, res) => {
  try {
    const { userId, email, firstName, lastName } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: 'Missing required fields: userId, email' });
    }

    const stripe = await getStripeClient();

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: email,
      capabilities: {
        transfers: { requested: true }
      },
      business_type: 'individual',
      individual: {
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email
      },
      metadata: {
        user_id: userId,
        platform: 'kingdom_connects',
        role: 'sales_agent'
      }
    });

    await admin.firestore().collection('users').doc(userId).update({
      stripe_connect_id: account.id,
      stripe_connect_status: 'pending',
      stripe_connect_created: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Stripe Connect account created:', account.id, 'for user:', userId);

    res.json({
      success: true,
      accountId: account.id,
      message: 'Stripe Connect account created'
    });

  } catch (error) {
    console.error('Error creating Connect account:', error);
    res.status(500).json({
      error: 'Failed to create Connect account',
      details: error.message
    });
  }
});

router.post('/create-account-session', (req, res, next) => authenticateUser(req, res, next), requireSalesOrAdmin, async (req, res) => {
  try {
    let accountId = req.body.accountId;

    if (!accountId) {
      const userDoc = await admin.firestore().collection('users').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }
      accountId = userDoc.data().stripe_connect_id;
    }

    if (!accountId) {
      return res.status(400).json({ error: 'No Stripe Connect account found for this user' });
    }

    const stripe = await getStripeClient();

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true
          }
        }
      }
    });

    res.json({
      success: true,
      clientSecret: accountSession.client_secret,
      accountId: accountId
    });

  } catch (error) {
    console.error('Error creating account session:', error);
    res.status(500).json({
      error: 'Failed to create account session',
      details: error.message
    });
  }
});

router.get('/publishable-key', async (req, res) => {
  try {
    const creds = await getStripeCredentials();
    
    if (!creds.publishable) {
      throw new Error('Stripe publishable key not found');
    }

    res.json({
      publishableKey: creds.publishable
    });

  } catch (error) {
    console.error('Error getting publishable key:', error);
    res.status(500).json({
      error: 'Failed to get publishable key',
      details: error.message
    });
  }
});

router.get('/account-status', (req, res, next) => authenticateUser(req, res, next), requireSalesOrAdmin, async (req, res) => {
  try {
    const userDoc = await admin.firestore().collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const accountId = userData.stripe_connect_id;

    if (!accountId) {
      return res.json({
        hasAccount: false,
        onboardingComplete: false,
        message: 'No Stripe Connect account'
      });
    }

    const stripe = await getStripeClient();
    const account = await stripe.accounts.retrieve(accountId);

    const onboardingComplete = account.charges_enabled || account.payouts_enabled;

    if (onboardingComplete && userData.stripe_connect_status !== 'active') {
      await admin.firestore().collection('users').doc(req.user.uid).update({
        stripe_connect_status: 'active',
        stripe_connect_completed: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({
      hasAccount: true,
      accountId: accountId,
      onboardingComplete: onboardingComplete,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requirements: account.requirements?.currently_due || [],
      status: onboardingComplete ? 'active' : 'pending'
    });

  } catch (error) {
    console.error('Error checking account status:', error);
    res.status(500).json({
      error: 'Failed to check account status',
      details: error.message
    });
  }
});

router.post('/create-payout', (req, res, next) => authenticateUser(req, res, next), requireMarketingOrAdmin, async (req, res) => {
  try {
    const { userId, amount, description, commissionId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'Missing required fields: userId, amount' });
    }

    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const accountId = userData.stripe_connect_id;

    if (!accountId) {
      return res.status(400).json({ error: 'User has no Stripe Connect account' });
    }

    if (userData.stripe_connect_status !== 'active') {
      return res.status(400).json({ error: 'User has not completed Stripe onboarding' });
    }

    const stripe = await getStripeClient();

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: accountId,
      description: description || 'Kingdom Connects Commission',
      metadata: {
        user_id: userId,
        commission_id: commissionId || '',
        platform: 'kingdom_connects'
      }
    });

    if (commissionId) {
      await admin.firestore().collection('commission_ledger').doc(commissionId).update({
        status: 'paid',
        stripe_transfer_id: transfer.id,
        paid_at: admin.firestore.FieldValue.serverTimestamp(),
        paid_by: req.user.uid
      });
    }

    console.log('Payout created:', transfer.id, 'Amount:', amount, 'To:', userId);

    res.json({
      success: true,
      transferId: transfer.id,
      amount: amount,
      message: 'Payout sent successfully'
    });

  } catch (error) {
    console.error('Error creating payout:', error);
    res.status(500).json({
      error: 'Failed to create payout',
      details: error.message
    });
  }
});

router.get('/dashboard-link', (req, res, next) => authenticateUser(req, res, next), requireSalesOrAdmin, async (req, res) => {
  try {
    const userDoc = await admin.firestore().collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const accountId = userDoc.data().stripe_connect_id;

    if (!accountId) {
      return res.status(400).json({ error: 'No Stripe Connect account found' });
    }

    const stripe = await getStripeClient();
    const loginLink = await stripe.accounts.createLoginLink(accountId);

    res.json({
      success: true,
      url: loginLink.url
    });

  } catch (error) {
    console.error('Error creating dashboard link:', error);
    res.status(500).json({
      error: 'Failed to create dashboard link',
      details: error.message
    });
  }
});

const churchRouter = express.Router();

churchRouter.post('/create-church-account', (req, res, next) => authenticateUser(req, res, next), async (req, res) => {
  try {
    const { church_id, church_name, email } = req.body;

    if (!church_id) {
      return res.status(400).json({ error: 'Missing church_id' });
    }

    const churchDoc = await admin.firestore().collection('churches').doc(church_id).get();
    if (!churchDoc.exists) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const churchData = churchDoc.data();
    if (churchData.contact_email !== req.user.email) {
      return res.status(403).json({ error: 'Not authorized for this church' });
    }

    if (churchData.stripe_connect_id) {
      return res.json({
        success: true,
        account_id: churchData.stripe_connect_id,
        message: 'Existing account found'
      });
    }

    const stripe = await getStripeClient();

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: email || churchData.contact_email,
      business_type: 'non_profit',
      capabilities: {
        transfers: { requested: true }
      },
      business_profile: {
        name: church_name || churchData.church_name,
        mcc: '8661',
        url: churchData.website || undefined
      },
      metadata: {
        church_id: church_id,
        platform: 'kingdom_connects',
        type: 'church_tithe_recipient'
      }
    });

    await admin.firestore().collection('churches').doc(church_id).update({
      stripe_connect_id: account.id,
      stripe_connect_status: 'pending',
      stripe_connect_created: admin.firestore.FieldValue.serverTimestamp(),
      payout_method: 'electronic'
    });

    console.log('Created Stripe Connect account for church:', church_id, account.id);

    res.json({
      success: true,
      account_id: account.id,
      message: 'Stripe Connect account created'
    });

  } catch (error) {
    console.error('Error creating church Stripe account:', error);
    res.status(500).json({
      error: 'Failed to create account',
      details: error.message
    });
  }
});

churchRouter.post('/create-account-session', (req, res, next) => authenticateUser(req, res, next), async (req, res) => {
  try {
    const { account_id } = req.body;

    if (!account_id) {
      return res.status(400).json({ error: 'Missing account_id' });
    }

    const stripe = await getStripeClient();

    const accountSession = await stripe.accountSessions.create({
      account: account_id,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true
          }
        }
      }
    });

    const creds = await getStripeCredentials();

    res.json({
      success: true,
      client_secret: accountSession.client_secret,
      publishable_key: creds.publishable
    });

  } catch (error) {
    console.error('Error creating account session:', error);
    res.status(500).json({
      error: 'Failed to create session',
      details: error.message
    });
  }
});

churchRouter.post('/dashboard-link', (req, res, next) => authenticateUser(req, res, next), async (req, res) => {
  try {
    const { church_id } = req.body;

    if (!church_id) {
      return res.status(400).json({ error: 'Missing church_id' });
    }

    const churchDoc = await admin.firestore().collection('churches').doc(church_id).get();
    if (!churchDoc.exists) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const churchData = churchDoc.data();
    
    if (churchData.contact_email !== req.user.email) {
      return res.status(403).json({ error: 'Not authorized for this church' });
    }

    const accountId = churchData.stripe_connect_id;
    if (!accountId) {
      return res.status(400).json({ error: 'No Stripe Connect account found' });
    }

    const stripe = await getStripeClient();
    const loginLink = await stripe.accounts.createLoginLink(accountId);

    res.json({
      success: true,
      url: loginLink.url
    });

  } catch (error) {
    console.error('Error creating church dashboard link:', error);
    res.status(500).json({
      error: 'Failed to create dashboard link',
      details: error.message
    });
  }
});

churchRouter.post('/church-payout', (req, res, next) => authenticateUser(req, res, next), requireMarketingOrAdmin, async (req, res) => {
  try {
    const { church_id, amount, description, commission_id } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Missing amount' });
    }

    const stripe = await getStripeClient();
    let transferDestination;

    if (church_id) {
      const churchDoc = await admin.firestore().collection('churches').doc(church_id).get();
      if (!churchDoc.exists) {
        return res.status(404).json({ error: 'Church not found' });
      }

      const churchData = churchDoc.data();
      
      if (!churchData.stripe_connect_id) {
        return res.status(400).json({ error: 'Church has no Stripe Connect account' });
      }

      if (churchData.stripe_connect_status !== 'active') {
        return res.status(400).json({ error: 'Church has not completed Stripe onboarding' });
      }

      transferDestination = churchData.stripe_connect_id;
    } else {
      await admin.firestore().collection('kingdom_fund').add({
        amount: amount,
        description: description || 'Tithe from unchurched business',
        commission_id: commission_id || null,
        source: 'unchurched_business_tithe',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        status: 'collected',
        processed_by: req.user.uid
      });

      console.log('Kingdom Fund collection:', amount);

      return res.json({
        success: true,
        destination: 'kingdom_fund',
        amount: amount,
        message: 'Funds added to Kingdom Ministry Fund'
      });
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: transferDestination,
      description: description || 'Kingdom Connects Tithe Payment',
      metadata: {
        church_id: church_id,
        commission_id: commission_id || '',
        platform: 'kingdom_connects',
        type: 'church_tithe'
      }
    });

    if (commission_id) {
      await admin.firestore().collection('commission_ledger').doc(commission_id).update({
        status: 'paid',
        stripe_transfer_id: transfer.id,
        paid_at: admin.firestore.FieldValue.serverTimestamp(),
        paid_by: req.user.uid
      });
    }

    console.log('Church tithe payout:', transfer.id, 'Amount:', amount, 'To:', church_id);

    res.json({
      success: true,
      transfer_id: transfer.id,
      amount: amount,
      message: 'Tithe payment sent successfully'
    });

  } catch (error) {
    console.error('Error creating church payout:', error);
    res.status(500).json({
      error: 'Failed to create payout',
      details: error.message
    });
  }
});

console.log('Stripe router loaded with endpoints:');
console.log('  GET  /api/stripe/status (admin - health check for dashboard)');
console.log('  POST /api/stripe/create-connect-account');
console.log('  POST /api/stripe/create-account-session');
console.log('  GET  /api/stripe/publishable-key');
console.log('  GET  /api/stripe/account-status');
console.log('  POST /api/stripe/create-payout');
console.log('  GET  /api/stripe/dashboard-link');
console.log('  POST /api/stripe-connect/create-church-account');
console.log('  POST /api/stripe-connect/create-account-session');
console.log('  POST /api/stripe-connect/dashboard-link');
console.log('  POST /api/stripe-connect/church-payout');

module.exports = { router, churchRouter, initStripe };
