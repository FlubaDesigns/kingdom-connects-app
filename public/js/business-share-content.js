// Use the business's canonical church association, never a reviewer's church.
export function buildBusinessShareContent({ businessId, business, church, origin, detail = '' }) {
  if (!businessId || !business?.business_name || !business.church_id || !church?.church_name) return null;
  const base = new URL(origin).origin;
  const businessUrl = `${base}/business.html?id=${encodeURIComponent(businessId)}`;
  const churchUrl = `${base}/church.html?id=${encodeURIComponent(business.church_id)}`;
  const title = `${business.business_name}, associated with ${church.church_name}.`;
  return {
    title,
    businessName: business.business_name,
    churchName: church.church_name,
    businessUrl,
    churchUrl,
    // Social captions do not reliably support named hyperlinks. Keep both
    // labeled URLs in the actual post, including the clipboard version.
    text: [title, detail.trim(), `Business page: ${businessUrl}`, `Church page: ${churchUrl}`].filter(Boolean).join('\n\n')
  };
}
