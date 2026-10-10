import { put } from '../api.js';
import { icon } from '../icons.js';
import { esc, field, readForm, showErrors, clearErrors, setBusy, toast } from '../ui.js';
import { session } from '../session.js';

export async function render({ el }) {
  const u = session.user;
  el.innerHTML = `
    <div class="page-head"><div><h1>My profile</h1><p>Signed in as ${esc(u.email)} · ${u.role === 'admin' ? 'Admin' : 'Staff'}</p></div></div>
    <form novalidate data-form class="stack" style="max-width:720px">
      <section class="card"><div class="card-head"><h2>Details</h2></div>
        <div class="card-body form-grid">
          ${field({ name: 'name', label: 'Full name', value: u.name, required: true })}
          ${field({ name: 'email', label: 'Email', type: 'email', value: u.email, required: true })}
        </div></section>
      <section class="card"><div class="card-head"><div><h2>Change password</h2><p>Leave empty to keep your current password.</p></div></div>
        <div class="card-body form-grid">
          ${field({ name: 'current_password', label: 'Current password', type: 'password', attrs: 'autocomplete="current-password"', span: true })}
          ${field({ name: 'new_password', label: 'New password', type: 'password', attrs: 'autocomplete="new-password" minlength="8"', hint: 'At least 8 characters.' })}
          ${field({ name: 'confirm_password', label: 'Confirm new password', type: 'password', attrs: 'autocomplete="new-password"' })}
        </div></section>
      <div class="flex" style="justify-content:flex-end"><button type="submit" class="btn btn-primary">${icon('check')}Save profile</button></div>
    </form>`;

  const form = el.querySelector('[data-form]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const v = readForm(form);
    clearErrors(form);
    if (v.new_password && v.new_password !== v.confirm_password) {
      showErrors(form, { errors: { confirm_password: 'The two passwords do not match.' } });
      return;
    }
    setBusy(btn, true);
    try {
      const res = await put('auth/profile', v);
      session.user = res.user;
      document.querySelector('[data-user-name]').textContent = res.user.name;
      ['current_password', 'new_password', 'confirm_password'].forEach(n => { form.elements[n].value = ''; });
      toast(v.new_password ? 'Profile and password updated' : 'Profile updated');
    } catch (err) { showErrors(form, err); }
    setBusy(btn, false);
  });
}
