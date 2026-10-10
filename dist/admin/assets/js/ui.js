/**
 * UI kit: formatting, escaping, form fields, modals, confirm, toasts, menus, pagination.
 * Views build markup with template strings — every dynamic value goes through esc().
 */
import { icon } from './icons.js';

/* ---------------- formatting ---------------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => (v === null || v === undefined ? '' : String(v)).replace(/[&<>"']/g, c => ESC[c]);

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const number = n => inr.format(Number(n) || 0);
export const money = n => '₹' + number(Math.round((Number(n) || 0) * 100) / 100);
export const moneyShort = n => {
  const v = Number(n) || 0;
  if (v >= 1e7) return '₹' + (v / 1e7).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'Cr';
  if (v >= 1e5) return '₹' + (v / 1e5).toFixed(v >= 1e6 ? 0 : 1).replace(/\.0$/, '') + 'L';
  if (v >= 1e3) return '₹' + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return '₹' + Math.round(v);
};

const toDate = s => (s instanceof Date ? s : new Date(String(s).replace(' ', 'T')));
export const fmtDate = s => (s ? toDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = s => (s ? toDate(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export function timeAgo(s) {
  if (!s) return '—';
  const sec = Math.round((Date.now() - toDate(s).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const units = [[60, 'min'], [24, 'h'], [7, 'd']];
  let v = sec / 60;
  for (const [step, label] of units) {
    if (v < step) return `${Math.floor(v)}${label === 'min' ? ' min' : label} ago`;
    v /= step;
  }
  return fmtDate(s);
}
/** "2026-10-09 18:00:00" → value for <input type="datetime-local"> */
export const toLocalInput = s => (s ? String(s).replace(' ', 'T').slice(0, 16) : '');
export const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const imgUrl = path => (path ? '../' + String(path).replace(/^\/+/, '') : '');

/* ---------------- status vocabularies ---------------- */
export const ORDER_STATUS = {
  placed: ['Placed', 'warn'], packed: ['Packed', 'violet'], shipped: ['Shipped', 'info'],
  out_for_delivery: ['Out for delivery', 'info'], delivered: ['Delivered', 'ok'], cancelled: ['Cancelled', 'danger'],
};
export const ORDER_FLOW = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
export const PAYMENT_STATUS = { pending: ['Pending', 'warn'], paid: ['Paid', 'ok'], failed: ['Failed', 'danger'], refunded: ['Refunded', 'neutral'] };
export const PAYMENT_METHOD = { razorpay: 'Online', cod: 'Cash on delivery' };
export const ENQUIRY_STATUS = { new: ['New', 'warn'], in_progress: ['In progress', 'info'], closed: ['Closed', 'ok'] };
export const ENQUIRY_SOURCE = { contact: 'Contact form', services: 'Bulk / B2B' };
export const INDIAN_STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

export function badge(map, key) {
  const [label, tone] = map[key] || [key, 'neutral'];
  return `<span class="badge ${tone}">${esc(label)}</span>`;
}

/* ---------------- small helpers ---------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function setBusy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.html = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${esc(label || 'Saving…')}`;
  } else if (btn.dataset.html !== undefined) {
    btn.disabled = false; btn.innerHTML = btn.dataset.html; delete btn.dataset.html;
  }
}

/* ---------------- toasts ---------------- */
export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, type === 'error' ? 5200 : 3200);
}

/* ---------------- form fields ---------------- */
/**
 * field({ name, label, type, value, required, hint, options, placeholder, span, attrs, prefix, suffix, optional })
 * options: [[value, label], ...] or { value: label }
 */
