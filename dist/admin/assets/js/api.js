/**
 * API client for admin/api.php. Adds the CSRF header on writes, parses JSON,
 * and turns error responses into ApiError (with per-field `errors`).
 */
const BASE = new URL('api.php/', new URL('../../', import.meta.url)).href;
let csrf = '';
const listeners = new Set();

export class ApiError extends Error {
  constructor(message, status, errors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const setCsrf = token => { csrf = token || ''; };

/** Subscribe to "session expired" (401) events. */
export const onUnauthorized = fn => listeners.add(fn);

export function apiUrl(path, query = {}) {
  const url = new URL(path, BASE);
  Object.entries(query).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v); });
  return url.href;
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, headers, credentials: 'same-origin' };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(apiUrl(path, query), init);
  } catch (e) {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== 'auth/login') listeners.forEach(fn => fn());
    throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.errors || {});
  }
  return data;
}

export const get = (path, query) => api(path, { query });
export const post = (path, body) => api(path, { method: 'POST', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const del = path => api(path, { method: 'DELETE' });
