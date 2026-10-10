import { get } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, fmtDate, errorState } from '../ui.js';

/** Printable packing slips, one per page. Opened from Shipping → select orders → Print packing slips. */
export async function render({ el, query }) {
  let data;
  try { data = await get('shipping/slips', { ids: query.ids || '' }); } catch (err) { errorState(el, err, () => render({ el, query })); return; }
  const store = data.store;

  el.innerHTML = `
    <div class="page-head no-print">
      <div><a href="#/shipping" class="crumb">${icon('back')}Shipping</a><h1>Packing slips</h1><p>${number(data.data.length)} orders · one slip per page</p></div>
      <div class="actions"><button type="button" class="btn btn-primary" data-print>${icon('print')}Print</button></div>
    </div>
    ${data.data.length ? data.data.map(o => {
      const units = o.items.reduce((a, i) => a + i.qty, 0);
      return `<article class="slip">
        <div class="flex between wrap gap-2">
          <div><b style="font-size:18px">${esc(store.store_name)}</b><div class="small" style="color:#5A5244">${esc(store.support_phone)} · ${esc(store.support_email)}</div></div>
          <div style="text-align:right"><h2 class="mono">${esc(o.order_no)}</h2><div class="small" style="color:#5A5244">${esc(fmtDate(o.created_at))}</div></div>
        </div>
        <hr class="divider">
        <div class="flex between wrap gap-2">
          <div><div class="small" style="color:#5A5244">SHIP TO</div>
            <b>${esc(o.customer_name)}</b><br>${esc(o.address_line1)}${o.address_line2 ? '<br>' + esc(o.address_line2) : ''}<br>${esc(o.city)}, ${esc(o.state)} – <b>${esc(o.pin)}</b><br>+91 ${esc(o.customer_phone)}</div>
          <div style="text-align:right">
            ${o.payment_method === 'cod' ? `<span class="cod">COLLECT CASH ${money(o.total)}</span>` : '<span class="cod">PREPAID</span>'}
            ${o.shipment && o.shipment.awb ? `<div class="mt-2 small">${esc(o.shipment.courier_name || '')} · AWB <b class="mono">${esc(o.shipment.awb)}</b></div>` : ''}
          </div>
        </div>
        <table><thead><tr><th style="width:28px"></th><th>Item</th><th style="text-align:right">Qty</th></tr></thead>
          <tbody>${o.items.map(i => `<tr><td><span class="box"></span></td><td>${esc(i.product_name)}</td><td style="text-align:right"><b>${number(i.qty)}</b></td></tr>`).join('')}</tbody>
          <tfoot><tr><td></td><td><b>Total tins</b></td><td style="text-align:right"><b>${number(units)}</b></td></tr></tfoot></table>
        ${o.admin_notes ? `<p class="mt-2 small"><b>Note:</b> ${esc(o.admin_notes)}</p>` : ''}
        <p class="mt-3 small" style="color:#8A8172">Packed by: ____________ &nbsp; Checked by: ____________</p>
      </article>`;
    }).join('') : '<div class="card empty"><h3>No orders selected</h3><p>Go back to Shipping and tick the orders to print.</p></div>'}`;
  el.querySelector('[data-print]')?.addEventListener('click', () => window.print());
}
