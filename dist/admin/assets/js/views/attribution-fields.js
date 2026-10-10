/** UTM source / medium / campaign inputs with suggestions, shared by the order form and order edit dialog. */
import { esc, field } from '../ui.js';

export const SOURCE_SUGGESTIONS = ['phone', 'whatsapp', 'walk-in', 'instagram', 'facebook', 'google', 'youtube', 'email', 'sms', 'influencer', 'referral'];
export const MEDIUM_SUGGESTIONS = ['offline', 'social', 'paid_social', 'cpc', 'organic', 'email', 'referral', 'affiliate', 'qr'];

const datalist = (id, values) => `<datalist id="${id}">${values.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;

export function attributionFields(v = {}) {
  return `
    ${field({ name: 'utm_source', label: 'Source', value: v.utm_source || '', optional: true, placeholder: 'whatsapp, instagram, phone…', attrs: 'list="dl-src" autocomplete="off"' })}
    ${field({ name: 'utm_medium', label: 'Medium', value: v.utm_medium || '', optional: true, placeholder: 'social, offline, cpc…', attrs: 'list="dl-med" autocomplete="off"' })}
    ${field({ name: 'utm_campaign', label: 'Campaign', value: v.utm_campaign || '', optional: true, span: true, placeholder: 'e.g. diwali_2026' })}
    ${datalist('dl-src', SOURCE_SUGGESTIONS)}${datalist('dl-med', MEDIUM_SUGGESTIONS)}`;
}
