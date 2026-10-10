// ============================================================
// SSR Cloud Functions - Kingdom Connects
// Business and Church profile pages for production SEO
// ============================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION   = 'us-central1';
const BASE_URL = 'https://kingdomconnects.org';
const DEFAULT_IMAGE = `${BASE_URL}/assets/og-kingdom-connects.png`;

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCategory(slug) {
  if (!slug) return '';
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
}

function generateSlug(name, city, state, docId = null) {
  const parts = [name, city, state].filter(Boolean);
  const slug = parts.join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
  if (!slug || slug.length < 3) return docId || 'listing';
  return slug;
}

// ── Business Page Generator ───────────────────────────────────
function generateBusinessPage(business, businessId) {
  const name        = escapeHtml(business.business_name);
  const description = escapeHtml(business.description || '');
  const category    = escapeHtml(formatCategory(business.primary_category || ''));
  const city        = escapeHtml(business.city || '');
  const state       = escapeHtml(business.state || '');
  const phone       = escapeHtml(business.phone_number || business.phone || '');
  const email       = escapeHtml(business.email || '');
  const address     = escapeHtml([business.address_line1, business.city, business.state, business.zip_code].filter(Boolean).join(', '));
  const image       = business.photos?.[0] || DEFAULT_IMAGE;
  const rating      = business.average_rating ? `${business.average_rating.toFixed(1)} stars` : '';
  const reviewCount = business.review_count || 0;

  const slug         = business.slug || generateSlug(business.business_name, business.city, business.state, businessId);
  const canonicalUrl = `${BASE_URL}/business/${slug}.htm`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": business.business_name,
    "description": business.description || '',
    "address": {
      "@type": "PostalAddress",
      "streetAddress": business.address_line1 || '',
      "addressLocality": business.city || '',
      "addressRegion": business.state || '',
      "postalCode": business.zip_code || ''
    },
    "telephone": business.phone_number || business.phone || '',
    "url": canonicalUrl,
    "image": image
  };

  if (business.average_rating) {
    structuredData.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": business.average_rating,
      "reviewCount": reviewCount
    };
  }

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} - ${category} in ${city}, ${state} | Kingdom Connects</title>
  <meta name="description" content="${description.substring(0, 160) || `${name} is a Christian ${category} in ${city}, ${state}. Find contact info, reviews, and more on Kingdom Connects.`}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="business.business">
  <meta property="og:site_name" content="Kingdom Connects">
  <meta property="og:title" content="${name} - Kingdom Connects">
  <meta property="og:description" content="${description.substring(0, 200) || `${name} is a Christian business in ${city}, ${state}.`}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${name} - Kingdom Connects">
  <meta name="twitter:description" content="${description.substring(0, 200) || `${name} is a Christian business in ${city}, ${state}.`}">
  <meta name="twitter:image" content="${image}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" href="/assets/favicon.ico" type="image/x-icon">
  <script type="application/ld+json">${safeJsonForScript(structuredData)}</script>
  <link rel="stylesheet" href="/styles/layout.css?v=8">
  <link rel="stylesheet" href="/styles/theme.css?v=8">
  <link rel="stylesheet" href="/styles/buttons.css?v=8">
  <link rel="stylesheet" href="/styles/forms.css?v=8">
  <link rel="stylesheet" href="/styles/components/business-cards.css?v=8">
  <link rel="stylesheet" href="/styles/overrides.css?v=8">
  <script>
    window.__KC_INITIAL_DATA__ = ${safeJsonForScript({ type: 'business', id: businessId, slug, data: business })};
  </script>
