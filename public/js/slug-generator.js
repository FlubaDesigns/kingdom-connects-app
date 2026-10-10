/**
 * Slug Generator Module
 * Generates SEO-friendly slugs for businesses and churches
 * Format: {name}-{state}-{city}
 * Example: daves-auto-fl-englewood, foundation-baptist-church-fl-tampa
 */

import { db } from "./firebase-config.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Generate slug for business
 * Format: business-name-state-city (if multiple in state)
 * Example: "Dave's Auto FL" → "daves-auto-fl"
 * Example: "Dave's Auto FL Englewood" → "daves-auto-fl-englewood"
 */
export async function generateBusinessSlug(businessName, state, city) {
  if (!businessName || !state) {
    throw new Error('Business name and state are required for slug generation');
  }

  const baseSlug = createBaseSlug(businessName, state);
  
  const isDuplicate = await checkDuplicateBusinessSlug(baseSlug);
  
  if (isDuplicate && city) {
    const citySlug = createBaseSlug(businessName, state, city);
    const isDuplicateCity = await checkDuplicateBusinessSlug(citySlug);
    
    if (isDuplicateCity) {
      return appendNumberToSlug(citySlug, 'business_listings_public');
    }
    
    return citySlug;
  }
  
  if (isDuplicate && !city) {
    return appendNumberToSlug(baseSlug, 'business_listings_public');
  }
  
  return baseSlug;
}

/**
 * Generate slug for church
 * Format: church-name-state-city (if multiple in state)
 * Example: "Foundation Baptist Church FL" → "foundation-baptist-church-fl"
 * Example: "Foundation Baptist Church FL Tampa" → "foundation-baptist-church-fl-tampa"
 */
export async function generateChurchSlug(churchName, state, city) {
  if (!churchName || !state) {
    throw new Error('Church name and state are required for slug generation');
  }

  const baseSlug = createBaseSlug(churchName, state);
  
  const isDuplicate = await checkDuplicateChurchSlug(baseSlug);
  
  if (isDuplicate && city) {
    const citySlug = createBaseSlug(churchName, state, city);
    const isDuplicateCity = await checkDuplicateChurchSlug(citySlug);
    
    if (isDuplicateCity) {
      return appendNumberToSlug(citySlug, 'churches');
    }
    
    return citySlug;
  }
  
  if (isDuplicate && !city) {
    return appendNumberToSlug(baseSlug, 'churches');
  }
  
  return baseSlug;
}

/**
 * Create base slug from parts
 * Converts "Dave's Auto", "FL", "Englewood" → "daves-auto-fl-englewood"
 */
function createBaseSlug(...parts) {
  return parts
    .filter(Boolean)
    .map(part => 
      part
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
    )
    .join('-');
}

/**
 * Check if business slug already exists
 */
async function checkDuplicateBusinessSlug(slug) {
  try {
    const q = query(
      collection(db, 'business_listings_public'),
      where('slug', '==', slug)
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking business slug:', error);
    return false;
  }
}

/**
 * Check if church slug already exists
 */
async function checkDuplicateChurchSlug(slug) {
  try {
    const q = query(
      collection(db, 'churches'),
      where('slug', '==', slug)
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking church slug:', error);
    return false;
  }
}

/**
 * Append number to slug if duplicate
 * "daves-auto-fl" → "daves-auto-fl-2", "daves-auto-fl-3", etc.
 */
async function appendNumberToSlug(baseSlug, collectionName) {
  let counter = 2;
  let newSlug = `${baseSlug}-${counter}`;
  
  while (await slugExists(newSlug, collectionName)) {
    counter++;
    newSlug = `${baseSlug}-${counter}`;
    
    if (counter > 100) {
      console.error('Slug generation exceeded 100 attempts');
      break;
    }
  }
  
  return newSlug;
}

/**
 * Check if slug exists in collection
 */
async function slugExists(slug, collectionName) {
  try {
    const q = query(
      collection(db, collectionName),
      where('slug', '==', slug)
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking slug existence:', error);
    return false;
  }
}

/**
 * Validate slug format
 * Must be lowercase, alphanumeric with hyphens only
 */
export function validateSlug(slug) {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug);
}

/**
 * Get business by slug
 */
export async function getBusinessBySlug(slug) {
  try {
    const q = query(
      collection(db, 'business_listings_public'),
      where('slug', '==', slug)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    };
  } catch (error) {
    console.error('Error fetching business by slug:', error);
    return null;
  }
}

/**
 * Get church by slug
 */
export async function getChurchBySlug(slug) {
  try {
    const q = query(
      collection(db, 'churches'),
      where('slug', '==', slug)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    };
  } catch (error) {
    console.error('Error fetching church by slug:', error);
    return null;
  }
}
