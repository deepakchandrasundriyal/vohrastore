/**
 * "Ship order" dialog: book through Shiprocket (compare courier rates → AWB) or record a manual courier + AWB.
 * Also exports shipment helpers (status badge, actions) shared by the order page and the shipping queue.
 */
import { get, post } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, field, openModal, toast, setBusy, readForm, showErrors, clearErrors, fmtDate, fmtDateTime } from '../ui.js';

export const SHIP_STATUS = {
  created: ['Booking incomplete', 'warn'], awb_assigned: ['AWB assigned', 'violet'], pickup_scheduled: ['Pickup scheduled', 'info'],
  in_transit: ['In transit', 'info'], out_for_delivery: ['Out for delivery', 'info'], delivered: ['Delivered', 'ok'],
  cancelled: ['Cancelled', 'neutral'], rto: ['Returning (RTO)', 'danger'], exception: ['Delivery problem', 'danger'],
};
const COURIERS = ['Delhivery', 'Blue Dart', 'DTDC', 'Xpressbees', 'Ekart', 'Shadowfax', 'India Post', 'Professional Couriers', 'Own delivery'];

export const shipBadge = s => {
  const [label, tone] = SHIP_STATUS[s] || [s, 'neutral'];
  return `<span class="badge ${tone}">${esc(label)}</span>`;
};

/** Open a Shiprocket PDF (label / manifest / invoice) in a new tab. */
export async function openDocument(orderId, type, btn) {
  const win = window.open('about:blank', '_blank'); // open synchronously so pop-up blockers allow it
  setBusy(btn, true, 'Preparing…');
  try {
    const { url } = await get(`orders/${orderId}/shipping/doc/${type}`);
    if (win) win.location = url; else location.href = url;
  } catch (err) {
    win && win.close();
    toast(err.message, 'error');
  } finally { setBusy(btn, false); }
}

export async function shipmentAction(orderId, action, btn, body = {}) {
  setBusy(btn, true, 'Working…');
  try {
    const res = await post(`orders/${orderId}/shipping/${action}`, body);
    toast({ pickup: 'Pickup scheduled', track: 'Tracking updated', cancel: 'Shipment cancelled', 'manual-status': 'Shipment updated' }[action] || 'Done');
    return res.shipment;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  } finally { setBusy(btn, false); }
}

/**
 * @param {number} orderId
 * @param {(shipment) => void} onDone
 */
