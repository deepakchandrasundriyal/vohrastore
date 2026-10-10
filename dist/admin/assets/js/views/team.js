import { get, post, put, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, fmtDateTime, initials, field, openModal, confirmDialog, toast, emptyState, loadingRows, rowError, errorState } from '../ui.js';
import { session } from '../session.js';

export async function render({ el }) {
  if (!session.isAdmin) { errorState(el, new Error('Only admins can manage the team.'), () => history.back()); return; }
  let items = [];

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Team</h1><p>People who can sign in to this admin. Staff can run orders and products; admins can also change settings and the team.</p></div>
      <div class="actions"><button type="button" class="btn btn-primary" data-new>${icon('plus')}Add member</button></div>
    </div>
    <section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Member</th><th>Role</th><th class="hide-sm">Last sign-in</th><th>Status</th><th></th></tr></thead>
      <tbody data-rows>${loadingRows(5, 3)}</tbody></table></div></section>`;
  const rows = el.querySelector('[data-rows]');

  async function load() {
    try {
      items = (await get('team')).data;
      rows.innerHTML = items.length ? items.map(a => `<tr>
        <td><div class="cell-media"><span class="avatar">${esc(initials(a.name))}</span><span class="ellipsis"><span class="strong">${esc(a.name)}</span>${a.id === session.user.id ? ' <span class="badge plain" style="height:20px;font-size:11px">You</span>' : ''}<span class="sub">${esc(a.email)}</span></span></div></td>
        <td><span class="badge ${a.role === 'admin' ? 'violet' : 'neutral'} plain">${a.role === 'admin' ? 'Admin' : 'Staff'}</span></td>
        <td class="hide-sm">${esc(a.last_login_at ? fmtDateTime(a.last_login_at) : 'Never')}</td>
        <td>${a.is_active ? '<span class="badge ok">Active</span>' : '<span class="badge neutral">Disabled</span>'}</td>
        <td class="r nowrap"><button type="button" class="btn btn-ghost btn-sm" data-edit="${a.id}">${icon('edit')}Edit</button>
          ${a.id === session.user.id ? '' : `<button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-text" data-del="${a.id}" aria-label="Remove ${esc(a.name)}">${icon('trash')}</button>`}</td>
      </tr>`).join('') : `<tr><td colspan="5">${emptyState('No team members', 'Add someone to help run the store.')}</td></tr>`;
    } catch (err) { rows.innerHTML = rowError(err, 5); }
  }

  function modal(a = null) {
    openModal({
      title: a ? `Edit ${a.name}` : 'Add team member',
      body: `<div class="form-grid">
        ${field({ name: 'name', label: 'Full name', value: a?.name, required: true })}
        ${field({ name: 'email', label: 'Email', type: 'email', value: a?.email, required: true })}
        ${field({ name: 'role', label: 'Role', type: 'select', options: [['staff', 'Staff'], ['admin', 'Admin']], value: a?.role || 'staff' })}
        ${field({ name: 'password', label: a ? 'New password' : 'Password', type: 'password', required: !a, optional: !!a, attrs: 'autocomplete="new-password" minlength="8"', hint: a ? 'Leave empty to keep the current password.' : 'At least 8 characters. Share it securely.' })}
        ${field({ name: 'is_active', label: 'Can sign in', type: 'switch', value: a ? a.is_active : true, span: true })}
      </div>`,
      submitLabel: a ? 'Save' : 'Add member',
      onSubmit: async v => {
        a ? await put(`team/${a.id}`, v) : await post('team', v);
        toast(a ? 'Team member updated' : `${v.name} added`); load();
      },
    });
  }

  el.addEventListener('click', async e => {
    if (e.target.closest('[data-new]')) { modal(); return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { modal(items.find(x => x.id === +ed.dataset.edit)); return; }
    const d = e.target.closest('[data-del]');
    if (d) {
      const a = items.find(x => x.id === +d.dataset.del);
      if (!(await confirmDialog({ title: `Remove ${a.name}?`, message: 'They will no longer be able to sign in. Order history they touched is kept.', confirmLabel: 'Remove' }))) return;
      try { await del(`team/${a.id}`); toast('Team member removed'); load(); } catch (err) { toast(err.message, 'error'); }
    }
  });

  await load();
}
