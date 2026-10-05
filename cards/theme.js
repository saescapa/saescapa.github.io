const STORAGE_KEY = 'theme';
const THEMES = ['light', 'dark'];

function isTheme(value) {
  return THEMES.includes(value);
}

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeTheme(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
}

const root = document.documentElement;
let theme = [readStoredTheme(), root.dataset.theme].find(isTheme) ?? 'light';
root.dataset.theme = theme;

export function getTheme() {
  return theme;
}

export function onThemeChange(callback) {
  const listener = (event) => callback(event.detail.theme);
  document.addEventListener('themechange', listener);
  return () => document.removeEventListener('themechange', listener);
}

function setTheme(next) {
  theme = next;
  root.dataset.theme = next;
  storeTheme(next);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
}

const toggle = document.querySelector('.theme-toggle');

function renderToggle() {
  const dark = theme === 'dark';
  toggle.textContent = dark ? 'Light' : 'Playground';
  toggle.setAttribute('aria-pressed', String(dark));
}

if (toggle) {
  toggle.hidden = false;
  renderToggle();
  toggle.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
  onThemeChange(renderToggle);
}

document.addEventListener('click', (event) => {
  if (theme === 'dark' && event.target.closest('[data-playground] a')) {
    event.preventDefault();
  }
});