export async function openShipModal(orderId, onDone) {
  let info;
  try { info = await get(`orders/${orderId}/shipping`); } catch (err) { toast(err.message, 'error'); return; }
  const pkg = info.package;
  const retry = info.shipment && info.shipment.provider === 'shiprocket' && info.shipment.status === 'created';
  let mode = info.shiprocket ? 'shiprocket' : 'manual';
  let couriers = [];

  const m = openModal({
    title: retry ? 'Finish booking' : 'Ship order', size: 'lg',
    subtitle: retry ? `The order is in Shiprocket but has no AWB yet${info.shipment.last_error ? `: ${info.shipment.last_error}` : '.'}` : 'Book a courier and get the AWB / tracking number.',
    body: `
      <div class="segmented" role="group" aria-label="Shipping method" style="margin-bottom:16px">
        <button type="button" data-mode="shiprocket" aria-pressed="${mode === 'shiprocket'}">${icon('truck')} Shiprocket</button>
        <button type="button" data-mode="manual" aria-pressed="${mode === 'manual'}">${icon('edit')} Manual courier</button>
      </div>
      <input type="hidden" name="mode" value="${mode}">
      <div data-pane="shiprocket">
        ${info.shiprocket ? `
          <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
            ${field({ name: 'weight_kg', label: 'Weight', type: 'number', value: pkg.weight_kg, suffix: 'kg', attrs: 'step="0.01" min="0.05"' })}
            ${field({ name: 'length_cm', label: 'Length', type: 'number', value: pkg.length_cm, suffix: 'cm', attrs: 'step="0.5" min="1"' })}
            ${field({ name: 'breadth_cm', label: 'Breadth', type: 'number', value: pkg.breadth_cm, suffix: 'cm', attrs: 'step="0.5" min="1"' })}
            ${field({ name: 'height_cm', label: 'Height', type: 'number', value: pkg.height_cm, suffix: 'cm', attrs: 'step="0.5" min="1"' })}
          </div>
          <div class="flex between items-center mt-3"><span class="label">Courier</span><button type="button" class="btn btn-sm" data-rates>${icon('refresh')}Compare courier rates</button></div>
          <div class="mt-1" data-couriers data-error-for="courier_id"><p class="hint">Leave as “Recommended” to let Shiprocket pick the best courier, or compare rates first.</p></div>
          <input type="hidden" name="courier_id" value=""><input type="hidden" name="rate" value="">`
        : `<div class="card card-pad" style="box-shadow:none;background:var(--surface-2)">
            <b>Shiprocket is not connected.</b><p class="muted mt-1">Add your Shiprocket API user and pickup location in <a class="link" href="#/settings?tab=shipping">Settings → Shipping</a>. Until then, use “Manual courier”.</p></div>`}
      </div>
      <div data-pane="manual" class="form-grid">
        ${field({ name: 'courier_name', label: 'Courier', placeholder: 'Delhivery, DTDC…', attrs: 'list="dl-couriers" autocomplete="off"' })}
        ${field({ name: 'awb', label: 'AWB / tracking number', attrs: 'autocomplete="off"' })}
        ${field({ name: 'tracking_url', label: 'Tracking link', type: 'url', optional: true, span: true, placeholder: 'https://…' })}
        ${field({ name: 'mark_shipped', label: 'Parcel already handed to the courier (mark order as shipped)', type: 'switch', value: true, span: true })}
        <datalist id="dl-couriers">${COURIERS.map(c => `<option value="${c}">`).join('')}</datalist>
      </div>`,
    submitLabel: retry ? 'Get AWB' : 'Book shipment',
    busyLabel: 'Booking…',
    onSubmit: async (v, form) => {
      let res;
      if (v.mode === 'manual') {
        res = await post(`orders/${orderId}/shipping/manual`, v);
      } else {
        if (!info.shiprocket) throw Object.assign(new Error('Connect Shiprocket first, or switch to Manual courier.'), { errors: {} });
        res = await post(`orders/${orderId}/shipping/${retry ? 'awb' : 'ship'}`, v);
      }
      toast(res.shipment.awb ? `Booked · AWB ${res.shipment.awb}` : 'Shipment saved');
      onDone(res.shipment);
      if (res.shipment.provider === 'shiprocket') { showBooked(form, res.shipment); return false; } // keep open for label / pickup
      return true;
    },
  });
  const form = m.form;

  const setMode = next => {
    mode = next;
    form.elements.mode.value = next;
    form.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === next)));
    form.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== next; p.querySelectorAll('input, select').forEach(i => { i.disabled = p.hidden && i.name !== 'mode'; }); });
  };
  setMode(mode);

  function paintCouriers() {
    const box = form.querySelector('[data-couriers]');
    if (!couriers.length) { box.innerHTML = '<p class="field-error">No courier serves this PIN code for this parcel. Check the weight or use a manual courier.</p>'; return; }
    box.innerHTML = `<div class="courier-list">
      <label class="courier"><input type="radio" name="pick" value="" checked><span><b>Recommended by Shiprocket</b><small>Best mix of price, speed and rating</small></span></label>
      ${couriers.map(c => `<label class="courier"><input type="radio" name="pick" value="${c.id}" data-rate="${c.rate}">
        <span><b>${esc(c.name)}</b> ${c.recommended ? '<span class="badge ok plain">Recommended</span>' : ''} ${c.cod ? '' : '<span class="badge warn plain">No COD</span>'}
          <small>${c.days ? `${esc(c.days)} days` : ''}${c.etd ? ` · arrives by ${esc(c.etd)}` : ''}${c.rating ? ` · ★ ${c.rating}` : ''}</small></span>
        <span class="num strong">${money(c.rate)}</span></label>`).join('')}
    </div>`;
  }

  form.addEventListener('click', async e => {
    const mb = e.target.closest('[data-mode]');
    if (mb) { setMode(mb.dataset.mode); return; }
    const rb = e.target.closest('[data-rates]');
    if (rb) {
      clearErrors(form);
      setBusy(rb, true, 'Checking…');
      try {
        const v = readForm(form);
        couriers = (await post(`orders/${orderId}/shipping/rates`, v)).couriers;
        paintCouriers();
      } catch (err) { showErrors(form, err); }
      setBusy(rb, false);
    }
  });
  form.addEventListener('change', e => {
    if (e.target.name !== 'pick') return;
    form.elements.courier_id.value = e.target.value;
    form.elements.rate.value = e.target.dataset.rate || '';
  });
}

/** After booking through Shiprocket: show AWB + next steps (label, pickup). */
function showBooked(form, s) {
  form.querySelector('.modal-body').innerHTML = `
    <div class="flex gap-2 items-center"><span class="avatar" style="background:var(--ok-bg);color:var(--ok)">${icon('check')}</span>
      <div><b>Shipment booked with ${esc(s.courier_name || 'courier')}</b><p class="muted small">AWB <span class="mono strong">${esc(s.awb)}</span></p></div></div>
    <ol class="mt-3" style="padding-left:18px;line-height:2">
      <li>Print the shipping label and stick it on the box.</li>
      <li>Schedule a pickup. The courier collects the parcel from your pickup address.</li>
      <li>Tracking then updates automatically: shipped → out for delivery → delivered.</li>
    </ol>
    <div class="flex gap-1 wrap mt-2">
      <button type="button" class="btn btn-primary" data-doc="label">${icon('print')}Print label</button>
      <button type="button" class="btn" data-pickup>${icon('truck')}Schedule pickup</button>
      <button type="button" class="btn btn-ghost" data-doc="invoice">${icon('download')}Invoice</button>
    </div>`;
  form.querySelector('.modal-foot button[type=submit]')?.remove();
  form.querySelector('.modal-foot [data-close]').textContent = 'Done';
  form.querySelector('.modal-body').addEventListener('click', async e => {
    const d = e.target.closest('[data-doc]');
    if (d) { openDocument(s.order_id, d.dataset.doc, d); return; }
    const p = e.target.closest('[data-pickup]');
    if (p) {
      const updated = await shipmentAction(s.order_id, 'pickup', p);
      if (updated) p.outerHTML = `<span class="badge info">Pickup ${updated.pickup_scheduled_at ? fmtDate(updated.pickup_scheduled_at) : 'scheduled'}</span>`;
    }
  });
}

