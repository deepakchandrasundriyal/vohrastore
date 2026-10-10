import { get, put, post } from '../api.js';
import { icon } from '../icons.js';
import { esc, field, readForm, showErrors, clearErrors, setBusy, toast, errorState, copyText, confirmDialog } from '../ui.js';
import { session } from '../session.js';

export async function render({ el, query }) {
  let s, ship;
  try { [s, ship] = await Promise.all([get('settings'), get('shipping/settings')]); } catch (err) { errorState(el, err, () => render({ el, query })); return; }
  const readOnly = !session.isAdmin;
  let pickupLocations = [];

  el.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>Store details, shipping and payment options.${readOnly ? ' Only admins can change these.' : ''}</p></div></div>
    <div class="stack" style="max-width:880px">
      <form novalidate data-general class="stack">
        <fieldset ${readOnly ? 'disabled' : ''} style="border:0;padding:0;margin:0" class="stack">
          <section class="card"><div class="card-head"><div><h2>Store details</h2><p>Shown to customers in emails and on the contact page.</p></div></div>
            <div class="card-body form-grid">
              ${field({ name: 'store_name', label: 'Store name', value: s.store_name, required: true, span: true })}
              ${field({ name: 'site_url', label: 'Store web address', type: 'url', value: s.site_url, required: true, span: true, hint: 'Used to build marketing links, Google previews and the courier webhook. Change it to https://vohrastore.com/ when the site goes live.' })}
              ${field({ name: 'support_email', label: 'Support email', type: 'email', value: s.support_email, required: true })}
              ${field({ name: 'support_phone', label: 'Support phone', value: s.support_phone, required: true })}
            </div></section>
          <section class="card"><div class="card-head"><div><h2>Shipping charges</h2><p>What customers pay, applied after the coupon discount.</p></div></div>
            <div class="card-body form-grid">
              ${field({ name: 'free_shipping_above', label: 'Free shipping on orders from', type: 'number', value: s.free_shipping_above, prefix: '₹', required: true, attrs: 'min="0"' })}
              ${field({ name: 'flat_shipping', label: 'Shipping charge below that', type: 'number', value: s.flat_shipping, prefix: '₹', required: true, attrs: 'min="0"' })}
            </div></section>
          <section class="card"><div class="card-head"><h2>Payments &amp; inventory</h2></div>
            <div class="card-body form-grid">
              ${field({ name: 'cod_enabled', label: 'Offer cash on delivery', type: 'switch', value: s.cod_enabled, span: true })}
              ${field({ name: 'low_stock_default', label: 'Default low-stock alert', type: 'number', value: s.low_stock_default, suffix: 'tins', required: true, attrs: 'min="0"', hint: 'Used as the starting value for new products.' })}
            </div></section>
        </fieldset>
        ${readOnly ? '' : `<div class="flex" style="justify-content:flex-end"><button type="submit" class="btn btn-primary">${icon('check')}Save settings</button></div>`}
      </form>

      <form novalidate data-shipping class="stack" id="shipping">
        <fieldset ${readOnly ? 'disabled' : ''} style="border:0;padding:0;margin:0" class="stack">
          <section class="card">
            <div class="card-head"><div><h2>Shiprocket</h2><p>Book couriers, print labels and get automatic tracking from the Shipping page.</p></div>
              <span class="badge ${ship.connected ? 'ok' : 'neutral'}" data-conn>${ship.connected ? 'Connected' : 'Not connected'}</span></div>
            <div class="card-body form-grid">
              <div class="span-2 notice" style="margin:0">${icon('info')}<div class="small">In Shiprocket go to <b>Settings → API → Configure → Create an API user</b>. Use a <b>different email</b> from your main Shiprocket login. Paste that email and password here.</div></div>
              ${field({ name: 'shiprocket_enabled', label: 'Use Shiprocket for shipping', type: 'switch', value: ship.shiprocket_enabled, span: true })}
              ${field({ name: 'shiprocket_email', label: 'API user email', type: 'email', value: ship.shiprocket_email, attrs: 'autocomplete="off"' })}
              ${field({ name: 'shiprocket_password', label: 'API user password', type: 'password', placeholder: ship.has_password ? '•••••••• (saved, leave empty to keep)' : '', attrs: 'autocomplete="new-password"' })}
              <div class="span-2 flex gap-1 items-center wrap"><button type="button" class="btn" data-test>${icon('refresh')}Save &amp; test connection</button><span class="small" data-test-msg></span></div>
              <div class="field"><label for="pick-loc">Pickup location</label>
                <select id="pick-loc" class="select" name="pickup_location" data-pickup-select>
                  <option value="${esc(ship.pickup_location)}">${esc(ship.pickup_location || 'Test the connection to load your locations')}</option>
                </select><p class="hint">Where the courier collects parcels, as set up in Shiprocket.</p></div>
              ${field({ name: 'pickup_pincode', label: 'Pickup PIN code', value: ship.pickup_pincode, attrs: 'inputmode="numeric" maxlength="6"', hint: 'Filled in when you choose a location; used for courier rates.' })}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><div><h2>Default parcel</h2><p>Pre-filled when you ship an order; you can change it per order.</p></div></div>
            <div class="card-body form-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
              ${field({ name: 'package_unit_weight_kg', label: 'Weight per tin', type: 'number', value: ship.package_unit_weight_kg, suffix: 'kg', attrs: 'step="0.01" min="0.01"' })}
              ${field({ name: 'package_base_weight_kg', label: 'Empty box weight', type: 'number', value: ship.package_base_weight_kg, suffix: 'kg', attrs: 'step="0.01" min="0"' })}
              ${field({ name: 'package_length_cm', label: 'Length', type: 'number', value: ship.package_length_cm, suffix: 'cm', attrs: 'step="0.5" min="1"' })}
              ${field({ name: 'package_breadth_cm', label: 'Breadth', type: 'number', value: ship.package_breadth_cm, suffix: 'cm', attrs: 'step="0.5" min="1"' })}
              ${field({ name: 'package_height_cm', label: 'Height', type: 'number', value: ship.package_height_cm, suffix: 'cm', attrs: 'step="0.5" min="1"' })}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><div><h2>Automatic tracking (webhook)</h2><p>Shiprocket tells the admin the moment a parcel is picked up, out for delivery or delivered.</p></div></div>
            <div class="card-body stack" style="gap:12px">
              <p class="small text-2">In Shiprocket: <b>Settings → API → Webhooks</b>. Paste this URL and token, and switch tracking webhooks on. The site must be live on the internet (not 127.0.0.1) for Shiprocket to reach it. Until then, use “Refresh tracking” on the Shipping page.</p>
              <div class="field"><span class="label">Webhook URL</span><div class="url-box"><code>${esc(ship.webhook_url)}</code><button type="button" class="btn btn-sm" data-copy="${esc(ship.webhook_url)}">${icon('copy')}Copy</button></div></div>
              ${ship.webhook_token ? `<div class="field"><span class="label">Token (x-api-key)</span><div class="url-box"><code data-token>${esc(ship.webhook_token)}</code><button type="button" class="btn btn-sm" data-copy-token>${icon('copy')}Copy</button><button type="button" class="btn btn-sm btn-ghost" data-rotate>New token</button></div></div>` : ''}
            </div>
          </section>
        </fieldset>
        ${readOnly ? '' : `<div class="flex" style="justify-content:flex-end"><button type="submit" class="btn btn-primary">${icon('check')}Save shipping settings</button></div>`}
      </form>
    </div>`;

  const general = el.querySelector('[data-general]');
  general.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = general.querySelector('button[type=submit]');
    clearErrors(general); setBusy(btn, true);
    try { await put('settings', readForm(general)); toast('Settings saved'); } catch (err) { showErrors(general, err); }
    setBusy(btn, false);
  });

  const shipping = el.querySelector('[data-shipping]');
  const select = shipping.querySelector('[data-pickup-select]');
  const saveShipping = async () => {
    const saved = await put('shipping/settings', readForm(shipping));
    shipping.elements.shiprocket_password.value = '';
    shipping.elements.shiprocket_password.placeholder = saved.has_password ? '•••••••• (saved, leave empty to keep)' : '';
    return saved;
  };
  shipping.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = shipping.querySelector('button[type=submit]');
    clearErrors(shipping); setBusy(btn, true);
    try { await saveShipping(); toast('Shipping settings saved'); } catch (err) { showErrors(shipping, err); }
    setBusy(btn, false);
  });
  select.addEventListener('change', () => {
    const loc = pickupLocations.find(l => l.name === select.value);
    if (loc && loc.pincode) shipping.elements.pickup_pincode.value = loc.pincode;
  });

  shipping.addEventListener('click', async e => {
    const t = e.target.closest('[data-test]');
    if (t) {
      const msg = shipping.querySelector('[data-test-msg]');
      clearErrors(shipping); setBusy(t, true, 'Connecting…'); msg.textContent = '';
      try {
        await saveShipping();
        const r = await post('shipping/test');
        pickupLocations = r.pickup_locations;
        const current = select.value;
        select.innerHTML = pickupLocations.length
          ? pickupLocations.map(l => `<option value="${esc(l.name)}" ${l.name === current ? 'selected' : ''}>${esc(l.name)} · ${esc(l.pincode)}</option>`).join('')
          : '<option value="">No pickup locations. Add one in Shiprocket → Settings → Pickup addresses</option>';
        if (!current && pickupLocations[0]) { select.value = pickupLocations[0].name; select.dispatchEvent(new Event('change')); }
        msg.className = 'small ok-text'; msg.textContent = `Connected · ${pickupLocations.length} pickup location(s) found. Choose one and save.`;
        const b = el.querySelector('[data-conn]'); b.className = 'badge ok'; b.textContent = 'Connected';
      } catch (err) {
        if (Object.keys(err.errors || {}).length) showErrors(shipping, err);
        msg.className = 'small danger-text'; msg.textContent = err.message;
      }
      setBusy(t, false); return;
    }
    const c = e.target.closest('[data-copy]');
    if (c) { copyText(c.dataset.copy, 'Webhook URL copied'); return; }
    if (e.target.closest('[data-copy-token]')) { copyText(shipping.querySelector('[data-token]').textContent, 'Token copied'); return; }
    if (e.target.closest('[data-rotate]')) {
      if (!(await confirmDialog({ title: 'Create a new webhook token?', message: 'The old token stops working. Paste the new one into Shiprocket right away.', confirmLabel: 'New token', danger: false }))) return;
      try { const r = await post('shipping/webhook-token'); shipping.querySelector('[data-token]').textContent = r.webhook_token; toast('New token created'); } catch (err) { toast(err.message, 'error'); }
    }
  });

  if (query.tab === 'shipping') setTimeout(() => el.querySelector('#shipping').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
