import { get, post, put, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, number, fmtDateTime, timeAgo, badge, field, openModal, confirmDialog, toast, debounce, pager, emptyState, loadingRows, rowError, ENQUIRY_STATUS, ENQUIRY_SOURCE } from '../ui.js';
import { session } from '../session.js';

export async function render({ el, query, setQuery }) {
  const f = { q: query.q || '', status: query.status || '', source: query.source || '', page: query.page || '' };
  let items = [];

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Enquiries</h1><p>Messages from the contact page and bulk / B2B requests.</p></div>
      <div class="actions"><button type="button" class="btn" data-new>${icon('plus')}Log an enquiry</button></div>
    </div>
    <section class="card">
      <div class="tabs" role="tablist" data-tabs></div>
      <div class="toolbar">
        <label class="search">${icon('search')}<span class="sr-only">Search</span><input class="input" type="search" value="${esc(f.q)}" placeholder="Name, company, phone or message" data-q></label>
        <select class="select" data-source aria-label="Source"><option value="">All sources</option>${Object.entries(ENQUIRY_SOURCE).map(([k, l]) => `<option value="${k}" ${f.source === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>From</th><th>Topic</th><th class="hide-md">Message</th><th class="hide-sm">Received</th><th>Status</th></tr></thead>
        <tbody data-rows>${loadingRows(5)}</tbody>
      </table></div>
      <div data-pager></div>
    </section>`;
  const rows = el.querySelector('[data-rows]');

  async function load() {
    setQuery(f);
    try {
      const res = await get('enquiries', { ...f, per_page: 20 });
      items = res.data;
      const all = Object.values(res.counts).reduce((a, b) => a + b, 0);
      el.querySelector('[data-tabs]').innerHTML = [['', 'All', all], ...Object.entries(ENQUIRY_STATUS).map(([k, [l]]) => [k, l, res.counts[k] || 0])]
        .map(([k, l, n]) => `<button type="button" class="tab" role="tab" data-status="${k}" aria-selected="${f.status === k}">${l}<span class="n">${number(n)}</span></button>`).join('');
      rows.innerHTML = items.length ? items.map(e => `
        <tr class="clickable" data-id="${e.id}" style="${e.status === 'new' ? 'font-weight:500' : ''}">
          <td><span class="strong">${esc(e.name)}</span><span class="sub">${esc(e.company || e.email || (e.phone ? '+91 ' + e.phone : ''))}</span></td>
          <td>${esc(e.topic || '—')}<span class="sub">${esc(ENQUIRY_SOURCE[e.source])}</span></td>
          <td class="hide-md text-2" style="max-width:340px"><span class="ellipsis" style="display:block">${esc(e.message)}</span></td>
          <td class="hide-sm" title="${esc(fmtDateTime(e.created_at))}">${esc(timeAgo(e.created_at))}</td>
          <td>${badge(ENQUIRY_STATUS, e.status)}</td>
        </tr>`).join('')
        : `<tr><td colspan="5">${emptyState('Inbox zero', 'No enquiries match this view.')}</td></tr>`;
      el.querySelector('[data-pager]').innerHTML = pager(res.meta);
    } catch (err) { rows.innerHTML = rowError(err, 5); }
  }

  function formFields(v) {
    return `<div class="form-grid">
      ${field({ name: 'name', label: 'Name', value: v.name, required: true })}
      ${field({ name: 'company', label: 'Business', value: v.company, optional: true })}
      ${field({ name: 'phone', label: 'Mobile', type: 'tel', value: v.phone, prefix: '+91' })}
      ${field({ name: 'email', label: 'Email', type: 'email', value: v.email })}
      ${field({ name: 'source', label: 'Source', type: 'select', options: ENQUIRY_SOURCE, value: v.source || 'contact' })}
      ${field({ name: 'topic', label: 'Topic', value: v.topic, optional: true, placeholder: 'Bulk order, gifting…' })}
      ${field({ name: 'city', label: 'City', value: v.city, optional: true })}
      ${field({ name: 'quantity', label: 'Quantity', value: v.quantity, optional: true, placeholder: '200 tins, mixed' })}
      ${field({ name: 'order_ref', label: 'Order ID', value: v.order_ref, optional: true })}
      ${field({ name: 'status', label: 'Status', type: 'select', options: Object.entries(ENQUIRY_STATUS).map(([k, [l]]) => [k, l]), value: v.status || 'new' })}
      ${field({ name: 'message', label: 'Message', type: 'textarea', value: v.message, required: true, span: true, rows: 4 })}
    </div>`;
  }

  function open(e) {
    const contact = [
      e.phone ? `<a class="btn btn-sm" href="tel:+91${esc(e.phone)}">${icon('phone')}+91 ${esc(e.phone)}</a>` : '',
      e.phone ? `<a class="btn btn-sm" href="https://wa.me/91${esc(e.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : '',
      e.email ? `<a class="btn btn-sm" href="mailto:${esc(e.email)}?subject=${encodeURIComponent('Re: your enquiry to Vohra\'s')}">${icon('mail')}Email</a>` : '',
    ].join('');
    const details = [['Business', e.company], ['City', e.city], ['Quantity', e.quantity], ['Order ID', e.order_ref], ['Source', ENQUIRY_SOURCE[e.source]], ['Received', fmtDateTime(e.created_at)]].filter(([, v]) => v);
    const m = openModal({
      title: e.name, subtitle: e.topic || ENQUIRY_SOURCE[e.source], size: 'lg',
      body: `<div class="flex gap-1 wrap">${contact}</div>
        <div class="card card-pad mt-2" style="background:var(--surface-2);box-shadow:none"><p style="white-space:pre-line">${esc(e.message)}</p></div>
        <dl class="dl mt-3">${details.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="mt-3" style="max-width:260px">${field({ name: 'status', label: 'Status', type: 'select', options: Object.entries(ENQUIRY_STATUS).map(([k, [l]]) => [k, l]), value: e.status === 'new' ? 'in_progress' : e.status })}</div>`,
      submitLabel: 'Update status',
      extraFooter: `<button type="button" class="btn btn-ghost btn-danger-text left" data-del>${icon('trash')}Delete</button><button type="button" class="btn" data-edit-full>${icon('edit')}Edit</button>`,
      onSubmit: async v => {
        await put(`enquiries/${e.id}`, { ...e, status: v.status });
        toast('Enquiry updated'); session.refreshBadges(); load();
      },
    });
    m.dialog.querySelector('[data-del]').addEventListener('click', async () => {
      m.close();
      if (!(await confirmDialog({ title: 'Delete this enquiry?', message: 'It will be permanently removed.' }))) return;
      try { await del(`enquiries/${e.id}`); toast('Enquiry deleted'); session.refreshBadges(); load(); } catch (err) { toast(err.message, 'error'); }
    });
    m.dialog.querySelector('[data-edit-full]').addEventListener('click', () => { m.close(); edit(e); });
  }

  function edit(e = null) {
    openModal({
      title: e ? 'Edit enquiry' : 'Log an enquiry', subtitle: e ? '' : 'For requests that came in by phone, email or WhatsApp.', size: 'lg',
      body: formFields(e || {}),
      submitLabel: e ? 'Save' : 'Add enquiry',
      onSubmit: async v => {
        e ? await put(`enquiries/${e.id}`, v) : await post('enquiries', v);
        toast(e ? 'Enquiry saved' : 'Enquiry logged'); session.refreshBadges(); load();
      },
    });
  }

  el.querySelector('[data-q]').addEventListener('input', debounce(e => { f.q = e.target.value.trim(); f.page = ''; load(); }, 300));
  el.querySelector('[data-source]').addEventListener('change', e => { f.source = e.target.value; f.page = ''; load(); });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) { edit(); return; }
    const t = e.target.closest('[data-status]');
    if (t) { f.status = t.dataset.status; f.page = ''; load(); return; }
    const p = e.target.closest('[data-page]');
    if (p && !p.disabled) { f.page = p.dataset.page; load(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const row = e.target.closest('tr[data-id]');
    if (row) open(items.find(x => x.id === +row.dataset.id));
  });

  await load();
}
