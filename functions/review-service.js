'use strict';

// Reviews are authoritative; directory rating/count are a transactionally maintained projection.
async function writeReview(tx, db, reviewRef, previous, next, timestamp) {
  const businessId = previous?.business_id || next?.business_id;
  if (!businessId && !next) { tx.delete(reviewRef); return; }
  if (!businessId) throw Object.assign(new Error('Review has no business.'), { status: 409 });
  const businessRef = db.collection('business_listings_public').doc(businessId);
  const business = await tx.get(businessRef);
  const approved = await tx.get(db.collection('reviews').where('business_id', '==', businessId).where('status', '==', 'approved'));
  const reviews = approved.docs.filter(doc => doc.id !== reviewRef.id).map(doc => doc.data());
  if (next?.status === 'approved') reviews.push(next);
  const ratings = reviews.map(review => Number(review.rating ?? review.star_rating)).filter(rating => Number.isInteger(rating) && rating >= 1 && rating <= 5);
  if (next) tx.set(reviewRef, next); else tx.delete(reviewRef);
  if (business.exists) tx.update(businessRef, { review_count: ratings.length,
    average_rating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0,
    updated_at: timestamp() });
}
// Firestore normally retries contention itself. A closed read transaction can instead
// surface as INVALID_ARGUMENT, so restart only that narrowly identified failed transaction.
// The callback must contain database operations only; never external effects such as mail or payments.
async function runReviewTransaction(db, operation) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.runTransaction(operation); }
    catch (error) {
      if (attempt === 2 || error.code !== 3 || !/transaction is invalid or closed/i.test(error.message)) throw error;
    }
  }
}
module.exports = { writeReview, runReviewTransaction };
