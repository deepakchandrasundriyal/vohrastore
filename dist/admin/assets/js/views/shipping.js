import { get, post } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, fmtDate, timeAgo, debounce, pager, emptyState, loadingRows, rowError, toast, setBusy, confirmDialog } from '../ui.js';
import { navigate } from '../router.js';
import { session } from '../session.js';
import { openShipModal, shipBadge, openDocument, shipmentAction } from './ship-modal.js';

const TABS = [
  ['to_pack', 'To pack', 'Paid or COD orders waiting to be packed. Oldest first.'],
  ['awaiting_payment', 'Awaiting payment', 'Online orders whose payment has not come through. Do not pack these yet.'],
  ['to_ship', 'Ready to ship', 'Packed, but no courier booked yet.'],
  ['pickup', 'Awaiting pickup', 'Courier booked. Print the label and schedule the pickup.'],
  ['in_transit', 'In transit', 'With the courier. Tracking updates automatically.'],
  ['problems', 'Problems', 'Returns (RTO), failed deliveries and bookings that need another try.'],
  ['delivered', 'Delivered', 'Delivered in the last 30 days.'],
];

export async function render({ el, query, setQuery }) {
  const f = { tab: TABS.some(t => t[0] === query.tab) ? query.tab : 'to_pack', q: query.q || '', page: query.page || '' };
  let rowsData = [];
  const selected = new Set();

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Shipping</h1><p>What to pack, what to ship, and where every parcel is.</p></div>
      <div class="actions">
        <button type="button" class="btn" data-sync hidden>${icon('refresh')}Refresh tracking</button>
        <a class="btn btn-ghost" href="#/settings?tab=shipping">${icon('settings')}Shipping settings</a>
      </div>
    </div>
    <div data-notice></div>
    <section class="card">
      <div class="tabs" role="tablist" data-tabs></div>
      <div class="toolbar">
        <label class="search">${icon('search')}<span class="sr-only">Search</span><input class="input" type="search" value="${esc(f.q)}" placeholder="Order no, customer, phone or AWB" data-q></label>
        <span class="spacer"></span><span class="small muted" data-hint></span>
      </div>
      <div class="bulk-bar" data-bulk hidden>
        <b data-bulk-count></b>
        <button type="button" class="btn btn-sm" data-slips>${icon('print')}Print packing slips</button>
        <button type="button" class="btn btn-sm btn-primary" data-bulk-pack>${icon('check')}Mark as packed</button>
        <button type="button" class="btn btn-sm btn-ghost" data-bulk-clear>Clear</button>
      </div>
      <div class="table-wrap"><table class="table"><thead data-head></thead><tbody data-rows>${loadingRows(6)}</tbody></table></div>
      <div data-pager></div>
    </section>`;
  const rows = el.querySelector('[data-rows]');
  const selectable = () => ['to_pack', 'to_ship', 'pickup'].includes(f.tab);

  async function load() {
    setQuery(f);
    selected.clear(); paintBulk();
    rows.closest('.card').classList.add('is-refreshing');
    try {
      const res = await get('shipping/queue', { tab: f.tab, q: f.q, page: f.page });
      rowsData = res.data;
      el.querySelector('[data-sync]').hidden = !res.shiprocket;
      el.querySelector('[data-notice]').innerHTML = res.shiprocket ? '' : `<div class="notice">${icon('info')}<div><b>Shiprocket is not connected.</b> You can still record shipments with a manual courier and AWB. To book couriers, print labels and get automatic tracking from here, add your Shiprocket API user in <a class="link" href="#/settings?tab=shipping">Settings → Shipping</a>.</div></div>`;
      el.querySelector('[data-tabs]').innerHTML = TABS.map(([k, l]) => `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${f.tab === k}">${esc(l)}<span class="n" ${k === 'problems' && res.counts[k] ? 'style="background:var(--danger-bg);color:var(--danger)"' : ''}>${number(res.counts[k])}</span></button>`).join('');
      el.querySelector('[data-hint]').textContent = TABS.find(t => t[0] === f.tab)[2];
      el.querySelector('[data-head]').innerHTML = `<tr>${selectable() ? `<th style="width:36px"><input type="checkbox" class="row-check" data-all aria-label="Select all"></th>` : ''}<th>Order</th><th>Ship to</th><th class="hide-md">Items</th><th class="hide-sm">Payment</th><th>${['to_pack', 'awaiting_payment', 'to_ship'].includes(f.tab) ? 'Waiting' : 'Shipment'}</th><th class="r">Action</th></tr>`;
      const cols = selectable() ? 7 : 6;
      rows.innerHTML = rowsData.length ? rowsData.map(rowHTML).join('')
        : `<tr><td colspan="${cols}">${emptyState(f.tab === 'to_pack' ? 'Nothing to pack right now' : 'Nothing here', f.tab === 'to_pack' ? 'New paid and COD orders will appear here, oldest first.' : 'Orders move through these tabs as they are shipped.')}</td></tr>`;
      el.querySelector('[data-pager]').innerHTML = pager(res.meta);
      session.badges = { ...(session.badges || {}), shipping: res.counts.to_pack };
      session.onBadges();
    } catch (err) {
      rows.innerHTML = rowError(err, 7);
    } finally {
      rows.closest('.card').classList.remove('is-refreshing');
    }
  }

  function waiting(o) {
    const hours = (Date.now() - new Date(o.created_at.replace(' ', 'T')).getTime()) / 36e5;
    return `${hours >= 24 ? '<span class="badge danger">Late</span> ' : ''}<span class="${hours >= 24 ? 'danger-text' : ''}">${esc(timeAgo(o.created_at))}</span>`;
  }

  function shipmentCell(o) {
    if (!o.shipment_id || o.ship_status === 'cancelled') {
      return ['to_pack', 'awaiting_payment', 'to_ship'].includes(f.tab) ? waiting(o) : '<span class="muted small">Courier not recorded</span>';
    }
    return `${shipBadge(o.ship_status)}<span class="sub">${esc(o.courier_name || '')}${o.awb ? ` · <span class="mono">${esc(o.awb)}</span>` : ''}</span>
      ${o.etd && !['delivered'].includes(o.ship_status) ? `<span class="sub">Expected ${esc(fmtDate(o.etd))}</span>` : ''}
      ${o.pickup_scheduled_at && o.ship_status === 'pickup_scheduled' ? `<span class="sub">Pickup ${esc(fmtDate(o.pickup_scheduled_at))}</span>` : ''}
      ${o.last_error && o.ship_status === 'created' ? `<span class="sub danger-text">${esc(o.last_error)}</span>` : ''}
      ${['rto', 'exception'].includes(o.ship_status) && o.courier_status ? `<span class="sub danger-text">${esc(o.courier_status)}</span>` : ''}`;
  }

  function actionCell(o) {
    const sr = o.provider === 'shiprocket';
    const btns = [];
    switch (f.tab) {
      case 'to_pack':
        btns.push(`<button type="button" class="btn btn-sm" data-pack="${o.id}">Packed</button>`, `<button type="button" class="btn btn-sm btn-primary" data-ship="${o.id}">${icon('truck')}Ship</button>`); break;
      case 'to_ship':
        btns.push(`<button type="button" class="btn btn-sm btn-primary" data-ship="${o.id}">${icon('truck')}Ship</button>`); break;
      case 'pickup':
        if (sr && o.ship_status === 'created') btns.push(`<button type="button" class="btn btn-sm btn-primary" data-ship="${o.id}">Finish booking</button>`);
        if (sr && o.awb) btns.push(`<button type="button" class="btn btn-sm" data-doc="${o.id}">${icon('print')}Label</button>`);
        if (sr && o.ship_status === 'awb_assigned') btns.push(`<button type="button" class="btn btn-sm btn-primary" data-act="pickup" data-id="${o.id}">Schedule pickup</button>`);
        if (o.provider === 'manual') btns.push(`<button type="button" class="btn btn-sm btn-primary" data-manual="in_transit" data-id="${o.id}">Mark shipped</button>`);
        break;
      case 'in_transit':
        if (o.tracking_url) btns.push(`<a class="btn btn-sm btn-ghost" href="${esc(o.tracking_url)}" target="_blank" rel="noopener">${icon('external')}Track</a>`);
        if (sr) btns.push(`<button type="button" class="btn btn-sm btn-ghost btn-icon" data-act="track" data-id="${o.id}" aria-label="Refresh tracking">${icon('refresh')}</button>`);
        else if (o.provider === 'manual') btns.push(`<button type="button" class="btn btn-sm" data-manual="${o.status === 'out_for_delivery' ? 'delivered' : 'out_for_delivery'}" data-id="${o.id}">${o.status === 'out_for_delivery' ? 'Delivered' : 'Out for delivery'}</button>`);
        break;
      case 'problems':
        if (o.ship_status === 'created') btns.push(`<button type="button" class="btn btn-sm btn-primary" data-ship="${o.id}">Retry booking</button>`);
        break;
      default:
    }
    btns.push(`<a class="btn btn-sm btn-ghost btn-icon" href="#/orders/${o.id}" aria-label="Open order">${icon('chevron')}</a>`);
    return `<div class="flex gap-1" style="justify-content:flex-end;flex-wrap:wrap">${btns.join('')}</div>`;
  }

  function rowHTML(o) {
    return `<tr data-id="${o.id}">
      ${selectable() ? `<td><input type="checkbox" class="row-check" data-sel="${o.id}" ${selected.has(o.id) ? 'checked' : ''} aria-label="Select ${esc(o.order_no)}"></td>` : ''}
      <td><a class="strong mono" href="#/orders/${o.id}">${esc(o.order_no)}</a><span class="sub">${esc(fmtDate(o.created_at))}</span></td>
      <td><span class="strong">${esc(o.customer_name)}</span><span class="sub">${esc(o.city)} · ${esc(o.pin)}</span></td>
      <td class="hide-md" style="max-width:260px"><span class="small text-2" style="display:block">${esc(o.items_summary || '')}</span><span class="sub">${number(o.items_count)} tins</span></td>
      <td class="hide-sm">${o.payment_method === 'cod' ? `<span class="badge warn plain">COD ${money(o.total)}</span>` : `<span class="badge ok plain">Prepaid</span><span class="sub num">${money(o.total)}</span>`}</td>
      <td>${shipmentCell(o)}</td>
      <td class="r">${actionCell(o)}</td>
    </tr>`;
  }

  function paintBulk() {
    const bar = el.querySelector('[data-bulk]');
    bar.hidden = !selected.size;
    el.querySelector('[data-bulk-count]').textContent = `${selected.size} selected`;
    el.querySelector('[data-bulk-pack]').hidden = f.tab !== 'to_pack';
  }

  el.querySelector('[data-q]').addEventListener('input', debounce(e => { f.q = e.target.value.trim(); f.page = ''; load(); }, 300));
  el.addEventListener('change', e => {
    if (e.target.matches('[data-all]')) {
      rowsData.forEach(o => (e.target.checked ? selected.add(o.id) : selected.delete(o.id)));
      el.querySelectorAll('[data-sel]').forEach(c => { c.checked = e.target.checked; });
      paintBulk(); return;
    }
    const s = e.target.dataset.sel;
    if (s) { e.target.checked ? selected.add(+s) : selected.delete(+s); paintBulk(); }
  });

  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]');
    if (t) { f.tab = t.dataset.tab; f.page = ''; load(); return; }
    const p = e.target.closest('[data-page]');
    if (p && !p.disabled) { f.page = p.dataset.page; load(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }

    const ship = e.target.closest('[data-ship]');
    if (ship) { openShipModal(+ship.dataset.ship, () => { load(); session.refreshBadges(); }); return; }

    const pack = e.target.closest('[data-pack]');
    if (pack) {
      setBusy(pack, true, '…');
      try { await post('shipping/bulk-pack', { ids: [+pack.dataset.pack] }); toast('Marked as packed'); session.refreshBadges(); load(); } catch (err) { toast(err.message, 'error'); setBusy(pack, false); }
      return;
    }
    const doc = e.target.closest('[data-doc]');
    if (doc) { openDocument(+doc.dataset.doc, 'label', doc); return; }
    const act = e.target.closest('[data-act]');
    if (act) { if (await shipmentAction(+act.dataset.id, act.dataset.act, act)) load(); return; }
    const man = e.target.closest('[data-manual]');
    if (man) { if (await shipmentAction(+man.dataset.id, 'manual-status', man, { status: man.dataset.manual })) load(); return; }

    if (e.target.closest('[data-slips]')) { navigate('/shipping/slips', { ids: [...selected].join(',') }); return; }
    if (e.target.closest('[data-bulk-clear]')) { selected.clear(); el.querySelectorAll('[data-sel], [data-all]').forEach(c => { c.checked = false; }); paintBulk(); return; }
    const bp = e.target.closest('[data-bulk-pack]');
    if (bp) {
      if (!(await confirmDialog({ title: `Mark ${selected.size} orders as packed?`, message: 'They move to “Ready to ship”, where you can book couriers.', confirmLabel: 'Mark as packed', danger: false }))) return;
      try { const r = await post('shipping/bulk-pack', { ids: [...selected] }); toast(`${r.packed} orders marked as packed`); session.refreshBadges(); load(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const sync = e.target.closest('[data-sync]');
    if (sync) {
      setBusy(sync, true, 'Refreshing…');
      try { const r = await post('shipping/sync'); toast(`Tracking updated for ${r.synced} shipments${r.failed ? ` (${r.failed} failed)` : ''}`); load(); } catch (err) { toast(err.message, 'error'); }
      setBusy(sync, false);
    }
  });

  await load();
}