</head>
<body>
  <a id="top"></a>
  <div class="page-wrap">
    <div id="header"></div>
    <div id="breadcrumbs"></div>
    <main class="page-content" id="main">
      <div id="loadingMessage" class="hidden"></div>
      <div id="errorMessage" class="hidden"></div>
      <div id="businessContent">
        <div class="m-block">
          <a href="/business_directory.html" class="btn btn-small">← Back to Directory</a>
        </div>
        <article class="card">
          ${business.is_pro ? '<div id="proBadge" class="mb-sm"><span class="badge badge-gold">PRO BUSINESS</span></div>' : ''}
          <h1 id="businessName" class="gold-metallic mb-sm">${name}</h1>
          <div id="businessCategory" class="business-meta">${category}</div>
          ${rating ? `<div id="ratingDisplay" class="mb-md">${rating} (${reviewCount} reviews)</div>` : ''}
          <div id="businessDescription" class="mb-md">${description}</div>
        </article>
        <article class="card">
          <h2 class="gold">Contact Information</h2>
          <div class="grid-2 gap-md">
            <div>
              <h3 class="text-md mb-sm">Address</h3>
              <p id="businessAddress">${address}</p>
            </div>
            <div>
              <h3 class="text-md mb-sm">Contact</h3>
              ${phone ? `<p id="businessPhone" class="mb-sm"><a href="tel:${phone}">${phone}</a></p>` : ''}
              ${email ? `<p id="businessEmail" class="mb-sm"><a href="mailto:${email}">${email}</a></p>` : ''}
            </div>
          </div>
        </article>
        <article id="mediaSection" class="card hidden">
          <h2 class="gold">Photos &amp; Videos</h2>
          <div id="photoGallery" class="photo-gallery mb-md"></div>
          <div id="videoGallery"></div>
        </article>
        <article id="promotionsSection" class="card hidden">
          <h2 class="gold">Current Promotions</h2>
          <div id="promotionsList"></div>
        </article>
        <article id="productsServicesSection" class="card hidden">
          <h2 class="gold">Products &amp; Services</h2>
          <div id="productsServicesList"></div>
        </article>
        <article id="testimonialsSection" class="card hidden">
          <h2 class="gold">Customer Testimonials</h2>
          <div id="testimonialsList"></div>
        </article>
        <article id="socialMediaSection" class="card hidden">
          <h2 class="gold">Follow Us</h2>
          <div id="socialMediaLinks" class="social-links-row"></div>
        </article>
        <article id="shareSection" class="card">
          <div id="socialShareButtons"></div>
        </article>
        <article class="card">
          <h2 class="gold">Customer Reviews</h2>
          <div id="reviewsStats" class="mb-md"></div>
          <div id="noReviews" class="text-center p-md text-muted">Loading reviews...</div>
          <div id="reviewsList"></div>
          <div id="submitReviewContainer" class="mt-md text-center">
            <a id="submitReviewBtn" href="/submit_review.html?business=${businessId}" class="btn btn-gold">Write a Review</a>
          </div>
        </article>
      </div>
    </main>
    <div id="footer"></div>
  </div>
  <script src="/js/maintenance-check.js" type="module"></script>
  <script src="/js/components.js" defer></script>
  <script src="/js/button-effects.js" defer></script>
  <script src="/js/breadcrumbs.js" defer></script>
  <script type="module" src="/js/business.js"></script>
</body>
</html>`;
}

// ── Church Page Generator ─────────────────────────────────────
function generateChurchPage(church, churchId) {
  const name         = escapeHtml(church.church_name);
  const description  = escapeHtml(church.description || '');
  const denomination = escapeHtml(church.denomination || '');
  const city         = escapeHtml(church.city || '');
  const state        = escapeHtml(church.state || '');
  const phone        = escapeHtml(church.phone_number || church.phone || '');
  const email        = escapeHtml(church.contact_email || church.email || '');
  const address      = escapeHtml([church.address_line1, church.city, church.state, church.zip_code].filter(Boolean).join(', '));
  const image        = church.hero_image || church.logo || DEFAULT_IMAGE;

  const slug         = church.slug || generateSlug(church.church_name, church.city, church.state, churchId);
  const canonicalUrl = `${BASE_URL}/church/${slug}.htm`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Church",
    "name": church.church_name,
    "description": church.description || '',
    "address": {
      "@type": "PostalAddress",
      "streetAddress": church.address_line1 || '',
      "addressLocality": church.city || '',
      "addressRegion": church.state || '',
      "postalCode": church.zip_code || ''
    },
    "telephone": church.phone_number || church.phone || '',
    "url": canonicalUrl,
    "image": image
  };

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}${denomination ? ` - ${denomination}` : ''} in ${city}, ${state} | Kingdom Connects</title>
  <meta name="description" content="${description.substring(0, 160) || `${name} is a ${denomination || 'church'} in ${city}, ${state}. Join our community of faith.`}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="place">
  <meta property="og:site_name" content="Kingdom Connects">
  <meta property="og:title" content="${name} - Kingdom Connects">
  <meta property="og:description" content="${description.substring(0, 200) || `${name} is a church in ${city}, ${state}. Join our community.`}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${name} - Kingdom Connects">
  <meta name="twitter:description" content="${description.substring(0, 200) || `${name} is a church in ${city}, ${state}.`}">
  <meta name="twitter:image" content="${image}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" href="/assets/favicon.ico" type="image/x-icon">
  <script type="application/ld+json">${safeJsonForScript(structuredData)}</script>
  <link rel="stylesheet" href="/styles/layout.css?v=7">
  <link rel="stylesheet" href="/styles/theme.css?v=7">
  <link rel="stylesheet" href="/styles/buttons.css?v=7">
  <link rel="stylesheet" href="/styles/forms.css?v=7">
  <link rel="stylesheet" href="/styles/overrides.css?v=7">
  <link rel="stylesheet" href="/styles/components/church.css">
  <script>
    window.__KC_INITIAL_DATA__ = ${safeJsonForScript({ type: 'church', id: churchId, slug, data: church })};
  </script>
</head>
<body>
  <a id="top"></a>
  <div class="page-wrap">
    <div id="header"></div>
    <div id="breadcrumbs" class="breadcrumb-container"></div>
    <main class="page-content" id="main">
      <div id="loadingMessage" class="hidden"></div>
      <div id="errorMessage" class="hidden"></div>
      <div id="churchProfile">
        <article class="card" id="heroSection">
          ${church.hero_image ? `<img id="heroImage" class="church-hero-image" src="${church.hero_image}" alt="${name} banner">` : ''}
          <div class="flex-between mb-sm">
            <div>
              <h1 id="churchName" class="gold-metallic">${name}</h1>
              ${denomination ? `<p id="churchDenomination" class="text-muted">${denomination}</p>` : ''}
            </div>
            <button id="favoriteBtn" class="btn btn-gold btn-small hidden">Save</button>
          </div>
          <p id="churchDescription" class="line-height-relaxed">${description}</p>
          ${church.welcome_message ? `<p id="welcomeMessage" class="welcome-message">${escapeHtml(church.welcome_message)}</p>` : ''}
        </article>
        <article id="shareSection" class="card">
          <div id="socialShareButtons"></div>
        </article>
        <article class="card" id="contactCard">
          <h2 class="gold">Contact Information</h2>
          <div id="contactInfo" class="contact-info-grid">
            ${address ? `<p><strong>Address:</strong> ${address}</p>` : ''}
            ${phone ? `<p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
            ${email ? `<p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>` : ''}
          </div>
        </article>
        <article class="card">
          <a href="/church_directory.html" class="btn btn-gold">Back to Church Directory</a>
        </article>
      </div>
    </main>
    <div id="footer"></div>
  </div>
  <script src="/js/maintenance-check.js" type="module"></script>
  <script src="/js/header_public.js" type="module"></script>
  <script src="/js/footer_public.js" defer></script>
  <script src="/js/breadcrumbs.js" defer></script>
  <script type="module" src="/js/church.js"></script>
