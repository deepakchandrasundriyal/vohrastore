/**
 * New-order alerts while the admin is open: polls the session every 45 s and, when a new order arrives,
 * shows a toast with a link, plays a short chime (if enabled), shows a desktop notification when the tab is hidden,
 * and prefixes the tab title with the number of orders waiting to be packed.
 */
import { get } from './api.js';
import { esc } from './ui.js';
import { session } from './session.js';

const POLL_MS = 45000;
const KEY = 'vohra_admin_alerts';
let timer = null;
let lastOrderId = null;

export const prefs = {
  get() { try { return { sound: true, desktop: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { sound: true, desktop: false }; } },
  set(p) { try { localStorage.setItem(KEY, JSON.stringify({ ...this.get(), ...p })); } catch (e) { /* storage blocked */ } },
};

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
  } catch (e) { /* audio not allowed until the user has interacted */ }
}

export function titleCount() {
  const n = session.badges?.shipping || 0;
  document.title = document.title.replace(/^\(\d+\)\s*/, '');
  if (n) document.title = `(${n}) ${document.title}`;
}

function announce(newCount) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ok';
  el.innerHTML = `<span>🛒 <b>${newCount === 1 ? 'New order received' : `${esc(newCount)} new orders received`}</b><br><a href="#/shipping" style="text-decoration:underline">Open the packing list</a></span>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 12000);
  el.addEventListener('click', () => el.remove());

  const p = prefs.get();
  if (p.sound) chime();
  if (p.desktop && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const n = new Notification("Vohra's Store: new order", { body: `${newCount} new order(s) to pack`, icon: '../assets/img/brand/favicon.png', tag: 'vohra-new-order' });
    n.onclick = () => { window.focus(); location.hash = '#/shipping'; n.close(); };
  }
}

async function poll() {
  if (!session.user) return;
  try {
    const s = await get('auth/session');
    if (!s.user) return;
    const latest = s.badges?.latest_order_id || 0;
    if (lastOrderId !== null && latest > lastOrderId) announce(latest - lastOrderId);
    lastOrderId = latest;
    session.badges = s.badges;
    session.onBadges();
    titleCount();
  } catch (e) { /* offline or signed out — try again next tick */ }
}

export function startAlerts() {
  lastOrderId = session.badges?.latest_order_id ?? null;
  clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  titleCount();
}

export async function enableDesktopNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  prefs.set({ desktop: result === 'granted' });
  return result;
}
