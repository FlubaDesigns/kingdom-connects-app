/* Kingdom Connects - Testimonials Social Sharing */
import { onReady } from './dom-ready.js';

// Add social sharing
function initSocialSharing() {
  if (typeof addSocialSharing === 'function') {
    addSocialSharing('testimonialShare', {
      url: window.location.href,
      title: 'Kingdom Connects Success Stories',
      description: 'See how Christian businesses are thriving while supporting their churches!'
    });
  }
}

onReady(initSocialSharing);
