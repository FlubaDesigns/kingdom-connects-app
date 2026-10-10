/* Kingdom Connects - Analytics Tracking Service */
import { db } from '../firebase-config.js';
import { collection, addDoc, updateDoc, increment, doc, query, where, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

class AnalyticsService {
  
  async trackImpression(businessId) {
    if (!businessId) return;
    
    try {
      await addDoc(collection(db, "analytics"), {
        business_id: businessId,
        event_type: "impression",
        timestamp: Timestamp.now(),
        page: window.location.pathname
      });

      const businessRef = doc(db, "business_listings_public", businessId);
      await updateDoc(businessRef, {
        total_views: increment(1)
      });
    } catch (error) {
      // Silently fail for unauthenticated users (expected behavior)
      if (error.code !== 'permission-denied') {
        console.warn('Analytics tracking failed:', error.message);
      }
    }
  }

  async trackClick(businessId, clickType) {
    if (!businessId || !clickType) return;
    
    try {
      await addDoc(collection(db, "analytics"), {
        business_id: businessId,
        event_type: clickType,
        timestamp: Timestamp.now(),
        page: window.location.pathname
      });
    } catch (error) {
      // Silently fail for unauthenticated users (expected behavior)
      if (error.code !== 'permission-denied') {
        console.warn('Analytics tracking failed:', error.message);
      }
    }
  }

  async trackWebsiteClick(businessId) {
    return this.trackClick(businessId, 'website_click');
  }

  async trackPhoneClick(businessId) {
    return this.trackClick(businessId, 'phone_click');
  }

  async getBusinessAnalytics(businessId, dateRange = 30) {
    if (!businessId) return null;
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - dateRange);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      const q = query(
        collection(db, "analytics"),
        where("business_id", "==", businessId),
        where("timestamp", ">=", cutoffTimestamp)
      );
      
      const querySnapshot = await getDocs(q);
      
      const analytics = {
        impressions: 0,
        website_clicks: 0,
        phone_clicks: 0,
        total_clicks: 0,
        ctr: 0
      };

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        switch (data.event_type) {
          case 'impression':
            analytics.impressions++;
            break;
          case 'website_click':
            analytics.website_clicks++;
            analytics.total_clicks++;
            break;
          case 'phone_click':
            analytics.phone_clicks++;
            analytics.total_clicks++;
            break;
        }
      });

      if (analytics.impressions > 0) {
        analytics.ctr = ((analytics.total_clicks / analytics.impressions) * 100).toFixed(2);
      }

      return analytics;
    } catch (error) {
      console.error('Error fetching analytics:', error);
      return null;
    }
  }
}

export default new AnalyticsService();
