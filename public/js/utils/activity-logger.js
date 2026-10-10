/**
 * Activity Logger Utility
 * Central logging system for tracking all platform actions
 */

import { db } from "../firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Log an activity to the activity_log collection
 * 
 * @param {Object} params - Activity parameters
 * @param {string} params.activity_type - Type of activity (e.g., 'create_listing', 'edit_listing')
 * @param {string} params.user_id - UID of user performing action (optional for system actions)
 * @param {string} params.target_type - Type of target (e.g., 'business', 'church', 'review')
 * @param {string} params.target_id - ID of the affected item
 * @param {string} params.details - Description of the activity
 * @param {string} params.ip_address - IP address (optional)
 * @returns {Promise<void>}
 */
export async function logActivity({
  activity_type,
  user_id = null,
  target_type = null,
  target_id = null,
  details = '',
  ip_address = null
}) {
  try {
    await addDoc(collection(db, "activity_log"), {
      activity_type,
      user_id,
      target_type,
      target_id,
      details,
      ip_address,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

/**
 * Activity type constants for consistency
 */
export const ACTIVITY_TYPES = {
  // Listings
  CREATE_BUSINESS: 'create_business',
  EDIT_BUSINESS: 'edit_business',
  DELETE_BUSINESS: 'delete_business',
  CREATE_CHURCH: 'create_church',
  EDIT_CHURCH: 'edit_church',
  DELETE_CHURCH: 'delete_church',
  
  // Reviews
  CREATE_REVIEW: 'create_review',
  MODERATE_REVIEW: 'moderate_review',
  DELETE_REVIEW: 'delete_review',
  
  // Users
  CREATE_USER: 'create_user',
  EDIT_USER: 'edit_user',
  DELETE_USER: 'delete_user',
  
  // Pro/Payments
  UPGRADE_PRO: 'upgrade_pro',
  DOWNGRADE_PRO: 'downgrade_pro',
  
  // Admin actions
  APPROVE_SUBMISSION: 'approve_submission',
  DENY_SUBMISSION: 'deny_submission',
  SUSPEND_LISTING: 'suspend_listing',
  UNSUSPEND_LISTING: 'unsuspend_listing',
  
  // Categories
  APPROVE_CATEGORY: 'approve_category',
  DENY_CATEGORY: 'deny_category'
};

/**
 * Target type constants
 */
export const TARGET_TYPES = {
  BUSINESS: 'business',
  CHURCH: 'church',
  REVIEW: 'review',
  USER: 'user',
  CATEGORY: 'category'
};
