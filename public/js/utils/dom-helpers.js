/**
 * DOM Helper Utilities for CSP-Compliant Code
 * Use these functions instead of inline styles in JavaScript
 */

/**
 * Show a status message with appropriate styling
 * @param {HTMLElement} container - Container element
 * @param {string} message - Message text
 * @param {string} type - 'success', 'warning', 'error', or 'info'
 */
export function showStatusMessage(container, message, type = 'info') {
  const className = `status-${type}`;
  container.innerHTML = `<p class="${className}">${message}</p>`;
}

/**
 * Create a status element
 * @param {string} message - Message text
 * @param {string} type - 'success', 'warning', 'error', or 'info'
 * @returns {string} HTML string with proper classes
 */
export function createStatusElement(message, type = 'info') {
  const className = `status-${type}`;
  return `<p class="${className}">${message}</p>`;
}

/**
 * Create a centered message element
 * @param {string} message - Message text
 * @param {string} iconEmoji - Optional emoji icon
 * @returns {string} HTML string
 */
export function createCenteredMessage(message, iconEmoji = '') {
  return `
    <div class="text-center">
      ${iconEmoji ? `<div class="icon-lg">${iconEmoji}</div>` : ''}
      <p>${message}</p>
    </div>
  `;
}

/**
 * Apply multiple CSS classes to an element
 * @param {HTMLElement} element - Target element
 * @param {string[]} classes - Array of class names
 */
export function addClasses(element, classes) {
  element.classList.add(...classes);
}

/**
 * Toggle element visibility by adding/removing class
 * @param {HTMLElement} element - Target element
 * @param {boolean} show - Whether to show the element
 * @param {string} hiddenClass - Class name for hidden state (default: 'hidden')
 */
export function toggleVisibility(element, show, hiddenClass = 'hidden') {
  if (show) {
    element.classList.remove(hiddenClass);
  } else {
    element.classList.add(hiddenClass);
  }
}

/**
 * Create a grid container with auto-fit columns
 * @param {string[]} items - Array of HTML strings
 * @returns {string} HTML string with grid wrapper
 */
export function createAutoGrid(items) {
  return `
    <div class="grid-auto-fit">
      ${items.join('')}
    </div>
  `;
}

/**
 * Sanitize user input for safe HTML rendering
 * @param {string} str - Input string
 * @returns {string} Sanitized string
 */
export function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Safe template helper - prevents XSS
 * @param {TemplateStringsArray} strings - Template strings
 * @param {...any} values - Template values
 * @returns {string} Safe HTML string
 */
export function html(strings, ...values) {
  return strings.map((str, i) => {
    const value = values[i];
    if (value === undefined || value === null) return str;
    // If it's a number or boolean, return as-is
    if (typeof value === 'number' || typeof value === 'boolean') {
      return str + value;
    }
    // Otherwise sanitize
    return str + sanitize(String(value));
  }).join('');
}
