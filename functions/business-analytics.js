'use strict';
const {isAdmin, isBlocked, activeChurch} = require('./hierarchy-policy');
const {hasPro} = require('./business-media');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function createBusinessAnalyticsService(db, now=()=>Date.now()) {
  async function execute(actor,input) {
    const id=input.businessId;
    if(typeof id!=='string'||!id||id.length>128||id.includes('/')) fail(400,'Invalid business ID.');
    const bRef=db.doc('business_listings_public/'+id);
    const [bSnap,ownerSnap,userSnap]=await Promise.all([bRef.get(),db.doc('business_listings_private/'+id).get(),db.doc('users/'+actor.uid).get()]);
    const b=bSnap.data(),user=userSnap.data();
    if(!b||!user||isBlocked(user)) fail(403,'Business access unavailable.');
    if(input.action==='getBusinessAnalytics') {
      if(!isAdmin(user)&&(ownerSnap.data()?.owner_uid!==actor.uid||!hasPro(b,user))) fail(403,'Pro business owner access required.');
      const days=Number(input.days||30);
      if(![7,30,90,365].includes(days)) fail(400,'Invalid date range.');
      const cutoff=new Date(now()-(days-1)*86400000).toISOString().slice(0,10);
      const snapshots=await db.collection(`business_analytics/${id}/days`).where('date','>=',cutoff).get();
      const result={impressions:0,website_clicks:0,phone_clicks:0,total_clicks:0,ctr:'0.00'};
      for(const snap of snapshots.docs) for(const field of ['impressions','website_clicks','phone_clicks']) result[field]+=Number(snap.data()[field]||0);
      result.total_clicks=result.website_clicks+result.phone_clicks;
      if(result.impressions) result.ctr=(result.total_clicks/result.impressions*100).toFixed(2);
      return result;
    }
    if(input.action!=='trackBusinessEvent'||!['impression','website_click','phone_click'].includes(input.eventType)) fail(400,'Invalid business event.');
    const time=now(),day=new Date(time).toISOString().slice(0,10);
    const visitor=db.doc(`business_analytics/${id}/visitors/${actor.uid}`),daily=db.doc(`business_analytics/${id}/days/${day}`);
    return db.runTransaction(async tx=>{
      const [business,visitorSnap,dailySnap]=await Promise.all([tx.get(bRef),tx.get(visitor),tx.get(daily)]);
      const current=business.data();
      const church=current?.church_id ? await tx.get(db.doc('churches/'+current.church_id)) : null;
      if(!current?.is_visible||current.listing_status!=='active'||!activeChurch(church?.data())) fail(403,'Business is not published.');
      const seen=visitorSnap.data()||{};
      if(time-(seen[input.eventType]||0)<60000) return {recorded:false};
      const field={impression:'impressions',website_click:'website_clicks',phone_click:'phone_clicks'}[input.eventType];
      tx.set(visitor,{[input.eventType]:time},{merge:true});
      tx.set(daily,{date:day,[field]:Number(dailySnap.data()?.[field]||0)+1},{merge:true});
      if(input.eventType==='impression') tx.update(bRef,{total_views:Number(current.total_views||0)+1});
      return {recorded:true};
    });
  }
  return {execute};
}
module.exports={createBusinessAnalyticsService};
