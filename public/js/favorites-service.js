import { db, auth } from "./firebase-config.js";
import { collection, doc, setDoc, deleteDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function checkIfFavorited(userId, businessId) {
  try {
    const q = query(
      collection(db, "favorite_businesses"),
      where("user_id", "==", userId),
      where("business_id", "==", businessId)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking favorite status:", error);
    return false;
  }
}

export async function addToFavorites(userId, businessId) {
  try {
    await setDoc(doc(db, "favorite_businesses", `${userId}_${businessId}`), {
      user_id: userId,
      business_id: businessId,
      saved_at: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error("Error adding to favorites:", error);
    return { success: false, error: error.message };
  }
}

export async function removeFromFavorites(userId, businessId) {
  try {
    const q = query(
      collection(db, "favorite_businesses"),
      where("user_id", "==", userId),
      where("business_id", "==", businessId)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      await Promise.all(snapshot.docs.map(item => deleteDoc(item.ref)));
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error removing from favorites:", error);
    return { success: false, error: error.message };
  }
}

export async function toggleFavorite(userId, businessId) {
  const isFavorited = await checkIfFavorited(userId, businessId);
  
  if (isFavorited) {
    return await removeFromFavorites(userId, businessId);
  } else {
    return await addToFavorites(userId, businessId);
  }
}
