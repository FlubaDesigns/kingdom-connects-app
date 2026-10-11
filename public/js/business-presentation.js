// Shared storefront formatting. Treat all business-supplied values as untrusted.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function safeWebUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const input = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function businessContact(business) {
  const cityLine = [business.city, [business.state, business.zip_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const address = business.show_address === false ? [] : [business.address_line1, business.address_line2, cityLine].filter(Boolean);
  return {
    address,
    phone: business.show_phone === false ? '' : String(business.phone_number || ''),
    email: business.show_email === false ? '' : String(business.email || '').replace(/[\r\n]/g, ''),
    website: business.show_website === false ? '' : safeWebUrl(business.website_url)
  };
}
export function renderOffering(item) {
  const image = safeWebUrl(item.image_url), details = safeWebUrl(item.details_url);
  return `<article class="storefront-offering">
    ${image ? `<img class="offering-image" src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy">` : ''}
    <div class="offering-body">
      <div class="offering-label">${item.item_type === 'product' ? 'Product' : 'Service'}${item.is_featured ? ' · Featured' : ''}</div>
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      ${item.duration ? `<p class="text-muted text-sm">${escapeHtml(item.duration)}</p>` : ''}
      <div class="offering-footer">
        ${item.price ? `<strong class="gold">${escapeHtml(item.price)}</strong>` : '<span>Contact for pricing</span>'}
        ${details ? `<a class="btn btn-small" href="${escapeHtml(details)}" target="_blank" rel="noopener noreferrer">View details ↗</a>` : '<a class="btn btn-small" href="#contactSection">Ask about this</a>'}
      </div>
    </div>
  </article>`;
}
