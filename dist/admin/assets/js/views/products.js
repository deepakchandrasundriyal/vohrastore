import { get, post, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, debounce, emptyState, loadingRows, rowError, sortHeader, nextSort, confirmDialog, toast, imgUrl, openMenu } from '../ui.js';
import { navigate } from '../router.js';
import { seoScore } from './seo-fields.js';

const STATUS_TABS = [['', 'All'], ['active', 'Visible'], ['inactive', 'Hidden'], ['low', 'Low stock'], ['out', 'Out of stock']];
const PROFILES = { classic: 'Classic & Light', spicy: 'Spicy & Tangy', creamy: 'Creamy & Cheesy', herby: 'Fresh & Herby' };

export async function render({ el, query, setQuery }) {
  const f = { q: query.q || '', status: query.status || '', profile: query.profile || '', sort: query.sort || 'sort_order' };
  let items = [];

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Products</h1><p>Prices, stock and everything shown on each product page.</p></div>
      <div class="actions"><a href="#/products/new" class="btn btn-primary">${icon('plus')}New product</a></div>
    </div>
    <section class="card">
      <div class="tabs" role="tablist" aria-label="Filter products">${STATUS_TABS.map(([k, l]) => `<button type="button" class="tab" role="tab" data-status="${k}" aria-selected="${f.status === k}">${l}</button>`).join('')}</div>
      <div class="toolbar">
        <label class="search">${icon('search')}<span class="sr-only">Search</span><input class="input" type="search" value="${esc(f.q)}" placeholder="Search products" data-q></label>
        <select class="select" data-profile aria-label="Taste profile"><option value="">All taste profiles</option>${Object.entries(PROFILES).map(([k, l]) => `<option value="${k}" ${f.profile === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="spacer"></span><span class="small muted" data-count></span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead data-head></thead>
        <tbody data-rows>${loadingRows(8)}</tbody>
      </table></div>
    </section>`;
  const rows = el.querySelector('[data-rows]');

  async function load() {
    setQuery(f);
    el.querySelector('[data-head]').innerHTML = `<tr>${sortHeader('Product', 'name', f.sort)}<th class="hide-md">Profile</th>${sortHeader('Price', 'price', f.sort, 'r')}${sortHeader('Stock', 'stock', f.sort, 'r')}${sortHeader('Sold', 'sold', f.sort, 'r hide-sm')}<th class="hide-md">SEO</th><th>Visible</th><th></th></tr>`;
    try {
      items = (await get('products', f)).data;
      el.querySelector('[data-count]').textContent = `${items.length} ${items.length === 1 ? 'product' : 'products'}`;
      rows.innerHTML = items.length ? items.map(rowHTML).join('')
        : `<tr><td colspan="8">${emptyState('No products found', f.q || f.status || f.profile ? 'Try a different filter.' : 'Add your first product to start selling.', '<a class="btn btn-primary" href="#/products/new">New product</a>')}</td></tr>`;
    } catch (err) {
      rows.innerHTML = rowError(err, 8);
    }
  }

  function stockBadge(p) {
    if (p.stock <= 0) return '<span class="badge danger">Out of stock</span>';
    if (p.stock <= p.low_stock_at) return '<span class="badge warn">Low</span>';
    return '';
  }

  function rowHTML(p) {
    return `<tr data-id="${p.id}">
      <td><a href="#/products/${p.id}" class="cell-media">
        <span class="thumb" style="background:${esc(p.tint)}">${p.image ? `<img src="${esc(imgUrl(p.image))}" alt="">` : icon('image')}</span>
        <span class="ellipsis"><span class="strong">${esc(p.name)}</span><span class="sub">${esc(p.weight)} · /${esc(p.slug)}</span></span></a></td>
      <td class="hide-md"><span class="flex items-center gap-1"><i class="swatch" style="background:${esc(p.color)}"></i>${esc(PROFILES[p.profile])}</span></td>
      <td class="r num"><b>${money(p.price)}</b>${p.mrp > p.price ? `<span class="sub strike">${money(p.mrp)}</span>` : ''}</td>
      <td class="r"><div class="flex items-center gap-1" style="justify-content:flex-end">${stockBadge(p)}
        <input class="input stock-input num" type="number" min="0" value="${p.stock}" data-stock="${p.id}" aria-label="Stock for ${esc(p.name)}"></div></td>
      <td class="r num hide-sm">${number(p.sold)}</td>
      <td class="hide-md"><a href="#/products/${p.id}" title="Edit SEO">${(([l, t]) => `<span class="badge ${t}">${l}</span>`)(seoScore(p.seo_title, p.seo_description))}</a></td>
      <td><label class="switch"><input type="checkbox" data-active="${p.id}" ${p.is_active ? 'checked' : ''} aria-label="Show ${esc(p.name)} in the store"><span class="track"></span></label></td>
      <td class="r"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-menu="${p.id}" aria-label="Actions for ${esc(p.name)}">${icon('dots')}</button></td>
    </tr>`;
  }

  async function quick(id, body, okMsg) {
    try {
      const updated = await post(`products/${id}/quick`, body);
      const i = items.findIndex(p => p.id === updated.id);
      if (i >= 0) items[i] = { ...items[i], ...updated };
      rows.querySelector(`tr[data-id="${id}"]`).outerHTML = rowHTML(items[i]);
      toast(okMsg(updated));
    } catch (err) {
      toast(err.errors?.stock || err.message, 'error');
      load();
    }
  }

  async function remove(p) {
    const ok = await confirmDialog({
      title: `Delete ${p.name}?`,
      message: p.sold ? `It has ${p.sold} tins in past orders — those orders keep their copy of the name and price. To stop selling it but keep its data, hide it instead.` : 'This permanently removes the product.',
      confirmLabel: 'Delete product',
    });
    if (!ok) return;
    try { await del(`products/${p.id}`); toast(`${p.name} deleted`); load(); } catch (err) { toast(err.message, 'error'); }
  }

  el.querySelector('[data-q]').addEventListener('input', debounce(e => { f.q = e.target.value.trim(); load(); }, 250));
  el.querySelector('[data-profile]').addEventListener('change', e => { f.profile = e.target.value; load(); });

  rows.addEventListener('change', e => {
    const s = e.target.dataset.stock;
    if (s) {
      const v = parseInt(e.target.value, 10);
      if (Number.isNaN(v) || v < 0) { toast('Stock must be 0 or more.', 'error'); load(); return; }
      quick(s, { stock: v }, p => `${p.name}: stock set to ${number(p.stock)}`);
    }
    const a = e.target.dataset.active;
    if (a) quick(a, { is_active: e.target.checked }, p => `${p.name} is now ${p.is_active ? 'visible' : 'hidden'} in the store`);
  });
  rows.addEventListener('keydown', e => { if (e.target.dataset.stock && e.key === 'Enter') e.target.blur(); });

  el.addEventListener('click', e => {
    const t = e.target.closest('[data-status]');
    if (t) { f.status = t.dataset.status; el.querySelectorAll('[data-status]').forEach(x => x.setAttribute('aria-selected', String(x === t))); load(); return; }
    const s = e.target.closest('[data-sort]');
    if (s) { f.sort = nextSort(f.sort, s.dataset.sort); load(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const m = e.target.closest('[data-menu]');
    if (m) {
      const p = items.find(x => x.id === +m.dataset.menu);
      openMenu(m, [
        { label: 'Edit', icon: 'edit', onClick: () => navigate(`/products/${p.id}`) },
        { label: 'View in store', icon: 'external', onClick: () => window.open(`../product-${p.slug}`, '_blank', 'noopener') },
        '-',
        { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(p) },
      ]);
    }
  });

  await load();
}
