/* Kingdom Connects - Social Sharing Component */

/**
 * Add social sharing buttons to any element
 * @param {string} containerId - ID of the container element
 * @param {object} options - Sharing options (url, title, description)
 */
function addSocialSharing(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const url = options.url || window.location.href;
  const title = encodeURIComponent(options.title || document.title);
  const description = encodeURIComponent(options.description || 'Check out this Christian business on Kingdom Connects!');
  const encodedUrl = encodeURIComponent(url);
  
  const shareButtons = `
    <div class="share-buttons">
      <span class="text-muted font-semibold">Share:</span>
      
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" 
         target="_blank" 
         rel="noopener noreferrer"
         class="share-btn facebook"
         aria-label="Share on Facebook">
        <span>📘</span> Facebook
      </a>
      
      <a href="https://twitter.com/intent/tweet?url=${encodedUrl}&text=${title}" 
         target="_blank" 
         rel="noopener noreferrer"
         class="share-btn twitter"
         aria-label="Share on Twitter">
        <span>🐦</span> Twitter
      </a>
      
      <a href="mailto:?subject=${title}&body=${description}%20${encodedUrl}" 
         class="share-btn email"
         aria-label="Share via Email">
        <span>📧</span> Email
      </a>
      
      <button class="share-btn copy copy-link-btn"
              data-url="${url.replace(/"/g, '&quot;')}"
              aria-label="Copy link">
        <span>🔗</span> Copy Link
      </button>
    </div>
  `;
  
  container.innerHTML = shareButtons;
  
  // Bind click event safely to copy button
  const copyBtn = container.querySelector('.copy-link-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      const urlToCopy = this.getAttribute('data-url');
      copyToClipboard(urlToCopy);
    });
  }
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    window.showToast('Link copied! Share it with friends and family.', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.className = 'invisible-clipboard';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      window.showToast('Link copied! Share it with friends and family.', 'success');
    } catch (err) {
      window.showToast('Unable to copy link automatically', 'error');
    }
    document.body.removeChild(textarea);
  });
}

/**
 * Generate shareable quote for reviews
 */
function generateReviewShareText(businessName, rating, reviewText) {
  const stars = '⭐'.repeat(rating);
  const snippet = reviewText.length > 100 ? reviewText.substring(0, 100) + '...' : reviewText;
  return `I gave ${businessName} ${stars} on Kingdom Connects! "${snippet}"`;
}

// Export functions for use in other scripts
window.addSocialSharing = addSocialSharing;
window.generateReviewShareText = generateReviewShareText;