</body>
</html>`;
}

// ── Cloud Function: Business Profile ─────────────────────────
exports.businessProfile = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  try {
    // Extract slug from path: /business/{slug}.htm
    const pathSlug = req.path.split('/').filter(Boolean).pop()?.replace(/\.htm$/, '');
    if (!pathSlug) return res.status(400).send('Invalid URL');

    const db = admin.firestore();
    let businessData = null;
    let businessId   = null;

    // Slug lookup
    const slugQuery = await db.collection('business_listings_public')
      .where('slug', '==', pathSlug)
      .where('listing_status', '==', 'active')
      .limit(1).get();

    if (!slugQuery.empty) {
      businessId   = slugQuery.docs[0].id;
      businessData = slugQuery.docs[0].data();
    } else {
      // Fallback: generate slug from all active listings
      const allActive = await db.collection('business_listings_public')
        .where('listing_status', '==', 'active').get();
      for (const doc of allActive.docs) {
        const d    = doc.data();
        const gen  = generateSlug(d.business_name, d.city, d.state, doc.id);
        if (gen === pathSlug) { businessId = doc.id; businessData = d; break; }
      }
    }

    if (businessData) {
      const parent = businessData.church_id ? await db.collection('churches').doc(businessData.church_id).get() : null;
      if (!require('./hierarchy-policy').businessState(businessData, parent?.data()).is_visible) businessData = null;
    }
    if (!businessData) {
      res.status(404);
      return res.send(`<!DOCTYPE html><html><head><title>Not Found - Kingdom Connects</title>
<meta http-equiv="refresh" content="3; url=/business_directory.html"></head>
<body><h1>Business Not Found</h1><p>Redirecting to <a href="/business_directory.html">Business Directory</a>...</p></body></html>`);
    }

    res.set('Cache-Control', 'public, max-age=300');
    return res.send(generateBusinessPage(businessData, businessId));
  } catch (err) {
    console.error('[SSR] Business error:', err);
    return res.status(500).send('Server error');
  }
});

// ── Cloud Function: Church Profile ────────────────────────────
exports.churchProfile = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  try {
    // Extract slug from path: /church/{slug}.htm
    const pathSlug = req.path.split('/').filter(Boolean).pop()?.replace(/\.htm$/, '');
    if (!pathSlug) return res.status(400).send('Invalid URL');

    const db = admin.firestore();
    let churchData = null;
    let churchId   = null;

    // Slug lookup
    const slugQuery = await db.collection('churches')
      .where('slug', '==', pathSlug)
      .where('listing_status', '==', 'active')
      .limit(1).get();

    if (!slugQuery.empty) {
      churchId   = slugQuery.docs[0].id;
      churchData = slugQuery.docs[0].data();
    } else {
      const allActive = await db.collection('churches')
        .where('listing_status', '==', 'active').get();
      for (const doc of allActive.docs) {
        const d   = doc.data();
        const gen = generateSlug(d.church_name, d.city, d.state, doc.id);
        if (gen === pathSlug) { churchId = doc.id; churchData = d; break; }
      }
    }

    if (!churchData) {
      res.status(404);
      return res.send(`<!DOCTYPE html><html><head><title>Not Found - Kingdom Connects</title>
<meta http-equiv="refresh" content="3; url=/church_directory.html"></head>
<body><h1>Church Not Found</h1><p>Redirecting to <a href="/church_directory.html">Church Directory</a>...</p></body></html>`);
    }

    res.set('Cache-Control', 'public, max-age=300');
    return res.send(generateChurchPage(churchData, churchId));
  } catch (err) {
    console.error('[SSR] Church error:', err);
    return res.status(500).send('Server error');
  }
});
