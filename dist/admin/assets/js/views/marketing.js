import { get, post, put, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, money, number, fmtDate, timeAgo, field, openModal, confirmDialog, toast, debounce, emptyState, loadingRows, rowError, openMenu, copyText, errorState } from '../ui.js';
import { lineChart } from '../charts.js';

const datalist = (id, values) => `<datalist id="${id}">${[...new Set(values)].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;

export async function render({ el, query, setQuery }) {
  const f = { q: query.q || '', source: query.source || '' };
  let meta, siteUrl, items = [];
  try {
    const [m, s] = await Promise.all([get('campaigns/meta'), get('settings')]);
    meta = m; siteUrl = s.site_url.replace(/\/?$/, '/');
  } catch (err) { errorState(el, err, () => render({ el, query, setQuery })); return; }

  const shortUrl = l => `${siteUrl}go.php?c=${l.code}`;
  const fullUrl = l => {
    const q = new URLSearchParams(Object.entries({
      utm_source: l.utm_source, utm_medium: l.utm_medium, utm_campaign: l.utm_campaign, utm_term: l.utm_term, utm_content: l.utm_content, utm_id: l.code,
    }).filter(([, v]) => v));
    return `${siteUrl}${l.destination}?${q}`;
  };
  const pageLabel = path => (meta.pages.find(p => p.path === path) || { label: path }).label;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Marketing links</h1><p>Create a tracked link for any page, share it anywhere, and see which posts and ads bring orders.</p></div>
      <div class="actions"><button type="button" class="btn btn-primary" data-new>${icon('plus')}Create link</button></div>
    </div>
    <section class="card card-pad" style="margin-bottom:18px">
      <div class="grid grid-3 small">
        <div class="flex gap-2"><span class="avatar" style="flex:none">1</span><div><b>Create a link</b><p class="muted">Pick the page and tell us where you'll post it: source (instagram), medium (social), campaign (diwali_2026).</p></div></div>
        <div class="flex gap-2"><span class="avatar" style="flex:none">2</span><div><b>Share the short link</b><p class="muted">Use it in bios, stories, ads, WhatsApp or print it as a QR code. Every click is counted.</p></div></div>
        <div class="flex gap-2"><span class="avatar" style="flex:none">3</span><div><b>See the orders</b><p class="muted">Orders placed after the click keep the link's source and campaign. See Reports → Marketing.</p></div></div>
      </div>
    </section>
    <section class="card">
      <div class="toolbar">
        <label class="search">${icon('search')}<span class="sr-only">Search</span><input class="input" type="search" value="${esc(f.q)}" placeholder="Name, code or campaign" data-q></label>
        <select class="select" data-source aria-label="Source"><option value="">All sources</option>${meta.sources.map(s => `<option ${f.source === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Link</th><th class="hide-md">Source / medium / campaign</th><th>Short link</th><th class="r">Clicks</th><th class="r">Orders</th><th class="r hide-sm">Conv.</th><th class="r hide-sm">Revenue</th><th></th></tr></thead>
        <tbody data-rows>${loadingRows(8, 4)}</tbody>
      </table></div>
    </section>`;
  const rows = el.querySelector('[data-rows]');

  async function load() {
    setQuery(f);
    try {
      items = (await get('campaigns', f)).data;
      rows.innerHTML = items.length ? items.map(l => `
        <tr data-id="${l.id}" style="${l.is_active ? '' : 'opacity:.55'}">
          <td><span class="strong">${esc(l.name)}</span>${l.is_active ? '' : ' <span class="badge plain">Off</span>'}<span class="sub">→ ${esc(pageLabel(l.destination))}</span></td>
          <td class="hide-md"><span class="strong">${esc(l.utm_source)}</span> <span class="muted">/ ${esc(l.utm_medium)}</span><span class="sub">${esc(l.utm_campaign)}${l.utm_content ? ' · ' + esc(l.utm_content) : ''}</span></td>
          <td><button type="button" class="btn btn-sm" data-copy-short="${l.id}" title="${esc(shortUrl(l))}">${icon('copy')}<span class="mono">${esc(l.code)}</span></button></td>
          <td class="r num">${number(l.clicks)}<span class="sub">${l.last_clicked_at ? esc(timeAgo(l.last_clicked_at)) : 'no clicks'}</span></td>
          <td class="r num">${l.orders ? `<a class="link" href="#/orders?utm_id=${esc(l.code)}">${number(l.orders)}</a>` : '0'}</td>
          <td class="r num hide-sm">${l.conversion === null ? '—' : l.conversion + '%'}</td>
          <td class="r num hide-sm strong">${money(l.revenue)}</td>
          <td class="r"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-menu="${l.id}" aria-label="Actions for ${esc(l.name)}">${icon('dots')}</button></td>
        </tr>`).join('')
        : `<tr><td colspan="8">${emptyState('No marketing links yet', 'Create your first tracked link for an Instagram post, an ad or a WhatsApp broadcast.', '<button class="btn btn-primary" data-new>Create link</button>')}</td></tr>`;
    } catch (err) { rows.innerHTML = rowError(err, 8); }
  }

  function share(l) {
    openModal({
      title: 'Share this link', subtitle: l.name,
      body: `
        <div class="field"><span class="label">Short link <span class="opt">(recommended: counts clicks)</span></span>
          <div class="url-box"><code>${esc(shortUrl(l))}</code><button type="button" class="btn btn-sm" data-c="short">${icon('copy')}Copy</button></div></div>
        <div class="field mt-3"><span class="label">Full link with UTM tags <span class="opt">(for ad platforms that need the final URL)</span></span>
          <div class="url-box"><code>${esc(fullUrl(l))}</code><button type="button" class="btn btn-sm" data-c="full">${icon('copy')}Copy</button></div></div>
        <p class="hint mt-3">Clicks are only counted through the short link. Orders are tracked through both links once the storefront is connected.</p>`,
      cancelLabel: 'Done',
      extraFooter: `<a class="btn left" href="${esc(shortUrl(l))}" target="_blank" rel="noopener">${icon('external')}Test link</a>`,
      onOpen: dlg => dlg.addEventListener('click', e => {
        const b = e.target.closest('[data-c]'); if (b) copyText(b.dataset.c === 'short' ? shortUrl(l) : fullUrl(l), 'Link copied');
      }),
    });
  }

  function modal(l = null) {
    const v = l || { utm_medium: 'social', is_active: true, destination: 'index.html' };
    const { form } = openModal({
      title: l ? 'Edit link' : 'Create marketing link', size: 'lg',
      subtitle: l ? 'The short link stays the same, so links you have already shared keep working.' : '',
      body: `<div class="form-grid">
        ${field({ name: 'name', label: 'Link name', value: v.name, required: true, span: true, placeholder: 'e.g. Diwali reel – Instagram', hint: 'Only for your team.' })}
        ${field({ name: 'destination', label: 'Page to open', type: 'select', options: meta.pages.map(p => [p.path, `${p.label} (${p.path})`]), value: v.destination, span: true })}
        ${field({ name: 'utm_source', label: 'Source', value: v.utm_source, required: true, placeholder: 'instagram', attrs: 'list="m-src" autocomplete="off"', hint: 'Where people see the link.' })}
        ${field({ name: 'utm_medium', label: 'Medium', value: v.utm_medium, required: true, placeholder: 'social', attrs: 'list="m-med" autocomplete="off"', hint: 'Type of traffic: social, cpc, email…' })}
        ${field({ name: 'utm_campaign', label: 'Campaign', value: v.utm_campaign, required: true, placeholder: 'diwali_2026', attrs: 'list="m-camp" autocomplete="off"', span: true, hint: 'Use the same name across channels to compare them.' })}
        ${field({ name: 'utm_content', label: 'Content', value: v.utm_content, optional: true, placeholder: 'reel_01, story, banner_a', hint: 'To tell two posts in one campaign apart.' })}
        ${field({ name: 'utm_term', label: 'Keyword', value: v.utm_term, optional: true, placeholder: 'healthy snacks', hint: 'Mostly for Google Ads.' })}
        ${field({ name: 'notes', label: 'Notes', value: v.notes, optional: true, span: true })}
        ${field({ name: 'is_active', label: 'Link is active (off = sends visitors to the home page, not counted)', type: 'switch', value: v.is_active, span: true })}
        <div class="field span-2"><span class="label">Preview</span><div class="url-box"><code data-preview></code></div></div>
      </div>
      ${datalist('m-src', meta.sources)}${datalist('m-med', meta.mediums)}${datalist('m-camp', meta.campaigns)}`,
      submitLabel: l ? 'Save' : 'Create link',
      onSubmit: async body => {
        const saved = l ? await put(`campaigns/${l.id}`, body) : await post('campaigns', body);
        toast(l ? 'Link saved' : 'Link created');
        await load();
        if (!l) share(saved);
      },
    });
    const preview = () => {
      const val = n => (form.elements[n].value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
      form.querySelector('[data-preview]').textContent = fullUrl({
        destination: form.elements.destination.value, code: l ? l.code : 'xxxxxxx',
        utm_source: val('utm_source'), utm_medium: val('utm_medium'), utm_campaign: val('utm_campaign'), utm_term: val('utm_term'), utm_content: val('utm_content'),
      });
    };
    form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
  }

  async function stats(l) {
    const full = await get(`campaigns/${l.id}`).catch(err => { toast(err.message, 'error'); return null; });
    if (!full) return;
    const total = full.daily_clicks.reduce((a, d) => a + d.clicks, 0);
    const { dialog } = openModal({
      title: full.name, subtitle: `${full.utm_source} / ${full.utm_medium} · ${full.utm_campaign} · created ${fmtDate(full.created_at)}${full.created_by_name ? ' by ' + full.created_by_name : ''}`, size: 'lg',
      body: `<div class="summary-strip">
          <div class="card"><small>Clicks (all time)</small><b>${number(full.clicks)}</b></div>
          <div class="card"><small>Orders</small><b>${number(full.orders)}</b></div>
          <div class="card"><small>Conversion</small><b>${full.conversion === null ? '—' : full.conversion + '%'}</b></div>
          <div class="card"><small>Revenue</small><b>${money(full.revenue)}</b></div></div>
        <p class="small muted"><i class="swatch"></i>Clicks per day · last 30 days · ${number(total)} total</p><div data-chart></div>`,
      cancelLabel: 'Close',
      extraFooter: `<a class="btn left" href="#/orders?utm_id=${esc(full.code)}">${icon('orders')}View orders</a>`,
    });
    const dispose = lineChart(dialog.querySelector('[data-chart]'), full.daily_clicks.map(d => ({ date: d.date, value: d.clicks })), {
      label: 'Clicks', format: number, axisFormat: number, height: 200,
      dateLabel: s => new Date(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      tickLabel: s => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    });
    dialog.addEventListener('close', dispose);
    dialog.querySelector('a[href^="#/orders"]').addEventListener('click', () => dialog.close());
  }

  async function remove(l) {
    const ok = await confirmDialog({ title: `Delete “${l.name}”?`, message: 'The short link will stop counting clicks and send visitors to the home page. Orders keep their source and campaign.', confirmLabel: 'Delete link' });
    if (!ok) return;
    try { await del(`campaigns/${l.id}`); toast('Link deleted'); load(); } catch (err) { toast(err.message, 'error'); }
  }

  el.querySelector('[data-q]').addEventListener('input', debounce(e => { f.q = e.target.value.trim(); load(); }, 250));
  el.querySelector('[data-source]').addEventListener('change', e => { f.source = e.target.value; load(); });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) { modal(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const c = e.target.closest('[data-copy-short]');
    if (c) { copyText(shortUrl(items.find(x => x.id === +c.dataset.copyShort)), 'Short link copied'); return; }
    const m = e.target.closest('[data-menu]');
    if (m) {
      const l = items.find(x => x.id === +m.dataset.menu);
      openMenu(m, [
        { label: 'Share / copy links', icon: 'link', onClick: () => share(l) },
        { label: 'Clicks & orders', icon: 'chart', onClick: () => stats(l) },
        { label: 'Edit', icon: 'edit', onClick: () => modal(l) },
        '-',
        { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(l) },
      ]);
    }
  });

  await load();
}
