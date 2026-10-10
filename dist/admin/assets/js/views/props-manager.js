/**
 * Decorative props library: upload new prop images, rename / reorder / replace, delete.
 * onChange(list) receives the fresh library after every change so the product form can repaint.
 */
import { api, get, del } from '../api.js';
import { icon } from '../icons.js';
import { esc, number, openModal, confirmDialog, toast, imgUrl, setBusy } from '../ui.js';

export function openPropsManager(onChange) {
  let list = [];
  const { dialog } = openModal({
    title: 'Decorative props', subtitle: 'Images placed around the tin on product pages. Transparent PNG or WebP works best.', size: 'lg',
    body: `
      <div class="card card-pad" style="box-shadow:none;background:var(--surface-2)" data-add-form>
        <div class="flex gap-2 wrap items-center">
          <input class="input" data-new-label placeholder="Name, e.g. Curry leaves" maxlength="80" style="flex:1 1 200px" required>
          <label class="btn">${icon('image')}<span data-file-label>Choose image</span><input type="file" data-new-file accept="image/webp,image/png,image/jpeg" hidden></label>
          <button type="button" class="btn btn-primary" data-add>${icon('plus')}Add prop</button>
        </div>
        <p class="field-error" data-add-error hidden></p>
      </div>
      <div class="props-grid mt-3" data-grid><div class="boot" style="min-height:120px;grid-column:1/-1"><span class="spinner"></span></div></div>`,
    cancelLabel: 'Done',
  });
  const grid = dialog.querySelector('[data-grid]');
  const addForm = dialog.querySelector('[data-add-form]');
  const addError = dialog.querySelector('[data-add-error]');

  async function refresh() {
    list = (await get('props')).data;
    grid.innerHTML = list.map(p => `
      <div class="prop-card" data-id="${p.id}">
        <img src="${esc(imgUrl(p.image))}" alt="">
        <input class="input" style="height:32px;text-align:center" value="${esc(p.label)}" data-label aria-label="Name">
        <span class="sub">${p.used_by ? `Used by ${number(p.used_by)} product${p.used_by === 1 ? '' : 's'}` : 'Not used'}</span>
        <div class="acts">
          <label class="btn btn-ghost btn-icon btn-sm" title="Replace image">${icon('image')}<input type="file" accept="image/webp,image/png,image/jpeg" hidden data-replace></label>
          <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-text" data-del aria-label="Delete ${esc(p.label)}">${icon('trash')}</button>
        </div>
      </div>`).join('') || '<p class="muted">No props yet.</p>';
    onChange(list);
  }

  async function save(p, { label, file }) {
    const fd = new FormData();
    fd.append('label', label ?? p.label);
    fd.append('sort_order', p.sort_order);
    if (file) fd.append('file', file);
    try { await api(`props/${p.id}`, { method: 'POST', body: fd }); toast('Prop updated'); await refresh(); }
    catch (err) { toast(Object.values(err.errors || {})[0] || err.message, 'error'); }
  }

  const newLabel = addForm.querySelector('[data-new-label]'), newFile = addForm.querySelector('[data-new-file]');
  newFile.addEventListener('change', () => { dialog.querySelector('[data-file-label]').textContent = newFile.files[0]?.name || 'Choose image'; });
  newLabel.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addForm.querySelector('[data-add]').click(); } });
  addForm.querySelector('[data-add]').addEventListener('click', async () => {
    addError.hidden = true;
    const label = newLabel.value.trim(), file = newFile.files[0];
    if (!label || !file) { addError.textContent = 'Give the prop a name and choose an image.'; addError.hidden = false; return; }
    const btn = addForm.querySelector('[data-add]');
    const fd = new FormData(); fd.append('label', label); fd.append('file', file);
    setBusy(btn, true, 'Uploading…');
    try {
      await api('props', { method: 'POST', body: fd });
      newLabel.value = ''; newFile.value = ''; dialog.querySelector('[data-file-label]').textContent = 'Choose image';
      toast(`${label} added`); await refresh();
    } catch (err) {
      addError.textContent = Object.values(err.errors || {})[0] || err.message; addError.hidden = false;
    } finally { setBusy(btn, false); }
  });

  grid.addEventListener('change', e => {
    const card = e.target.closest('[data-id]'); if (!card) return;
    const p = list.find(x => x.id === +card.dataset.id);
    if (e.target.matches('[data-label]') && e.target.value.trim() && e.target.value.trim() !== p.label) save(p, { label: e.target.value.trim() });
    if (e.target.matches('[data-replace]') && e.target.files[0]) save(p, { file: e.target.files[0] });
  });
  grid.addEventListener('click', async e => {
    if (!e.target.closest('[data-del]')) return;
    const p = list.find(x => x.id === +e.target.closest('[data-id]').dataset.id);
    const ok = await confirmDialog({
      title: `Delete “${p.label}”?`,
      message: p.used_by ? `It is used by ${p.used_by} product(s); it will be removed from them.` : 'This prop is not used by any product.',
      confirmLabel: 'Delete prop',
    });
    if (!ok) return;
    try { await del(`props/${p.id}`); toast('Prop deleted'); await refresh(); } catch (err) { toast(err.message, 'error'); }
  });

  refresh().catch(err => { grid.innerHTML = `<p class="danger-text">${esc(err.message)}</p>`; });
}
