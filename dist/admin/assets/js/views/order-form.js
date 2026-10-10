import { get, post } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, field, readForm, showErrors, clearErrors, setBusy, toast, debounce, imgUrl, initials, errorState, PAYMENT_STATUS, INDIAN_STATES } from '../ui.js';
import { navigate, setLeaveGuard } from '../router.js';
import { attributionFields } from './attribution-fields.js';
import { session } from '../session.js';

export async function render({ el, query }) {
  let products;
  let prefill = null;
  try {
    [products, prefill] = await Promise.all([
      get('products/options').then(r => r.data),
      query.customer ? get(`customers/${query.customer}`).catch(() => null) : null,
    ]);
  } catch (err) {
    errorState(el, err, () => render({ el, query }));
    return;
  }
  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const lines = [{ product_id: '', qty: 1 }];
  let dirty = false;

  el.innerHTML = `
    <a href="#/orders" class="crumb">${icon('back')}Orders</a>
    <div class="page-head"><div><h1>New order</h1><p>For phone, WhatsApp or walk-in orders. Stock is reserved as soon as you save.</p></div></div>
    <form novalidate data-form>
      <div class="grid grid-main-side">
        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Customer</h2></div>
            <div class="card-body">
              <div class="field combo" style="margin-bottom:16px">
                <label for="c-find">Find an existing customer <span class="opt">(optional)</span></label>
                <input id="c-find" class="input" type="search" placeholder="Search by name, email or phone" autocomplete="off" data-find>
                <div class="combo-list" data-find-list hidden></div>
              </div>
              <div class="form-grid">
                ${field({ name: 'customer_name', label: 'Full name', required: true })}
                ${field({ name: 'customer_phone', label: 'Mobile number', type: 'tel', required: true, prefix: '+91', attrs: 'inputmode="tel"' })}
                ${field({ name: 'customer_email', label: 'Email', type: 'email', required: true, span: true, hint: 'Existing customers are matched by email; new ones are created automatically.' })}
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Shipping address</h2></div>
            <div class="card-body form-grid">
              ${field({ name: 'address_line1', label: 'House no., building, street', required: true, span: true })}
              ${field({ name: 'address_line2', label: 'Area, landmark', optional: true, span: true })}
              ${field({ name: 'city', label: 'City', required: true })}
              ${field({ name: 'pin', label: 'PIN code', required: true, attrs: 'inputmode="numeric" maxlength="6"' })}
              ${field({ name: 'state', label: 'State', type: 'select', options: INDIAN_STATES.map(s => [s, s]), placeholder: 'Select state', required: true, span: true })}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Products</h2><button type="button" class="btn btn-sm" data-add-line>${icon('plus')}Add product</button></div>
            <div class="card-body"><div class="line-items" data-lines data-error-for="items"></div></div>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Payment</h2></div>
            <div class="card-body form-grid">
              ${field({ name: 'payment_method', label: 'Method', type: 'select', options: [['cod', 'Cash on delivery'], ['razorpay', 'Online (UPI / card)']], value: 'cod', span: true })}
              ${field({ name: 'payment_status', label: 'Payment status', type: 'select', options: Object.entries(PAYMENT_STATUS).map(([k, [l]]) => [k, l]), value: 'pending', span: true })}
              <div class="field span-2"><label for="o-coupon">Coupon code <span class="opt">(optional)</span></label>
                <div class="flex gap-1"><input id="o-coupon" name="coupon_code" class="input" style="text-transform:uppercase" autocomplete="off"><button type="button" class="btn" data-apply>Apply</button></div>
                <p class="hint" data-coupon-msg></p></div>
              ${field({ name: 'admin_notes', label: 'Internal note', type: 'textarea', rows: 2, optional: true, span: true })}
            </div>
          </section>
          <section class="card">
            <div class="card-head"><div><h2>Order source</h2><p>Where did this customer find you? Shows up in Reports.</p></div></div>
            <div class="card-body form-grid">${attributionFields()}</div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Summary</h2></div>
            <div class="card-body" data-summary></div>
            <div class="card-foot"><button type="submit" class="btn btn-primary w-full" style="height:44px">${icon('check')}Create order</button></div>
          </section>
        </div>
      </div>
    </form>`;

  const form = el.querySelector('[data-form]');
  const linesBox = el.querySelector('[data-lines]');
  const summary = el.querySelector('[data-summary]');
  const couponMsg = el.querySelector('[data-coupon-msg]');

  /* ---------- customer lookup ---------- */
  function fillCustomer(c) {
    form.customer_name.value = c.name || '';
    form.customer_email.value = c.email || '';
    form.customer_phone.value = c.phone || '';
    const a = c.address || {};
    ['line1', 'line2', 'city', 'pin', 'state'].forEach(k => {
      const input = form.elements[k === 'line1' ? 'address_line1' : k === 'line2' ? 'address_line2' : k];
      if (a[k]) input.value = a[k];
    });
  }
  if (prefill) fillCustomer(prefill);

  const find = el.querySelector('[data-find]');
  const findList = el.querySelector('[data-find-list]');
  let found = [];
  find.addEventListener('input', debounce(async () => {
    const q = find.value.trim();
    if (q.length < 2) { findList.hidden = true; return; }
    const res = await get('customers', { q, per_page: 6 }).catch(() => ({ data: [] }));
    found = res.data;
    findList.innerHTML = found.length ? found.map((c, i) => `<button type="button" data-pick="${i}"><span class="avatar" style="width:30px;height:30px;font-size:11px">${esc(initials(c.name))}</span><span class="ellipsis"><b>${esc(c.name)}</b><span class="sub">${esc(c.email)} · ${esc(c.phone || 'no phone')}</span></span></button>`).join('')
      : '<p class="muted small" style="padding:10px">No customers match. Fill in the details below to create one.</p>';
    findList.hidden = false;
  }, 250));
  findList.addEventListener('click', async e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const full = await get(`customers/${found[+b.dataset.pick].id}`).catch(() => found[+b.dataset.pick]);
    fillCustomer(full); findList.hidden = true; find.value = ''; dirty = true;
  });

  /* ---------- line items ---------- */
  function paintLines() {
    linesBox.innerHTML = lines.map((l, i) => {
      const p = byId[l.product_id];
      const used = new Set(lines.filter((_, j) => j !== i).map(x => String(x.product_id)));
      return `<div class="row">
        <div class="cell-media"><span class="thumb sm">${p?.image ? `<img src="${esc(imgUrl(p.image))}" alt="">` : icon('image')}</span>
          <select class="select" data-line-product="${i}" aria-label="Product">
            <option value="">Choose a product…</option>
            ${products.map(o => `<option value="${o.id}" ${String(o.id) === String(l.product_id) ? 'selected' : ''} ${(!o.is_active || o.stock <= 0 || used.has(String(o.id))) && String(o.id) !== String(l.product_id) ? 'disabled' : ''}>${esc(o.name)} — ${money(o.price)}${!o.is_active ? ' (hidden)' : o.stock <= 0 ? ' (out of stock)' : ` · ${o.stock} in stock`}</option>`).join('')}
          </select></div>
        <input class="input num" type="number" min="1" max="${p ? p.stock : 999}" value="${l.qty}" data-line-qty="${i}" aria-label="Quantity">
        <span class="lt">${p ? money(p.price * l.qty) : '—'}</span>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-line-remove="${i}" aria-label="Remove line" ${lines.length === 1 ? 'disabled' : ''}>${icon('trash')}</button>
      </div>`;
    }).join('');
  }

  /* ---------- live totals (server-calculated, same rules as checkout) ---------- */
  let previewSeq = 0;
  const refreshTotals = debounce(async () => {
    const items = lines.filter(l => l.product_id && l.qty > 0).map(l => ({ product_id: +l.product_id, qty: +l.qty }));
    const units = items.reduce((a, i) => a + i.qty, 0);
    if (!items.length) { summary.innerHTML = '<p class="muted">Add a product to see the total.</p>'; return; }
    const mine = ++previewSeq;
    const code = form.coupon_code.value.trim();
    try {
      const q = await post('orders/preview', { items, coupon_code: code });
      if (mine !== previewSeq) return;
      couponMsg.className = 'hint ok-text';
      couponMsg.textContent = q.coupon ? `${q.coupon.label} applied.` : '';
      paintSummary(q, units);
    } catch (err) {
      if (mine !== previewSeq) return;
      if (err.errors?.coupon_code) {
        couponMsg.className = 'field-error'; couponMsg.textContent = err.errors.coupon_code;
        const q = await post('orders/preview', { items, coupon_code: '' }).catch(() => null);
        if (q && mine === previewSeq) paintSummary(q, units);
      } else summary.innerHTML = `<p class="danger-text">${esc(err.message)}</p>`;
    }
  }, 250);

  function paintSummary(q, units) {
    summary.innerHTML = `<dl class="dl">
      <div><dt>Subtotal · ${number(units)} ${units === 1 ? 'tin' : 'tins'}</dt><dd class="num">${money(q.subtotal)}</dd></div>
      ${q.discount ? `<div><dt>Discount <span class="code-pill">${esc(q.coupon.code)}</span></dt><dd class="num ok-text">− ${money(q.discount)}</dd></div>` : ''}
      <div><dt>Shipping</dt><dd class="num">${q.shipping ? money(q.shipping) : 'Free'}</dd></div>
      <div class="total"><dt>Total</dt><dd class="num">${money(q.total)}</dd></div></dl>`;
  }

  linesBox.addEventListener('change', e => {
    const p = e.target.dataset.lineProduct, q = e.target.dataset.lineQty;
    if (p !== undefined) lines[+p].product_id = e.target.value;
    if (q !== undefined) lines[+q].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
    dirty = true; paintLines(); refreshTotals();
  });
  linesBox.addEventListener('input', e => {
    const q = e.target.dataset.lineQty;
    if (q !== undefined) { lines[+q].qty = Math.max(1, parseInt(e.target.value, 10) || 1); refreshTotals(); }
  });
  el.addEventListener('click', e => {
    if (!e.target.closest('.combo')) findList.hidden = true;
    if (e.target.closest('[data-add-line]')) { lines.push({ product_id: '', qty: 1 }); paintLines(); linesBox.querySelector(`[data-line-product="${lines.length - 1}"]`).focus(); return; }
    const r = e.target.closest('[data-line-remove]');
    if (r) { lines.splice(+r.dataset.lineRemove, 1); paintLines(); refreshTotals(); return; }
    if (e.target.closest('[data-apply]')) refreshTotals();
  });
  form.coupon_code.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); refreshTotals(); } });
  form.addEventListener('input', () => { dirty = true; });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    clearErrors(form);
    const body = readForm(form);
    body.items = lines.filter(l => l.product_id).map(l => ({ product_id: +l.product_id, qty: +l.qty }));
    setBusy(btn, true, 'Creating…');
    try {
      const order = await post('orders', body);
      dirty = false;
      toast(`Order ${order.order_no} created`);
      session.refreshBadges();
      navigate(`/orders/${order.id}`);
    } catch (err) {
      showErrors(form, err);
      setBusy(btn, false);
    }
  });

  setLeaveGuard(() => !dirty || confirm('Discard this order? Your changes will be lost.'));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  paintLines();
  refreshTotals();
  return () => window.removeEventListener('beforeunload', beforeUnload);
}
