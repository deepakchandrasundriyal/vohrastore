import { get } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, moneyShort, number, fmtDate, timeAgo, badge, imgUrl, ORDER_STATUS, PAYMENT_STATUS, errorState } from '../ui.js';
import { lineChart, barList, splitBar } from '../charts.js';
import { session } from '../session.js';

const RANGES = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['12m', '12 months']];
const KPIS = [
  { key: 'revenue', label: 'Revenue', fmt: money },
  { key: 'orders', label: 'Orders', fmt: number },
  { key: 'aov', label: 'Avg. order value', fmt: v => money(Math.round(v)) },
  { key: 'units', label: 'Tins sold', fmt: number },
  { key: 'new_customers', label: 'New customers', fmt: number },
  { key: 'cancel_rate', label: 'Cancellation rate', fmt: v => v + '%', lowerIsBetter: true },
];

export async function render({ el, query, setQuery }) {
  const state = { range: RANGES.some(r => r[0] === query.range) ? query.range : '30d', metric: 'revenue', table: false, data: null };
  let disposeChart = null;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  el.innerHTML = `
    <div class="page-head">
      <div><h1>${greet}, ${esc(session.user.name.split(' ')[0])}</h1><p>Here's how the store is doing.</p></div>
      <div class="actions">
        <div class="segmented" role="group" aria-label="Date range">${RANGES.map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${k === state.range}">${l}</button>`).join('')}</div>
        <button type="button" class="btn btn-icon" data-refresh aria-label="Refresh">${icon('refresh')}</button>
      </div>
    </div>
    <div data-body><div class="boot" style="min-height:50vh"><span class="spinner"></span></div></div>`;
  const body = el.querySelector('[data-body]');

  async function load() {
    if (state.data) body.classList.add('is-refreshing'); // keep previous render while refetching
    try {
      state.data = await get('dashboard', { range: state.range });
      paint();
    } catch (err) {
      errorState(body, err, load);
    } finally {
      body.classList.remove('is-refreshing');
    }
  }

  function paint() {
    const d = state.data;
    const periodLabel = RANGES.find(r => r[0] === state.range)[1].replace(/^/, 'previous ');
    body.innerHTML = `
      ${attentionHTML(d.attention)}
      <section class="kpis" aria-label="Key metrics">${KPIS.map(k => kpiHTML(k, d.kpis[k.key], periodLabel)).join('')}</section>

      <section class="card" style="margin-bottom:18px">
        <div class="card-head">
          <div><h2 data-trend-title>${state.metric === 'revenue' ? 'Revenue' : 'Orders'} over time</h2>
            <p>${fmtDate(d.range.from)} – ${fmtDate(d.range.to)} · cancelled orders excluded · ${d.range.bucket === 'month' ? 'monthly' : 'daily'}</p></div>
          <div class="flex gap-1 items-center">
            <div class="segmented" role="group" aria-label="Metric">
              <button type="button" data-metric="revenue" aria-pressed="${state.metric === 'revenue'}">Revenue</button>
              <button type="button" data-metric="orders" aria-pressed="${state.metric === 'orders'}">Orders</button>
            </div>
            <button type="button" class="btn btn-sm btn-ghost" data-table aria-pressed="${state.table}">${icon(state.table ? 'chart' : 'table')}${state.table ? 'Chart' : 'Table'}</button>
          </div>
        </div>
        <div class="card-body" data-trend></div>
      </section>

      <div class="grid grid-2" style="margin-bottom:18px">
        <section class="card"><div class="card-head"><div><h2>Top products</h2><p>By revenue in this period</p></div><a href="#/products" class="btn btn-sm btn-ghost">All products</a></div>
          <div class="card-body">${d.top_products.length ? barList(d.top_products.map(p => ({
            label: p.name, value: p.revenue, display: money(p.revenue), sub: `${number(p.units)} tins`,
            media: p.image ? `<span class="thumb sm"><img src="${esc(imgUrl(p.image))}" alt=""></span>` : '',
          }))) : '<p class="muted">No sales in this period.</p>'}</div></section>
        <section class="card"><div class="card-head"><div><h2>Orders by status</h2><p>Orders placed in this period</p></div><a href="#/orders" class="btn btn-sm btn-ghost">All orders</a></div>
          <div class="card-body">${barList(d.status.map(s => ({ label: s.label, value: s.count, display: number(s.count), href: `#/orders?status=${s.key}` })))}</div></section>
      </div>

      <div class="grid grid-3" style="margin-bottom:18px">
        <section class="card"><div class="card-head"><h2>Payment methods</h2></div>
          <div class="card-body">${splitBar(d.payments.map((p, i) => ({ label: p.label, value: p.revenue, display: money(p.revenue), color: `var(--series-${i + 1})` })))}
            <p class="hint mt-2">${d.payments.map(p => `${esc(p.label)}: ${number(p.orders)} orders`).join(' · ')}</p></div></section>
        <section class="card"><div class="card-head"><h2>Top states</h2></div>
          ${d.top_states.length ? `<div class="table-wrap"><table class="table table-compact"><thead><tr><th>State</th><th class="r">Orders</th><th class="r">Revenue</th></tr></thead><tbody>
            ${d.top_states.map(s => `<tr><td>${esc(s.state)}</td><td class="r num">${number(s.orders)}</td><td class="r num">${money(s.revenue)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="card-body muted">No orders yet.</div>'}</section>
        <section class="card"><div class="card-head"><h2>Coupon performance</h2><a href="#/coupons" class="btn btn-sm btn-ghost">Coupons</a></div>
          ${d.coupons.length ? `<div class="table-wrap"><table class="table table-compact"><thead><tr><th>Code</th><th class="r">Orders</th><th class="r">Discount</th></tr></thead><tbody>
            ${d.coupons.map(c => `<tr><td><span class="code-pill">${esc(c.code)}</span></td><td class="r num">${number(c.orders)}</td><td class="r num">${money(c.discount)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="card-body muted">No coupons used in this period.</div>'}</section>
      </div>

      <div class="grid grid-main-side">
        <section class="card"><div class="card-head"><h2>Recent orders</h2><a href="#/orders" class="btn btn-sm btn-ghost">View all</a></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th class="hide-sm">Payment</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
          ${d.recent.map(o => `<tr class="clickable" data-href="#/orders/${o.id}">
            <td><span class="strong mono">${esc(o.order_no)}</span><span class="sub">${esc(timeAgo(o.created_at))}</span></td>
            <td>${esc(o.customer_name)}</td><td class="hide-sm">${badge(PAYMENT_STATUS, o.payment_status)}</td>
            <td>${badge(ORDER_STATUS, o.status)}</td><td class="r num strong">${money(o.total)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No orders yet.</td></tr>'}
          </tbody></table></div></section>
        <section class="card"><div class="card-head"><div><h2>Low stock</h2><p>At or below the alert level</p></div><a href="#/products?status=low" class="btn btn-sm btn-ghost">Manage</a></div>
          <div class="card-body">${d.low_stock.length ? `<div class="bar-list">${d.low_stock.map(p => `
            <a href="#/products/${p.id}" class="flex items-center gap-2">
              <span class="thumb sm">${p.image ? `<img src="${esc(imgUrl(p.image))}" alt="">` : ''}</span>
              <span class="ellipsis" style="flex:1">${esc(p.name)}</span>
              ${p.stock <= 0 ? '<span class="badge danger">Out of stock</span>' : `<span class="badge warn">${number(p.stock)} left</span>`}
            </a>`).join('')}</div>` : `<p class="muted flex items-center gap-1">${icon('check')} All products are well stocked.</p>`}</div></section>
      </div>`;
    paintTrend();
  }

  function paintTrend() {
    const box = body.querySelector('[data-trend]');
    if (disposeChart) { disposeChart(); disposeChart = null; }
    const monthly = state.data.range.bucket === 'month';
    const isRev = state.metric === 'revenue';
    const pts = state.data.series.map(p => ({
      date: p.date, value: isRev ? p.revenue : p.orders,
      extra: isRev ? ['Orders', number(p.orders)] : ['Revenue', money(p.revenue)],
    }));
    const dateLabel = s => monthly
      ? new Date(s + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      : new Date(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const tickLabel = s => monthly
      ? new Date(s + '-01').toLocaleDateString('en-IN', { month: 'short' })
      : new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    if (state.table) {
      box.innerHTML = `<div class="table-wrap" style="max-height:340px;overflow:auto"><table class="table table-compact"><thead><tr><th>${monthly ? 'Month' : 'Date'}</th><th class="r">Revenue</th><th class="r">Orders</th></tr></thead><tbody>
        ${[...state.data.series].reverse().map(p => `<tr><td>${esc(dateLabel(p.date))}</td><td class="r num">${money(p.revenue)}</td><td class="r num">${number(p.orders)}</td></tr>`).join('')}
      </tbody></table></div>`;
      return;
    }
    const total = pts.reduce((a, p) => a + p.value, 0);
    box.innerHTML = `<p class="small muted" style="margin-bottom:8px"><i class="swatch"></i>${isRev ? 'Revenue' : 'Orders'} · total <b class="num" style="color:var(--text)">${isRev ? money(total) : number(total)}</b></p><div data-chart></div>`;
    disposeChart = lineChart(box.querySelector('[data-chart]'), pts, {
      label: isRev ? 'Revenue' : 'Orders',
      format: isRev ? money : number,
      axisFormat: isRev ? moneyShort : v => number(v),
      dateLabel, tickLabel,
    });
  }

  el.addEventListener('click', e => {
    const r = e.target.closest('[data-range]');
    if (r) {
      state.range = r.dataset.range; setQuery({ range: state.range });
      el.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b === r)));
      load(); return;
    }
    if (e.target.closest('[data-refresh]')) { load(); return; }
    const m = e.target.closest('[data-metric]');
    if (m) {
      state.metric = m.dataset.metric;
      el.querySelectorAll('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b === m)));
      el.querySelector('[data-trend-title]').textContent = `${state.metric === 'revenue' ? 'Revenue' : 'Orders'} over time`;
      paintTrend(); return;
    }
    const t = e.target.closest('[data-table]');
    if (t) { state.table = !state.table; t.setAttribute('aria-pressed', String(state.table)); t.innerHTML = `${icon(state.table ? 'chart' : 'table')}${state.table ? 'Chart' : 'Table'}`; paintTrend(); return; }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a')) location.hash = row.dataset.href;
  });

  await load();
  return () => disposeChart && disposeChart();
}

function attentionHTML(a) {
  const items = [
    { n: a.to_pack, label: 'orders to pack', href: '#/orders?status=placed', ico: 'box' },
    { n: a.to_ship, label: 'packed, ready to ship', href: '#/orders?status=packed', ico: 'truck' },
    { n: a.payment_pending, label: 'online payments pending', href: '#/orders?payment_status=pending&payment_method=razorpay', ico: 'card' },
    { n: a.new_enquiries, label: 'new enquiries', href: '#/enquiries?status=new', ico: 'inbox' },
  ];
  return `<section class="attention" aria-label="Needs attention">${items.map(i => `
    <a href="${i.href}"><span class="ico">${icon(i.ico)}</span><span><b>${number(i.n)}</b><span>${esc(i.label)}</span></span></a>`).join('')}</section>`;
}

function kpiHTML(k, m, periodLabel) {
  let delta;
  if (m.change === null) delta = `<span class="delta">New this period</span>`;
  else if (m.change === 0) delta = `<span class="delta">No change vs ${esc(periodLabel)}</span>`;
  else {
    const up = m.change > 0;
    const good = k.lowerIsBetter ? !up : up;
    delta = `<span class="delta ${good ? 'good' : 'bad'}">${icon(up ? 'up' : 'down')}<b>${up ? '+' : ''}${m.change}%</b><span class="vs">vs ${esc(periodLabel)}</span></span>`;
  }
  return `<div class="card kpi"><div class="k-label">${esc(k.label)}</div><div class="k-value">${esc(k.fmt(m.value))}</div>${delta}</div>`;
}