export function field(o) {
  const id = o.id || `f-${o.name}-${Math.random().toString(36).slice(2, 7)}`;
  const req = o.required ? 'required' : '';
  const attrs = o.attrs || '';
  const value = o.value ?? '';
  const label = o.label ? `<label for="${id}">${esc(o.label)}${o.optional ? ' <span class="opt">(optional)</span>' : ''}</label>` : '';
  let control;
  switch (o.type) {
    case 'textarea':
      control = `<textarea id="${id}" name="${o.name}" class="textarea" rows="${o.rows || 4}" ${req} ${attrs} placeholder="${esc(o.placeholder || '')}">${esc(value)}</textarea>`;
      break;
    case 'select': {
      const opts = Array.isArray(o.options) ? o.options : Object.entries(o.options || {});
      control = `<select id="${id}" name="${o.name}" class="select" ${req} ${attrs}>${o.placeholder ? `<option value="">${esc(o.placeholder)}</option>` : ''}${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      break;
    }
    case 'switch':
      return `<div class="field ${o.span ? 'span-2' : ''}"><label class="switch"><input type="checkbox" name="${o.name}" ${value ? 'checked' : ''} ${attrs}><span class="track"></span><span>${esc(o.label)}</span></label>${o.hint ? `<p class="hint">${esc(o.hint)}</p>` : ''}</div>`;
    default:
      control = `<input id="${id}" name="${o.name}" type="${o.type || 'text'}" class="input" value="${esc(value)}" ${req} ${attrs} placeholder="${esc(o.placeholder || '')}">`;
  }
  if (o.prefix || o.suffix) {
    control = `<div class="input-group">${o.prefix ? `<span class="addon">${esc(o.prefix)}</span>` : ''}${control}${o.suffix ? `<span class="addon">${esc(o.suffix)}</span>` : ''}</div>`;
  }
  return `<div class="field ${o.span ? 'span-2' : ''}">${label}${control}${o.hint ? `<p class="hint">${esc(o.hint)}</p>` : ''}</div>`;
}

/** Collect named controls into an object. Checkboxes → boolean; names ending in [] → arrays. */
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.name.endsWith('[]')) {
      const key = el.name.slice(0, -2);
      out[key] = out[key] || [];
      if ((el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value !== '') out[key].push(el.value);
    } else if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}

export function clearErrors(form) {
  $$('.field-error, .form-alert', form).forEach(n => n.remove());
  $$('.is-invalid', form).forEach(n => { n.classList.remove('is-invalid'); n.removeAttribute('aria-invalid'); });
}

/** Show server validation errors next to their fields; unmatched ones go into a banner. */
export function showErrors(form, err) {
  clearErrors(form);
  const errors = err.errors || {};
  const orphans = [];
  let first = null;
  Object.entries(errors).forEach(([name, msg]) => {
    const el = form.querySelector(`[name="${name}"], [name="${name}[]"], [data-error-for="${name}"]`);
    if (!el) { orphans.push(msg); return; }
    el.classList.add('is-invalid'); el.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p'); p.className = 'field-error'; p.textContent = msg;
    (el.closest('.input-group, .switch, .chips, .uploads, .prop-pick') || el).insertAdjacentElement('afterend', p);
    first = first || el;
  });
  if (orphans.length || !Object.keys(errors).length) {
    const box = document.createElement('div'); box.className = 'form-alert'; box.setAttribute('role', 'alert');
    box.textContent = orphans.length ? orphans.join(' ') : err.message;
    form.prepend(box);
    first = first || box;
  }
  first && first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (first && first.focus) first.focus({ preventScroll: true });
}

/* ---------------- modal ---------------- */
/**
 * openModal({ title, subtitle, body, size, submitLabel, onSubmit(values, form), onOpen(dialog), extraFooter, cancelLabel })
 * onSubmit may return a value or throw ApiError; the dialog closes on success.
 */
export function openModal(o) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal ${o.size || ''}`;
  dlg.innerHTML = `
    <form novalidate>
      <div class="modal-head"><div><h2>${esc(o.title)}</h2>${o.subtitle ? `<p>${esc(o.subtitle)}</p>` : ''}</div>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${icon('close')}</button></div>
      <div class="modal-body">${o.body}</div>
      <div class="modal-foot">${o.extraFooter || ''}
        <button type="button" class="btn" data-close>${esc(o.cancelLabel || 'Cancel')}</button>
        ${o.onSubmit ? `<button type="submit" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}">${esc(o.submitLabel || 'Save')}</button>` : ''}
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector('form');
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) close();
    if (e.target === dlg) close(); // backdrop
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!o.onSubmit) return;
    const btn = form.querySelector('button[type="submit"]');
    clearErrors(form);
    setBusy(btn, true, o.busyLabel);
    try {
      const keepOpen = await o.onSubmit(readForm(form), form);
      if (keepOpen !== false) close();
    } catch (err) {
      showErrors(form, err);
    } finally {
      if (dlg.open) setBusy(btn, false);
    }
  });
  dlg.showModal();
  o.onOpen && o.onOpen(dlg, form);
  const first = form.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body select, .modal-body textarea');
  first && first.focus();
  return { dialog: dlg, form, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise(resolve => {
    let ok = false;
    const { dialog } = openModal({
      title, body: `<p class="text-2">${esc(message)}</p>`, submitLabel: confirmLabel, danger, busyLabel: 'Working…',
      onSubmit: () => { ok = true; },
    });
    dialog.addEventListener('close', () => resolve(ok));
  });
}

