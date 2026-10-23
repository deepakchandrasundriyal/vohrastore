import { get, post, put, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, field, openModal, confirmDialog, toast, emptyState, loadingRows, rowError, imgUrl, errorState } from '../ui.js';
import { seoFields, bindSeo, seoScore } from './seo-fields.js';

export async function render({ el, query, setQuery }) {
  const f = { tab: query.tab === 'products' ? 'products' : 'pages' };
  let data, siteUrl;
  try { siteUrl = (await get('settings')).site_url.replace(/\/?$/, '/'); } catch (err) { errorState(el, err, () => render({ el, query, setQuery })); return; }

  el.innerHTML = `
    <div class="page-head">
      <div><h1>SEO</h1><p>Control how each page and product appears in Google search and when shared on WhatsApp or Facebook.</p></div>
      <div class="actions"><button type="button" class="btn" data-new-page>${icon('plus')}Add page</button></div>
    </div>
    <div class="summary-strip" data-summary></div>
    <section class="card">
      <div class="tabs" role="tablist">
        <button type="button" class="tab" role="tab" data-tab="pages" aria-selected="${f.tab === 'pages'}">${icon('globe')}Pages</button>
        <button type="button" class="tab" role="tab" data-tab="products" aria-selected="${f.tab === 'products'}">${icon('products')}Products</button>
      </div>
      <div class="table-wrap"><table class="table"><thead data-head></thead><tbody data-rows>${loadingRows(5, 6)}</tbody></table></div>
    </section>`;
  const rows = el.querySelector('[data-rows]');

  const lenCell = (val, ideal) => {
    const n = (val || '').trim().length;
    return `<span class="counter ${!n ? 'bad' : n > ideal ? 'warn' : 'ok'}">${n}/${ideal}</span>`;
  };

  async function load() {
    setQuery(f);
    try {
      data = await get('seo');
      const all = [...data.pages.map(p => seoScore(p.seo_title, p.seo_description, p.noindex)), ...data.products.map(p => seoScore(p.seo_title, p.seo_description, !p.is_active))];
      const count = label => all.filter(s => s[0] === label).length;
      el.querySelector('[data-summary]').innerHTML = [['Good', count('Good')], ['Needs work', count('Needs work')], ['Missing', count('Missing')], ['Hidden from Google', count('Hidden from Google')]]
        .map(([l, n]) => `<div class="card"><small>${l}</small><b>${n}</b></div>`).join('');
      paint();
    } catch (err) { rows.innerHTML = rowError(err, 5); }
  }

  function paint() {
    el.querySelectorAll('[data-tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === f.tab)));
    el.querySelector('[data-new-page]').hidden = f.tab !== 'pages';
    if (f.tab === 'pages') {
      el.querySelector('[data-head]').innerHTML = '<tr><th>Page</th><th class="hide-md">Title in Google</th><th class="r">Title</th><th class="r">Description</th><th>Status</th><th></th></tr>';
      rows.innerHTML = data.pages.length ? data.pages.map(p => {
        const [label, tone] = seoScore(p.seo_title, p.seo_description, p.noindex);
        return `<tr class="clickable" data-page="${p.id}">
          <td><span class="strong">${esc(p.label)}</span><span class="sub mono">${esc(p.path)}</span></td>
          <td class="hide-md" style="max-width:360px"><span class="ellipsis" style="display:block;color:var(--info)">${esc(p.seo_title)}</span><span class="sub ellipsis">${esc(p.seo_description || '—')}</span></td>
          <td class="r">${lenCell(p.seo_title, 60)}</td><td class="r">${lenCell(p.seo_description, 160)}</td>
          <td><span class="badge ${tone}">${esc(label)}</span></td>
          <td class="r muted">${icon('chevron')}</td></tr>`;
      }).join('') : `<tr><td colspan="6">${emptyState('No pages yet', 'Add SEO settings for a storefront page.')}</td></tr>`;
    } else {
      el.querySelector('[data-head]').innerHTML = '<tr><th>Product</th><th class="hide-md">Title in Google</th><th class="r">Title</th><th class="r">Description</th><th>Status</th><th></th></tr>';
      rows.innerHTML = data.products.map(p => {
        const [label, tone] = seoScore(p.seo_title, p.seo_description, !p.is_active);
        return `<tr class="clickable" data-product="${p.id}">
          <td><div class="cell-media"><span class="thumb sm">${p.image ? `<img src="${esc(imgUrl(p.image))}" alt="">` : ''}</span><span><span class="strong">${esc(p.name)}</span><span class="sub mono">product-${esc(p.slug)}.html</span></span></div></td>
          <td class="hide-md" style="max-width:360px"><span class="ellipsis" style="display:block;color:var(--info)">${esc(p.seo_title || '—')}</span><span class="sub ellipsis">${esc(p.seo_description || '—')}</span></td>
          <td class="r">${lenCell(p.seo_title, 60)}</td><td class="r">${lenCell(p.seo_description, 160)}</td>
          <td><span class="badge ${tone}">${esc(p.is_active ? label : 'Hidden product')}</span></td>
          <td class="r muted">${icon('chevron')}</td></tr>`;
      }).join('');
    }
  }

  function pageModal(p = null) {
    const v = p || { noindex: false };
    const { form } = openModal({
      title: p ? `SEO · ${p.label}` : 'Add page', size: 'lg',
      body: `<div class="form-grid">
        ${field({ name: 'label', label: 'Page name', value: v.label, required: true })}
        ${field({ name: 'path', label: 'File', value: v.path, required: true, placeholder: 'about.html', attrs: p ? 'readonly' : '' })}
        ${seoFields(v)}
        ${field({ name: 'canonical_url', label: 'Canonical URL', value: v.canonical_url || '', optional: true, span: true, placeholder: 'https://vohrastore.com/…', hint: 'Only if this page duplicates another one. Leave empty normally.' })}
        ${field({ name: 'noindex', label: 'Hide this page from Google (noindex)', type: 'switch', value: v.noindex, span: true, hint: 'For cart, checkout, account and similar private pages.' })}
      </div>`,
      extraFooter: p ? `<button type="button" class="btn btn-ghost btn-danger-text left" data-del>${icon('trash')}Remove</button>` : '',
      submitLabel: p ? 'Save SEO' : 'Add page',
      onSubmit: async body => {
        p ? await put(`seo/pages/${p.id}`, body) : await post('seo/pages', body);
        toast('SEO saved'); load();
      },
    });
    bindSeo(form, { url: () => siteUrl + (form.elements.path.value || '') });
    form.querySelector('[data-del]')?.addEventListener('click', async () => {
      form.closest('dialog').close();
      if (!(await confirmDialog({ title: `Remove SEO settings for ${p.label}?`, message: 'The page itself is not deleted. Its SEO settings will be reset when the storefront is connected.', confirmLabel: 'Remove' }))) return;
      try { await del(`seo/pages/${p.id}`); toast('Removed'); load(); } catch (err) { toast(err.message, 'error'); }
    });
  }

  async function productModal(id) {
    let product;
    try { product = await get(`products/${id}`); } catch (err) { toast(err.message, 'error'); return; }
    const { form } = openModal({
      title: `SEO · ${product.name}`, size: 'lg',
      body: `<div class="form-grid">${seoFields(product, { titleHint: `${product.name} Roasted Makhana ${product.weight} | Vohra's`, descHint: product.tagline })}</div>
        <p class="hint mt-2">Everything else about this product is edited on the <a class="link" href="#/products/${product.id}">product page</a>.</p>`,
      submitLabel: 'Save SEO',
      onSubmit: async seo => {
        await put(`products/${product.id}`, { ...product, ...seo });
        toast('SEO saved'); load();
      },
    });
    form.querySelector('a.link').addEventListener('click', () => form.closest('dialog').close());
    bindSeo(form, { url: () => `${siteUrl}product-${product.slug}`, fallbackTitle: () => product.name, fallbackDesc: () => product.description, uploadPath: 'products/upload' });
  }

  el.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) { f.tab = t.dataset.tab; setQuery(f); paint(); return; }
    if (e.target.closest('[data-new-page]')) { pageModal(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const pg = e.target.closest('[data-page]');
    if (pg) { pageModal(data.pages.find(p => p.id === +pg.dataset.page)); return; }
    const pr = e.target.closest('[data-product]');
    if (pr) productModal(+pr.dataset.product);
  });

  await load();
}
