import { get, post, put, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, fmtDate, field, openModal, confirmDialog, toast, debounce, emptyState, loadingRows, rowError, openMenu, toLocalInput } from '../ui.js';

const TABS = [['', 'All'], ['active', 'Active'], ['expired', 'Expired'], ['inactive', 'Switched off']];

function state(c) {
  const now = Date.now();
  if (!c.is_active) return ['Off', 'neutral'];
  if (c.expires_at && new Date(c.expires_at.replace(' ', 'T')) <= now) return ['Expired', 'danger'];
  if (c.starts_at && new Date(c.starts_at.replace(' ', 'T')) > now) return ['Scheduled', 'info'];
  if (c.max_uses !== null && c.used_count >= c.max_uses) return ['Limit reached', 'warn'];
  return ['Active', 'ok'];
}
const discountText = c => (c.type === 'percent' ? `${number(c.value)}% off` : `${money(c.value)} off`);

export async function render({ el, query, setQuery }) {
  const f = { q: query.q || '', status: query.status || '' };
  let items = [];

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Coupons</h1><p>Discount codes customers enter at checkout.</p></div>
      <div class="actions"><button type="button" class="btn btn-primary" data-new>${icon('plus')}New coupon</button></div>
    </div>
    <section class="card">
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" class="tab" role="tab" data-status="${k}" aria-selected="${f.status === k}">${l}</button>`).join('')}</div>
      <div class="toolbar"><label class="search">${icon('search')}<span class="sr-only">Search</span><input class="input" type="search" value="${esc(f.q)}" placeholder="Search codes" data-q></label></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Code</th><th>Discount</th><th class="hide-md">Rules</th><th>Usage</th><th class="r hide-sm">Revenue</th><th>Status</th><th>On</th><th></th></tr></thead>
        <tbody data-rows>${loadingRows(8, 3)}</tbody>
      </table></div>
    </section>`;
  const rows = el.querySelector('[data-rows]');

  async function load() {
    setQuery(f);
    try {
      items = (await get('coupons', f)).data;
      rows.innerHTML = items.length ? items.map(rowHTML).join('')
        : `<tr><td colspan="8">${emptyState('No coupons here', 'Create a code for a festival sale, a first-order offer or a partner.', '<button class="btn btn-primary" data-new>New coupon</button>')}</td></tr>`;
    } catch (err) { rows.innerHTML = rowError(err, 8); }
  }

  function rowHTML(c) {
    const [label, tone] = state(c);
    const pct = c.max_uses ? Math.min(100, c.used_count / c.max_uses * 100) : 0;
    const rules = [c.min_order ? `Min. ${money(c.min_order)}` : 'No minimum',
      c.starts_at || c.expires_at ? `${c.starts_at ? fmtDate(c.starts_at) : 'Now'} → ${c.expires_at ? fmtDate(c.expires_at) : 'no end'}` : 'No end date'];
    return `<tr data-id="${c.id}">
      <td><span class="code-pill">${esc(c.code)}</span><span class="sub">${esc(c.label)}</span></td>
      <td class="strong">${esc(discountText(c))}</td>
      <td class="hide-md small text-2">${rules.map(esc).join('<br>')}</td>
      <td style="min-width:120px"><span class="num">${number(c.used_count)}${c.max_uses ? ` / ${number(c.max_uses)}` : ''}</span>
        ${c.max_uses ? `<div class="bar-track" style="margin-top:6px;height:6px"><div class="bar-fill" style="width:${pct}%"></div></div>` : '<span class="sub">uses</span>'}</td>
      <td class="r num hide-sm">${money(c.revenue)}<span class="sub">${money(c.discount_given)} given</span></td>
      <td><span class="badge ${tone}">${label}</span></td>
      <td><label class="switch"><input type="checkbox" data-toggle="${c.id}" ${c.is_active ? 'checked' : ''} aria-label="Enable ${esc(c.code)}"><span class="track"></span></label></td>
      <td class="r"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-menu="${c.id}" aria-label="Actions for ${esc(c.code)}">${icon('dots')}</button></td>
    </tr>`;
  }

  function modal(c = null) {
    const v = c || { type: 'percent', is_active: true };
    openModal({
      title: c ? `Edit ${c.code}` : 'New coupon', size: 'lg',
      body: `<div class="form-grid">
        ${field({ name: 'code', label: 'Code', value: v.code, required: true, attrs: 'style="text-transform:uppercase" autocomplete="off" maxlength="40"', hint: 'What customers type, e.g. DIWALI25.' })}
        ${field({ name: 'label', label: 'Description shown at checkout', value: v.label, required: true, placeholder: '25% off for Diwali' })}
        ${field({ name: 'type', label: 'Discount type', type: 'select', options: [['percent', 'Percentage of subtotal'], ['flat', 'Fixed amount (₹)']], value: v.type })}
        ${field({ name: 'value', label: 'Discount value', type: 'number', value: v.value, required: true, attrs: 'min="1" step="0.01"', suffix: v.type === 'flat' ? '₹' : '%' })}
        ${field({ name: 'min_order', label: 'Minimum order', type: 'number', value: v.min_order || '', prefix: '₹', optional: true, attrs: 'min="0" step="1"' })}
        ${field({ name: 'max_uses', label: 'Total usage limit', type: 'number', value: v.max_uses ?? '', optional: true, attrs: 'min="1" step="1"', hint: 'Leave empty for unlimited.' })}
        ${field({ name: 'starts_at', label: 'Starts', type: 'datetime-local', value: toLocalInput(v.starts_at), optional: true })}
        ${field({ name: 'expires_at', label: 'Ends', type: 'datetime-local', value: toLocalInput(v.expires_at), optional: true })}
        ${field({ name: 'is_active', label: 'Coupon is switched on', type: 'switch', value: v.is_active, span: true })}
      </div>`,
      submitLabel: c ? 'Save changes' : 'Create coupon',
      onOpen: (dlg, form) => {
        const unit = form.value.closest('.input-group').querySelector('.addon');
        form.type.addEventListener('change', () => { unit.textContent = form.type.value === 'flat' ? '₹' : '%'; });
      },
      onSubmit: async body => {
        const saved = c ? await put(`coupons/${c.id}`, body) : await post('coupons', body);
        toast(c ? 'Coupon saved' : `${saved.code} created`);
        load();
      },
    });
  }

  async function remove(c) {
    const ok = await confirmDialog({ title: `Delete ${c.code}?`, message: c.used_count ? `It has been used ${c.used_count} times. Past orders keep the code and discount. Customers can no longer apply it.` : 'Customers will no longer be able to apply this code.', confirmLabel: 'Delete coupon' });
    if (!ok) return;
    try { await del(`coupons/${c.id}`); toast('Coupon deleted'); load(); } catch (err) { toast(err.message, 'error'); }
  }

  el.querySelector('[data-q]').addEventListener('input', debounce(e => { f.q = e.target.value.trim(); load(); }, 250));
  rows.addEventListener('change', async e => {
    const id = e.target.dataset.toggle; if (!id) return;
    try {
      const c = await post(`coupons/${id}/toggle`);
      items = items.map(x => (x.id === c.id ? c : x));
      rows.querySelector(`tr[data-id="${id}"]`).outerHTML = rowHTML(c);
      toast(`${c.code} switched ${c.is_active ? 'on' : 'off'}`);
    } catch (err) { toast(err.message, 'error'); load(); }
  });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) { modal(); return; }
    const t = e.target.closest('[data-status]');
    if (t) { f.status = t.dataset.status; el.querySelectorAll('[data-status]').forEach(x => x.setAttribute('aria-selected', String(x === t))); load(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const m = e.target.closest('[data-menu]');
    if (m) {
      const c = items.find(x => x.id === +m.dataset.menu);
      openMenu(m, [
        { label: 'Edit', icon: 'edit', onClick: () => modal(c) },
        { label: 'Copy code', icon: 'copy', onClick: () => navigator.clipboard?.writeText(c.code).then(() => toast('Copied')) },
        '-',
        { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(c) },
      ]);
    }
  });

  await load();
}
