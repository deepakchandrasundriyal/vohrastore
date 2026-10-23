import { api, get, post, put, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, field, readForm, showErrors, clearErrors, setBusy, toast, confirmDialog, errorState, imgUrl, fmtDateTime, number } from '../ui.js';
import { navigate, setLeaveGuard } from '../router.js';
import { openPropsManager } from './props-manager.js';
import { seoFields, bindSeo } from './seo-fields.js';

const IMAGES = [
  ['image', 'Tin (main)', true],
  ['image_bowl', 'In the bowl', false],
  ['image_label', 'Back label', false],
];
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export async function render({ el, params }) {
  const editing = !!params.id;
  let meta, p;
  try {
    [meta, p] = await Promise.all([get('products/meta'), editing ? get(`products/${params.id}`) : null]);
  } catch (err) {
    errorState(el, err, () => render({ el, params }));
    return;
  }
  p = p || {
    name: '', slug: '', tagline: '', description: '', profile: 'classic', price: '', mrp: '', weight: '100 g', stock: 0, low_stock_at: 10,
    color: '#C98A1B', tint: '#F2E2B8', image: '', image_bowl: '', image_label: '', props: [], ingredients: '', allergens: [], nutrition: {},
    is_active: true, sort_order: 100,
  };
  let slugTouched = editing;
  let dirty = false;
  const allergenOptions = [...new Set([...meta.allergens, ...(p.allergens || [])])];

  el.innerHTML = `
    <a href="#/products" class="crumb">${icon('back')}Products</a>
    <div class="page-head">
      <div><h1>${editing ? esc(p.name) : 'New product'}</h1>
        <p>${editing ? `Last updated ${esc(fmtDateTime(p.updated_at))} · ${number(p.sold)} tins sold` : 'Fill in the details exactly as printed on the pack.'}</p></div>
      ${editing ? `<div class="actions"><button type="button" class="btn" data-jump-seo>${icon('globe')}SEO</button><a class="btn" href="../product-${esc(p.slug)}" target="_blank" rel="noopener">${icon('external')}View in store</a>
        <button type="button" class="btn btn-danger-text" data-delete>${icon('trash')}Delete</button></div>` : ''}
    </div>

    <form novalidate data-form>
      <div class="grid grid-main-side">
        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Basic details</h2></div>
            <div class="card-body form-grid">
              ${field({ name: 'name', label: 'Product name', value: p.name, required: true, placeholder: 'e.g. Peri Peri' })}
              ${field({ name: 'slug', label: 'URL slug', value: p.slug, required: true, prefix: 'product-', hint: 'Lowercase letters, numbers and dashes.' })}
              ${field({ name: 'tagline', label: 'Tagline', value: p.tagline, required: true, span: true, placeholder: 'Red chilli, garlic & spice roast' })}
              ${field({ name: 'description', label: 'Description', type: 'textarea', value: p.description, required: true, span: true, rows: 4 })}
              ${field({ name: 'profile', label: 'Taste profile', type: 'select', options: meta.profiles, value: p.profile, hint: 'Used by the shop filters.' })}
              ${field({ name: 'weight', label: 'Net weight', value: p.weight, required: true })}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><div><h2>Images</h2><p>WebP, PNG or JPG up to 3 MB. Transparent tin shots look best.</p></div></div>
            <div class="card-body"><div class="uploads" data-error-for="image">
              ${IMAGES.map(([key, label, req]) => `
                <div class="upload ${p[key] ? 'has' : ''}" data-upload="${key}">
                  <span class="badge plain tag">${esc(label)}${req ? '' : ' · optional'}</span>
                  ${p[key] ? `<img src="${esc(imgUrl(p[key]))}" alt="">` : `<div class="ph">${icon('image')}Drop or click to upload</div>`}
                  <input type="file" accept="image/webp,image/png,image/jpeg" aria-label="Upload ${esc(label)} image">
                  <input type="hidden" name="${key}" value="${esc(p[key] || '')}">
                  ${!req && p[key] ? `<button type="button" class="btn btn-sm btn-icon rm" data-clear-image="${key}" aria-label="Remove image">${icon('close')}</button>` : ''}
                </div>`).join('')}
            </div></div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Ingredients &amp; allergens</h2></div>
            <div class="card-body form-grid">
              ${field({ name: 'ingredients', label: 'Ingredients', type: 'textarea', value: p.ingredients, required: true, span: true, rows: 4 })}
              <div class="field span-2"><span class="label">Contains</span>
                <div class="chips" data-allergens>${allergenOptions.map(a => `<label class="chip-check"><input type="checkbox" name="allergens[]" value="${esc(a)}" ${(p.allergens || []).includes(a) ? 'checked' : ''}><span>${esc(a)}</span></label>`).join('')}</div>
                <p class="hint">Leave all unticked for “No declared allergens”.</p></div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><div><h2>Nutrition facts</h2><p>As printed on the label. Serving size 28 g.</p></div></div>
            <div class="table-wrap"><table class="table nutri">
              <thead><tr><th>Nutrient</th><th class="r">Per 100 g</th><th class="r">Per serve</th><th class="r">%RDA / serve</th></tr></thead>
              <tbody>${Object.entries(meta.nutrients).map(([k, [label, unit]]) => {
                const row = (p.nutrition || {})[k] || ['', '', ''];
                return `<tr><td>${esc(label)} <span class="muted small">${esc(unit)}</span></td>
                  <td><input class="input num" type="number" step="0.01" min="0" data-n="${k}" data-i="0" value="${esc(row[0])}" aria-label="${esc(label)} per 100 g"></td>
                  <td><input class="input num" type="number" step="0.01" min="0" data-n="${k}" data-i="1" value="${esc(row[1])}" aria-label="${esc(label)} per serve"></td>
                  <td><input class="input" data-n="${k}" data-i="2" value="${esc(row[2] ?? '')}" placeholder="-" aria-label="${esc(label)} RDA"></td></tr>`;
              }).join('')}</tbody></table></div>
          </section>

          <section class="card" id="seo">
            <div class="card-head"><div><h2>Search engine (SEO)</h2><p>How this product appears in Google and in link previews.</p></div></div>
            <div class="card-body form-grid">${seoFields(p, { titleHint: `${p.name || 'Product'} Roasted Makhana ${p.weight} | Vohra's`, descHint: p.tagline || 'One or two sentences that make people click.', imageAlt: true })}</div>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Pricing &amp; stock</h2></div>
            <div class="card-body form-grid">
              ${field({ name: 'price', label: 'Selling price', type: 'number', value: p.price, required: true, prefix: '₹', attrs: 'min="1" step="0.01"' })}
              ${field({ name: 'mrp', label: 'MRP', type: 'number', value: p.mrp, required: true, prefix: '₹', attrs: 'min="1" step="0.01"' })}
              ${field({ name: 'stock', label: 'In stock', type: 'number', value: p.stock, required: true, suffix: 'tins', attrs: 'min="0"' })}
              ${field({ name: 'low_stock_at', label: 'Low-stock alert', type: 'number', value: p.low_stock_at, required: true, attrs: 'min="0"' })}
              ${field({ name: 'sort_order', label: 'Display order', type: 'number', value: p.sort_order, required: true, attrs: 'min="0"', hint: 'Lower shows first.' })}
              <div class="field" style="align-self:end;padding-bottom:6px">${field({ name: 'is_active', label: 'Visible in store', type: 'switch', value: p.is_active })}</div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Appearance</h2></div>
            <div class="card-body form-grid">
              <div class="field"><label>Brand colour</label><div class="color-field"><input type="color" value="${esc(p.color)}" data-color-for="color" aria-label="Pick brand colour"><input class="input mono" name="color" value="${esc(p.color)}" maxlength="7"></div></div>
              <div class="field"><label>Background tint</label><div class="color-field"><input type="color" value="${esc(p.tint)}" data-color-for="tint" aria-label="Pick background tint"><input class="input mono" name="tint" value="${esc(p.tint)}" maxlength="7"></div></div>
              <div class="span-2 preview-card" data-preview></div>
              <div class="field span-2">
                <div class="label-row"><span class="label">Decorative props <span class="opt">(pick 2)</span></span><button type="button" class="btn btn-sm btn-ghost" data-manage-props>${icon('settings')}Manage</button></div>
                <div class="prop-pick" data-props data-error-for="props"></div>
                <p class="hint">Shown around the tin on the product page. Add your own images with “Manage”.</p></div>
            </div>
          </section>
        </div>
      </div>

      <div class="save-bar">
        <span class="msg" data-dirty-msg>${editing ? 'No unsaved changes' : ''}</span>
        <a href="#/products" class="btn">Cancel</a>
        <button type="submit" class="btn btn-primary">${icon('check')}${editing ? 'Save changes' : 'Create product'}</button>
      </div>
    </form>`;

  const form = el.querySelector('[data-form]');
  const markDirty = () => { dirty = true; el.querySelector('[data-dirty-msg]').textContent = 'Unsaved changes'; };

  function paintPreview() {
    const v = readForm(form);
    el.querySelector('[data-preview]').style.background = v.tint;
    el.querySelector('[data-preview]').innerHTML = `${v.image ? `<img src="${esc(imgUrl(v.image))}" alt="">` : ''}
      <div><b style="color:#1F1A13">${esc(v.name || 'Product name')}</b><div class="small" style="color:#5A5244">${esc(v.tagline || 'Tagline')}</div>
      <div class="num" style="color:#1F1A13;margin-top:4px">${v.price ? money(v.price) : '₹—'}</div></div>`;
  }

  get('settings').then(s => bindSeo(form, {
    url: () => `${s.site_url.replace(/\/?$/, '/')}product-${form.elements.slug.value || 'new-product'}`,
    fallbackTitle: () => form.elements.name.value,
    fallbackDesc: () => form.elements.description.value,
    uploadPath: 'products/upload',
  })).catch(() => {});

  /* slug follows the name until edited by hand */
  form.elements.name.addEventListener('input', () => { if (!slugTouched) form.elements.slug.value = slugify(form.elements.name.value); });
  form.elements.slug.addEventListener('input', () => { slugTouched = true; });
  form.elements.slug.addEventListener('blur', () => { form.elements.slug.value = slugify(form.elements.slug.value); });

  /* colour pickers stay in sync with their hex inputs */
  el.querySelectorAll('[data-color-for]').forEach(picker => {
    const text = form.elements[picker.dataset.colorFor];
    picker.addEventListener('input', () => { text.value = picker.value.toUpperCase(); paintPreview(); });
    text.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) { picker.value = text.value; paintPreview(); } });
  });

  /* decorative props: library comes from the database; at most two, ticking a third unticks the earliest */
  let propLibrary = meta.props;
  const propOrder = (p.props || []).filter(s => propLibrary.some(x => x.slug === s));
  const propsBox = el.querySelector('[data-props]');
  const paintProps = () => {
    propsBox.innerHTML = propLibrary.map(x => `<label><input type="checkbox" name="props[]" value="${esc(x.slug)}" ${propOrder.includes(x.slug) ? 'checked' : ''}><span><img src="${esc(imgUrl(x.image))}" alt="" loading="lazy">${esc(x.label)}</span></label>`).join('')
      + `<button type="button" class="prop-add" data-manage-props style="border:0;background:none;padding:0"><span>${icon('plus')}Add prop</span></button>`;
  };
  paintProps();
  el.addEventListener('click', e => {
    if (!e.target.closest('[data-manage-props]')) return;
    openPropsManager(list => {
      propLibrary = list;
      for (let i = propOrder.length - 1; i >= 0; i--) if (!list.some(x => x.slug === propOrder[i])) propOrder.splice(i, 1);
      paintProps();
    });
  });
  propsBox.addEventListener('change', e => {
    const v = e.target.value;
    if (e.target.checked) {
      propOrder.push(v);
      while (propOrder.length > 2) {
        const drop = propOrder.shift();
        const box = form.querySelector(`[name="props[]"][value="${CSS.escape(drop)}"]`);
        if (box) box.checked = false;
      }
    } else propOrder.splice(propOrder.indexOf(v), 1);
  });

  /* image uploads */
  el.querySelectorAll('[data-upload]').forEach(box => {
    const file = box.querySelector('input[type=file]');
    const hidden = box.querySelector('input[type=hidden]');
    const upload = async f => {
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) { toast('Images must be 3 MB or smaller.', 'error'); return; }
      box.classList.add('busy');
      const fd = new FormData(); fd.append('file', f); fd.append('slug', form.elements.slug.value || slugify(form.elements.name.value) || 'product');
      try {
        const { path } = await api('products/upload', { method: 'POST', body: fd });
        hidden.value = path;
        box.querySelector('img, .ph')?.remove();
        box.insertAdjacentHTML('afterbegin', `<img src="${esc(imgUrl(path))}" alt="">`);
        markDirty(); paintPreview();
      } catch (err) {
        toast(err.errors?.image || err.message, 'error');
      } finally {
        box.classList.remove('busy'); file.value = '';
      }
    };
    file.addEventListener('change', () => upload(file.files[0]));
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag'); upload(e.dataTransfer.files[0]); });
  });
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-jump-seo]')) { el.querySelector('#seo').scrollIntoView({ behavior: 'smooth', block: 'start' }); el.querySelector('#seo-title').focus({ preventScroll: true }); return; }
    const c = e.target.closest('[data-clear-image]');
    if (c) {
      e.preventDefault();
      const box = c.closest('[data-upload]');
      box.querySelector('input[type=hidden]').value = '';
      box.querySelector('img')?.remove();
      box.insertAdjacentHTML('afterbegin', `<div class="ph">${icon('image')}Drop or click to upload</div>`);
      c.remove(); markDirty();
    }
    if (e.target.closest('[data-delete]')) {
      const ok = await confirmDialog({
        title: `Delete ${p.name}?`,
        message: p.sold ? `${p.sold} tins of this product are in past orders; those orders keep their copy. To stop selling it but keep its data, switch off “Visible in store” instead.` : 'This permanently removes the product and its uploaded images.',
        confirmLabel: 'Delete product',
      });
      if (!ok) return;
      try { await del(`products/${p.id}`); dirty = false; toast(`${p.name} deleted`); navigate('/products'); } catch (err) { toast(err.message, 'error'); }
    }
  });

  form.addEventListener('input', () => { markDirty(); paintPreview(); });
  form.addEventListener('change', markDirty);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    clearErrors(form);
    const body = readForm(form);
    body.nutrition = {};
    form.querySelectorAll('[data-n]').forEach(i => {
      (body.nutrition[i.dataset.n] ||= ['', '', ''])[+i.dataset.i] = i.value;
    });
    body.props = propOrder.filter(x => body.props?.includes(x));
    body.allergens = body.allergens || [];
    setBusy(btn, true, 'Saving…');
    try {
      const saved = editing ? await put(`products/${p.id}`, body) : await post('products', body);
      dirty = false;
      toast(editing ? 'Product saved' : `${saved.name} created`);
      if (!editing) { navigate(`/products/${saved.id}`); return; }
      p = saved;
      el.querySelector('h1').textContent = saved.name;
      el.querySelector('[data-dirty-msg]').textContent = 'All changes saved';
      setBusy(btn, false);
    } catch (err) {
      showErrors(form, err);
      setBusy(btn, false);
    }
  });

  setLeaveGuard(() => !dirty || confirm('Leave without saving? Your changes will be lost.'));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  paintPreview();
  return () => window.removeEventListener('beforeunload', beforeUnload);
}
