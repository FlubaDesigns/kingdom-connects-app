import { db } from "../firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PUBLIC_FIELDS = [
  'business_name', 'description', 'city', 'state', 'zip_code', 'country',
  'email', 'primary_category', 'subcategories', 'secondary_categories',
  'listing_status', 'subscription_tier', 'pro_status', 'is_visible',
  'created_at', 'updated_at', 'slug', 'logo', 'logo_url',
  'photos', 'videos', 'video_files', 'hours_of_operation',
  'average_rating', 'review_count', 'social_media', 'show_social_media',
  'allow_reviews', 'allow_social_sharing', 'allow_review_sharing',
  'show_phone', 'show_email', 'show_address', 'show_website',
  'address_line1', 'address_line2', 'phone_number', 'website_url',
  'church_id'
];

const PRIVATE_FIELDS = [
  'owner_uid', 'owner_email', 'submitter_uid', 'submitter_email',
  'your_name', 'phone_ext',
  'stripe_customer_id', 'stripe_subscription_id', 'stripe_product_id',
  'billing_cycle', 'trial_status', 'trial_ends', 'subscription_start',
  'submission_date', 'approved_at', 'approved_by'
];

// Only known private fields join a public listing; authority and identity stay canonical.
export function mergeBusiness(id, publicData = {}, privateData = {}) {
  const privateFields = Object.fromEntries(Object.entries(privateData).filter(([key]) => PRIVATE_FIELDS.includes(key)));
  return { ...privateFields, ...publicData, owner_uid: privateData.owner_uid, id };
}

export async function getBusinessForUser(uid, email = null) {
  try {
    const results = [];
    
    const uidQuery = query(
      collection(db, "business_listings_private"),
      where("owner_uid", "==", uid)
    );
    const uidSnapshot = await getDocs(uidQuery);
    
    for (const privateDoc of uidSnapshot.docs) {
      const privateData = privateDoc.data();
      const id = privateDoc.id;
      
      const publicDoc = await getDoc(doc(db, "business_listings_public", id));
      const publicData = publicDoc.exists() ? publicDoc.data() : {};
      
      if (publicDoc.exists()) results.push(mergeBusiness(id, publicData, privateData));
    }
    
    if (results.length === 0) {
      return null;
    }
    
    return results;
  } catch (error) {
    console.error("Error fetching business for user:", error);
    return null;
  }
}

export async function getBusinessByEmail(email) {
  try {
    const privateQuery = query(
      collection(db, "business_listings_private"),
      where("owner_email", "==", email)
    );
    const privateSnapshot = await getDocs(privateQuery);
    
    if (privateSnapshot.empty) {
      return null;
    }
    
    const results = [];
    
    for (const privateDoc of privateSnapshot.docs) {
      const privateData = privateDoc.data();
      const id = privateDoc.id;
      
      const publicDoc = await getDoc(doc(db, "business_listings_public", id));
      const publicData = publicDoc.exists() ? publicDoc.data() : {};
      
      if (publicDoc.exists()) results.push(mergeBusiness(id, publicData, privateData));
    }
    
    return results;
  } catch (error) {
    console.error("Error fetching business by email:", error);
    return null;
  }
}

export async function getBusinessById(id) {
  try {
    const [publicDoc, privateDoc] = await Promise.all([
      getDoc(doc(db, "business_listings_public", id)),
      getDoc(doc(db, "business_listings_private", id))
    ]);
    
    if (!publicDoc.exists()) {
      return null;
    }
    
    return mergeBusiness(id, publicDoc.data(), privateDoc.exists() ? privateDoc.data() : {});
  } catch (error) {
    console.error("Error fetching business by ID:", error);
    return null;
  }
}

export async function getBusinessPublicOnly(id) {
  try {
    const publicDoc = await getDoc(doc(db, "business_listings_public", id));
    if (!publicDoc.exists()) {
      return null;
    }
    return { ...publicDoc.data(), id };
  } catch (error) {
    console.error("Error fetching public business:", error);
    return null;
  }
}

export async function getAllBusinessesMerged() {
  try {
    const [publicSnapshot, privateSnapshot] = await Promise.all([
      getDocs(collection(db, "business_listings_public")),
      getDocs(collection(db, "business_listings_private"))
    ]);
    
    const privateMap = new Map();
    privateSnapshot.docs.forEach(d => privateMap.set(d.id, d.data()));
    
    const results = [];
    publicSnapshot.docs.forEach(d => {
      const privateData = privateMap.get(d.id) || {};
      results.push(mergeBusiness(d.id, d.data(), privateData));
    });
    
    return results;
  } catch (error) {
    console.error("Error fetching all businesses:", error);
    return [];
  }
}

export async function updateBusiness(id, data) {
  const publicData = {};
  const privateData = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (PRIVATE_FIELDS.includes(key)) {
      privateData[key] = value;
    } else if (PUBLIC_FIELDS.includes(key)) {
      publicData[key] = value;
    } else {
      throw new Error(`Unsupported business field: ${key}`);
    }
  }
  
  const batch = writeBatch(db);
  
  if (Object.keys(publicData).length > 0) {
    batch.update(doc(db, "business_listings_public", id), publicData);
  }
  
  if (Object.keys(privateData).length > 0) {
    batch.update(doc(db, "business_listings_private", id), privateData);
  }
  
  await batch.commit();
}
