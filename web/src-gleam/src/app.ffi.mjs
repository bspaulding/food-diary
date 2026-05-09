// src/auth0_ffi.mjs
// FFI functions for Auth0 authentication

// Redirect to Auth0 login
export function redirectToLogin(authUrl) {
  window.location.href = authUrl;
}

// Get the authorization code from URL parameters
export function getAuthCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}

// Get user info from Auth0
export async function getUserInfo(domain, accessToken) {
  const response = await fetch(`https://${domain}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get user info");
  }

  const userInfo = await response.json();
  return userInfo;
}

// Store token in localStorage
export function storeToken(token) {
  localStorage.setItem("auth0_token", token);
}

// Get token from localStorage
export function getStoredToken() {
  return localStorage.getItem("auth0_token");
}

// Remove token from localStorage
export function clearStoredToken() {
  localStorage.removeItem("auth0_token");
}

// Verify token is still valid (basic check)
export function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp * 1000; // Convert to milliseconds
    return Date.now() >= exp;
  } catch (e) {
    return true;
  }
}

export function getLocationProtocol() {
  return location.protocol;
}

export function getLocationHost() {
  return location.host;
}

export function resetLocation() {
  history.pushState({}, "", "/");
}

export function getApiBaseUrl() {
  return location.origin;
}

export function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let debounceTimer;
export function debounceSearch(fn, delay) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}

export function nowMinusOneHourISO() {
  return new Date(Date.now() - 3600000).toISOString();
}

export function nowPlusOneHourISO() {
  return new Date(Date.now() + 3600000).toISOString();
}

// Loading eruda for mobile debugging

function loadScript(url, callback) {
  const script = document.createElement("script");
  script.src = url;
  script.onload = callback;
  document.head.appendChild(script);
}

function isMobileSafari() {
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

if (isMobileSafari()) {
  loadScript("https://cdn.jsdelivr.net/npm/eruda", function () {
    eruda.init();
  });
}
