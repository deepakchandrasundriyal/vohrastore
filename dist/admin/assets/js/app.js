/**
 * Admin app entry: session bootstrap, login screen, shell (sidebar/topbar), routes.
 */
import { api, get, post, setCsrf, onUnauthorized } from './api.js';
import { icon } from './icons.js';
import { esc, initials, openMenu, toast, setBusy, $ } from './ui.js';
import { route, start, navigate } from './router.js';
import { session } from './session.js';
import { startAlerts, prefs as alertPrefs, enableDesktopNotifications, titleCount } from './alerts.js';

const app = document.getElementById('app');

/* ---------------- theme ---------------- */
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('vohra_admin_theme', t); } catch (e) { /* storage blocked */ }
}
if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = currentTheme();

/* ---------------- routes ---------------- */
const NAV = [
  { group: 'Overview', items: [{ path: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  { group: 'Sales', items: [
    { path: '/orders', label: 'Orders', icon: 'orders' },
    { path: '/shipping', label: 'Shipping', icon: 'truck', badge: 'shipping' },
    { path: '/customers', label: 'Customers', icon: 'customers' },
    { path: '/coupons', label: 'Coupons', icon: 'coupons' },
  ] },
  { group: 'Catalogue', items: [{ path: '/products', label: 'Products', icon: 'products' }] },
  { group: 'Growth', items: [
    { path: '/reports', label: 'Reports', icon: 'chart' },
    { path: '/marketing', label: 'Marketing links', icon: 'link' },
    { path: '/seo', label: 'SEO', icon: 'globe' },
  ] },
  { group: 'Inbox', items: [{ path: '/enquiries', label: 'Enquiries', icon: 'inbox', badge: 'enquiries' }] },
  { group: 'Admin', items: [
    { path: '/settings', label: 'Settings', icon: 'settings' },
    { path: '/team', label: 'Team', icon: 'team', role: 'admin' },
  ] },
];

const view = name => () => import(`./views/${name}.js`);
route('/dashboard', view('dashboard'), { section: '/dashboard', title: 'Dashboard' });
route('/orders', view('orders'), { section: '/orders', title: 'Orders' });
route('/orders/new', view('order-form'), { section: '/orders', title: 'New order' });
route('/orders/:id', view('order-detail'), { section: '/orders', title: 'Order' });
route('/shipping', view('shipping'), { section: '/shipping', title: 'Shipping' });
route('/shipping/slips', view('packing-slips'), { section: '/shipping', title: 'Packing slips' });
route('/products', view('products'), { section: '/products', title: 'Products' });
route('/products/new', view('product-form'), { section: '/products', title: 'New product' });
route('/products/:id', view('product-form'), { section: '/products', title: 'Edit product' });
route('/customers', view('customers'), { section: '/customers', title: 'Customers' });
route('/customers/:id', view('customer-detail'), { section: '/customers', title: 'Customer' });
route('/coupons', view('coupons'), { section: '/coupons', title: 'Coupons' });
route('/enquiries', view('enquiries'), { section: '/enquiries', title: 'Enquiries' });
route('/reports', view('reports'), { section: '/reports', title: 'Reports' });
route('/reports/:tab', view('reports'), { section: '/reports', title: 'Reports' });
route('/marketing', view('marketing'), { section: '/marketing', title: 'Marketing links' });
route('/seo', view('seo'), { section: '/seo', title: 'SEO' });
route('/settings', view('settings'), { section: '/settings', title: 'Settings' });
route('/team', view('team'), { section: '/team', title: 'Team' });
route('/profile', view('profile'), { section: '/profile', title: 'My profile' });

/* ---------------- login ---------------- */
function renderLogin() {
  const tins = ['peri-peri', 'cheesy-delight', 'pink-salt', 'mint-pudina', 'tangy-tomato'];
  app.innerHTML = `
    <div class="auth">
      <aside class="auth-art">
        <div class="brand" style="padding:0"><img src="../assets/img/brand/logo.png" alt=""><div><b>Vohra's Store</b><small style="color:rgba(251,246,234,.6)">Admin</small></div></div>
        <div class="tins">${tins.map(s => `<img src="../assets/img/products/${s}.webp" alt="">`).join('')}</div>
        <div><h2>Run the whole store from one calm place.</h2><p>Orders, stock, customers, coupons and enquiries — with the numbers that matter on the first screen.</p></div>
      </aside>
      <main class="auth-form">
        <div class="auth-card">
          <div class="brand"><img src="../assets/img/brand/logo.png" alt=""><div><b>Vohra's Store</b><small>Admin panel</small></div></div>
          <h1>Sign in</h1>
          <p>Use your admin email and password.</p>
          <form novalidate>
            <div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" class="input" autocomplete="username" required></div>
            <div class="field"><label for="l-pass">Password</label>
              <div class="pass-wrap"><input id="l-pass" name="password" type="password" class="input" autocomplete="current-password" required>
              <button type="button" class="btn btn-ghost btn-sm" data-toggle-pass>Show</button></div></div>
            <p class="field-error" data-login-error hidden role="alert"></p>
            <button type="submit" class="btn btn-primary w-full" style="height:44px">Sign in</button>
          </form>
          <p class="hint mt-3">Forgot your password? Ask another admin to reset it from <b>Team</b>.</p>
        </div>
      </main>
    </div>`;
  const form = $('form', app);
  const errEl = $('[data-login-error]', app);
  $('[data-toggle-pass]', app).addEventListener('click', e => {
    const i = $('#l-pass'); i.type = i.type === 'password' ? 'text' : 'password'; e.target.textContent = i.type === 'password' ? 'Show' : 'Hide';
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    errEl.hidden = true;
    if (!form.email.value.trim() || !form.password.value) { errEl.textContent = 'Enter your email and password.'; errEl.hidden = false; return; }
    setBusy(btn, true, 'Signing in…');
    try {
      const res = await post('auth/login', { email: form.email.value.trim(), password: form.password.value });
      setCsrf(res.csrf);
      await boot();
    } catch (err) {
      errEl.textContent = err.message; errEl.hidden = false;
      setBusy(btn, false);
      form.password.select();
    }
  });
  $('#l-email').focus();
}

/* ---------------- shell ---------------- */
function navHTML(user) {
  return NAV.map(g => {
    const items = g.items.filter(i => !i.role || i.role === user.role);
    if (!items.length) return '';
    return `<div class="nav-group"><div class="nav-label">${esc(g.group)}</div><nav class="nav">${items.map(i => `
      <a href="#${i.path}" data-section="${i.path}">${icon(i.icon)}<span>${esc(i.label)}</span>${i.badge ? `<span class="count" data-badge="${i.badge}" hidden></span>` : ''}</a>`).join('')}</nav></div>`;
  }).join('');
}

function renderShell() {
  const user = session.user;
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Main navigation">
        <a href="#/dashboard" class="brand"><img src="../assets/img/brand/logo.png" alt=""><div><b>Vohra's Store</b><small>Admin</small></div></a>
        ${navHTML(user)}
        <div class="sidebar-foot">
          <button type="button" class="user-chip" data-user-menu aria-haspopup="menu">
            <span class="avatar">${esc(initials(user.name))}</span>
            <span class="ellipsis"><span class="ellipsis" data-user-name>${esc(user.name)}</span><small>${esc(user.role === 'admin' ? 'Administrator' : 'Staff')}</small></span>
            ${icon('dots', 'chev')}
          </button>
        </div>
      </aside>
      <div class="scrim" data-scrim></div>
      <div class="main">
        <header class="topbar">
          <button type="button" class="btn btn-ghost btn-icon menu-btn" data-nav-toggle aria-label="Open menu">${icon('menu')}</button>
          <form class="global-search" role="search" data-global-search>
            ${icon('search')}
            <input class="input" type="search" name="q" placeholder="Search orders by number, name, email or phone" aria-label="Search orders">
            <kbd>/</kbd>
          </form>
          <div class="topbar-actions">
            <button type="button" class="btn btn-ghost btn-icon" data-theme-toggle aria-label="Toggle dark mode">${icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>
            <a href="../" target="_blank" rel="noopener" class="btn btn-ghost btn-icon hide-sm" aria-label="View store">${icon('store')}</a>
            <a href="#/orders/new" class="btn btn-primary">${icon('plus')}<span class="hide-sm">New order</span></a>
          </div>
        </header>
        <main class="content" id="view" tabindex="-1"></main>
      </div>
    </div>`;

  const shell = $('.shell', app);
  const closeNav = () => shell.classList.remove('nav-open');
  $('[data-nav-toggle]', app).addEventListener('click', () => shell.classList.toggle('nav-open'));
  $('[data-scrim]', app).addEventListener('click', closeNav);
  $('.sidebar', app).addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });

  $('[data-theme-toggle]', app).addEventListener('click', e => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    e.currentTarget.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
  });

  const search = $('[data-global-search]', app);
  search.addEventListener('submit', e => {
    e.preventDefault();
    const q = search.q.value.trim();
    navigate('/orders', q ? { q } : {});
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('dialog[open]')) {
      e.preventDefault(); search.q.focus();
    }
  });

  $('[data-user-menu]', app).addEventListener('click', e => openMenu(e.currentTarget, [
    { label: 'My profile', icon: 'user', onClick: () => navigate('/profile') },
    { label: 'View store', icon: 'external', onClick: () => window.open('../', '_blank', 'noopener') },
    '-',
    { label: alertPrefs.get().sound ? 'New-order sound: on' : 'New-order sound: off', icon: 'inbox', onClick: () => { const on = !alertPrefs.get().sound; alertPrefs.set({ sound: on }); toast(on ? 'New-order sound turned on' : 'New-order sound turned off'); } },
    { label: alertPrefs.get().desktop ? 'Desktop alerts: on' : 'Turn on desktop alerts', icon: 'alert', onClick: async () => { const r = await enableDesktopNotifications(); toast(r === 'granted' ? 'Desktop alerts on. You will be notified of new orders even in another tab.' : 'Your browser blocked notifications. Allow them in the site settings.', r === 'granted' ? 'ok' : 'error'); } },
    '-',
    { label: 'Sign out', icon: 'logout', onClick: logout },
  ]));

  start($('#view', app), (meta) => {
    document.title = `${meta.title} · Vohra's Admin`;
    app.querySelectorAll('[data-section]').forEach(a => {
      if (a.dataset.section === meta.section) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  });
  renderBadges();
  startAlerts();
}

export function renderBadges() {
  const b = session.badges || {};
  app.querySelectorAll('[data-badge]').forEach(el => {
    const n = b[el.dataset.badge] || 0;
    el.textContent = n > 99 ? '99+' : n; el.hidden = n === 0;
  });
}
session.onBadges = renderBadges;

async function logout() {
  try { await post('auth/logout'); } catch (e) { /* already signed out */ }
  session.user = null; setCsrf('');
  location.hash = '';
  renderLogin();
  toast('Signed out');
}

onUnauthorized(() => {
  if (!session.user) return;
  session.user = null;
  toast('Your session has expired. Please sign in again.', 'error');
  renderLogin();
});

async function boot() {
  try {
    const s = await get('auth/session');
    setCsrf(s.csrf);
    if (!s.user) { renderLogin(); return; }
    session.user = s.user; session.badges = s.badges;
    renderShell();
  } catch (err) {
    app.innerHTML = `<div class="boot"><div class="card load-error" style="max-width:420px">${icon('alert')}<h3>Can't reach the admin API</h3><p>${esc(err.message)}</p><button class="btn" onclick="location.reload()">Retry</button></div></div>`;
  }
}

/** Views call this after changes that affect sidebar counts. */
export async function refreshBadges() {
  try { const s = await api('auth/session'); session.badges = s.badges; renderBadges(); } catch (e) { /* non-critical */ }
}
session.refreshBadges = refreshBadges;

boot();
