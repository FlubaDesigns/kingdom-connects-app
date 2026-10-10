// Script to create default email templates in Firestore
// Run once to populate the email_templates collection

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const defaultTemplates = [
  {
    slug: 'church_approved',
    name: 'Church Approval Welcome',
    category: 'approval',
    subject: 'Welcome to Kingdom Connects! Your Church Has Been Approved',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Congratulations!</h2>
        <p>Hello {{recipient_name}},</p>
        <p>Great news! Your church listing for <strong>{{church_name}}</strong> has been approved and is now live on Kingdom Connects.</p>
        <p>You can now:</p>
        <ul>
          <li>Manage your church profile</li>
          <li>Add announcements and events</li>
          <li>Upload photos and media</li>
          <li>Connect with local Christian businesses</li>
        </ul>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Go to Your Dashboard</a></p>
        <p>Thank you for joining our mission to build a stronger Christian community!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Congratulations! Your church listing for {{church_name}} has been approved and is now live on Kingdom Connects. Visit your dashboard at {{dashboard_url}} to get started. Thank you for joining our mission!`,
    is_active: true,
    description: 'Sent when a church submission is approved by admin'
  },
  {
    slug: 'business_approved',
    name: 'Business Approval Welcome',
    category: 'approval',
    subject: 'Your Business Listing is Live on Kingdom Connects!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Welcome to Kingdom Connects!</h2>
        <p>Hello,</p>
        <p>Excellent news! Your business listing for <strong>{{business_name}}</strong> has been approved and is now visible to our community of faith-based customers.</p>
        <p>Your free listing includes:</p>
        <ul>
          <li>Business profile with description and contact info</li>
          <li>Customer reviews and ratings</li>
          <li>Searchable directory presence</li>
        </ul>
        <p><strong>Want to grow faster?</strong> Consider upgrading to Pro for enhanced visibility, unlimited photos, and more features - with 10% automatically tithed to support ministry work.</p>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Manage Your Listing</a></p>
        <p>Together, we're building Kingdom commerce!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Welcome to Kingdom Connects! Your business listing for {{business_name}} has been approved and is now live. Manage your listing at {{dashboard_url}}. Consider upgrading to Pro for enhanced features!`,
    is_active: true,
    description: 'Sent when a business submission is approved by admin'
  },
  {
    slug: 'church_rejected',
    name: 'Church Submission Declined',
    category: 'rejection',
    subject: 'Update on Your Kingdom Connects Church Submission',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Update on Your Submission</h2>
        <p>Hello {{recipient_name}},</p>
        <p>Thank you for your interest in listing <strong>{{church_name}}</strong> on Kingdom Connects.</p>
        <p>After review, we're unable to approve your submission at this time. This may be due to:</p>
        <ul>
          <li>Incomplete information</li>
          <li>Duplicate listing</li>
          <li>Not meeting our community guidelines</li>
        </ul>
        <p>If you believe this was in error or would like to resubmit with corrections, please contact us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Thank you for your submission for {{church_name}}. We're unable to approve it at this time. Please contact support@kingdomconnects.org for more information.`,
    is_active: true,
    description: 'Sent when a church submission is rejected by admin'
  },
  {
    slug: 'business_rejected',
    name: 'Business Submission Declined',
    category: 'rejection',
    subject: 'Update on Your Kingdom Connects Business Submission',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Update on Your Submission</h2>
        <p>Hello,</p>
        <p>Thank you for your interest in listing <strong>{{business_name}}</strong> on Kingdom Connects.</p>
        <p>After review, we're unable to approve your submission at this time. This may be due to:</p>
        <ul>
          <li>Business not aligned with Christian values</li>
          <li>Incomplete or inaccurate information</li>
          <li>Duplicate listing</li>
        </ul>
        <p>If you have questions or would like to discuss this decision, please reach out to us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Thank you for your submission for {{business_name}}. We're unable to approve it at this time. Please contact support@kingdomconnects.org if you have questions.`,
    is_active: true,
    description: 'Sent when a business submission is rejected by admin'
  },
  {
    slug: 'pro_upgrade_welcome',
    name: 'Pro Upgrade Welcome',
    category: 'welcome',
    subject: 'Welcome to Kingdom Connects Pro! 🎉',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Welcome to Pro!</h2>
        <p>Hello {{user_name}},</p>
        <p>Thank you for upgrading <strong>{{business_name}}</strong> to Kingdom Connects Pro!</p>
        <p>Your Pro features are now active:</p>
        <ul>
          <li>✓ Featured placement in search results</li>
          <li>✓ Unlimited photos and media</li>
          <li>✓ Up to 3 business subcategories</li>
          <li>✓ Priority customer support</li>
          <li>✓ Detailed analytics</li>
        </ul>
        <p><strong>Making a Kingdom Impact:</strong> 10% of your subscription is automatically tithed to support churches and ministries in our network.</p>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Explore Pro Features</a></p>
        <p>Thank you for investing in Kingdom commerce!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Welcome to Kingdom Connects Pro! Your Pro features for {{business_name}} are now active. 10% of your subscription supports churches and ministries. Visit {{dashboard_url}} to explore all Pro features.`,
    is_active: true,
    description: 'Sent when a business upgrades to Pro subscription'
  },
  {
    slug: 'church_submitted',
    name: 'Church Submission Received',
    category: 'confirmation',
    subject: 'Thank You for Submitting Your Church to Kingdom Connects!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Thank You for Your Submission!</h2>
        <p>Hello {{recipient_name}},</p>
        <p>We've received your submission for <strong>{{church_name}}</strong> and are excited to review it!</p>
        <p><strong>What happens next:</strong></p>
        <ol>
          <li>Our team will review your church information (usually within 24-48 hours)</li>
          <li>We'll verify the details and ensure everything meets our community guidelines</li>
          <li>You'll receive an email notification once your church is approved</li>
          <li>After approval, you can access your Church Admin Dashboard to manage your profile</li>
        </ol>
        <p>Your church listing will include:</p>
        <ul>
          <li>Church profile with service times and contact information</li>
          <li>Announcements and events calendar</li>
          <li>Photo and media galleries</li>
          <li>Connection with local Christian businesses</li>
          <li>10% tithe from Pro business subscriptions at your church</li>
        </ul>
        <p>If you have any questions in the meantime, feel free to contact us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p>Thank you for joining our mission to strengthen the Body of Christ!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Thank you for submitting {{church_name}} to Kingdom Connects! We'll review your submission within 24-48 hours and notify you via email once approved. Questions? Contact support@kingdomconnects.org`,
    is_active: true,
    description: 'Sent immediately when a church is submitted for review'
  },
  {
    slug: 'business_submitted',
    name: 'Business Submission Received',
    category: 'confirmation',
    subject: 'Thank You for Submitting Your Business to Kingdom Connects!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Thank You for Your Submission!</h2>
        <p>Hello,</p>
        <p>We've received your submission for <strong>{{business_name}}</strong> and are excited to add you to our faith-based business directory!</p>
        <p><strong>What happens next:</strong></p>
        <ol>
          <li>Our team will review your business information (usually within 24-48 hours)</li>
          <li>We'll verify that your business aligns with Christian values and meets our guidelines</li>
          <li>You'll receive an email notification once your listing is approved and live</li>
          <li>After approval, you can access your Business Dashboard to enhance your profile</li>
        </ol>
        <p>Your free listing includes:</p>
        <ul>
          <li>Business profile with description and contact information</li>
          <li>Customer reviews and ratings</li>
          <li>Searchable directory presence across the Kingdom Connects network</li>
        </ul>
        <p><strong>Consider upgrading to Pro for:</strong></p>
        <ul>
          <li>Featured placement in search results</li>
          <li>Unlimited photos and media</li>
          <li>Up to 3 business subcategories</li>
          <li>10% automatic tithing to support ministry work</li>
        </ul>
        <p>Questions? Contact us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p>Together, we're building Kingdom commerce!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Thank you for submitting {{business_name}} to Kingdom Connects! We'll review your submission within 24-48 hours and notify you once approved. Consider Pro for enhanced features! Questions? Contact support@kingdomconnects.org`,
    is_active: true,
    description: 'Sent immediately when a business is submitted for review'
  },
  {
    slug: 'member_welcome',
    name: 'Member Welcome Email',
    category: 'welcome',
    subject: 'Welcome to Kingdom Connects!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Welcome to the Kingdom Connects Family!</h2>
        <p>Hello {{user_name}},</p>
        <p>Thank you for creating your Kingdom Connects account! We're excited to have you join our mission to build a stronger Christian community through faith-based commerce.</p>
        <p><strong>As a member, you can:</strong></p>
        <ul>
          <li>Discover local Christian businesses in your area</li>
          <li>Find churches and connect with your faith community</li>
          <li>Save your favorite businesses for easy access</li>
          <li>Write reviews to help other believers make informed choices</li>
          <li>List your own business or church (if applicable)</li>
        </ul>
        <p><strong>Get Started:</strong></p>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Go to Your Dashboard</a></p>
        <p>Explore our directories:</p>
        <ul>
          <li><a href="{{base_url}}/business_directory.html">Christian Business Directory</a></li>
          <li><a href="{{base_url}}/church_directory.html">Church Directory</a></li>
        </ul>
        <p>Have questions? We're here to help at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p>Together, we're building Kingdom commerce!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Welcome to Kingdom Connects, {{user_name}}! As a member, you can discover Christian businesses, find churches, save favorites, and write reviews. Visit your dashboard at {{dashboard_url}} to get started. Questions? Contact support@kingdomconnects.org`,
    is_active: true,
    description: 'Sent when a new member creates their account'
  }
];

async function createTemplates() {
  console.log('Creating default email templates...');
  
  const batch = db.batch();
  
  for (const template of defaultTemplates) {
    // Use slug as document ID to prevent duplicates
    const docRef = db.collection('email_templates').doc(template.slug);
    batch.set(docRef, {
      ...template,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }); // Merge to update existing templates instead of overwriting
    console.log(`- Created/Updated template: ${template.name} (${template.slug})`);
  }
  
  await batch.commit();
  console.log(`\n✓ Successfully created/updated ${defaultTemplates.length} email templates!`);
  process.exit(0);
}

createTemplates().catch(error => {
  console.error('Error creating templates:', error);
  process.exit(1);
});
