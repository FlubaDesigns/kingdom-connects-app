import { onReady } from './dom-ready.js';

function initTestimonials() {
  addSocialSharing('testimonialShare', {
    url: window.location.href,
    title: 'Kingdom Connects Success Stories',
    description: 'See how Christian businesses are thriving while supporting their churches!'
  });
}

onReady(initTestimonials);
