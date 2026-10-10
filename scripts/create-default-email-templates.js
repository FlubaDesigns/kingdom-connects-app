// Script to create default email templates in Firestore
// Run once to populate the email_templates collection

const admin = require('firebase-admin');

// Use FIREBASE_SERVICE_ACCOUNT secret
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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
  },
  {
    slug: 'member_welcome_approved',
    name: 'Member Welcome - Church Approved',
    category: 'welcome',
    subject: 'Welcome to Kingdom Connects & {{church_name}}!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Congratulations! You're In!</h2>
        <p>Hello {{user_name}},</p>
        <p>Great news! Your Kingdom Connects account has been created and you're now a member of <strong>{{church_name}}</strong>!</p>
        <p><strong>As a member, you can:</strong></p>
        <ul>
          <li>Save and bookmark your favorite Christian businesses</li>
          <li>Write reviews to help fellow believers</li>
          <li>Get personalized recommendations in your "For You" section</li>
          <li>Connect with your church community</li>
          <li>Access exclusive member deals from Pro businesses</li>
          <li>Support Christian commerce in your area</li>
        </ul>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Go to Your Dashboard</a></p>
        <p>Together, we're building Kingdom commerce!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Congratulations {{user_name}}! Your Kingdom Connects account is active and you're a member of {{church_name}}. Visit your dashboard at {{dashboard_url}} to explore member features.`,
    is_active: true,
    description: 'Sent when a new member is auto-approved by their church'
  },
  {
    slug: 'member_welcome_pending',
    name: 'Member Welcome - Pending Church Approval',
    category: 'welcome',
    subject: 'Welcome to Kingdom Connects - Pending Approval',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Welcome! Almost There...</h2>
        <p>Hello {{user_name}},</p>
        <p>Thank you for creating your Kingdom Connects account! Your membership request has been sent to <strong>{{church_name}}</strong> for approval.</p>
        <p><strong>What happens next:</strong></p>
        <ol>
          <li>Your church admin will review your membership request</li>
          <li>You'll receive an email once you're approved</li>
          <li>After approval, you'll have full access to your Member Admin</li>
        </ol>
        <p><strong>Once approved, you'll be able to:</strong></p>
        <ul>
          <li>Save and bookmark your favorite Christian businesses</li>
          <li>Write reviews to help fellow believers</li>
          <li>Get personalized recommendations</li>
          <li>Connect with your church community</li>
          <li>Access exclusive member deals</li>
        </ul>
        <p>In the meantime, feel free to explore our directories:</p>
        <ul>
          <li><a href="{{base_url}}/business_directory.html">Christian Business Directory</a></li>
          <li><a href="{{base_url}}/church_directory.html">Church Directory</a></li>
        </ul>
        <p>Questions? Contact us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Welcome to Kingdom Connects, {{user_name}}! Your membership request has been sent to {{church_name}} for approval. You'll receive an email once approved. Questions? Contact support@kingdomconnects.org`,
    is_active: true,
    description: 'Sent when a new member needs church admin approval'
  },
  {
    slug: 'member_approved',
    name: 'Member Approved by Church',
    category: 'approval',
    subject: 'You\'re Approved! Welcome to {{church_name}}',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">You're Approved!</h2>
        <p>Hello {{user_name}},</p>
        <p>Great news! <strong>{{church_name}}</strong> has approved your membership request. You now have full access to your Kingdom Connects Member Admin!</p>
        <p><strong>You can now:</strong></p>
        <ul>
          <li>Save and bookmark your favorite Christian businesses</li>
          <li>Write reviews to help fellow believers</li>
          <li>Get personalized recommendations in your "For You" section</li>
          <li>Connect with businesses at your church</li>
          <li>Access exclusive member deals from Pro businesses</li>
        </ul>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Go to Your Dashboard</a></p>
        <p>Welcome to the Kingdom Connects family!</p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Great news, {{user_name}}! {{church_name}} has approved your membership. You now have full access to your Member Admin at {{dashboard_url}}. Welcome to the Kingdom Connects family!`,
    is_active: true,
    description: 'Sent when a church admin approves a member'
  },
  {
    slug: 'member_rejected',
    name: 'Member Rejected by Church',
    category: 'rejection',
    subject: 'Update on Your Kingdom Connects Membership Request',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Membership Request Update</h2>
        <p>Hello {{user_name}},</p>
        <p>Thank you for your interest in joining <strong>{{church_name}}</strong> on Kingdom Connects.</p>
        <p>Unfortunately, your membership request was not approved at this time. This could be for various reasons, such as:</p>
        <ul>
          <li>The church may not have recognized you as a member</li>
          <li>There may have been incomplete information</li>
          <li>The church may require in-person registration first</li>
        </ul>
        <p>Your Kingdom Connects account is still active! You can:</p>
        <ul>
          <li>Browse the Christian business directory</li>
          <li>Join a different church on the platform</li>
          <li>Contact the church directly if you believe this was an error</li>
        </ul>
        <p>If you have questions, please contact us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p>Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Hello {{user_name}}, your membership request for {{church_name}} was not approved. Your account is still active - you can browse the directory or join another church. Contact support@kingdomconnects.org with questions.`,
    is_active: true,
    description: 'Sent when a church admin rejects a member'
  },
  {
    slug: 'business_submission_pending_church',
    name: 'Business Submission - Pending Church Approval',
    category: 'notification',
    subject: 'Congratulations! Your Business Application is Submitted',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Congratulations, {{owner_name}}!</h2>
        <p>Your business <strong>{{business_name}}</strong> has been submitted to Kingdom Connects.</p>
        
        <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #C5A572; margin-top: 0;">Next Steps</h3>
          <p><strong>{{church_name}}</strong> will review your affiliation request. Once they approve, our team will complete the final platform review.</p>
          <p>You'll receive an email when each step is complete.</p>
        </div>
        
        <p>Your account is ready! You can log in anytime to check your status:</p>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">Go to Your Dashboard</a></p>
        
        <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Congratulations {{owner_name}}! Your business {{business_name}} has been submitted. {{church_name}} will review your affiliation request first, then our team will complete platform review. Check your status at {{dashboard_url}}`,
    is_active: true,
    description: 'Sent to business owner when church requires manual approval of affiliation'
  },
  {
    slug: 'business_submission_pending_review',
    name: 'Business Submission - Pending Platform Review',
    category: 'notification',
    subject: 'Congratulations! Welcome to Kingdom Connects',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Congratulations, {{owner_name}}!</h2>
        <p>Your business <strong>{{business_name}}</strong> has been submitted to Kingdom Connects.</p>
        
        <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #C5A572; margin-top: 0;">What Happens Next?</h3>
          <p>Our team will review your listing within 24-48 hours. You'll receive an email when your business goes live!</p>
        </div>
        
        <p>Your account is ready! Log in to explore your dashboard:</p>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">Go to Your Dashboard</a></p>
        
        <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Congratulations {{owner_name}}! Your business {{business_name}} has been submitted. Our team will review within 24-48 hours. Check your dashboard at {{dashboard_url}}`,
    is_active: true,
    description: 'Sent to business owner when church auto-approves or no church affiliation'
  },
  {
    slug: 'member_submitted',
    name: 'Member Signup Received',
    category: 'confirmation',
    subject: 'Thanks for Joining Kingdom Connects!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Thanks for Signing Up!</h2>
        <p>Hello {{user_name}},</p>
        <p>We've received your membership signup for Kingdom Connects. Welcome to our community of believers supporting faith-based commerce!</p>
        
        <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #C5A572; margin-top: 0;">What Happens Next?</h3>
          <p>Your membership is being processed. You'll receive another email once your account is fully activated.</p>
        </div>
        
        <p>In the meantime, feel free to explore:</p>
        <ul>
          <li><a href="{{base_url}}/business_directory.html">Christian Business Directory</a></li>
          <li><a href="{{base_url}}/church_directory.html">Church Directory</a></li>
        </ul>
        
        <p>Questions? Contact us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Thanks for signing up, {{user_name}}! Your Kingdom Connects membership is being processed. Explore our directories at {{base_url}} while you wait. Questions? Contact support@kingdomconnects.org`,
    is_active: true,
    description: 'Sent immediately when a member submits their signup'
  },
  {
    slug: 'business_pro_submitted',
    name: 'Business Pro Signup Received',
    category: 'confirmation',
    subject: 'Your Pro Business Application is Submitted!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Thank You for Choosing Pro!</h2>
        <p>Hello {{owner_name}},</p>
        <p>We've received your Pro business application for <strong>{{business_name}}</strong>. You've made an excellent choice to maximize your visibility in the Kingdom Connects community!</p>
        
        <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #C5A572; margin-top: 0;">What Happens Next?</h3>
          <ol style="margin: 0; padding-left: 20px;">
            <li>Our team reviews your listing (24-48 hours)</li>
            <li>Once approved, your Pro features activate immediately</li>
            <li>10% of your subscription is automatically tithed to ministry</li>
          </ol>
        </div>
        
        <p><strong>Your Pro benefits include:</strong></p>
        <ul>
          <li>Featured placement in search results</li>
          <li>Unlimited photos and media</li>
          <li>Promotions and special offers</li>
          <li>Products & services showcase</li>
          <li>Customer testimonials</li>
          <li>Priority support</li>
        </ul>
        
        <p>Your account is ready! Explore your dashboard:</p>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">Go to Your Dashboard</a></p>
        
        <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Thank you for choosing Pro, {{owner_name}}! Your business {{business_name}} has been submitted. Our team will review within 24-48 hours. Your Pro features activate upon approval. Check your dashboard at {{dashboard_url}}`,
    is_active: true,
    description: 'Sent when a new business signs up with Pro tier selected'
  },
  {
    slug: 'affiliation_requested',
    name: 'Business Affiliation Request (to Church)',
    category: 'notification',
    subject: 'New Business Wants to Affiliate with {{church_name}}',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">New Affiliation Request</h2>
        <p>Hello {{church_admin_name}},</p>
        <p>A new business has requested to affiliate with <strong>{{church_name}}</strong> on Kingdom Connects.</p>
        
        <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #C5A572; margin-top: 0;">Business Details</h3>
          <p><strong>Business Name:</strong> {{business_name}}</p>
          <p><strong>Owner:</strong> {{owner_name}}</p>
          <p><strong>Category:</strong> {{business_category}}</p>
          <p style="margin-bottom: 0;"><strong>Submitted:</strong> {{submission_date}}</p>
        </div>
        
        <p>Please review this request and approve or decline from your Church Admin dashboard:</p>
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">Review Request</a></p>
        
        <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `New affiliation request for {{church_name}}: {{business_name}} (owned by {{owner_name}}) wants to affiliate. Review this request at {{dashboard_url}}`,
    is_active: true,
    description: 'Sent to church admin when a business requests affiliation'
  },
  {
    slug: 'affiliation_approved',
    name: 'Business Affiliation Approved',
    category: 'approval',
    subject: '{{church_name}} Has Approved Your Affiliation!',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C5A572;">Affiliation Approved!</h2>
        <p>Hello {{owner_name}},</p>
        <p>Great news! <strong>{{church_name}}</strong> has approved your affiliation request for <strong>{{business_name}}</strong>.</p>
        
        <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #C5A572; margin-top: 0;">What This Means</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li>Your business is now connected to {{church_name}}</li>
            <li>Church members can easily find your business</li>
            <li>You're part of the church's business network</li>
          </ul>
        </div>
        
        <p>Your listing is now pending final platform review. You'll receive another email when you're fully live!</p>
        
        <p><a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background: #C5A572; color: white; text-decoration: none; border-radius: 4px;">Go to Your Dashboard</a></p>
        
        <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Great news, {{owner_name}}! {{church_name}} has approved your affiliation request for {{business_name}}. Your listing is now pending final platform review. Check your dashboard at {{dashboard_url}}`,
    is_active: true,
    description: 'Sent to business owner when church approves their affiliation'
  },
  {
    slug: 'affiliation_rejected',
    name: 'Business Affiliation Declined',
    category: 'rejection',
    subject: 'Update on Your Affiliation Request',
    html_body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Affiliation Request Update</h2>
        <p>Hello {{owner_name}},</p>
        <p>Thank you for your interest in affiliating <strong>{{business_name}}</strong> with <strong>{{church_name}}</strong> on Kingdom Connects.</p>
        <p>Unfortunately, the church has declined the affiliation request at this time. This could be for various reasons:</p>
        <ul>
          <li>The church may not recognize your business connection</li>
          <li>The church may have specific requirements for affiliates</li>
          <li>There may be a need to verify membership first</li>
        </ul>
        
        <div style="background: #f8f6f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #C5A572; margin-top: 0;">Your Options</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li>Contact the church directly to discuss</li>
            <li>Choose a different church affiliation</li>
            <li>Continue without church affiliation (your listing can still be reviewed)</li>
          </ul>
        </div>
        
        <p>If you have questions, contact us at <a href="mailto:support@kingdomconnects.org">support@kingdomconnects.org</a></p>
        <p style="margin-top: 30px;">Blessings,<br>The Kingdom Connects Team</p>
      </div>
    `,
    text_body: `Hello {{owner_name}}, your affiliation request for {{business_name}} with {{church_name}} was declined. You can contact the church directly, choose a different church, or continue without affiliation. Questions? Contact support@kingdomconnects.org`,
    is_active: true,
    description: 'Sent to business owner when church declines their affiliation'
  },
  
  // Sales & Marketing Templates
  {
    slug: 'sales_intro_church',
    name: 'Sales Intro - Church',
    category: 'sales',
    subject: 'Partner with Kingdom Connects - Support Your Community',
    headline: 'Grow Your Community Impact',
    intro: 'Hello {{recipient_name}}, I wanted to introduce you to Kingdom Connects, a platform that helps churches connect with faith-aligned businesses in their community.',
    highlights: [
      'Free church listing with no strings attached',
      'Connect your members with trusted local businesses',
      'Receive a portion of platform revenue back to your ministry',
      'Build economic strength within your congregation'
    ],
    cta: 'I would love to schedule a quick call to show you how Kingdom Connects can benefit your church and community.',
    button_text: 'Learn More',
    button_url: '{{base_url}}/for-churches',
    is_active: true,
    description: 'Initial outreach email to churches'
  },
  {
    slug: 'sales_intro_business',
    name: 'Sales Intro - Business',
    category: 'sales',
    subject: 'Reach Faith-Aligned Customers - Kingdom Connects',
    headline: 'Connect with Customers Who Share Your Values',
    intro: 'Hello {{recipient_name}}, I wanted to reach out about Kingdom Connects, a directory that helps Christian-owned businesses connect with faith-aligned customers.',
    highlights: [
      'Get listed in our searchable business directory',
      'Affiliate with your local church for credibility',
      'Reach customers actively looking for faith-based businesses',
      'Pro tier includes promotions, testimonials, and more'
    ],
    cta: 'Would you like to see how Kingdom Connects can help grow your business while serving your community?',
    button_text: 'List Your Business',
    button_url: '{{base_url}}/add-to-directory',
    is_active: true,
    description: 'Initial outreach email to business owners'
  },
  {
    slug: 'sales_followup',
    name: 'Sales Follow-up',
    category: 'sales',
    subject: 'Following Up - Kingdom Connects',
    headline: 'Just Checking In',
    intro: 'Hello {{recipient_name}}, I wanted to follow up on my previous message about Kingdom Connects.',
    highlights: [
      'Quick setup takes just minutes',
      'No commitment required to get started',
      'Join other faith-based businesses in your area'
    ],
    cta: 'If you have any questions or would like to chat, I am happy to help. Just reply to this email.',
    button_text: 'Get Started Free',
    button_url: '{{base_url}}/add-to-directory',
    is_active: true,
    description: 'Follow-up email for sales outreach'
  },
  {
    slug: 'marketing_newsletter',
    name: 'Marketing Newsletter',
    category: 'marketing',
    subject: 'Kingdom Connects Update - {{newsletter_date}}',
    headline: 'Kingdom Connects Community Update',
    intro: 'Hello {{recipient_name}}, here is your latest update from Kingdom Connects.',
    highlights: [
      'Featured businesses this month',
      'New churches joining the network',
      'Tips for growing your visibility',
      'Upcoming community events'
    ],
    cta: 'Visit your dashboard to update your listing and connect with others.',
    button_text: 'Go to Dashboard',
    button_url: '{{dashboard_url}}',
    is_active: true,
    description: 'Monthly or periodic newsletter'
  },
  {
    slug: 'marketing_promo',
    name: 'Marketing Promotion',
    category: 'marketing',
    subject: 'Special Offer for Kingdom Connects Members',
    headline: 'Exclusive Offer Just for You',
    intro: 'Hello {{recipient_name}}, as a valued member of Kingdom Connects, we have a special offer for you.',
    highlights: [
      'Limited time discount on Pro membership',
      'Enhanced visibility for your listing',
      'Priority support and features'
    ],
    cta: 'Take advantage of this exclusive offer before it expires.',
    button_text: 'Upgrade Now',
    button_url: '{{base_url}}/pricing',
    is_active: true,
    description: 'Promotional email for special offers'
  },
  
  // Sales Agent Journey Templates
  {
    slug: 'sales_inquiry_received',
    name: 'Sales Inquiry Received',
    category: 'sales',
    subject: 'Thanks for Reaching Out - Kingdom Connects',
    headline: 'We Got Your Message!',
    intro: 'Hello {{recipient_name}}, thank you for your interest in Kingdom Connects. We received your inquiry and wanted to let you know we are on it.',
    highlights: [
      'A team member will review your message',
      'We typically respond within 24-48 hours',
      'Feel free to reply if you have additional questions'
    ],
    cta: 'In the meantime, learn more about what we offer.',
    button_text: 'Learn More',
    button_url: '{{base_url}}/about',
    is_active: true,
    description: 'Auto-reply when someone submits an inquiry'
  },
  {
    slug: 'sales_agent_pending',
    name: 'Sales Agent Application Pending',
    category: 'sales',
    subject: 'Your Sales Agent Application - Next Steps',
    headline: 'Application Received!',
    intro: 'Hello {{recipient_name}}, thank you for applying to become a Kingdom Connects Sales Agent. We are excited about your interest in joining our team.',
    highlights: [
      'Your application is currently under review',
      'We will schedule a brief call to discuss the opportunity',
      'Expect to hear from us within 2-3 business days'
    ],
    cta: 'We will be in touch soon to discuss next steps.',
    button_text: 'View Sales Agent Info',
    button_url: '{{base_url}}/sales-agent',
    is_active: true,
    description: 'Sent when someone applies to be a sales agent'
  },
  {
    slug: 'sales_agent_call_scheduled',
    name: 'Sales Agent Call Scheduled',
    category: 'sales',
    subject: 'Your Call is Scheduled - Kingdom Connects',
    headline: 'Let\'s Talk!',
    intro: 'Hello {{recipient_name}}, great news! We have scheduled a call to discuss the Sales Agent opportunity with you.',
    highlights: [
      'Date/Time: {{call_date}} at {{call_time}}',
      'We will call you at {{phone_number}}',
      'The call will take about 15-20 minutes'
    ],
    cta: 'Looking forward to speaking with you!',
    button_text: 'Add to Calendar',
    button_url: '{{calendar_link}}',
    is_active: true,
    description: 'Sent when a sales agent call is scheduled'
  },
  {
    slug: 'sales_agent_approved',
    name: 'Sales Agent Approved',
    category: 'sales',
    subject: 'Welcome to the Team! - Kingdom Connects Sales Agent',
    headline: 'You\'re In!',
    intro: 'Hello {{recipient_name}}, congratulations! You have been approved as a Kingdom Connects Sales Agent. Welcome to the team!',
    highlights: [
      'Access your Sales Agent dashboard',
      'View your commission structure and goals',
      'Start connecting churches and businesses today',
      'Training materials available in your dashboard'
    ],
    cta: 'Log in now to get started.',
    button_text: 'Go to Dashboard',
    button_url: '{{dashboard_url}}',
    is_active: true,
    description: 'Sent when a sales agent application is approved'
  },
  {
    slug: 'sales_agent_rejected',
    name: 'Sales Agent Application Update',
    category: 'sales',
    subject: 'Update on Your Sales Agent Application',
    headline: 'Application Update',
    intro: 'Hello {{recipient_name}}, thank you for your interest in becoming a Kingdom Connects Sales Agent.',
    highlights: [
      'We have reviewed your application',
      'Unfortunately, we are unable to move forward at this time',
      'You are welcome to reapply in the future'
    ],
    cta: 'If you have questions, feel free to reach out.',
    button_text: 'Contact Us',
    button_url: '{{base_url}}/contact',
    is_active: true,
    description: 'Sent when a sales agent application is declined'
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
