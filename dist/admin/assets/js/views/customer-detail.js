import { get, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, fmtDate, fmtDateTime, badge, initials, confirmDialog, toast, errorState, ORDER_STATUS, PAYMENT_STATUS } from '../ui.js';
import { navigate } from '../router.js';
import { customerModal } from './customer-modal.js';

export async function render({ el, params }) {
  let c;

  async function load() {
    try { c = await get(`customers/${params.id}`); paint(); } catch (err) { errorState(el, err, load); }
  }

  function paint() {
    const a = c.address;
    const aov = c.orders_count ? c.total_spent / c.orders_count : 0;
    el.innerHTML = `
      <a href="#/customers" class="crumb">${icon('back')}Customers</a>
      <div class="page-head">
        <div class="cell-media"><span class="avatar lg">${esc(initials(c.name))}</span>
          <div><h1>${esc(c.name)}</h1><p>${c.registered ? 'Has an account' : 'Guest checkout'} · customer since ${esc(fmtDate(c.created_at))}</p></div></div>
        <div class="actions">
          <a href="#/orders/new?customer=${c.id}" class="btn btn-primary">${icon('plus')}New order</a>
          <button type="button" class="btn" data-edit>${icon('edit')}Edit</button>
          <button type="button" class="btn btn-icon btn-danger-text" data-delete aria-label="Delete customer">${icon('trash')}</button>
        </div>
      </div>
      <div class="grid grid-main-side">
        <section class="card">
          <div class="card-head"><h2>Orders</h2><a class="btn btn-sm btn-ghost" href="#/orders?q=${encodeURIComponent(c.email)}">Open in Orders</a></div>
          ${c.orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Date</th><th class="hide-sm">Payment</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
            ${c.orders.map(o => `<tr class="clickable" data-href="#/orders/${o.id}"><td><a class="strong mono" href="#/orders/${o.id}">${esc(o.order_no)}</a></td>
              <td>${esc(fmtDate(o.created_at))}</td><td class="hide-sm">${badge(PAYMENT_STATUS, o.payment_status)}</td><td>${badge(ORDER_STATUS, o.status)}</td><td class="r num strong">${money(o.total)}</td></tr>`).join('')}
          </tbody></table></div>` : `<div class="empty">${icon('orders')}<h3>No orders yet</h3><a class="btn btn-primary" href="#/orders/new?customer=${c.id}">Create the first order</a></div>`}
        </section>
        <div class="stack">
          <section class="card">
            <div class="card-body"><dl class="dl">
              <div><dt>Email</dt><dd class="ellipsis"><a class="link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></div>
              <div><dt>Mobile</dt><dd>${c.phone ? `<a class="link" href="tel:+91${esc(c.phone)}">+91 ${esc(c.phone)}</a>` : '—'}</dd></div>
              <div><dt>Last sign-in</dt><dd>${esc(c.last_login_at ? fmtDateTime(c.last_login_at) : '—')}</dd></div>
            </dl></div>
            <div class="stat-row">
              <div><small>Orders</small><b>${number(c.orders_count)}</b></div>
              <div><small>Spent</small><b>${money(c.total_spent)}</b></div>
              <div><small>Avg. order</small><b>${money(aov)}</b></div>
            </div>
          </section>
          <section class="card"><div class="card-head"><h2>Saved address</h2></div>
            <div class="card-body">${a && a.line1 ? `<address class="address">${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.city || '')}${a.state ? ', ' + esc(a.state) : ''} ${esc(a.pin || '')}</address>` : '<p class="muted">No address saved.</p>'}</div></section>
          <section class="card"><div class="card-head"><h2>Internal notes</h2></div>
            <div class="card-body">${c.notes ? `<p style="white-space:pre-line">${esc(c.notes)}</p>` : '<p class="muted">No notes.</p>'}</div></section>
        </div>
      </div>`;
  }

  el.addEventListener('click', async e => {
    if (e.target.closest('[data-edit]')) { customerModal(c, () => load()); return; }
    if (e.target.closest('[data-delete]')) {
      const ok = await confirmDialog({
        title: `Delete ${c.name}?`,
        message: c.orders.length ? `Their ${c.orders.length} orders stay in the system with the name and address they were placed with, but will no longer be linked to a customer.` : 'This permanently removes the customer.',
        confirmLabel: 'Delete customer',
      });
      if (!ok) return;
      try { await del(`customers/${c.id}`); toast('Customer deleted'); navigate('/customers'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a')) location.hash = row.dataset.href;
  });

  await load();
}
