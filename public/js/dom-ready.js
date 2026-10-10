/* Kingdom Connects - DOM Ready Utility */

/**
 * Executes callback when DOM is ready, handling module script timing
 * Works whether called before or after DOMContentLoaded event
 */
export function onReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}
