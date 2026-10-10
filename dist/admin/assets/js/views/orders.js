import { get, apiUrl } from '../api.js';
import { icon } from '../icons.js';
import {
  esc, money, number, fmtDate, timeAgo, badge, debounce, pager, sortHeader, nextSort, emptyState, loadingRows, rowError,
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHOD,
} from '../ui.js';

const FILTER_KEYS = ['q', 'status', 'payment_status', 'payment_method', 'utm_source', 'utm_campaign', 'utm_id', 'state', 'from', 'to', 'sort', 'page'];
/** Filters that arrive from Reports links and are shown as removable chips. */
const CHIP_LABELS = { utm_campaign: 'Campaign', utm_id: 'Link', state: 'State' };

export async function render({ el, query, setQuery }) {
  const f = Object.fromEntries(FILTER_KEYS.map(k => [k, query[k] || '']));
  f.sort = f.sort || '-created_at';
  const meta = await get('orders/meta').catch(() => ({ utm_sources: [] }));
  const sources = [...new Set([...(meta.utm_sources || []), ...(f.utm_source && f.utm_source !== '(direct)' ? [f.utm_source] : [])])];

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Orders</h1><p>Track, fulfil and update every order.</p></div>
      <div class="actions">
        <a class="btn" data-export href="#">${icon('download')}Export CSV</a>
        <a href="#/orders/new" class="btn btn-primary">${icon('plus')}New order</a>
      </div>
    </div>
    <section class="card">
      <div class="tabs" role="tablist" aria-label="Filter by status" data-tabs></div>
      <form class="toolbar" data-filters>
        <label class="search">${icon('search')}<span class="sr-only">Search</span>
          <input class="input" type="search" name="q" value="${esc(f.q)}" placeholder="Order no, name, email, phone"></label>
        <select class="select" name="payment_status" aria-label="Payment status">
          <option value="">Any payment</option>${Object.entries(PAYMENT_STATUS).map(([k, [l]]) => `<option value="${k}" ${f.payment_status === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="select" name="payment_method" aria-label="Payment method">
          <option value="">Any method</option>${Object.entries(PAYMENT_METHOD).map(([k, l]) => `<option value="${k}" ${f.payment_method === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="select" name="utm_source" aria-label="Marketing source">
          <option value="">Any source</option><option value="(direct)" ${f.utm_source === '(direct)' ? 'selected' : ''}>(direct / none)</option>${sources.map(s => `<option value="${esc(s)}" ${f.utm_source === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
        <label class="flex items-center gap-1 small muted">From <input class="input" type="date" name="from" value="${esc(f.from)}"></label>
        <label class="flex items-center gap-1 small muted">To <input class="input" type="date" name="to" value="${esc(f.to)}"></label>
        <button type="button" class="btn btn-ghost btn-sm" data-clear>Clear</button>
      </form>
      <div class="toolbar" data-chips hidden style="padding-top:0;border-bottom:0"></div>
      <div class="table-wrap"><table class="table">
        <thead data-head></thead>
        <tbody data-rows>${loadingRows(8)}</tbody>
      </table></div>
      <div data-pager></div>
    </section>`;

  const rows = el.querySelector('[data-rows]');
  const form = el.querySelector('[data-filters]');
  let seq = 0;

  function head() {
    el.querySelector('[data-head]').innerHTML = `<tr>
      ${sortHeader('Order', 'created_at', f.sort)}${sortHeader('Customer', 'customer', f.sort)}
      <th class="hide-md">Items</th><th class="hide-md">Source</th><th class="hide-sm">Payment</th>${sortHeader('Status', 'status', f.sort)}${sortHeader('Total', 'total', f.sort, 'r')}<th></th></tr>`;
  }

  async function load() {
    const mine = ++seq;
    setQuery(f);
    head();
    el.querySelector('[data-export]').href = apiUrl('orders/export', { ...f, page: '' });
    rows.closest('.card').classList.add('is-refreshing');
    try {
      const res = await get('orders', { ...f, per_page: 20 });
      if (mine !== seq) return;
      tabs(res.counts);
      chips();
      rows.innerHTML = res.data.length ? res.data.map(rowHTML).join('')
        : `<tr><td colspan="8">${emptyState('No orders found', hasFilters() ? 'Try clearing a filter or searching for something else.' : 'Orders will appear here as soon as they are placed.', hasFilters() ? '<button class="btn" data-clear>Clear filters</button>' : '<a class="btn btn-primary" href="#/orders/new">Create an order</a>')}</td></tr>`;
      el.querySelector('[data-pager]').innerHTML = pager(res.meta);
    } catch (err) {
      if (mine === seq) rows.innerHTML = rowError(err, 8);
    } finally {
      rows.closest('.card')?.classList.remove('is-refreshing');
    }
  }

  const hasFilters = () => FILTER_KEYS.some(k => k !== 'sort' && k !== 'page' && f[k]);

  function chips() {
    const box = el.querySelector('[data-chips]');
    const active = Object.keys(CHIP_LABELS).filter(k => f[k]);
    box.hidden = !active.length;
    box.innerHTML = active.map(k => `<button type="button" class="btn btn-sm" data-unchip="${k}">${esc(CHIP_LABELS[k])}: <b>${esc(f[k])}</b>${icon('close')}</button>`).join('');
  }

  function tabs(counts) {
    const all = Object.values(counts).reduce((a, b) => a + b, 0);
    el.querySelector('[data-tabs]').innerHTML = [['', 'All', all], ...Object.entries(ORDER_STATUS).map(([k, [l]]) => [k, l, counts[k] || 0])]
      .map(([k, l, n]) => `<button type="button" class="tab" role="tab" data-status="${k}" aria-selected="${f.status === k}">${esc(l)}<span class="n">${number(n)}</span></button>`).join('');
  }

  function rowHTML(o) {
    return `<tr class="clickable" data-href="#/orders/${o.id}">
      <td><a href="#/orders/${o.id}" class="strong mono">${esc(o.order_no)}</a><span class="sub" title="${esc(o.created_at)}">${esc(fmtDate(o.created_at))} · ${esc(timeAgo(o.created_at))}</span></td>
      <td><span class="strong">${esc(o.customer_name)}</span><span class="sub">${esc(o.city)}, ${esc(o.state)}</span></td>
      <td class="hide-md num">${number(o.items_count)} ${o.items_count === 1 ? 'tin' : 'tins'}</td>
      <td class="hide-md">${o.utm_source ? `<span class="strong">${esc(o.utm_source)}</span>${o.utm_campaign ? `<span class="sub">${esc(o.utm_campaign)}</span>` : ''}` : '<span class="muted">direct</span>'}</td>
      <td class="hide-sm">${badge(PAYMENT_STATUS, o.payment_status)}<span class="sub">${esc(PAYMENT_METHOD[o.payment_method])}</span></td>
      <td>${badge(ORDER_STATUS, o.status)}</td>
      <td class="r num strong">${money(o.total)}</td>
      <td class="r muted" style="width:32px">${icon('chevron')}</td>
    </tr>`;
  }

  const reload = (resetPage = true) => { if (resetPage) f.page = ''; load(); };
  form.addEventListener('input', debounce(e => { if (e.target.name === 'q') { f.q = e.target.value.trim(); reload(); } }, 300));
  form.addEventListener('change', e => { if (e.target.name && e.target.name !== 'q') { f[e.target.name] = e.target.value; reload(); } });
  form.addEventListener('submit', e => e.preventDefault());

  el.addEventListener('click', e => {
    const tab = e.target.closest('[data-status]');
    if (tab) { f.status = tab.dataset.status; reload(); return; }
    const s = e.target.closest('[data-sort]');
    if (s) { f.sort = nextSort(f.sort, s.dataset.sort); reload(); return; }
    const p = e.target.closest('[data-page]');
    if (p && !p.disabled) { f.page = p.dataset.page; load(); el.scrollIntoView({ block: 'start' }); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const chip = e.target.closest('[data-unchip]');
    if (chip) { f[chip.dataset.unchip] = ''; reload(); return; }
    if (e.target.closest('[data-clear]')) {
      FILTER_KEYS.forEach(k => { if (k !== 'sort') f[k] = ''; });
      form.reset(); form.querySelectorAll('input').forEach(i => { i.value = ''; });
      reload(); return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a, button')) location.hash = row.dataset.href;
  });

  await load();
}
