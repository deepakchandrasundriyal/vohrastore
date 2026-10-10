/** Shared create/edit customer dialog (used by the list and the detail page). */
import { post, put } from '../api.js';
import { field, openModal, toast, INDIAN_STATES } from '../ui.js';

export function customerModal(customer, onSaved) {
  const c = customer || {};
  const a = c.address || {};
  openModal({
    title: c.id ? 'Edit customer' : 'New customer',
    subtitle: c.id ? '' : 'Customers are also created automatically when they order.',
    size: 'lg',
    body: `<div class="form-grid">
      ${field({ name: 'name', label: 'Full name', value: c.name, required: true })}
      ${field({ name: 'phone', label: 'Mobile number', type: 'tel', value: c.phone, prefix: '+91', optional: true })}
      ${field({ name: 'email', label: 'Email', type: 'email', value: c.email, required: true, span: true })}
      ${field({ name: 'line1', label: 'Address', value: a.line1, optional: true, span: true })}
      ${field({ name: 'line2', label: 'Area / landmark', value: a.line2, optional: true, span: true })}
      ${field({ name: 'city', label: 'City', value: a.city, optional: true })}
      ${field({ name: 'pin', label: 'PIN code', value: a.pin, optional: true, attrs: 'inputmode="numeric" maxlength="6"' })}
      ${field({ name: 'state', label: 'State', type: 'select', options: INDIAN_STATES.map(s => [s, s]), placeholder: 'Select state', value: a.state, span: true })}
      ${field({ name: 'notes', label: 'Internal notes', type: 'textarea', rows: 3, value: c.notes || '', optional: true, span: true })}
    </div>`,
    submitLabel: c.id ? 'Save changes' : 'Create customer',
    onSubmit: async v => {
      const saved = c.id ? await put(`customers/${c.id}`, v) : await post('customers', v);
      toast(c.id ? 'Customer updated' : `${saved.name} added`);
      onSaved(saved);
    },
  });
}