/** Shipment card body for the order page. */
export function shipmentCardHTML(order, s) {
  if (!s || s.status === 'cancelled') {
    const canShip = ['placed', 'packed'].includes(order.status);
    const unpaid = order.payment_method === 'razorpay' && order.payment_status !== 'paid';
    return `${s ? '<p class="muted small">The previous shipment was cancelled.</p>' : ''}
      ${canShip ? (unpaid ? '<p class="muted">Waiting for online payment before shipping.</p>'
        : `<p class="muted">Not shipped yet.</p><button type="button" class="btn btn-primary mt-2 w-full" data-ship>${icon('truck')}Ship order</button>`)
        : '<p class="muted">No shipment recorded.</p>'}`;
  }
  const events = (s.events || []).slice(0, 6);
  const sr = s.provider === 'shiprocket';
  const actions = [];
  if (sr && s.status === 'created') actions.push(`<button type="button" class="btn btn-sm btn-primary" data-ship>${icon('truck')}Finish booking</button>`);
  if (sr && s.awb) actions.push(`<button type="button" class="btn btn-sm" data-doc="label">${icon('print')}Label</button>`);
  if (sr && s.status === 'awb_assigned') actions.push(`<button type="button" class="btn btn-sm" data-ship-action="pickup">${icon('truck')}Schedule pickup</button>`);
  if (sr && s.awb && !['delivered'].includes(s.status)) actions.push(`<button type="button" class="btn btn-sm btn-ghost" data-ship-action="track">${icon('refresh')}Refresh</button>`);
  if (!sr && ['awb_assigned', 'in_transit', 'out_for_delivery'].includes(s.status)) {
    const next = { awb_assigned: ['in_transit', 'Mark shipped'], in_transit: ['out_for_delivery', 'Out for delivery'], out_for_delivery: ['delivered', 'Mark delivered'] }[s.status];
    actions.push(`<button type="button" class="btn btn-sm btn-primary" data-manual-status="${next[0]}">${icon('check')}${next[1]}</button>`);
  }
  if (['created', 'awb_assigned', 'pickup_scheduled'].includes(s.status)) actions.push(`<button type="button" class="btn btn-sm btn-ghost btn-danger-text" data-ship-action="cancel">Cancel shipment</button>`);

  return `<dl class="dl">
      <div><dt>Status</dt><dd>${shipBadge(s.status)}</dd></div>
      <div><dt>Courier</dt><dd>${esc(s.courier_name || '—')}${sr ? ' <span class="muted small">via Shiprocket</span>' : ''}</dd></div>
      ${s.awb ? `<div><dt>AWB</dt><dd class="mono">${s.tracking_url ? `<a class="link" href="${esc(s.tracking_url)}" target="_blank" rel="noopener">${esc(s.awb)}</a>` : esc(s.awb)}</dd></div>` : ''}
      ${s.pickup_scheduled_at ? `<div><dt>Pickup</dt><dd>${esc(fmtDateTime(s.pickup_scheduled_at))}</dd></div>` : ''}
      ${s.etd && s.status !== 'delivered' ? `<div><dt>Expected</dt><dd>${esc(fmtDate(s.etd))}</dd></div>` : ''}
      ${s.delivered_at ? `<div><dt>Delivered</dt><dd>${esc(fmtDateTime(s.delivered_at))}</dd></div>` : ''}
      <div><dt>Parcel</dt><dd class="num">${s.weight_kg} kg · ${s.length_cm}×${s.breadth_cm}×${s.height_cm} cm</dd></div>
      ${s.shipping_cost ? `<div><dt>Courier cost</dt><dd class="num">${money(s.shipping_cost)}</dd></div>` : ''}
    </dl>
    ${s.last_error ? `<p class="form-alert mt-2" style="margin-bottom:0">${esc(s.last_error)}</p>` : ''}
    ${actions.length ? `<div class="flex gap-1 wrap mt-3 no-print">${actions.join('')}</div>` : ''}
    ${events.length ? `<ol class="timeline mt-3">${events.map(e => `<li><span class="pt"></span><b>${esc(e.status || e.activity)}</b>${e.activity && e.status ? ` <span class="text-2 small">${esc(e.activity)}</span>` : ''}<small>${esc(fmtDateTime(e.event_at))}${e.location ? ' · ' + esc(e.location) : ''}</small></li>`).join('')}</ol>` : ''}
    ${s.last_synced_at ? `<p class="hint mt-2">Last tracking update ${esc(fmtDateTime(s.last_synced_at))}</p>` : ''}`;
}

