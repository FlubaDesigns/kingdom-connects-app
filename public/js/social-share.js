export function createShareButtons(config) {
  const { url, title, description, previewUrl, shareText } = config;
  
  // Use preview URL for social platforms (they'll get proper OG tags)
  // Keep original URL for email and copy
  const socialUrl = previewUrl || url;
  const encodedSocialUrl = encodeURIComponent(socialUrl);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description || title);
  
  const encodedPost = encodeURIComponent(shareText || title);
  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedSocialUrl}${shareText ? `&quote=${encodedPost}` : ''}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedSocialUrl}&text=${encodedPost}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedSocialUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedDescription}%0A%0A${encodedUrl}`
  };
  
  return shareLinks;
}

export function renderShareButtons(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const shareLinks = createShareButtons(config);
  
  const shareIcons = {
    facebook: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    twitter: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#FFFFFF" stroke="#888888" stroke-width="0.5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    linkedin: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    email: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#666666"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`
  };
  
  const html = `
    <div class="share-section">
      <h4 class="gold mb-sm">Share This</h4>
      <div class="social-icons-row">
        <a href="${shareLinks.facebook}" target="_blank" rel="noopener noreferrer" class="social-icon-link" title="Share on Facebook">
          ${shareIcons.facebook}<span class="social-label">Facebook</span>
        </a>
        <a href="${shareLinks.twitter}" target="_blank" rel="noopener noreferrer" class="social-icon-link" title="Share on X (Twitter)">
          ${shareIcons.twitter}<span class="social-label">X</span>
        </a>
        <a href="${shareLinks.linkedin}" target="_blank" rel="noopener noreferrer" class="social-icon-link" title="Share on LinkedIn">
          ${shareIcons.linkedin}<span class="social-label">LinkedIn</span>
        </a>
        <a href="${shareLinks.email}" class="social-icon-link" title="Share via Email">
          ${shareIcons.email}<span class="social-label">Email</span>
        </a>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  if (config.businessPost) {
    const post = config.businessPost;
    const preview = document.createElement('p');
    const businessLink = document.createElement('a');
    businessLink.href = post.businessUrl;
    businessLink.textContent = post.businessName;
    const churchLink = document.createElement('a');
    churchLink.href = post.churchUrl;
    churchLink.textContent = post.churchName;
    preview.append(businessLink, ', associated with ', churchLink, '.');
    container.prepend(preview);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-secondary';
    copy.textContent = 'Copy social post';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(post.text);
        window.showToast?.('Post copied with both page links.', 'success');
      } catch {
        window.showToast?.('Unable to copy the post.', 'error');
      }
    });
    container.append(copy);
  }
}

export function trackShare(platform, itemType, itemId) {
  console.log(`Shared ${itemType} ${itemId} on ${platform}`);
}
