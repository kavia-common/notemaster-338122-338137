/**
 * Theme utilities for Notemaster.
 *
 * - Persisted preference stored in localStorage under THEME_STORAGE_KEY.
 * - If no persisted preference exists, we default to the user's OS preference.
 */

export const THEME_STORAGE_KEY = "notemaster.theme";

export const THEMES = {
  LIGHT: "light",
  DARK: "dark",
};

function isValidTheme(value) {
  return value === THEMES.LIGHT || value === THEMES.DARK;
}

function safeGetLocalStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore write failures (private mode / disabled storage). Theme will still work for session.
  }
}

/**
 * PUBLIC_INTERFACE
 * Determine the initial theme.
 *
 * Priority:
 * 1) persisted preference
 * 2) OS preference
 * 3) light
 */
export function getInitialTheme() {
  const persisted = safeGetLocalStorage(THEME_STORAGE_KEY);
  if (isValidTheme(persisted)) return persisted;

  try {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? THEMES.DARK : THEMES.LIGHT;
  } catch {
    return THEMES.LIGHT;
  }
}

/**
 * PUBLIC_INTERFACE
 * Apply a theme to the document root (data-theme attribute) and persist it.
 */
export function applyTheme(theme) {
  const next = isValidTheme(theme) ? theme : THEMES.LIGHT;
  document.documentElement.setAttribute("data-theme", next);
  safeSetLocalStorage(THEME_STORAGE_KEY, next);
  return next;
}

/**
 * PUBLIC_INTERFACE
 * Toggle between light and dark themes; applies + persists.
 */
export function toggleTheme(currentTheme) {
  const next = currentTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
  applyTheme(next);
  return next;
}
