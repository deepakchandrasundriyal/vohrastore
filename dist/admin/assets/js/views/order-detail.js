import { get, post, put, del } from '../api.js';
import { icon } from '../icons.js';
import {
  esc, money, number, fmtDateTime, badge, field, openModal, confirmDialog, openMenu, toast, setBusy, errorState, imgUrl, initials,
  ORDER_STATUS, ORDER_FLOW, PAYMENT_STATUS, PAYMENT_METHOD, INDIAN_STATES,
} from '../ui.js';
import { navigate } from '../router.js';
import { attributionFields } from './attribution-fields.js';
import { openShipModal, shipmentCardHTML, openDocument, shipmentAction } from './ship-modal.js';
import { session } from '../session.js';

function attributionHTML(o) {
  if (!o.utm_source) {
    return `<p class="muted">Direct / unknown. No tracking link was used${o.landing_page ? `; landed on <span class="mono">${esc(o.landing_page)}</span>` : ''}.</p>`;
  }
  const rows = [
    ['Source', o.utm_source], ['Medium', o.utm_medium], ['Campaign', o.utm_campaign], ['Content', o.utm_content], ['Keyword', o.utm_term],
    ['Landing page', o.landing_page], ['Referrer', o.referrer],
  ].filter(([, v]) => v);
  return `<dl class="dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="ellipsis" title="${esc(v)}">${esc(v)}</dd></div>`).join('')}
    ${o.utm_id ? `<div><dt>Link</dt><dd><a class="link mono" href="#/marketing?q=${esc(o.utm_id)}">${esc(o.utm_id)}</a></dd></div>` : ''}</dl>`;
}

const NEXT_LABEL ={ placed: 'Mark as packed', packed: 'Mark as shipped', shipped: 'Out for delivery', out_for_delivery: 'Mark as delivered' };

export async function render({ el, params }) {
  let order;

  async function load() {
    try {
      order = await get(`orders/${params.id}`);
      paint();
    } catch (err) {
      errorState(el, err, load);
    }
  }

  function paint() {
    const o = order;
    const step = ORDER_FLOW.indexOf(o.status);
    const next = step >= 0 && step < ORDER_FLOW.length - 1 ? ORDER_FLOW[step + 1] : null;
    const itemsCount = o.items.reduce((a, i) => a + i.qty, 0);

    el.innerHTML = `
      <a href="#/orders" class="crumb no-print">${icon('back')}Orders</a>
      <div class="page-head">
        <div>
          <h1 class="flex items-center gap-2 wrap"><span class="mono">${esc(o.order_no)}</span>${badge(ORDER_STATUS, o.status)}${badge(PAYMENT_STATUS, o.payment_status)}</h1>
          <p>Placed ${esc(fmtDateTime(o.created_at))} · ${o.source === 'admin' ? 'Created in admin' : 'Online store'} · ${number(itemsCount)} ${itemsCount === 1 ? 'tin' : 'tins'}</p>
        </div>
        <div class="actions no-print">
          ${next ? `<button type="button" class="btn btn-primary" data-next="${next}">${icon('check')}${esc(NEXT_LABEL[o.status])}</button>` : ''}
          <button type="button" class="btn" data-edit>${icon('edit')}Edit</button>
          <button type="button" class="btn btn-icon" data-more aria-label="More actions" aria-haspopup="menu">${icon('dots')}</button>
        </div>
      </div>

      ${o.status === 'cancelled' ? '' : `<div class="card card-pad" style="margin-bottom:18px"><div class="stepper" aria-label="Fulfilment progress">
        ${ORDER_FLOW.map((s, i) => `<div class="s ${i <= step ? 'done' : ''}">${esc(ORDER_STATUS[s][0])}</div>`).join('')}</div></div>`}

      <div class="grid grid-main-side">
        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Items</h2></div>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Product</th><th class="r">Price</th><th class="r">Qty</th><th class="r">Total</th></tr></thead>
              <tbody>${o.items.map(i => `<tr>
                <td><div class="cell-media"><span class="thumb">${i.image ? `<img src="${esc(imgUrl(i.image))}" alt="">` : icon('image')}</span>
                  <div>${i.product_id ? `<a class="strong" href="#/products/${i.product_id}">${esc(i.product_name)}</a>` : `<span class="strong">${esc(i.product_name)}</span>`}
                  <span class="sub">${i.product_id ? esc(i.product_slug) : 'Product deleted'}</span></div></div></td>
                <td class="r num">${money(i.unit_price)}</td><td class="r num">× ${number(i.qty)}</td><td class="r num strong">${money(i.line_total)}</td></tr>`).join('')}
              </tbody></table></div>
            <div class="card-body" style="border-top:1px solid var(--border)">
              <dl class="dl" style="max-width:340px;margin-left:auto">
                <div><dt>Subtotal</dt><dd class="num">${money(o.subtotal)}</dd></div>
                ${o.discount ? `<div><dt>Discount ${o.coupon_code ? `<span class="code-pill">${esc(o.coupon_code)}</span>` : ''}</dt><dd class="num ok-text">− ${money(o.discount)}</dd></div>` : ''}
                <div><dt>Shipping</dt><dd class="num">${o.shipping ? money(o.shipping) : 'Free'}</dd></div>
                <div class="total"><dt>Total</dt><dd class="num">${money(o.total)}</dd></div>
              </dl>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>History</h2></div>
            <div class="card-body"><ol class="timeline">${[...o.history].reverse().map(h => `
              <li class="${h.status === 'cancelled' ? 'cancelled' : ''}"><span class="pt"></span>
                <b>${esc((ORDER_STATUS[h.status] || [h.status])[0])}</b>${h.note ? ` — <span class="text-2">${esc(h.note)}</span>` : ''}
                <small>${esc(fmtDateTime(h.created_at))}${h.admin_name ? ` · by ${esc(h.admin_name)}` : ''}</small></li>`).join('')}</ol></div>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Shipment</h2></div>
            <div class="card-body" data-shipment>${shipmentCardHTML(o, o.shipment)}</div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Customer</h2>${o.customer_id ? `<a href="#/customers/${o.customer_id}" class="btn btn-sm btn-ghost no-print">Profile</a>` : ''}</div>
            <div class="card-body">
              <div class="cell-media"><span class="avatar">${esc(initials(o.customer_name))}</span>
                <div class="ellipsis"><b>${esc(o.customer_name)}</b>
                  <span class="sub ellipsis"><a class="link" href="mailto:${esc(o.customer_email)}">${esc(o.customer_email)}</a></span>
                  <span class="sub"><a class="link" href="tel:+91${esc(o.customer_phone)}">+91 ${esc(o.customer_phone)}</a></span></div></div>
            </div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Shipping address</h2></div>
            <div class="card-body"><address class="address">${esc(o.customer_name)}<br>${esc(o.address_line1)}${o.address_line2 ? '<br>' + esc(o.address_line2) : ''}<br>${esc(o.city)}, ${esc(o.state)} ${esc(o.pin)}<br>India</address></div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Payment</h2></div>
            <div class="card-body"><dl class="dl">
              <div><dt>Method</dt><dd>${esc(PAYMENT_METHOD[o.payment_method])}</dd></div>
              <div><dt>Status</dt><dd>${badge(PAYMENT_STATUS, o.payment_status)}</dd></div>
              <div><dt>Amount</dt><dd class="num strong">${money(o.total)}</dd></div>
            </dl></div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Marketing source</h2><button type="button" class="btn btn-sm btn-ghost no-print" data-edit>Edit</button></div>
            <div class="card-body">${attributionHTML(o)}</div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Internal notes</h2><button type="button" class="btn btn-sm btn-ghost no-print" data-edit>Edit</button></div>
            <div class="card-body">${o.admin_notes ? `<p style="white-space:pre-line">${esc(o.admin_notes)}</p>` : '<p class="muted">No notes. Only your team can see notes.</p>'}</div>
          </section>
        </div>
      </div>`;
  }

  async function setStatus(status, note = '', btn = null) {
    setBusy(btn, true, 'Updating…');
    try {
      order = await post(`orders/${order.id}/status`, { status, note });
      toast(`Order marked as ${ORDER_STATUS[status][0].toLowerCase()}`);
      session.refreshBadges();
      paint();
    } catch (err) {
      toast(err.errors?.status || err.message, 'error');
      setBusy(btn, false);
    }
  }

  function statusModal() {
    const options = Object.entries(ORDER_STATUS).filter(([k]) => k !== order.status).map(([k, [l]]) => [k, l]);
    openModal({
      title: 'Change status', subtitle: `Currently ${ORDER_STATUS[order.status][0].toLowerCase()}`,
      body: `<div class="form-grid">
        ${field({ name: 'status', label: 'New status', type: 'select', options, value: ORDER_FLOW[ORDER_FLOW.indexOf(order.status) + 1] || '', span: true })}
        ${field({ name: 'note', label: 'Note', type: 'textarea', rows: 3, optional: true, placeholder: 'e.g. Shipped via Delhivery, AWB 1234567890', span: true })}
        <p class="hint span-2" data-cancel-hint hidden>${icon('info')} Cancelling returns the items to stock (if not yet shipped) and frees the coupon use. Cancelled orders cannot be reopened.</p>
      </div>`,
      submitLabel: 'Update status',
      onOpen: (dlg, form) => {
        const hint = dlg.querySelector('[data-cancel-hint]');
        const sync = () => { hint.hidden = form.status.value !== 'cancelled'; };
        form.status.addEventListener('change', sync); sync();
      },
      onSubmit: async v => {
        order = await post(`orders/${order.id}/status`, v);
        toast('Status updated'); session.refreshBadges(); paint();
        if (order.warning) toast(order.warning, 'error');
      },
    });
  }

  function editModal() {
    const o = order;
    openModal({
      title: 'Edit order details', size: 'lg',
      body: `<div class="form-grid">
        ${field({ name: 'customer_name', label: 'Customer name', value: o.customer_name, required: true })}
        ${field({ name: 'customer_phone', label: 'Mobile number', type: 'tel', value: o.customer_phone, required: true, prefix: '+91' })}
        ${field({ name: 'customer_email', label: 'Email', type: 'email', value: o.customer_email, required: true, span: true })}
        ${field({ name: 'address_line1', label: 'Address', value: o.address_line1, required: true, span: true })}
        ${field({ name: 'address_line2', label: 'Area / landmark', value: o.address_line2, optional: true, span: true })}
        ${field({ name: 'city', label: 'City', value: o.city, required: true })}
        ${field({ name: 'pin', label: 'PIN code', value: o.pin, required: true, attrs: 'inputmode="numeric" maxlength="6"' })}
        ${field({ name: 'state', label: 'State', type: 'select', options: INDIAN_STATES.map(s => [s, s]), value: o.state, required: true })}
        ${field({ name: 'payment_status', label: 'Payment status', type: 'select', options: Object.entries(PAYMENT_STATUS).map(([k, [l]]) => [k, l]), value: o.payment_status })}
        ${field({ name: 'admin_notes', label: 'Internal notes', type: 'textarea', value: o.admin_notes || '', rows: 3, optional: true, span: true })}
        <div class="span-2"><hr class="divider" style="margin:4px 0 0"><h3 style="font-size:14.5px">Marketing source</h3><p class="hint">Fix it if you know where this customer came from.</p></div>
        ${attributionFields(o)}
      </div>
      <p class="hint mt-2">Items and prices can't be changed after an order is placed. Cancel it and create a new order instead.</p>`,
      onSubmit: async v => { order = await put(`orders/${o.id}`, v); toast('Order updated'); paint(); },
    });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Delete order ${order.order_no}?`,
      message: order.status === 'cancelled'
        ? 'This permanently removes the order and its history.'
        : 'This permanently removes the order and its history. Items not yet shipped go back into stock. Prefer “Cancelled” if you want to keep a record.',
      confirmLabel: 'Delete order',
    });
    if (!ok) return;
    try {
      await del(`orders/${order.id}`);
      toast('Order deleted'); session.refreshBadges();
      navigate('/orders');
    } catch (err) { toast(err.message, 'error'); }
  }

  el.addEventListener('click', e => {
    const n = e.target.closest('[data-next]');
    if (n) {
      const hasShipment = order.shipment && order.shipment.status !== 'cancelled';
      if (n.dataset.next === 'shipped' && !hasShipment) { openShipModal(order.id, () => load()); return; } // book a courier instead of a bare status change
      setStatus(n.dataset.next, '', n); return;
    }
    if (e.target.closest('[data-ship]')) { openShipModal(order.id, () => load()); return; }
    const doc = e.target.closest('[data-doc]');
    if (doc) { openDocument(order.id, doc.dataset.doc, doc); return; }
    const sa = e.target.closest('[data-ship-action]');
    if (sa) {
      (async () => {
        if (sa.dataset.shipAction === 'cancel' && !(await confirmDialog({ title: 'Cancel this shipment?', message: 'The courier booking is cancelled. The order stays packed, so you can book again.', confirmLabel: 'Cancel shipment' }))) return;
        if (await shipmentAction(order.id, sa.dataset.shipAction, sa)) load();
      })();
      return;
    }
    const ms = e.target.closest('[data-manual-status]');
    if (ms) { shipmentAction(order.id, 'manual-status', ms, { status: ms.dataset.manualStatus }).then(s => s && load()); return; }
    if (e.target.closest('[data-edit]')) { editModal(); return; }
    const more = e.target.closest('[data-more]');
    if (more) {
      openMenu(more, [
        ...(order.status === 'cancelled' ? [] : [{ label: 'Change status…', icon: 'refresh', onClick: statusModal }]),
        { label: 'Print packing slip', icon: 'print', onClick: () => window.print() },
        { label: 'Copy order number', icon: 'copy', onClick: () => navigator.clipboard?.writeText(order.order_no).then(() => toast('Copied')) },
        '-',
        { label: 'Delete order', icon: 'trash', danger: true, onClick: remove },
      ]);
    }
  });

  await load();
}
