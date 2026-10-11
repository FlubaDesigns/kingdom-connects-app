/* Recorded activity comes from signed-in visitors; counters are server-owned. */
import { auth } from '../firebase-config.js';
import { changeHierarchy } from './hierarchy-service.js';
class AnalyticsService {
  async trackClick(businessId, eventType) {
    if (!businessId || !auth.currentUser) return;
    try { return await changeHierarchy('trackBusinessEvent',{businessId,eventType}); }
    catch (error) { console.warn('Activity was not recorded:',error.message); }
  }
  trackImpression(id) { return this.trackClick(id,'impression'); }
  trackWebsiteClick(id) { return this.trackClick(id,'website_click'); }
  trackPhoneClick(id) { return this.trackClick(id,'phone_click'); }
  async getBusinessAnalytics(businessId,days=30) {
    return changeHierarchy('getBusinessAnalytics',{businessId,days});
  }
}
export default new AnalyticsService();
