import { get } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, fmtDate, timeAgo, imgUrl, errorState, downloadCsv } from '../ui.js';
import { barList, splitBar, columnChart } from '../charts.js';

const TABS = [
  ['locations', 'Locations', 'pin'],
  ['products', 'Products', 'products'],
  ['marketing', 'Marketing', 'link'],
  ['customers', 'Customers', 'customers'],
  ['time', 'Days & hours', 'clock'],
];
const iso = d => d.toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const PRESETS = {
  '7': () => [daysAgo(6), iso(new Date())],
  '30': () => [daysAgo(29), iso(new Date())],
  '90': () => [daysAgo(89), iso(new Date())],
  month: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)]; },
  last_month: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]; },
  year: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), 0, 1)), iso(d)]; },
  all: () => ['2020-01-01', iso(new Date())],
};
const PRESET_LABELS = { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', month: 'This month', last_month: 'Last month', year: 'This year', all: 'All time', custom: 'Custom range' };
const pct = v => (v === null || v === undefined ? '—' : `${v}%`);
const share = v => `<span class="share"><span class="bar-track"><span class="bar-fill" style="display:block;width:${Math.min(100, v)}%"></span></span><span class="num small">${v}%</span></span>`;

export async function render({ el, params, query, setQuery }) {
  const tab = TABS.some(t => t[0] === params.tab) ? params.tab : 'locations';
  const preset = PRESET_LABELS[query.range] ? query.range : '30';
  const [defFrom, defTo] = PRESETS[preset === 'custom' ? '30' : preset]();
  const f = { range: preset, from: query.from || defFrom, to: query.to || defTo };
  const tables = {}; // id → { title, cols, rows } for CSV export

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Reports</h1><p>Where sales come from, what sells, and who buys. Cancelled orders are excluded.</p></div>
      <form class="range-bar" data-range-form>
        <select class="select" name="range" aria-label="Date range">${Object.entries(PRESET_LABELS).map(([k, l]) => `<option value="${k}" ${k === f.range ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" type="date" name="from" value="${f.from}" aria-label="From">
        <span class="muted">→</span>
        <input class="input" type="date" name="to" value="${f.to}" aria-label="To">
      </form>
    </div>
    <div class="tabs report-tabs" role="tablist">${TABS.map(([k, l, i]) => `<a class="tab" role="tab" data-report-tab="${k}" href="#/reports/${k}?${new URLSearchParams(f)}" aria-selected="${k === tab}">${icon(i)}${l}</a>`).join('')}</div>
    <div data-body><div class="boot" style="min-height:40vh"><span class="spinner"></span></div></div>`;
  const body = el.querySelector('[data-body]');

  /* ---------- table builder (+ CSV) ---------- */
  function table(id, title, subtitle, cols, rows, { empty = 'No data for this period.', limit = 0 } = {}) {
    tables[id] = { title, cols, rows };
    const shown = limit ? rows.slice(0, limit) : rows;
    return `<section class="card">
      <div class="card-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
        ${rows.length ? `<button type="button" class="btn btn-sm btn-ghost" data-csv="${id}">${icon('download')}CSV</button>` : ''}</div>
      ${rows.length ? `<div class="table-wrap"><table class="table table-compact"><thead><tr>${cols.map(c => `<th class="${c.align === 'r' ? 'r' : ''} ${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${shown.map(r => `<tr>${cols.map(c => `<td class="${c.align === 'r' ? 'r num' : ''} ${c.cls || ''}">${c.html ? c.html(r) : esc(c.value(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : `<div class="card-body muted">${esc(empty)}</div>`}
    </section>`;
  }

  function summary(s, extra = []) {
    const items = [['Revenue', money(s.revenue)], ['Orders', number(s.orders)], ['Avg. order value', money(Math.round(s.aov))], ['Tins sold', number(s.units)], ['Customers', number(s.customers)], ...extra];
    return `<section class="summary-strip">${items.map(([l, v]) => `<div class="card"><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</section>`;
  }

  const ordersLink = (q, text) => `<a class="link" href="#/orders?${new URLSearchParams({ ...q, from: f.from, to: f.to })}">${esc(text)}</a>`;

  /* ---------- tabs ---------- */
  const VIEWS = {
    locations: d => `${summary(d.summary, [['States reached', number(d.states.length)]])}
      <div class="grid grid-2" style="margin-bottom:18px">
        <section class="card"><div class="card-head"><div><h2>Top states by revenue</h2><p>Your most-selling locations</p></div></div>
          <div class="card-body">${d.states.length ? barList(d.states.slice(0, 10).map(s => ({ label: s.state, value: s.revenue, display: money(s.revenue), sub: `${number(s.orders)} orders` }))) : '<p class="muted">No orders yet.</p>'}</div></section>
        <section class="card"><div class="card-head"><div><h2>Top cities by revenue</h2></div></div>
          <div class="card-body">${d.cities.length ? barList(d.cities.slice(0, 10).map(c => ({ label: `${c.city}, ${c.state}`, value: c.revenue, display: money(c.revenue), sub: `${number(c.orders)} orders` }))) : '<p class="muted">No orders yet.</p>'}</div></section>
      </div>
      <div class="stack">
        ${table('states', 'Sales by state', 'Every state with at least one order', [
          { label: 'State', value: r => r.state, html: r => `<span class="strong">${esc(r.state)}</span>` },
          { label: 'Orders', value: r => r.orders, align: 'r', html: r => ordersLink({ state: r.state }, number(r.orders)) },
          { label: 'Customers', value: r => r.customers, align: 'r', cls: 'hide-sm', html: r => number(r.customers) },
          { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => `<b>${money(r.revenue)}</b>` },
          { label: 'Avg. order', value: r => r.aov, align: 'r', cls: 'hide-sm', html: r => money(Math.round(r.aov)) },
          { label: 'Share', value: r => r.share, cls: 'hide-sm', html: r => share(r.share) },
        ], d.states)}
        <div class="grid grid-2">
          ${table('cities', 'Top 25 cities', '', [
            { label: 'City', value: r => `${r.city}, ${r.state}`, html: r => `<span class="strong">${esc(r.city)}</span><span class="sub">${esc(r.state)}</span>` },
            { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
            { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => money(r.revenue) },
          ], d.cities)}
          ${table('pins', 'Top 25 PIN codes', 'Useful for delivery planning and local ads', [
            { label: 'PIN', value: r => r.pin, html: r => `<span class="mono strong">${esc(r.pin)}</span><span class="sub">${esc(r.city)}, ${esc(r.state)}</span>` },
            { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
            { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => money(r.revenue) },
          ], d.pins)}
        </div>
      </div>`,

    products: d => `${summary(d.summary)}
      <div class="grid grid-main-side" style="margin-bottom:18px">
        <section class="card"><div class="card-head"><h2>Revenue by product</h2></div>
          <div class="card-body">${d.products.length ? barList(d.products.map(p => ({
            label: p.name, value: p.revenue, display: money(p.revenue), sub: `${number(p.units)} tins`,
            media: p.image ? `<span class="thumb sm"><img src="${esc(imgUrl(p.image))}" alt=""></span>` : '',
          }))) : '<p class="muted">No sales in this period.</p>'}</div></section>
        ${table('state_best', 'Best seller in each state', 'By tins sold', [
          { label: 'State', value: r => r.state },
          { label: 'Best seller', value: r => r.product, html: r => `<span class="strong">${esc(r.product)}</span>` },
          { label: 'Tins', value: r => r.units, align: 'r', html: r => number(r.units) },
        ], d.top_per_state)}
      </div>
      ${table('products', 'Product performance', '', [
        { label: 'Product', value: r => r.name, html: r => `<div class="cell-media"><span class="thumb sm">${r.image ? `<img src="${esc(imgUrl(r.image))}" alt="">` : ''}</span>${r.id ? `<a class="strong" href="#/products/${r.id}">${esc(r.name)}</a>` : esc(r.name)}</div>` },
        { label: 'Tins sold', value: r => r.units, align: 'r', html: r => `<b>${number(r.units)}</b>` },
        { label: 'Orders', value: r => r.orders, align: 'r', cls: 'hide-sm', html: r => number(r.orders) },
        { label: 'Tins / order', value: r => r.avg_units_per_order, align: 'r', cls: 'hide-md', html: r => number(r.avg_units_per_order) },
        { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => `<b>${money(r.revenue)}</b>` },
        { label: 'Share', value: r => r.share, cls: 'hide-sm', html: r => share(r.share) },
        { label: 'Cancelled tins', value: r => r.cancelled_units, align: 'r', cls: 'hide-md', html: r => r.cancelled_units ? `<span class="danger-text">${number(r.cancelled_units)}</span>` : '<span class="muted">0</span>' },
      ], d.products)}`,

    marketing: d => `${summary(d.summary, [['Known source', `${d.summary.attributed_share}%`], ['Link clicks', number(d.summary.clicks)]])}
      <div class="grid grid-2" style="margin-bottom:18px">
        <section class="card"><div class="card-head"><div><h2>Revenue by source</h2><p>Last click before the order. “(direct)” = no tracking found</p></div></div>
          <div class="card-body">${d.sources.length ? barList(d.sources.map(s => ({ label: s.channel, value: s.revenue, display: money(s.revenue), sub: `${number(s.orders)} orders` }))) : '<p class="muted">No orders yet.</p>'}</div></section>
        ${table('mediums', 'By medium', 'cpc, social, email, organic…', [
          { label: 'Medium', value: r => r.medium, html: r => `<span class="strong">${esc(r.medium)}</span>` },
          { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
          { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => money(r.revenue) },
          { label: 'Share', value: r => r.share, cls: 'hide-sm', html: r => share(r.share) },
        ], d.mediums)}
      </div>
      <div class="stack">
        ${table('links', 'Marketing links', 'Clicks and orders in this period', [
          { label: 'Link', value: r => r.name, html: r => `<span class="strong">${esc(r.name)}</span><span class="sub mono">go?c=${esc(r.code)}</span>` },
          { label: 'Source / medium', value: r => `${r.source} / ${r.medium}`, cls: 'hide-sm', html: r => `${esc(r.source)} <span class="muted">/ ${esc(r.medium)}</span>` },
          { label: 'Clicks', value: r => r.clicks, align: 'r', html: r => number(r.clicks) },
          { label: 'Orders', value: r => r.orders, align: 'r', html: r => r.orders ? ordersLink({ utm_id: r.code }, number(r.orders)) : '0' },
          { label: 'Conversion', value: r => r.conversion ?? '', align: 'r', html: r => pct(r.conversion) },
          { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => `<b>${money(r.revenue)}</b>` },
        ], d.links, { empty: 'No marketing links yet. Create one under Marketing links.' })}
        ${table('sources', 'Sources', '', [
          { label: 'Source', value: r => r.channel, html: r => ordersLink({ utm_source: r.channel }, r.channel) },
          { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
          { label: 'Customers', value: r => r.customers, align: 'r', cls: 'hide-sm', html: r => number(r.customers) },
          { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => `<b>${money(r.revenue)}</b>` },
          { label: 'Avg. order', value: r => r.aov, align: 'r', cls: 'hide-sm', html: r => money(Math.round(r.aov)) },
          { label: 'Share', value: r => r.share, cls: 'hide-sm', html: r => share(r.share) },
        ], d.sources)}
        <div class="grid grid-2">
          ${table('campaigns', 'Campaigns', '', [
            { label: 'Campaign', value: r => r.campaign, html: r => `${ordersLink({ utm_campaign: r.campaign }, r.campaign)}<span class="sub">${esc(r.channel)}${r.medium ? ' / ' + esc(r.medium) : ''}</span>` },
            { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
            { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => money(r.revenue) },
          ], d.campaigns, { empty: 'No orders with a campaign in this period.' })}
          ${table('landing', 'Landing pages', 'First page the buyer opened', [
            { label: 'Page', value: r => r.page, html: r => `<span class="mono small">${esc(r.page)}</span>` },
            { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
            { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => money(r.revenue) },
          ], d.landing_pages, { empty: 'No landing-page data yet.' })}
        </div>
      </div>`,

    customers: d => {
      const split = Object.fromEntries(d.split.map(s => [s.kind, s]));
      const n = split.new || { orders: 0, revenue: 0 }, r = split.returning || { orders: 0, revenue: 0 };
      return `${summary(d.summary, [['New customers', number(d.summary.new_customers)], ['Repeat rate (all time)', `${d.summary.repeat_rate}%`]])}
      <div class="grid grid-2" style="margin-bottom:18px">
        <section class="card"><div class="card-head"><div><h2>New vs returning</h2><p>Revenue from first orders vs repeat orders</p></div></div>
          <div class="card-body">${splitBar([
            { label: `New · ${number(n.orders)} orders`, value: n.revenue, display: money(n.revenue), color: 'var(--series-1)' },
            { label: `Returning · ${number(r.orders)} orders`, value: r.revenue, display: money(r.revenue), color: 'var(--series-2)' },
          ])}</div></section>
        <section class="card"><div class="card-head"><div><h2>Order frequency</h2><p>Customers by number of orders (all time)</p></div></div>
          <div class="card-body">${barList(d.frequency.map(b => ({ label: b.bucket, value: b.customers, display: `${number(b.customers)} customers` })))}</div></section>
      </div>
      ${table('top_customers', 'Top customers', 'By revenue in this period', [
        { label: 'Customer', value: r2 => r2.name, html: r2 => `<a class="strong" href="#/customers/${r2.id}">${esc(r2.name)}</a><span class="sub">${esc(r2.email)}</span>` },
        { label: 'City', value: r2 => r2.city, cls: 'hide-sm' },
        { label: 'Orders', value: r2 => r2.orders, align: 'r', html: r2 => number(r2.orders) },
        { label: 'Revenue', value: r2 => r2.revenue, align: 'r', html: r2 => `<b>${money(r2.revenue)}</b>` },
        { label: 'Last order', value: r2 => r2.last_order, cls: 'hide-sm', html: r2 => esc(timeAgo(r2.last_order)) },
      ], d.top)}`;
    },

    time: d => {
      const peakDay = [...d.weekdays].sort((a, b) => b.orders - a.orders)[0];
      const peakHour = [...d.hours].sort((a, b) => b.orders - a.orders)[0];
      const hourLabel = h => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
      return `${summary(d.summary, [['Busiest day', peakDay.orders ? peakDay.day : '—'], ['Busiest hour', peakHour.orders ? `${hourLabel(peakHour.hour)}–${hourLabel((peakHour.hour + 1) % 24)}` : '—']])}
      <div class="grid grid-2" style="margin-bottom:18px">
        <section class="card"><div class="card-head"><div><h2>Orders by day of week</h2><p>Plan posts and ads for your strongest days</p></div></div>
          <div class="card-body">${columnChart(d.weekdays.map(w => ({ label: w.day, value: w.orders, display: `${number(w.orders)} orders · ${money(w.revenue)}`, tick: w.day.slice(0, 3) })))}</div></section>
        <section class="card"><div class="card-head"><div><h2>Orders by hour</h2><p>Hour the order was placed (IST)</p></div></div>
          <div class="card-body">${columnChart(d.hours.map(h => ({ label: `${hourLabel(h.hour)}–${hourLabel((h.hour + 1) % 24)}`, value: h.orders, display: `${number(h.orders)} orders`, tick: h.hour % 3 === 0 ? hourLabel(h.hour) : '' })))}</div></section>
      </div>
      <div class="grid grid-2">
        ${table('weekdays', 'Day of week', '', [
          { label: 'Day', value: r => r.day },
          { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
          { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => money(r.revenue) },
        ], d.weekdays)}
        ${table('hours', 'Hour of day', '', [
          { label: 'Hour', value: r => hourLabel(r.hour) },
          { label: 'Orders', value: r => r.orders, align: 'r', html: r => number(r.orders) },
          { label: 'Revenue', value: r => r.revenue, align: 'r', html: r => money(r.revenue) },
        ], d.hours.filter(h => h.orders))}
      </div>`;
    },
  };

  async function load() {
    setQuery(f);
    el.querySelectorAll('[data-report-tab]').forEach(a => { a.href = `#/reports/${a.dataset.reportTab}?${new URLSearchParams(f)}`; });
    if (body.querySelector('.card')) body.classList.add('is-refreshing');
    try {
      const d = await get(`reports/${tab}`, { from: f.from, to: f.to });
      body.innerHTML = `<p class="small muted" style="margin:-6px 0 14px">${esc(fmtDate(d.range.from))} – ${esc(fmtDate(d.range.to))}</p>` + VIEWS[tab](d);
    } catch (err) {
      errorState(body, err, load);
    } finally {
      body.classList.remove('is-refreshing');
    }
  }

  const form = el.querySelector('[data-range-form]');
  form.addEventListener('change', e => {
    if (e.target.name === 'range') {
      f.range = e.target.value;
      if (f.range !== 'custom') { [f.from, f.to] = PRESETS[f.range](); form.from.value = f.from; form.to.value = f.to; }
    } else {
      f.range = 'custom'; form.range.value = 'custom';
      f.from = form.from.value; f.to = form.to.value;
    }
    load();
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-csv]');
    if (!b) return;
    const t = tables[b.dataset.csv];
    downloadCsv(`${tab}-${b.dataset.csv}-${f.from}_to_${f.to}.csv`, t.cols.map(c => ({ label: c.label, value: c.value })), t.rows);
  });

  await load();
}
