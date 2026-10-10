/*!
 * Vohra's Store — frontend showcase script (vanilla ES6, no dependencies).
 * Cart, orders and login are simulated in localStorage for the design review.
 * In the dynamic build each `Store`/`Cart` call becomes a fetch() to the PHP JSON API.
 */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const PRODUCTS = window.VOHRA_PRODUCTS || [];
  const CFG = window.VOHRA_CONFIG || { shipping: { freeAbove: 499, flat: 49 }, coupons: {} };
  const BY = Object.fromEntries(PRODUCTS.map(p => [p.slug, p]));
  const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const page = document.body.dataset.page || '';

  /* ---------------- storage (safe) ---------------- */
  const mem = {};
  const Store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} },
  };

  /* ---------------- cart ---------------- */
  const MAX_QTY = 20;
  const Cart = {
    items() { return (Store.get('vohra_cart', []) || []).filter(i => BY[i.slug]); },
    save(items) { Store.set('vohra_cart', items); renderAll(); },
    add(slug, qty = 1) {
      const items = this.items(); const line = items.find(i => i.slug === slug);
      if (line) line.qty = Math.min(MAX_QTY, line.qty + qty); else items.push({ slug, qty: Math.min(MAX_QTY, qty) });
      this.save(items);
    },
    set(slug, qty) {
      let items = this.items();
      if (qty <= 0) items = items.filter(i => i.slug !== slug);
      else items.forEach(i => { if (i.slug === slug) i.qty = Math.min(MAX_QTY, qty); });
      this.save(items);
    },
    clear() { Store.del('vohra_coupon'); this.save([]); },
    count() { return this.items().reduce((a, i) => a + i.qty, 0); },
    lines() { return this.items().map(i => ({ ...i, p: BY[i.slug], line: BY[i.slug].price * i.qty })); },
    coupon() { const c = Store.get('vohra_coupon', null); return c && CFG.coupons[c] ? c : null; },
    totals() {
      const subtotal = this.lines().reduce((a, l) => a + l.line, 0);
      const code = this.coupon(); const c = code ? CFG.coupons[code] : null;
      const discount = c ? (c.type === 'percent' ? Math.round(subtotal * c.value / 100) : Math.min(subtotal, c.value)) : 0;
      const after = subtotal - discount;
      const shipping = subtotal === 0 || after >= CFG.shipping.freeAbove ? 0 : CFG.shipping.flat;
      const mrp = this.lines().reduce((a, l) => a + l.p.mrp * l.qty, 0);
      return { subtotal, discount, shipping, total: after + shipping, code, mrp };
    },
  };

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $('[data-toast]'); if (!t) return;
    $('[data-toast-text]', t).textContent = msg;
    t.classList.add('is-on'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  /* ---------------- panels: cart / menu / search ---------------- */
  const scrim = $('[data-scrim]');
  let openPanel = null, lastFocus = null;
  function open(name) {
    const el = $(`[data-panel="${name}"]`); if (!el) return;
    if (openPanel) close();
    lastFocus = document.activeElement;
    openPanel = el; el.setAttribute('aria-hidden', 'false');
    if (name === 'search') { el.classList.remove('-translate-y-full'); setTimeout(() => $('[data-search-input]').focus(), 80); renderSearch(''); }
    else el.classList.add('is-open');
    scrim && scrim.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    if (name === 'cart') renderMini();
  }
  function close() {
    if (!openPanel) return;
    openPanel.setAttribute('aria-hidden', 'true');
    if (openPanel.dataset.panel === 'search') openPanel.classList.add('-translate-y-full');
    else openPanel.classList.remove('is-open');
    scrim && scrim.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    openPanel = null; lastFocus && lastFocus.focus && lastFocus.focus();
  }
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); open(o.dataset.open); return; }
    if (e.target.closest('[data-close]') || e.target === scrim) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* ---------------- search ---------------- */
  const PROFILE_WORDS = { classic: 'classic light salt', spicy: 'spicy tangy hot chilli', creamy: 'creamy cheesy cheese', herby: 'herby mint fresh' };
  function matchProducts(q) {
    q = q.trim().toLowerCase(); if (!q) return PRODUCTS;
    return PRODUCTS.filter(p => (p.name + ' ' + p.tagline + ' ' + PROFILE_WORDS[p.profile]).toLowerCase().includes(q));
  }
  function renderSearch(q) {
    const box = $('[data-search-results]'); if (!box) return;
    const list = matchProducts(q);
    box.innerHTML = list.length ? list.map(p => `
      <a href="product-${p.slug}.html" class="flex items-center gap-4 rounded-2xl p-2.5 hover:bg-paper">
        <span class="grid place-items-center w-16 h-16 rounded-xl shrink-0" style="background:${p.tint}"><img src="assets/img/products/${p.slug}.webp" alt="" class="h-14 w-auto"></span>
        <span class="min-w-0 flex-1"><span class="block font-display text-xl leading-tight">${escapeHtml(p.name)}</span><span class="block text-[13px] text-muted truncate">${escapeHtml(p.tagline)}</span></span>
        <span class="num font-medium">${money(p.price)}</span>
      </a>`).join('')
      : `<p class="py-6 text-muted">No flavour matches “${escapeHtml(q)}”. Try “salt”, “spicy” or “cheese”.</p>`;
  }
  const sInput = $('[data-search-input]');
  sInput && sInput.addEventListener('input', () => renderSearch(sInput.value));
  const sForm = $('[data-search-form]');
  sForm && sForm.addEventListener('submit', e => {
    e.preventDefault(); const list = matchProducts(sInput.value);
    if (list.length === 1) location.href = `product-${list[0].slug}.html`;
    else { Store.set('vohra_q', sInput.value); location.href = 'shop.html'; }
  });

  /* ---------------- add to cart (event delegation) ---------------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-add]');
    if (b) {
      const slug = b.dataset.add; const qtyEl = b.dataset.qtyFrom ? $(b.dataset.qtyFrom) : null;
      const qty = qtyEl ? Math.max(1, parseInt(qtyEl.value, 10) || 1) : 1;
      Cart.add(slug, qty); pulse(b);
      if (b.hasAttribute('data-open-cart')) open('cart'); else toast(`${BY[slug].name} added to cart`);
      return;
    }
    const all = e.target.closest('[data-add-all]');
    if (all) { PRODUCTS.forEach(p => Cart.add(p.slug, 1)); open('cart'); return; }
    const bn = e.target.closest('[data-buy-now]');
    if (bn) { const qtyEl = $(bn.dataset.qtyFrom); Cart.add(bn.dataset.buyNow, Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1)); location.href = 'checkout.html'; }
  });
  function pulse(el) { el.animate && el.animate([{ transform: 'scale(1)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: 260 }); }

  /* qty steppers: [data-qty] wraps buttons[data-step] + input */
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-step]'); if (!s) return;
    const wrap = s.closest('[data-qty]'); const input = $('input', wrap);
    const v = Math.min(MAX_QTY, Math.max(wrap.dataset.min ? +wrap.dataset.min : 1, (parseInt(input.value, 10) || 1) + (+s.dataset.step)));
    if (wrap.dataset.line) { Cart.set(wrap.dataset.line, (parseInt(input.value, 10) || 1) + (+s.dataset.step)); return; }
    input.value = v; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.addEventListener('change', e => {
    const wrap = e.target.closest('[data-qty][data-line]'); if (!wrap) return;
    Cart.set(wrap.dataset.line, Math.max(1, parseInt(e.target.value, 10) || 1));
  });
  document.addEventListener('click', e => {
    const r = e.target.closest('[data-remove]'); if (!r) return;
    const name = BY[r.dataset.remove].name; Cart.set(r.dataset.remove, 0); toast(`${name} removed`);
  });

  /* ---------------- shared renderers ---------------- */
  const stepper = (slug, qty, small) => `
    <div class="qty ${small ? '!h-9' : ''}" data-qty data-line="${slug}" data-min="0">
      <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
      <input type="number" inputmode="numeric" min="1" max="${MAX_QTY}" value="${qty}" aria-label="Quantity">
      <button type="button" data-step="1" aria-label="Increase quantity">+</button>
    </div>`;

  function freeShipHTML() {
    const t = Cart.totals(); if (!t.subtotal) return '';
    const left = CFG.shipping.freeAbove - (t.subtotal - t.discount);
    const pct = Math.min(100, Math.round(((t.subtotal - t.discount) / CFG.shipping.freeAbove) * 100));
    return `<div class="rounded-xl bg-leaf-soft px-4 py-3 text-[13.5px] text-leaf-deep">
      ${left > 0 ? `Add <b class="num">${money(left)}</b> more for free shipping` : '<b>You have unlocked free shipping</b>'}
      <div class="mt-2 h-1.5 rounded-full bg-paper overflow-hidden"><div class="h-full rounded-full bg-leaf" style="width:${pct}%"></div></div></div>`;
  }

  function renderCounts() {
    const n = Cart.count();
    $$('[data-cart-count]').forEach(el => { el.textContent = n; el.hidden = n === 0; });
    $$('[data-cart-label]').forEach(el => { el.textContent = n ? `(${n} ${n === 1 ? 'tin' : 'tins'})` : ''; });
  }

  function renderMini() {
    const box = $('[data-mini-items]'); if (!box) return;
    const lines = Cart.lines(); const foot = $('[data-mini-foot]');
    $$('[data-freeship]').forEach(el => el.innerHTML = freeShipHTML());
    if (!lines.length) {
      box.innerHTML = `<div class="py-14 text-center">
        <img src="assets/img/bowls/pink-salt.webp" alt="" class="mx-auto w-36 opacity-90">
        <p class="mt-4 font-display text-2xl">Your cart is empty</p>
        <p class="mt-1 text-muted text-[14px]">Seven flavours are waiting.</p>
        <a href="shop.html" class="btn-ink mt-6">Shop flavours</a></div>`;
      foot.hidden = true; return;
    }
    foot.hidden = false;
    box.innerHTML = lines.map(l => `
      <div class="flex gap-3 border-b border-line py-4 last:border-0">
        <a href="product-${l.slug}.html" class="grid place-items-center w-20 h-24 shrink-0 rounded-xl" style="background:${l.p.tint}"><img src="assets/img/products/${l.slug}.webp" alt="" class="h-[84px] w-auto"></a>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2"><a href="product-${l.slug}.html" class="font-display text-[1.25rem] leading-tight hover:text-maroon">${escapeHtml(l.p.name)}</a>
          <button type="button" class="text-muted hover:text-maroon p-1 -m-1" data-remove="${l.slug}" aria-label="Remove ${escapeHtml(l.p.name)}"><svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button></div>
          <p class="text-[12.5px] text-muted">${l.p.weight} tin · ${money(l.p.price)}</p>
          <div class="mt-2.5 flex items-center justify-between">${stepper(l.slug, l.qty, true)}<span class="num font-semibold">${money(l.line)}</span></div>
        </div>
      </div>`).join('');
    $('[data-mini-subtotal]').textContent = money(Cart.totals().subtotal);
  }

  function totalsHTML(t) {
    return `
      <div class="flex justify-between"><dt class="text-muted">Subtotal</dt><dd class="num">${money(t.subtotal)}</dd></div>
      ${t.discount ? `<div class="flex justify-between text-leaf-deep"><dt>Coupon <span class="tag bg-leaf-soft">${t.code}</span></dt><dd class="num">−${money(t.discount)}</dd></div>` : ''}
      <div class="flex justify-between"><dt class="text-muted">Shipping</dt><dd class="num">${t.shipping ? money(t.shipping) : '<span class="text-leaf-deep font-medium">Free</span>'}</dd></div>
      <div class="flex justify-between border-t border-line pt-3 mt-1 text-[17px] font-semibold"><dt>Total</dt><dd class="num">${money(t.total)}</dd></div>
      <p class="text-[12px] text-muted">Inclusive of all taxes</p>`;
  }

  function couponUI(scope) {
    const code = Cart.coupon();
    $$('[data-coupon-form]', scope).forEach(form => {
      const msg = $('[data-coupon-msg]', form); const input = $('input', form);
      if (code) { input.value = code; msg.innerHTML = `<span class="text-leaf-deep">${CFG.coupons[code].label} applied.</span> <button type="button" class="link text-[12.5px]" data-coupon-remove>Remove</button>`; }
      else if (msg.querySelector('[data-coupon-remove]')) { input.value = ''; msg.innerHTML = ''; }
    });
  }
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-coupon-form]'); if (!f) return;
    e.preventDefault();
    const input = $('input', f); const msg = $('[data-coupon-msg]', f); const code = input.value.trim().toUpperCase();
    if (!code) { msg.innerHTML = '<span class="text-red-800">Enter a coupon code.</span>'; return; }
    if (!CFG.coupons[code]) { msg.innerHTML = `<span class="text-red-800">“${escapeHtml(code)}” is not a valid code. Check the spelling and try again.</span>`; return; }
    Store.set('vohra_coupon', code); renderAll(); toast(`${code} applied`);
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-coupon-remove]')) { Store.del('vohra_coupon'); renderAll(); toast('Coupon removed'); } });

  /* ---------------- cart page ---------------- */
  function renderCartPage() {
    const root = $('[data-cart-page]'); if (!root) return;
    const lines = Cart.lines();
    $('[data-cart-empty]').hidden = lines.length > 0;
    $('[data-cart-full]').hidden = lines.length === 0;
    if (!lines.length) return;
    $('[data-cart-lines]').innerHTML = lines.map(l => `
      <div class="grid grid-cols-[88px_1fr] sm:grid-cols-[112px_1fr_auto] gap-4 py-5 border-b border-line last:border-0">
        <a href="product-${l.slug}.html" class="grid place-items-center h-[110px] sm:h-[130px] rounded-2xl overflow-hidden" style="background:${l.p.tint}"><img src="assets/img/products/${l.slug}.webp" alt="${escapeHtml(l.p.name)} tin" class="h-[98px] sm:h-[116px] w-auto"></a>
        <div class="min-w-0">
          <a href="product-${l.slug}.html" class="font-display text-[1.45rem] leading-tight hover:text-maroon">${escapeHtml(l.p.name)}</a>
          <p class="text-[13px] text-muted">${escapeHtml(l.p.tagline)}</p>
          <p class="mt-1 text-[13px] text-muted num">${l.p.weight} tin · ${money(l.p.price)} each</p>
          <div class="mt-3 flex flex-wrap items-center gap-3">${stepper(l.slug, l.qty)}
            <button type="button" class="text-[13px] text-muted underline underline-offset-4 hover:text-maroon" data-remove="${l.slug}">Remove</button>
            <span class="sm:hidden ml-auto num font-semibold">${money(l.line)}</span></div>
        </div>
        <p class="hidden sm:block num text-lg font-semibold text-right">${money(l.line)}</p>
      </div>`).join('');
    const t = Cart.totals();
    $('[data-cart-totals]').innerHTML = totalsHTML(t);
    $$('[data-cart-total]').forEach(el => el.textContent = money(t.total));
    couponUI(root);
    const ups = $('[data-upsell]');
    if (ups) {
      const missing = PRODUCTS.filter(p => !lines.some(l => l.slug === p.slug));
      ups.closest('section').hidden = !missing.length;
      ups.innerHTML = missing.map(p => `
        <div class="snap-start shrink-0 w-[150px] rounded-2xl border border-line bg-paper p-3 text-center">
          <a href="product-${p.slug}.html" class="grid place-items-center h-28 rounded-xl" style="background:${p.tint}"><img src="assets/img/products/${p.slug}.webp" alt="" class="h-24 w-auto" loading="lazy"></a>
          <p class="mt-2 font-display text-[1.1rem] leading-tight">${escapeHtml(p.name)}</p>
          <button type="button" class="btn-line btn-sm !h-9 mt-2 w-full" data-add="${p.slug}">Add · ${money(p.price)}</button>
        </div>`).join('');
    }
  }

  /* ---------------- checkout ---------------- */
  function renderCheckout() {
    const root = $('[data-checkout]'); if (!root) return;
    const lines = Cart.lines();
    $('[data-co-empty]').hidden = lines.length > 0;
    $('[data-co-main]').hidden = lines.length === 0;
    if (!lines.length) return;
    const t = Cart.totals();
    $$('[data-co-lines]').forEach(box => box.innerHTML = lines.map(l => `
      <div class="flex items-center gap-3 py-2.5">
        <span class="relative grid place-items-center w-14 h-16 shrink-0 rounded-lg" style="background:${l.p.tint}"><img src="assets/img/products/${l.slug}.webp" alt="" class="h-14 w-auto">
          <span class="absolute -right-2 -top-2 min-w-[20px] h-5 px-1 rounded-full bg-ink text-cream text-[11px] leading-5 text-center num">${l.qty}</span></span>
        <span class="min-w-0 flex-1"><span class="block font-display text-[1.1rem] leading-tight">${escapeHtml(l.p.name)}</span><span class="text-[12px] text-muted">${l.p.weight} tin</span></span>
        <span class="num text-[14px] font-medium">${money(l.line)}</span>
      </div>`).join(''));
    $$('[data-co-totals]').forEach(el => el.innerHTML = totalsHTML(t));
    $$('[data-co-total]').forEach(el => el.textContent = money(t.total));
    couponUI(root);
  }

  const RULES = {
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || 'Enter a valid email, like name@example.com.',
    phone: v => /^[6-9]\d{9}$/.test(v.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')) || 'Enter a 10-digit Indian mobile number.',
    pin: v => /^[1-9]\d{5}$/.test(v) || 'Enter a 6-digit PIN code.',
    password: v => v.length >= 8 || 'Use at least 8 characters.',
  };
  function validate(form) {
    let first = null;
    $$('[data-err]', form).forEach(n => n.remove());
    $$('input, select, textarea', form).forEach(el => {
      el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid');
      if (el.disabled || el.type === 'radio' || el.type === 'checkbox' || el.closest('[hidden]')) return;
      const v = el.value.trim(); let err = null;
      if (el.required && !v) err = `${el.dataset.label || 'This field'} is required.`;
      else if (v && el.dataset.rule && RULES[el.dataset.rule]) { const r = RULES[el.dataset.rule](v); if (r !== true) err = r; }
      if (err) {
        el.classList.add('is-invalid'); el.setAttribute('aria-invalid', 'true');
        const p = document.createElement('p'); p.className = 'field-error'; p.dataset.err = ''; p.textContent = err;
        el.insertAdjacentElement('afterend', p); first = first || el;
      }
    });
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return !first;
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>${label || 'Please wait'}`; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label; }
  }

  const coForm = $('[data-checkout-form]');
  if (coForm) {
    const u = Store.get('vohra_user', null);
    if (u) ['name', 'email', 'phone'].forEach(k => { const el = coForm.elements[k]; if (el && !el.value) el.value = u[k] || ''; });
    const addr = Store.get('vohra_address', null);
    if (addr) Object.keys(addr).forEach(k => { const el = coForm.elements[k]; if (el && !el.value) el.value = addr[k]; });
    let placing = false;
    const submit = e => {
      e && e.preventDefault(); if (placing) return;
      if (!validate(coForm)) { toast('Please check the highlighted fields'); return; }
      placing = true; const btns = $$('[data-place-order]'); btns.forEach(b => busy(b, true, 'Placing order'));
      const fd = new FormData(coForm); const t = Cart.totals();
      const id = 'VS' + Date.now().toString().slice(-8);
      const order = {
        id, date: new Date().toISOString(), status: 'Placed', items: Cart.lines().map(l => ({ slug: l.slug, name: l.p.name, qty: l.qty, price: l.p.price })),
        totals: t, payment: fd.get('payment'),
        customer: { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone') },
        address: { line1: fd.get('line1'), line2: fd.get('line2'), city: fd.get('city'), state: fd.get('state'), pin: fd.get('pin') },
      };
      setTimeout(() => {
        const orders = Store.get('vohra_orders', []); orders.unshift(order); Store.set('vohra_orders', orders);
        Store.set('vohra_last_order', id);
        if (fd.get('save')) Store.set('vohra_address', { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), line1: fd.get('line1'), line2: fd.get('line2'), city: fd.get('city'), state: fd.get('state'), pin: fd.get('pin') });
        Cart.clear(); location.href = 'order-success.html';
      }, 1100);
    };
    coForm.addEventListener('submit', submit);
    $$('[data-place-order]').forEach(b => b.type !== 'submit' && b.addEventListener('click', submit));
    const sumToggle = $('[data-summary-toggle]');
    sumToggle && sumToggle.addEventListener('click', () => {
      const body = $('[data-summary-body]'); body.hidden = !body.hidden;
      sumToggle.setAttribute('aria-expanded', String(!body.hidden));
      $('[data-summary-toggle-label]').textContent = body.hidden ? 'Show order summary' : 'Hide order summary';
    });
  }

  /* ---------------- order success ---------------- */
  function renderSuccess() {
    const root = $('[data-success]'); if (!root) return;
    const id = Store.get('vohra_last_order', null);
    const o = (Store.get('vohra_orders', []) || []).find(x => x.id === id);
    if (!o) { $('[data-success-none]').hidden = false; root.hidden = true; return; }
    $$('[data-o-id]').forEach(el => el.textContent = o.id);
    $('[data-o-email]').textContent = o.customer.email;
    $('[data-o-lines]').innerHTML = o.items.map(i => `<div class="flex justify-between py-1.5"><span>${escapeHtml(i.name)} <span class="text-muted">× ${i.qty}</span></span><span class="num">${money(i.price * i.qty)}</span></div>`).join('');
    $('[data-o-totals]').innerHTML = totalsHTML(o.totals);
    $('[data-o-address]').innerHTML = `${escapeHtml(o.customer.name)}<br>${escapeHtml(o.address.line1)}${o.address.line2 ? ', ' + escapeHtml(o.address.line2) : ''}<br>${escapeHtml(o.address.city)}, ${escapeHtml(o.address.state)} ${escapeHtml(o.address.pin)}<br>${escapeHtml(o.customer.phone)}`;
    $('[data-o-pay]').textContent = o.payment === 'cod' ? 'Cash on delivery' : 'Paid online via Razorpay';
    const tl = $('#track-link'); if (tl) tl.href = 'track-order.html#' + o.id;
  }

  /* ---------------- shop page ---------------- */
  function initShop() {
    const grid = $('[data-shop-grid]'); if (!grid) return;
    const cards = $$('[data-card]:not([data-allcard])', grid);
    const allCard = $('[data-allcard]', grid);
    const state = { profile: 'all', sort: 'featured', q: Store.get('vohra_q', '') || '', peanutFree: false };
    Store.del('vohra_q');
    const q = $('[data-shop-search]'); if (q) q.value = state.q;
    const pfs = $$('[data-peanut-free]');
    const setPressed = v => $$('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === v)));
    const apply = () => {
      const shown = cards.filter(c => {
        const hay = (c.dataset.name + ' ' + PROFILE_WORDS[c.dataset.profile]).toLowerCase();
        return (state.profile === 'all' || c.dataset.profile === state.profile)
          && (!state.q || hay.includes(state.q.toLowerCase()))
          && (!state.peanutFree || !c.dataset.allergens.includes('peanut'));
      });
      const key = { protein: ['protein', -1], fibre: ['fibre', -1], energy: ['energy', 1], fat: ['fat', 1] }[state.sort];
      const ordered = [...cards];
      if (key) ordered.sort((a, b) => (parseFloat(a.dataset[key[0]]) - parseFloat(b.dataset[key[0]])) * key[1]);
      else if (state.sort === 'name') ordered.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));
      ordered.forEach(c => { grid.appendChild(c); c.hidden = !shown.includes(c); });
      const unfiltered = state.profile === 'all' && !state.q && !state.peanutFree;
      if (allCard) { grid.appendChild(allCard); allCard.hidden = !unfiltered; }
      $('[data-result-count]').textContent = `${shown.length} of ${cards.length} flavours`;
      $('[data-shop-empty]').hidden = shown.length > 0;
    };
    $$('[data-filter]').forEach(b => b.addEventListener('click', () => { state.profile = b.dataset.filter; setPressed(state.profile); apply(); }));
    const s = $('[data-sort]'); s && s.addEventListener('change', () => { state.sort = s.value; apply(); });
    pfs.forEach(pf => pf.addEventListener('change', () => { state.peanutFree = pf.checked; pfs.forEach(x => x.checked = pf.checked); apply(); }));
    let t; q && q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value.trim(); apply(); }, 220); });
    $$('[data-reset-filters]').forEach(b => b.addEventListener('click', () => {
      Object.assign(state, { profile: 'all', q: '', peanutFree: false }); if (q) q.value = ''; pfs.forEach(x => x.checked = false); setPressed('all'); apply();
    }));
    const hashProfile = location.hash.replace('#', '');
    if (['classic', 'spicy', 'creamy', 'herby'].includes(hashProfile)) { state.profile = hashProfile; setPressed(hashProfile); }
    apply();
  }

  /* ---------------- home: nutrition comparison ---------------- */
  function initCompare() {
    const box = $('[data-compare]'); if (!box) return;
    const UNITS = { protein: 'g', energy: 'kcal', fat: 'g', fibre: 'g', sodium: 'mg' };
    const NOTES = {
      protein: 'Protein per 100 g. Higher is more filling.', energy: 'Energy per 100 g. Lower is lighter.',
      fat: 'Total fat per 100 g. Lower is lighter.', fibre: 'Dietary fibre per 100 g. Higher is better for digestion.',
      sodium: 'Sodium per 100 g. Lower suits a low-salt diet.',
    };
    const rows = $$('[data-row]', box);
    const show = m => {
      const max = Math.max(...rows.map(r => parseFloat(r.dataset[m])));
      const sorted = [...rows].sort((a, b) => parseFloat(b.dataset[m]) - parseFloat(a.dataset[m]));
      const list = rows[0].parentElement; sorted.forEach(r => list.appendChild(r));
      rows.forEach(r => {
        const v = parseFloat(r.dataset[m]);
        $('.bar-fill', r).style.width = (v / max * 100).toFixed(1) + '%';
        $('[data-val]', r).textContent = (m === 'sodium' || m === 'energy' ? Math.round(v).toLocaleString('en-IN') : v.toFixed(2).replace(/\.?0+$/, '')) + ' ' + UNITS[m];
      });
      $('[data-compare-note]').textContent = NOTES[m];
      $$('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === m)));
    };
    $$('[data-metric]').forEach(b => b.addEventListener('click', () => show(b.dataset.metric)));
    show('protein');
  }

  /* ---------------- product page ---------------- */
  function initProduct() {
    const main = $('[data-main-img]'); if (!main) return;
    $$('[data-thumb]').forEach(t => t.addEventListener('click', () => {
      main.style.opacity = '0';
      setTimeout(() => { main.src = t.dataset.thumb; main.style.opacity = '1'; }, 150);
      $$('[data-thumb]').forEach(x => { x.classList.toggle('border-ink', x === t); x.classList.toggle('border-transparent', x !== t); });
    }));
    // keep main & sticky qty in sync
    const qMain = $('#qty-main'), qBar = $('#qty-bar');
    [qMain, qBar].forEach(q => q && q.addEventListener('change', () => { const v = q.value; if (qMain) qMain.value = v; if (qBar) qBar.value = v; }));
    // tabs
    const tabs = $$('[role="tab"]');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; $('#' + t.getAttribute('aria-controls')).hidden = !on; });
    }));
    // PIN check (demo estimate — Shiprocket serviceability API in the dynamic build)
    const pf = $('[data-pin-form]');
    pf && pf.addEventListener('submit', e => {
      e.preventDefault(); const v = $('input', pf).value.trim(); const out = $('[data-pin-out]');
      if (!/^[1-9]\d{5}$/.test(v)) { out.innerHTML = '<span class="text-red-800">Enter a valid 6-digit PIN code.</span>'; return; }
      const ncr = /^(110|121|122|201|124)/.test(v);
      const d = new Date(); d.setDate(d.getDate() + (ncr ? 2 : 5));
      out.innerHTML = `<span class="text-leaf-deep font-medium">Delivers to ${v}</span> · estimated by <b>${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b>`;
    });
  }

  /* ---------------- auth (demo) ---------------- */
  function initAuth() {
    const tabs = $$('[data-auth-tab]');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.setAttribute('aria-selected', String(x === t)));
      $$('[data-auth-pane]').forEach(p => p.hidden = p.dataset.authPane !== t.dataset.authTab);
    }));
    if (location.hash === '#register') { const r = $('[data-auth-tab="register"]'); r && r.click(); }
    const login = $('[data-login-form]');
    login && login.addEventListener('submit', e => {
      e.preventDefault(); if (!validate(login)) return;
      const email = login.elements.email.value.trim(); const reg = Store.get('vohra_registered', {}) || {};
      const known = reg[email.toLowerCase()];
      Store.set('vohra_user', known || { name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), email, phone: '' });
      busy($('button[type=submit]', login), true, 'Signing in'); setTimeout(() => location.href = 'account.html', 600);
    });
    const regF = $('[data-register-form]');
    regF && regF.addEventListener('submit', e => {
      e.preventDefault(); if (!validate(regF)) return;
      const u = { name: regF.elements.name.value.trim(), email: regF.elements.email.value.trim(), phone: regF.elements.phone.value.trim() };
      const reg = Store.get('vohra_registered', {}) || {}; reg[u.email.toLowerCase()] = u; Store.set('vohra_registered', reg);
      Store.set('vohra_user', u); busy($('button[type=submit]', regF), true, 'Creating account'); setTimeout(() => location.href = 'account.html', 600);
    });
    $$('[data-toggle-pass]').forEach(b => b.addEventListener('click', () => {
      const i = $(b.dataset.togglePass); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Show' : 'Hide';
    }));
  }

  const STEPS = ['Order placed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'];
  const orderStage = o => Math.min(1, Math.floor((Date.now() - new Date(o.date).getTime()) / 120000)); // demo: "Packed" after 2 min
  const fmtDate = (iso, add = 0) => { const d = new Date(iso); d.setDate(d.getDate() + add); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

  function initAccount() {
    const root = $('[data-account]'); if (!root) return;
    const u = Store.get('vohra_user', null);
    $('[data-guest]').hidden = !!u; $('[data-member]').hidden = !u;
    if (!u) return;
    $$('[data-u-name]').forEach(el => el.textContent = u.name || 'there');
    $('[data-u-email]').textContent = u.email || '—';
    $('[data-u-phone]').textContent = u.phone || 'Not added';
    const orders = Store.get('vohra_orders', []) || [];
    $('[data-orders]').innerHTML = orders.length ? orders.map(o => `
      <article class="panel p-4 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div><p class="font-medium num">Order #${o.id}</p><p class="text-[13px] text-muted">${fmtDate(o.date)} · ${(n => n + (n === 1 ? ' tin' : ' tins'))(o.items.reduce((a, i) => a + i.qty, 0))} · ${money(o.totals.total)}</p></div>
          <span class="tag bg-leaf-soft text-leaf-deep">${STEPS[orderStage(o)]}</span>
        </div>
        <div class="mt-3 flex -space-x-3">${o.items.slice(0, 7).map(i => `<span class="grid place-items-center w-11 h-12 rounded-lg border-2 border-paper" style="background:${(BY[i.slug] || {}).tint}"><img src="assets/img/products/${i.slug}.webp" alt="${escapeHtml(i.name)}" class="h-10 w-auto"></span>`).join('')}</div>
        <div class="mt-4 flex gap-2"><a href="track-order.html#${o.id}" class="btn-line btn-sm">Track order</a><button type="button" class="btn-ghost btn-sm" data-reorder="${o.id}">Buy again</button></div>
      </article>`).join('')
      : `<div class="panel p-8 text-center"><p class="font-display text-2xl">No orders yet</p><p class="mt-1 text-muted text-[14px]">When you place an order it will appear here with live tracking.</p><a href="shop.html" class="btn-ink mt-5">Start shopping</a></div>`;
    const a = Store.get('vohra_address', null);
    $('[data-address]').innerHTML = a ? `<p class="font-medium">${escapeHtml(a.name)}</p><p class="text-muted text-[14px]">${escapeHtml(a.line1)}${a.line2 ? ', ' + escapeHtml(a.line2) : ''}<br>${escapeHtml(a.city)}, ${escapeHtml(a.state)} ${escapeHtml(a.pin)}<br>${escapeHtml(a.phone)}</p>`
      : '<p class="text-muted text-[14px]">No saved address yet. Tick “Save this address” at checkout to keep it here.</p>';
    root.addEventListener('click', e => {
      const r = e.target.closest('[data-reorder]');
      if (r) { const o = orders.find(x => x.id === r.dataset.reorder); o.items.forEach(i => BY[i.slug] && Cart.add(i.slug, i.qty)); toast('Items added to cart'); open('cart'); }
      if (e.target.closest('[data-logout]')) { Store.del('vohra_user'); toast('Signed out'); setTimeout(() => location.reload(), 500); }
    });
  }

  function initTrack() {
    const form = $('[data-track-form]'); if (!form) return;
    const out = $('[data-track-out]');
    const run = id => {
      id = id.trim().toUpperCase().replace(/^#/, '');
      const o = (Store.get('vohra_orders', []) || []).find(x => x.id === id);
      if (!o) { out.innerHTML = `<div class="panel p-5 text-[14.5px]"><p class="font-medium text-maroon">We couldn't find order #${escapeHtml(id)}.</p><p class="mt-1 text-muted">Check the order ID in your confirmation email. It starts with VS followed by 8 digits.</p></div>`; return; }
      const stage = orderStage(o);
      out.innerHTML = `<div class="panel p-5 sm:p-7">
        <div class="flex flex-wrap items-baseline justify-between gap-2"><p class="font-display text-2xl">Order #${o.id}</p><p class="text-[13.5px] text-muted">Estimated delivery ${fmtDate(o.date, 3)} – ${fmtDate(o.date, 6)}</p></div>
        <ol class="mt-6 relative">${STEPS.map((s, i) => `
          <li class="relative flex gap-4 pb-6 last:pb-0">
            ${i < STEPS.length - 1 ? `<span class="absolute left-[13px] top-7 bottom-0 w-0.5 ${i < stage ? 'bg-leaf' : 'bg-line'}"></span>` : ''}
            <span class="relative z-10 grid place-items-center w-7 h-7 rounded-full shrink-0 ${i <= stage ? 'bg-leaf text-cream' : 'bg-sand text-muted'}">${i <= stage ? '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' : `<span class="text-[12px] num">${i + 1}</span>`}</span>
            <div><p class="${i <= stage ? 'font-medium text-ink' : 'text-muted'}">${s}</p><p class="text-[13px] text-muted">${i === 0 ? fmtDate(o.date) : i <= stage ? fmtDate(o.date) : 'Pending'}</p></div>
          </li>`).join('')}</ol></div>`;
    };
    form.addEventListener('submit', e => { e.preventDefault(); if (validate(form)) run(form.elements.order.value); });
    const h = location.hash.replace('#', ''); if (/^VS\d{8}$/i.test(h)) { form.elements.order.value = h; run(h); }
  }

  /* ---------------- enquiry / contact forms ---------------- */
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-enquiry-form]'); if (!f) return;
    e.preventDefault(); if (!validate(f)) return;
    const btn = $('button[type=submit]', f); busy(btn, true, 'Sending');
    setTimeout(() => { busy(btn, false); const n = (f.elements.name && f.elements.name.value.trim().split(' ')[0]) || ''; f.reset(); toast(`Thank you${n ? ', ' + n : ''}. Our team will get back to you shortly.`); }, 900);
  });

  /* preselect enquiry type from service CTAs */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-enquiry-type]'); if (!t) return;
    const sel = $('#e-type'); if (sel) sel.value = t.dataset.enquiryType;
  });

  /* copy buttons */
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-copy]'); if (!c) return;
    const txt = c.dataset.copy;
    const ok = () => toast('Copied ' + txt);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok).catch(() => toast(txt));
    else toast(txt);
  });

  /* ---------------- boot ---------------- */
  function renderAll() { renderCounts(); renderMini(); renderCartPage(); renderCheckout(); }
  renderAll(); renderSuccess(); initShop(); initCompare(); initProduct(); initAuth(); initAccount(); initTrack();
  window.addEventListener('storage', e => { if (e.key === 'vohra_cart') renderAll(); });
  window.Vohra = { Cart, Store, open, close, toast };
})();
