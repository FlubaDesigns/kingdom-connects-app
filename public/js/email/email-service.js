/**
 * Centralized Email Service
 * All email sending goes through Firebase Functions
 * Similar to auth/access-control.js - ONE place for all email logic
 */

import { auth } from "../firebase-config.js";

const API_BASE = window.location.origin;

async function getAuthToken(providedUser = null) {
  const user = providedUser || auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }
  return await user.getIdToken();
}

async function apiCall(endpoint, data, providedUser = null) {
  const token = await getAuthToken(providedUser);
  
  console.log(`📧 Email API call to ${endpoint}`, data);
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Email API error (${response.status}):`, errorText);
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText || 'Request failed' };
    }
    throw new Error(errorData.error || errorData.message || `Email send failed (${response.status})`);
  }
  
  const result = await response.json();
  console.log('✅ Email API success:', result);
  return result;
}

/**
 * Send a presentation email
 * @param {string} role - Role type: sales_agent, church_admin, business_owner, member
 * @param {string} email - Recipient email address
 * @param {boolean} includePresentation - Whether to include presentation attachment
 * @param {string} templateId - Optional template ID for custom template
 */
export async function sendPresentation(role, email, includePresentation = true, templateId = null) {
  return await apiCall('/api/presentations/send', {
    role,
    email,
    includePresentation,
    templateId
  });
}

/**
 * Send email using a template from Firestore
 * @param {string} templateName - Name of the template in email_templates collection
 * @param {string} to - Recipient email address
 * @param {object} variables - Template variables to replace {{variable}}
 * @param {object} user - Optional Firebase user object (for new signups before auth.currentUser is ready)
 */
export async function sendTemplate(templateName, to, variables = {}, user = null) {
  return await apiCall('/api/send-template', {
    templateName,
    to,
    variables
  }, user);
}

/**
 * Send a custom email (admin only)
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML content
 * @param {string} textBody - Plain text content (optional)
 */
export async function sendCustomEmail(to, subject, htmlBody, textBody = null) {
  return await apiCall('/api/send-email', {
    to,
    subject,
    htmlBody,
    textBody
  });
}

/**
 * Send demo invitation email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} demoType - Type of demo
 * @param {string} note - Personal note
 * @param {string} htmlContent - Full HTML email content
 */
export async function sendDemoInvite(email, name, demoType, note, htmlContent) {
  const DEMO_LABELS = {
    member: 'Member Signup',
    business_free: 'Free Business',
    business_pro: 'Pro Business',
    church: 'Church',
    sales: 'Sales Agent',
    hub: 'All Demos'
  };
  
  return await apiCall('/api/send-email', {
    to: email,
    subject: `You're Invited: ${DEMO_LABELS[demoType] || demoType} Demo - Kingdom Connects`,
    htmlBody: htmlContent
  });
}

/**
 * Send email verification using admin-managed template
 * Uses Firebase Admin SDK to generate verification link server-side
 */
export async function sendVerificationEmail() {
  return await apiCall('/api/sendVerificationEmail', {});
}

/**
 * Check email service health
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    return await response.json();
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

/**
 * Notify admin of new submission (business, church, or member)
 * @param {string} type - 'business', 'church', or 'member'
 * @param {string} name - Name of the business/church/member
 * @param {string} email - Submitter's email
 * @param {string} churchName - Optional church affiliation name
 * @param {object} user - Firebase user object
 */
export async function notifyAdminNewSubmission(type, name, email, churchName = null, user = null) {
  return await apiCall('/api/notify-admin-new-submission', {
    type,
    name,
    email,
    churchName
  }, user);
}

/**
 * Send confirmation email to business owner after submission
 * @param {object} params - Submission details
 * @param {string} params.businessName - Name of the business
 * @param {string} params.ownerEmail - Business owner's email
 * @param {string} params.ownerName - Business owner's name
 * @param {boolean} params.needsChurchApproval - Whether church manual approval is required
 * @param {string} params.churchName - Name of the affiliated church (if any)
 * @param {string} params.businessSlug - Business slug for static page URL (optional)
 * @param {object} user - Firebase user object
 */
export async function sendBusinessSubmissionConfirmation(params, user = null) {
  return await apiCall('/api/send-business-submission-confirmation', params, user);
}

export default {
  sendPresentation,
  sendTemplate,
  sendCustomEmail,
  sendDemoInvite,
  sendVerificationEmail,
  checkHealth,
  notifyAdminNewSubmission
};