/* ---------------- dropdown menu ---------------- */
export function openMenu(anchor, items) {
  document.querySelectorAll('.menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'menu'; menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => it === '-' ? '<hr>'
    : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'btn-danger-text' : ''}">${it.icon ? icon(it.icon) : ''}${esc(it.label)}</button>`).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  menu.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
  const off = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true));
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    menu.remove(); document.removeEventListener('mousedown', off, true);
    items[+b.dataset.i].onClick();
  });
  menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.remove(); anchor.focus(); } });
  menu.querySelector('button')?.focus();
}

/* ---------------- CSV / clipboard ---------------- */
/** Download rows as a UTF-8 CSV (Excel-friendly). cols: [{ label, value: row => any }] */
export function downloadCsv(filename, cols, rows) {
  const cell = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map(c => cell(c.label)).join(','), ...rows.map(r => cols.map(c => cell(c.value(r))).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); } catch (e) { toast('Copy failed. Select the text and copy it manually.', 'error'); }
}

/* ---------------- lists ---------------- */
export function pager(meta) {
  if (!meta || meta.total === 0) return '';
  const { page, pages, per_page: per, total } = meta;
  const from = (page - 1) * per + 1, to = Math.min(total, page * per);
  const nums = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);
  return `<div class="pager"><span>Showing <b>${number(from)}–${number(to)}</b> of <b>${number(total)}</b></span>
    <div class="pages">
      <button class="btn btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('back')}</button>
      ${nums.map(p => `<button class="btn btn-sm ${p === page ? 'btn-primary' : ''}" data-page="${p}" ${p === page ? 'aria-current="page"' : ''}>${p}</button>`).join('')}
      <button class="btn btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page">${icon('chevron')}</button>
    </div></div>`;
}

export function sortHeader(label, key, current, cls = '') {
  const active = current === key || current === '-' + key;
  const desc = current === '-' + key;
  return `<th class="${cls}"><button type="button" class="th-sort ${active ? 'active' : ''}" data-sort="${key}" aria-label="Sort by ${esc(label)}">${esc(label)}${icon(active ? (desc ? 'chevron-down' : 'chevron-up') : 'sort')}</button></th>`;
}
/** Clicking the same column flips direction; a new column starts descending. */
export const nextSort = (current, key) => (current === '-' + key ? key : '-' + key);

export const emptyState = (title, text, action = '') =>
  `<div class="empty">${icon('box')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

export const loadingRows = (cols, rows = 6) =>
  Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, () => '<td><div class="skeleton" style="height:14px"></div></td>').join('')}</tr>`).join('');

/** Inline error inside a table body; the view handles clicks on [data-retry]. */
export const rowError = (err, cols) =>
  `<tr><td colspan="${cols}"><div class="load-error">${icon('alert')}<p>${esc(err.message)}</p><button type="button" class="btn" data-retry>${icon('refresh')}Try again</button></div></td></tr>`;

export function errorState(el, err, retry) {
  el.innerHTML = `<div class="card load-error">${icon('alert')}<h3>Couldn't load this page</h3><p>${esc(err.message)}</p><button class="btn" data-retry>${icon('refresh')}Try again</button></div>`;
  el.querySelector('[data-retry]').addEventListener('click', retry);
}
