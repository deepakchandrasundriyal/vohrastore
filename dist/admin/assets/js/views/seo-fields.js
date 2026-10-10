/**
 * Shared SEO inputs: title / meta description / keywords / share image, with live character counters
 * and a Google search-result preview. Used by the SEO page and the product form.
 */
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, field, imgUrl, toast } from '../ui.js';

/** Google typically shows ~60 title characters and ~155 description characters. */
export const LIMITS = { title: [30, 60, 70], desc: [70, 160, 170] };

export function seoScore(title, desc, noindex = false) {
  if (noindex) return ['Hidden from Google', 'neutral'];
  const t = (title || '').trim().length, d = (desc || '').trim().length;
  if (!t || !d) return ['Missing', 'danger'];
  if (t < LIMITS.title[0] || t > LIMITS.title[1] || d < LIMITS.desc[0] || d > LIMITS.desc[1]) return ['Needs work', 'warn'];
  return ['Good', 'ok'];
}

function counterState(len, [min, ideal]) {
  if (!len) return ['bad', 'Missing'];
  if (len < min) return ['warn', 'A bit short'];
  if (len > ideal) return ['warn', 'May be cut off in Google'];
  return ['ok', 'Good length'];
}

export function seoFields(v = {}, { titleHint = '', descHint = '', imageAlt = false } = {}) {
  const share = v.og_image || '';
  return `${imageAlt ? field({ name: 'image_alt', label: 'Product image alt text', value: v.image_alt || '', optional: true, span: true, attrs: 'maxlength="160"', placeholder: "Vohra's Peri Peri roasted makhana, 100 g tin", hint: 'Describes the photo for Google Images and screen readers. Mention the product name and flavour.' }) : ''}
    <div class="field span-2"><div class="label-row"><label for="seo-title">SEO title</label><span class="counter" data-count="seo_title"></span></div>
      <input id="seo-title" name="seo_title" class="input" maxlength="${LIMITS.title[2]}" value="${esc(v.seo_title || '')}" placeholder="${esc(titleHint)}">
      <p class="hint">Shown as the blue headline in Google. Put the main keyword first.</p></div>
    <div class="field span-2"><div class="label-row"><label for="seo-desc">Meta description</label><span class="counter" data-count="seo_description"></span></div>
      <textarea id="seo-desc" name="seo_description" class="textarea" rows="3" maxlength="${LIMITS.desc[2]}" placeholder="${esc(descHint)}">${esc(v.seo_description || '')}</textarea>
      <p class="hint">The grey text under the title. Say what it is and why to click.</p></div>
    ${field({ name: 'seo_keywords', label: 'Focus keywords', value: v.seo_keywords || '', optional: true, span: true, placeholder: 'roasted makhana, healthy snacks', hint: 'Comma-separated. A reminder for your content team; Google does not use the keywords tag for ranking.' })}
    <div class="field span-2"><span class="label">Share image <span class="opt">(optional · 1200×630 for WhatsApp / Facebook previews)</span></span>
      <div class="flex gap-2 items-center wrap">
        <span class="thumb" style="width:120px;height:63px" data-og-thumb>${share ? `<img src="${esc(imgUrl(share))}" alt="" style="object-fit:cover;padding:0">` : icon('image')}</span>
        <label class="btn btn-sm">${icon('image')}Upload<input type="file" accept="image/webp,image/png,image/jpeg" hidden data-og-file></label>
        <button type="button" class="btn btn-sm btn-ghost" data-og-clear ${share ? '' : 'hidden'}>Remove</button>
        <input type="hidden" name="og_image" value="${esc(share)}">
      </div></div>
    <div class="field span-2"><span class="label">Google preview</span><div class="serp" data-serp></div></div>`;
}

/**
 * Wire counters, preview and upload inside `form`.
 * @param {{ url: () => string, fallbackTitle?: () => string, fallbackDesc?: () => string, uploadPath?: string }} o
 */
export function bindSeo(form, o) {
  const paint = () => {
    const t = form.elements.seo_title.value, d = form.elements.seo_description.value;
    [['seo_title', t, LIMITS.title], ['seo_description', d, LIMITS.desc]].forEach(([name, val, lim]) => {
      const el = form.querySelector(`[data-count="${name}"]`);
      const [cls, msg] = counterState(val.trim().length, lim);
      el.className = `counter ${cls}`; el.textContent = `${val.trim().length}/${lim[1]} · ${msg}`;
    });
    const url = o.url();
    form.querySelector('[data-serp]').innerHTML = `
      <div class="s-url"><img src="../assets/img/brand/favicon.png" alt=""><span><b style="color:#202124;font-weight:400">Vohra's Store</b><br>${esc(url.replace(/^https?:\/\//, '').replace(/\//g, ' › ').replace(/ › $/, ''))}</span></div>
      <div class="s-title">${esc(t || (o.fallbackTitle && o.fallbackTitle()) || 'Page title')}</div>
      <div class="s-desc">${esc(d || (o.fallbackDesc && o.fallbackDesc()) || 'Add a meta description so Google shows your own words here.')}</div>`;
  };
  form.addEventListener('input', paint);

  const file = form.querySelector('[data-og-file]');
  const hidden = form.elements.og_image;
  const thumb = form.querySelector('[data-og-thumb]');
  const clear = form.querySelector('[data-og-clear]');
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f); fd.append('slug', 'share');
    thumb.innerHTML = '<span class="spinner sm"></span>';
    try {
      const { path } = await api(o.uploadPath || 'seo/upload', { method: 'POST', body: fd });
      hidden.value = path;
      thumb.innerHTML = `<img src="${esc(imgUrl(path))}" alt="" style="object-fit:cover;padding:0">`;
      clear.hidden = false;
      form.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (err) {
      toast(err.errors?.image || err.errors?.og_image || err.message, 'error');
      thumb.innerHTML = hidden.value ? `<img src="${esc(imgUrl(hidden.value))}" alt="" style="object-fit:cover;padding:0">` : icon('image');
    } finally { file.value = ''; }
  });
  clear.addEventListener('click', () => { hidden.value = ''; thumb.innerHTML = icon('image'); clear.hidden = true; form.dispatchEvent(new Event('input', { bubbles: true })); });
  paint();
  return paint;
}
