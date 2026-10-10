import { get } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, fmtDate, timeAgo, initials, debounce, pager, sortHeader, nextSort, emptyState, loadingRows, rowError } from '../ui.js';
import { navigate } from '../router.js';
import { customerModal } from './customer-modal.js';

export async function render({ el, query, setQuery }) {
  const f = { q: query.q || '', type: query.type || '', sort: query.sort || '-created_at', page: query.page || '' };

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Customers</h1><p>Everyone who has ordered or created an account.</p></div>
      <div class="actions"><button type="button" class="btn btn-primary" data-new>${icon('plus')}New customer</button></div>
    </div>
    <section class="card">
      <div class="tabs" role="tablist" aria-label="Customer type">${[['', 'All'], ['registered', 'With account'], ['guest', 'Guest checkout']].map(([k, l]) => `<button type="button" class="tab" role="tab" data-type="${k}" aria-selected="${f.type === k}">${l}</button>`).join('')}</div>
      <div class="toolbar"><label class="search">${icon('search')}<span class="sr-only">Search</span><input class="input" type="search" value="${esc(f.q)}" placeholder="Name, email or phone" data-q></label></div>
      <div class="table-wrap"><table class="table"><thead data-head></thead><tbody data-rows>${loadingRows(6)}</tbody></table></div>
      <div data-pager></div>
    </section>`;
  const rows = el.querySelector('[data-rows]');

  async function load() {
    setQuery(f);
    el.querySelector('[data-head]').innerHTML = `<tr>${sortHeader('Customer', 'name', f.sort)}<th class="hide-md">Phone</th>${sortHeader('Orders', 'orders', f.sort, 'r')}${sortHeader('Spent', 'spent', f.sort, 'r')}${sortHeader('Last order', 'last_order', f.sort, 'hide-sm')}${sortHeader('Joined', 'created_at', f.sort, 'hide-md')}</tr>`;
    try {
      const res = await get('customers', { ...f, per_page: 20 });
      rows.innerHTML = res.data.length ? res.data.map(c => `
        <tr class="clickable" data-href="#/customers/${c.id}">
          <td><a href="#/customers/${c.id}" class="cell-media"><span class="avatar">${esc(initials(c.name))}</span>
            <span class="ellipsis"><span class="strong">${esc(c.name)}</span> ${c.registered ? '' : '<span class="badge plain" style="height:20px;font-size:11px">Guest</span>'}<span class="sub ellipsis">${esc(c.email)}</span></span></a></td>
          <td class="hide-md num">${c.phone ? '+91 ' + esc(c.phone) : '<span class="muted">—</span>'}</td>
          <td class="r num">${number(c.orders_count)}</td>
          <td class="r num strong">${money(c.total_spent)}</td>
          <td class="hide-sm">${c.last_order_at ? esc(timeAgo(c.last_order_at)) : '<span class="muted">Never</span>'}</td>
          <td class="hide-md">${esc(fmtDate(c.created_at))}</td>
        </tr>`).join('')
        : `<tr><td colspan="6">${emptyState('No customers found', f.q ? 'Try another search.' : 'Customers appear here after their first order.')}</td></tr>`;
      el.querySelector('[data-pager]').innerHTML = pager(res.meta);
    } catch (err) {
      rows.innerHTML = rowError(err, 6);
    }
  }

  el.querySelector('[data-q]').addEventListener('input', debounce(e => { f.q = e.target.value.trim(); f.page = ''; load(); }, 300));
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) { customerModal(null, c => navigate(`/customers/${c.id}`)); return; }
    const t = e.target.closest('[data-type]');
    if (t) { f.type = t.dataset.type; f.page = ''; el.querySelectorAll('[data-type]').forEach(x => x.setAttribute('aria-selected', String(x === t))); load(); return; }
    const s = e.target.closest('[data-sort]');
    if (s) { f.sort = nextSort(f.sort, s.dataset.sort); load(); return; }
    const p = e.target.closest('[data-page]');
    if (p && !p.disabled) { f.page = p.dataset.page; load(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a, button')) location.hash = row.dataset.href;
  });

  await load();
}
