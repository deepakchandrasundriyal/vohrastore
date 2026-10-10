/**
 * Hash router: #/orders/12?tab=history
 * A route maps a pattern to a view module's render({ el, params, query, setQuery }) which may return a cleanup fn.
 */
const routes = [];
let cleanup = null;
let guard = null;

export function route(pattern, load, meta = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, load, meta });
}

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function navigate(path, query) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString() : '';
  location.hash = '#' + path + (qs ? '?' + qs : '');
}

/** Replace the query string without adding history entries or re-rendering. */
export function replaceQuery(query) {
  const { path } = parseHash();
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null && v !== undefined)).toString();
  history.replaceState(null, '', '#' + path + (qs ? '?' + qs : ''));
  lastHash = location.hash;
}

/** A guard can veto navigation (e.g. unsaved changes). Return false to stay. */
export const setLeaveGuard = fn => { guard = fn; };

export async function resolve(el, onMatch) {
  const { path, query } = parseHash();
  const match = routes.map(r => ({ r, m: path.match(r.re) })).find(x => x.m);
  if (!match) { navigate('/dashboard'); return; }
  const params = Object.fromEntries(match.r.keys.map((k, i) => [k, decodeURIComponent(match.m[i + 1])]));

  if (typeof cleanup === 'function') cleanup();
  cleanup = null; guard = null;
  onMatch && onMatch(match.r.meta, path);
  // Every view gets a brand-new container, so event listeners a previous view attached are dropped with it.
  const viewEl = document.createElement('div');
  viewEl.innerHTML = '<div class="boot" style="min-height:40vh"><span class="spinner"></span></div>';
  el.replaceChildren(viewEl);
  window.scrollTo(0, 0);
  const view = await match.r.load();
  const token = viewEl;
  viewEl.innerHTML = '';
  cleanup = await view.render({ el: viewEl, params, query, setQuery: replaceQuery });
  if (!token.isConnected && typeof cleanup === 'function') { cleanup(); cleanup = null; } // user navigated away while it loaded
}

let target = null;
let lastHash = '';
/** Mount the router into `el`. Safe to call again after re-login (only one listener is ever attached). */
export function start(el, onMatch) {
  const first = target === null;
  target = { el, onMatch };
  lastHash = location.hash;
  if (first) {
    window.addEventListener('hashchange', () => {
      if (guard && guard() === false) { history.replaceState(null, '', lastHash); return; }
      lastHash = location.hash;
      resolve(target.el, target.onMatch);
    });
  }
  resolve(el, onMatch);
}
