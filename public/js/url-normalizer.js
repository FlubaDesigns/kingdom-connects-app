/**
 * URL Normalization Utility
 * Accepts URLs with/without www, http://, https://, or just domain.com
 * Normalizes to https:// format for consistent storage
 */

/**
 * Normalize a URL to https:// format
 * @param {string} url - Raw URL input from user
 * @returns {string} - Normalized URL with https://
 * 
 * Examples:
 * - "example.com" → "https://example.com"
 * - "www.example.com" → "https://www.example.com"
 * - "http://example.com" → "https://example.com"
 * - "https://example.com" → "https://example.com"
 */
export function normalizeWebsiteUrl(url) {
  if (!url || url.trim() === '') return '';
  
  let normalized = url.trim();
  
  // Remove any existing protocol
  normalized = normalized.replace(/^(https?:\/\/)/i, '');
  
  // Split into hostname and everything else (path, query, hash)
  // Check for path (/) or query (?) - whichever comes first
  const slashIndex = normalized.indexOf('/');
  const queryIndex = normalized.indexOf('?');
  const hashIndex = normalized.indexOf('#');
  
  // Find the first separator (path, query, or hash)
  let separatorIndex = -1;
  if (slashIndex !== -1) separatorIndex = slashIndex;
  if (queryIndex !== -1 && (separatorIndex === -1 || queryIndex < separatorIndex)) separatorIndex = queryIndex;
  if (hashIndex !== -1 && (separatorIndex === -1 || hashIndex < separatorIndex)) separatorIndex = hashIndex;
  
  let hostname, pathQueryHash;
  
  if (separatorIndex !== -1) {
    hostname = normalized.substring(0, separatorIndex);
    pathQueryHash = normalized.substring(separatorIndex);
  } else {
    hostname = normalized;
    pathQueryHash = '';
  }
  
  // Only lowercase the hostname, preserve path/query/hash casing
  hostname = hostname.toLowerCase();
  
  // Add https:// protocol
  return 'https://' + hostname + pathQueryHash;
}

/**
 * Normalize social media URL (keeps original domain as-is)
 * @param {string} url - Raw social media URL
 * @returns {string} - Normalized URL with https://
 */
export function normalizeSocialUrl(url) {
  if (!url || url.trim() === '') return '';
  
  let normalized = url.trim();
  
  // If it already has a protocol, keep it
  if (normalized.match(/^https?:\/\//)) {
    return normalized;
  }
  
  // Otherwise add https://
  return 'https://' + normalized;
}

/**
 * Validate that a URL has a valid domain structure
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid domain format
 */
export function isValidUrl(url) {
  if (!url || url.trim() === '') return true; // Empty is valid (optional field)
  
  try {
    const normalized = normalizeWebsiteUrl(url);
    const urlObj = new URL(normalized);
    
    // Must have at least a domain and TLD (e.g., example.com)
    return urlObj.hostname.includes('.');
  } catch (e) {
    return false;
  }
}

/**
 * Normalize multiple social media URLs from an object
 * @param {Object} socialMedia - Object with platform keys
 * @returns {Object} - Normalized social media object
 */
export function normalizeSocialMediaObject(socialMedia) {
  if (!socialMedia || typeof socialMedia !== 'object') return {};
  
  const normalized = {};
  
  // Normalize each platform URL
  ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin'].forEach(platform => {
    if (socialMedia[platform]) {
      normalized[platform] = normalizeSocialUrl(socialMedia[platform]);
    }
  });
  
  return normalized;
}

/**
 * Apply URL normalization to a form before submission
 * Call this before saving business or church data
 * 
 * @param {Object} data - Form data object
 * @param {string[]} websiteFields - Array of field names that contain website URLs
 * @returns {Object} - Data with normalized URLs
 */
export function normalizeFormUrls(data, websiteFields = ['website']) {
  const normalized = { ...data };
  
  // Normalize website fields
  websiteFields.forEach(field => {
    if (normalized[field]) {
      normalized[field] = normalizeWebsiteUrl(normalized[field]);
    }
  });
  
  // Normalize social media if present
  if (normalized.social_media) {
    normalized.social_media = normalizeSocialMediaObject(normalized.social_media);
  }
  
  return normalized;
}
