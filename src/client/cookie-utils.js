/**
 * Cookie Utilities
 * Simple cookie management for show selection
 * AI-Friendly: Pure functions for cookie operations
 */

const CookieUtils = {
  /**
   * Set a cookie with expiration
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {number} days - Expiration in days
   */
  set: function(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  },

  /**
   * Get a cookie value
   * @param {string} name - Cookie name
   * @returns {string} Cookie value or empty string
   */
  get: function(name) {
    return document.cookie.split('; ').reduce((r, v) => {
      const parts = v.split('=');
      return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, '');
  },

  /**
   * Delete a cookie
   * @param {string} name - Cookie name
   */
  delete: function(name) {
    this.set(name, '', -1);
  },

  /**
   * Get show parameter from URL or cookie
   * Priority: URL query > cookie
   * @returns {string|null} Show parameter
   */
  getShowParameter: function() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlShow = urlParams.get('show');
    
    // If ?show= is in URL, store it in cookie
    if (urlShow !== null) {
      if (urlShow === '') {
        // ?show= (empty) clears the cookie
        this.delete('show');
        return null;
      } else {
        this.set('show', urlShow);
        return urlShow;
      }
    }
    
    // Otherwise, use cookie value
    const cookieShow = this.get('show');
    return cookieShow || null;
  }
};

window.CookieUtils = CookieUtils;
