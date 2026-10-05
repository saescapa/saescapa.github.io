(() => {
  'use strict';

  function getTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function onThemeChange(callback) {
    const listener = (event) => callback(event.detail.theme);
    document.addEventListener('themechange', listener);
    return () => document.removeEventListener('themechange', listener);
  }

  document.addEventListener('click', (event) => {
    if (getTheme() === 'dark' && event.target.closest('[data-playground] a')) {
      event.preventDefault();
    }
  });

  window.site = window.site || {};
  window.site.theme = { getTheme, onThemeChange };
})();
