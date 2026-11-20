'use strict';
/* =====================================================================
   واجهة برنامج الكاشير والمحاسبة
   ===================================================================== */
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const S = { user: null, branches: [], settings: {}, methods: {}, branch: LS.get('pos_branch', 0), cache: {}, pos: {}, view: '' };

/* ---------------------------- Utils ---------------------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const money = (n) => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (n) => (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const M = (n, cls = '') => `<span class="num ${cls}">${money(n)}</span>`;
const Q = (n) => `<span class="num">${qf(n)}</span>`;
const dt = (s) => (s ? `<span class="num">${esc(s.slice(0, 16))}</span>` : '');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isAdmin = () => S.user && S.user.role === 'admin';
const can = (p) => isAdmin() || !!(S.user && S.user.perms[p]);
const branchOf = (id) => S.branches.find((b) => b.id === +id) || {};
const curBranch = () => (isAdmin() ? S.branch : S.user.branch_id);
const bq = (extra = {}) => ({ branch: isAdmin() ? S.branch || '' : '', ...extra });
const METHODS = () => Object.entries(S.methods);
const mName = (m) => (S.allMethods || {})[m] || S.methods[m] || m;
const M_COLOR = { cash: '#047857', card: '#1d4ed8', instapay: '#6d28d9', vodafone: '#dc2626', etisalat: '#65a30d', orange: '#ea580c', we: '#7c3aed', bank: '#0e7490', wallet: '#475569' };
const mBadge = (m, amount, ref) => `<span class="mbadge" style="--mc:${M_COLOR[m] || '#475569'}">${esc(mName(m))}${amount != null ? ` <b class="num">${money(amount)}</b>` : ''}${ref ? ` <span class="small num" title="رقم العملية">#${esc(ref)}</span>` : ''}</span>`;
const paysHTML = (pays, emptyText = '') => (pays && pays.length ? pays.map((p) => mBadge(p.method, pays.length > 1 ? p.amount : null, p.ref)).join(' ') : emptyText);
// اسم الشركة بالعربي (الأصناف القديمة متسجلة بالإنجليزي)
const BRAND_AR = { jotun: 'جوتن', pachin: 'باكين', pakin: 'باكين', sipes: 'سايبس', scib: 'سكيب', glc: 'جي إل سي', 'national paints': 'ناشونال' };
const brandLabel = (b) => { const s = String(b || '').trim(); return s ? BRAND_AR[s.toLowerCase()] || s : 'أخرى'; };
// لون ثابت لكل تصنيف (بيظهر كشريط فوق كارت الصنف في الكاشير)
const CAT_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
const catColor = (c) => { if (!c) return '#94a3b8'; let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CAT_COLORS[h % CAT_COLORS.length]; };
const sumMap = (o) => Object.values(o || {}).reduce((s, v) => s + (+v || 0), 0);
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function qs(o) { if (!o) return ''; const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v != null && v !== false) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; }
// مكان البرنامج على الموقع (/ على الجهاز، أو /اسم-المستودع/ على GitHub Pages)
const BASE = window.POS_BASE || '/';
// وضع الأونلاين: لو config.js فيه بيانات Supabase، كل الطلبات بتروح لـ Supabase بدل السيرفر المحلي
const SB = window.POS_CONFIG && window.POS_CONFIG.supabaseUrl && window.POS_CONFIG.supabaseKey ? window.POS_CONFIG : null;
async function sbApi(method, url, body) {
  const u = new URL(url, location.origin);
  const payload = { p_token: LS.get('pos_token', null), p_method: method, p_path: u.pathname, p_query: Object.fromEntries(u.searchParams), p_body: body || {} };
  let r; try {
    r = await fetch(SB.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/pos_api', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB.supabaseKey, Authorization: 'Bearer ' + SB.supabaseKey }, body: JSON.stringify(payload) });
  } catch { throw new Error('تعذر الاتصال — اتأكد إن الإنترنت شغال'); }
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok || !d || typeof d.ok !== 'boolean') throw new Error((d && (d.message || d.error)) || 'تعذر الاتصال بقاعدة البيانات (Supabase)');
  if (!d.ok) {
    if (d.status === 401 && u.pathname !== '/api/login') { LS.set('pos_token', null); S.user = null; renderLogin(); }
    throw new Error(d.error || 'خطأ');
  }
  if (u.pathname === '/api/login') LS.set('pos_token', d.data.token);
  if (u.pathname === '/api/logout') LS.set('pos_token', null);
  const data = d.data;
  if (u.pathname === '/api/me' && data) { // طرق الدفع بتيجي مرتبة كقائمة
    if (Array.isArray(data.methods)) data.methods = Object.fromEntries(data.methods);
    if (Array.isArray(data.all_methods)) data.all_methods = Object.fromEntries(data.all_methods);
  }
  return data;
}
async function api(method, url, body) {
  if (SB) return sbApi(method, url, body);
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r; try { r = await fetch(url, opt); } catch { throw new Error('تعذر الاتصال بالسيرفر — تأكد إن البرنامج شغال'); }
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 && !url.includes('/api/login')) { S.user = null; renderLogin(); throw new Error((data && data.error) || 'من فضلك سجل الدخول'); }
  if (!r.ok) throw new Error((data && data.error) || 'خطأ في الاتصال');
  return data;
}
const GET = (u, q) => api('GET', u + qs(q));
const POST = (u, b = {}) => api('POST', u, b);
const PUT = (u, b = {}) => api('PUT', u, b);
const DEL = (u) => api('DELETE', u, {});

function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), type === 'bad' ? 5000 : 3000);
}

const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  factory: '<path d="M3 21V10l6 4V10l6 4V5h6v16z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  safe: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9m-5 5 5-5 5 5M4 3h16"/>',
  logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h12"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  roller: '<rect x="3" y="3" width="15" height="6" rx="2"/><path d="M18 6h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-8v3"/><rect x="10" y="14" width="4" height="7" rx="1"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5a6 6 0 1 1-6 6"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
};
const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

/* ---------------------------- Modal ---------------------------- */
function modal({ title, body, wide = '', buttons = [], onOpen }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="modal ${wide}"><div class="mh">${esc(title)}<span class="sp"></span><button class="btn ghost sm" data-x title="إغلاق (Esc)">✕</button></div><div class="mb">${body}</div>${buttons.length ? '<div class="mf"></div>' : ''}</div>`;
  const mb = $('.mb', ov);
  const isTop = () => $$('.ov').pop() === ov;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && isTop()) { e.preventDefault(); close(); } };
  let primary = null;
  for (const b of buttons) {
    const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.innerHTML = b.t;
    if ((b.cls || '').includes('pri') && !primary) primary = el;
    el.onclick = async () => {
      if (!b.fn) return close();
      el.disabled = true;
      try { const r = await b.fn(mb, close); if (r !== false) close(); } catch (e) { toast(e.message, 'bad'); } finally { el.disabled = false; }
    };
    $('.mf', ov).append(el);
  }
  ov.addEventListener('keydown', (e) => { if (e.key === 'Enter' && primary && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !e.defaultPrevented) { e.preventDefault(); primary.click(); } });
  $('[data-x]', ov).onclick = close;
  document.body.append(ov); document.addEventListener('keydown', onKey);
  if (onOpen) onOpen(mb, close);
  const f = $('[autofocus]', ov) || $('input:not([type=checkbox]):not([readonly]),select,textarea', mb); if (f) setTimeout(() => f.focus(), 30);
  return { el: ov, mb, close };
}
function confirmBox(msg, okText = 'تأكيد', cls = 'pri') {
  return new Promise((res) => { let done = false; const m = modal({ title: 'تأكيد', body: `<p style="margin:0">${msg}</p>`, buttons: [{ t: okText, cls, fn: () => { done = true; res(true); } }, { t: 'إلغاء' }] }); const o = m.close; new MutationObserver((_, ob) => { if (!document.body.contains(m.el)) { ob.disconnect(); if (!done) res(false); } }).observe(document.body, { childList: true }); void o; });
}
function promptBox(title, label, def = '') {
  return new Promise((res) => { let done = false; const m = modal({ title, body: `<label class="f">${label}</label><input class="in" id="pb" value="${esc(def)}">`, buttons: [{ t: 'تأكيد', cls: 'pri', fn: (mb) => { done = true; res($('#pb', mb).value.trim()); } }, { t: 'إلغاء' }] }); new MutationObserver((_, ob) => { if (!document.body.contains(m.el)) { ob.disconnect(); if (!done) res(null); } }).observe(document.body, { childList: true }); });
}
function fv(root) {
  const o = {};
  for (const el of $$('[name]', root)) {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number') o[el.name] = el.value === '' ? '' : +el.value;
    else o[el.name] = el.value.trim();
  }
  return o;
}
const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;
const methodOpts = (sel = 'cash') => METHODS().map(([k, v]) => opt(k, v, sel)).join('');

/* ---------------------------- Table ---------------------------- */
function mountTable(el, cols, rows, o = {}) {
  if (!rows.length) { el.innerHTML = `<div class="tbl-wrap"><div class="empty">${o.empty || 'لا توجد بيانات'}</div></div>`; return; }
  const cell = (c, r) => (c.f ? c.f(r) : esc(r[c.k] ?? ''));
  el.innerHTML = `<div class="tbl-wrap" ${o.maxh ? `style="max-height:${o.maxh}"` : ''}><table class="t"><thead><tr>${cols.map((c) => `<th class="${c.n ? 'n' : ''}">${c.t}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${o.click ? 'click ' : ''}${o.rowCls ? o.rowCls(r) : ''}">${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody>
    ${o.foot ? `<tfoot><tr>${o.foot.map((x) => `<td class="n">${x ?? ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  el.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const act = e.target.closest('[data-act]');
    if (act && o.act) { e.stopPropagation(); o.act(act.dataset.act, rows[+tr.dataset.i], act); return; }
    if (o.click) o.click(rows[+tr.dataset.i]);
  });
}
function tableHTML(cols, rows, foot) {
  return `<table class="t"><thead><tr>${cols.map((c) => `<th class="${c.n ? 'n' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${c.f ? c.f(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot><tr>${foot.map((x) => `<td class="n">${x ?? ''}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}
function exportCSV(name, cols, rows) {
  const strip = (h) => String(h ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const c2 = cols.filter((c) => !c.noCsv);
  const lines = [c2.map((c) => strip(c.t)), ...rows.map((r) => c2.map((c) => (c.v ? c.v(r) : c.k ? r[c.k] : strip(c.f ? c.f(r) : ''))))];
  const csv = '﻿' + lines.map((l) => l.map((v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `${name}-${ymd(new Date())}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------------------- Date range ---------------------------- */
function presetRange(p) {
  const d = new Date();
  switch (p) {
    case 'today': return [ymd(d), ymd(d)];
    case 'yesterday': d.setDate(d.getDate() - 1); return [ymd(d), ymd(d)];
    case 'week': { const e = ymd(d); d.setDate(d.getDate() - 6); return [ymd(d), e]; }
    case 'month': return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(d)];
    case 'lastmonth': return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
    case 'year': return [`${d.getFullYear()}-01-01`, ymd(d)];
    default: return ['', ''];
  }
}
function rangeHTML(st) {
  const P = [['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر 7 أيام'], ['month', 'الشهر الحالي'], ['lastmonth', 'الشهر الماضي'], ['year', 'السنة الحالية'], ['all', 'كل الفترات'], ['custom', 'فترة مخصصة']];
  return `<select class="in" data-r="p" style="width:auto">${P.map(([k, t]) => opt(k, t, st.p)).join('')}</select>
    <span class="row" data-r="c" style="gap:4px">من <input type="date" class="in" data-r="f" value="${st.from}" style="width:auto"> إلى <input type="date" class="in" data-r="t" value="${st.to}" style="width:auto"></span>`;
}
function bindRange(root, st, cb) {
  const p = $('[data-r=p]', root), f = $('[data-r=f]', root), t = $('[data-r=t]', root);
  p.onchange = () => { st.p = p.value; if (st.p !== 'custom') { [st.from, st.to] = presetRange(st.p); f.value = st.from; t.value = st.to; } cb(); };
  f.onchange = t.onchange = () => { st.p = 'custom'; p.value = 'custom'; st.from = f.value; st.to = t.value; cb(); };
}
function newRange(p = 'month') { const [from, to] = presetRange(p); return { p, from, to }; }
const rangeLabel = (st) => (st.from || st.to ? `من ${st.from || 'البداية'} إلى ${st.to || 'اليوم'}` : 'كل الفترات');

/* ---------------------------- Picker ---------------------------- */
function picker(input, o) {
  const wrap = input.parentElement; wrap.classList.add('picker');
  let dd = null, sel = 0, list = [];
  const close = () => { if (dd) dd.remove(); dd = null; };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    list = o.items().filter((x) => !q || o.match(x, q)).slice(0, o.limit || 40);
    if (!dd) { dd = document.createElement('div'); dd.className = 'dd'; wrap.append(dd); }
    dd.innerHTML = list.length ? list.map((x, i) => `<div data-i="${i}" class="${i === sel ? 'on' : ''}"><span>${o.label(x)}</span><span class="faint small">${o.sub ? o.sub(x) : ''}</span></div>`).join('') : '<div class="faint">لا توجد نتائج</div>';
    const on = $('.on', dd); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const pick = (x) => { close(); o.onPick(x); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('focus', () => { sel = 0; render(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (o.exact && q) { const x = o.items().find((it) => o.exact(it, q)); if (x) { e.preventDefault(); e.stopPropagation(); return pick(x); } }
      if (dd && list[sel]) { e.preventDefault(); e.stopPropagation(); pick(list[sel]); }
      return;
    }
    if (!dd) return;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, list.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });
  wrap.addEventListener('mousedown', (e) => { const d = e.target.closest('.dd [data-i]'); if (d) { e.preventDefault(); pick(list[+d.dataset.i]); } });
}
const prodMatch = (p, q) => (p.name || '').toLowerCase().includes(q) || String(p.code || '').toLowerCase() === q || String(p.code || '').toLowerCase().startsWith(q) || (p.barcode && String(p.barcode).includes(q)) || (p.category || '').toLowerCase().includes(q);
const prodExact = (p, q) => (p.barcode && p.barcode === q) || String(p.code) === q;

/* ---------------------------- Data cache ---------------------------- */
async function products(force) {
  const b = curBranch(); const k = 'p' + b;
  if (force || !S.cache[k]) S.cache[k] = await GET('/api/products', bq());
  return S.cache[k];
}
async function customers(force) {
  const b = curBranch(); const k = 'c' + b;
  if (force || !S.cache[k]) S.cache[k] = await GET('/api/customers', bq());
  return S.cache[k];
}
async function suppliers(force) {
  const b = curBranch(); const k = 's' + b;
  if (force || !S.cache[k]) S.cache[k] = await GET('/api/suppliers', bq());
  return S.cache[k];
}
const dropCache = () => { S.cache = {}; };

/* ---------------------------- Printing ---------------------------- */
const PRINT_BASE = `*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;margin:0;color:#000}table{width:100%;border-collapse:collapse}.n{text-align:left;direction:ltr}.c{text-align:center}h1,h2,h3{margin:0}`;
const PRINT_THERMAL = `@page{size:80mm auto;margin:0}body{width:80mm;padding:4mm 4mm 8mm;font-size:12px}h1{font-size:17px;text-align:center}.sub{text-align:center;font-size:11px;margin:2px 0}.hr{border-top:1px dashed #000;margin:6px 0}
  .meta td{padding:1px 0}.items th{border-bottom:1px solid #000;font-size:11px;padding:3px 0;text-align:right}.items td{padding:3px 0;vertical-align:top;border-bottom:1px dotted #999}.items .nm{font-weight:bold}
  .tot td{padding:2px 0}.tot .g td{font-size:16px;font-weight:bold;border-top:1px solid #000;padding-top:4px}.ft{text-align:center;margin-top:8px;font-size:11px}`;
const PRINT_A4 = `@page{size:A4;margin:12mm}body{font-size:12px}h1{font-size:22px}h2{font-size:16px;margin:6px 0}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px}
  table.t th,table.t td{border:1px solid #999;padding:5px 7px;text-align:right}table.t th{background:#eee}table.t td.n,table.t th.n{text-align:left}table.t tfoot td{font-weight:bold;background:#f3f3f3}
  .meta td{padding:2px 6px}.tot{width:300px;margin-right:auto;margin-top:10px}.tot td{padding:3px 6px;border-bottom:1px solid #ddd}.tot .g td{font-size:15px;font-weight:bold;border-top:2px solid #000}.ft{margin-top:20px;text-align:center;color:#444}.sub{color:#444}.num{direction:ltr;display:inline-block}.badge{padding:0 4px}`;
function printHTML(html, thermal, customCss) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:0;bottom:0';
  document.body.append(f);
  const d = f.contentDocument; d.open();
  d.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>طباعة</title><style>${PRINT_BASE}${customCss != null ? customCss : thermal ? PRINT_THERMAL : PRINT_A4}</style></head><body>${html}</body></html>`); d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300);
}
function printSale(s, fmt) {
  const b = branchOf(s.branch_id); const thermal = (fmt || b.print_format || 'thermal') === 'thermal';
  const isRet = s.kind === 'return';
  const cashPay = (s.pays.find((p) => p.method === 'cash') || {}).amount || 0;
  const change = r2((s.cash_given || 0) - cashPay);
  const remain = r2(s.total - s.paid);
  const title = isRet ? 'إيصال مرتجع مبيعات' : 'فاتورة بيع';
  const meta = [['رقم', s.doc_no], isRet ? ['على فاتورة', s.ref_doc] : null, ['التاريخ', s.date.slice(0, 16)], ['الكاشير', s.user_name], (s.cust_name || s.customer_name) ? ['العميل', s.cust_name || s.customer_name] : null, s.cust_phone ? ['موبايل', s.cust_phone] : null].filter(Boolean);
  const tot = [
    ['الإجمالي', money(s.subtotal)],
    s.discount ? ['الخصم', money(s.discount)] : null,
    ['الصافي', money(s.total), 'g'],
    ...s.pays.map((p) => [(isRet ? 'مُسترد ' : 'مدفوع ') + mName(p.method) + (p.ref ? ` (${esc(p.ref)})` : ''), money(p.amount)]),
    change > 0 ? ['الباقي للعميل', money(change)] : null,
    remain > 0.009 ? [isRet ? 'خُصم من حساب العميل' : 'متبقي (آجل)', money(remain)] : null,
    s.customer_balance != null && s.customer_id ? ['رصيد العميل الحالي', money(s.customer_balance)] : null,
  ].filter(Boolean);
  const company = S.settings.company_name || '';
  if (thermal) {
    printHTML(`<h1>${esc(b.name)}</h1>${company ? `<div class="sub">${esc(company)}</div>` : ''}${b.address ? `<div class="sub">${esc(b.address)}</div>` : ''}${b.phone ? `<div class="sub">ت: ${esc(b.phone)}</div>` : ''}
      <div class="hr"></div><div class="c" style="font-weight:bold">${title}</div>
      <table class="meta">${meta.map(([k, v]) => `<tr><td>${k}</td><td class="n">${esc(v)}</td></tr>`).join('')}</table><div class="hr"></div>
      <table class="items"><thead><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">الإجمالي</th></tr></thead><tbody>
      ${s.items.map((i) => `<tr><td class="nm" colspan="4">${esc(i.name)}</td></tr><tr><td></td><td class="n">${qf(i.qty)}</td><td class="n">${money(i.price)}</td><td class="n">${money(i.total)}</td></tr>`).join('')}</tbody></table>
      <table class="tot">${tot.map(([k, v, c]) => `<tr class="${c || ''}"><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</table>
      ${s.notes ? `<div class="hr"></div><div>${esc(s.notes)}</div>` : ''}<div class="hr"></div><div class="ft">${esc(b.receipt_footer || 'شكراً لزيارتكم')}</div>`, true);
  } else {
    printHTML(`<div class="head"><div><h1>${esc(b.name)}</h1>${company ? `<div class="sub">${esc(company)}</div>` : ''}<div class="sub">${esc(b.address || '')} ${b.phone ? ' — ت: ' + esc(b.phone) : ''}</div></div>
      <div><h2>${title}</h2><table class="meta">${meta.map(([k, v]) => `<tr><td>${k}:</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table></div></div>
      <table class="t"><thead><tr><th>#</th><th>الصنف</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">الخصم</th><th class="n">الإجمالي</th></tr></thead><tbody>
      ${s.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td class="n">${qf(i.qty)}</td><td class="n">${money(i.price)}</td><td class="n">${i.discount ? money(i.discount) : ''}</td><td class="n">${money(i.total)}</td></tr>`).join('')}</tbody></table>
      <table class="tot">${tot.map(([k, v, c]) => `<tr class="${c || ''}"><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</table>
      ${s.notes ? `<p>ملاحظات: ${esc(s.notes)}</p>` : ''}<div class="ft">${esc(b.receipt_footer || '')}</div>`, false);
  }
}
function printReport(title, sub, html) {
  const b = curBranch() ? branchOf(curBranch()).name : 'كل المعارض';
  printHTML(`<div class="head"><div><h1>${esc(title)}</h1><div class="sub">${esc(sub || '')}</div></div><div class="sub">${esc(S.settings.company_name || '')}<br>${esc(b)}<br>طُبع: ${new Date().toLocaleString('en-GB')}</div></div>${html}`, false);
}
/* ---------------------------- المرفقات: صور جنب خانة البيان ---------------------------- */
// تصغير الصورة قبل الرفع (أقصى 1600 بكسل) عشان متاخدش مساحة
async function fileToDataURL(f) {
  if (/^image\//.test(f.type) && !/gif/.test(f.type)) {
    try {
      const bmp = await createImageBitmap(f); const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    } catch {}
  }
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
}
// زرار "📎 إرفاق صورة" جنب أي خانة بيان/ملاحظات. بيرجع { upload(entity, id) } تتنادى بعد الحفظ
function attachUI(input) {
  if (!input) return { upload: async () => 0, count: () => 0 };
  const box = document.createElement('div'); box.className = 'attach';
  box.innerHTML = `<label class="btn sm att-pick" title="صورة إيصال، فاتورة، ورقة…">📎 إرفاق صورة<input type="file" accept="image/*,application/pdf" multiple hidden></label><span class="att-list"></span>`;
  input.insertAdjacentElement('afterend', box);
  const files = [];
  const render = () => {
    $('.att-list', box).innerHTML = files.map((f, i) => `<span class="att-chip">${f.url ? `<img src="${f.url}" alt="">` : '📄'}<span class="small">${esc(f.file.name.slice(0, 18))}</span>${/^image/.test(f.file.type) ? `<button type="button" class="btn ghost sm" data-ocr="${i}" title="اقرا الكلام اللي في الصورة واكتبه في البيان">📝 اقرا الكلام</button>` : ''}<button type="button" class="btn ghost sm" data-rm="${i}" title="شيل">✕</button></span>`).join('');
  };
  $('input[type=file]', box).onchange = (e) => {
    for (const f of e.target.files) { if (f.size > 15e6) { toast(`${f.name}: الملف كبير قوي`, 'bad'); continue; } files.push({ file: f, url: /^image\//.test(f.type) ? URL.createObjectURL(f) : '' }); }
    e.target.value = ''; render();
  };
  box.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]'); if (rm) { files.splice(+rm.dataset.rm, 1); render(); return; }
    const oc = e.target.closest('[data-ocr]'); if (!oc) return;
    oc.disabled = true; const old = oc.textContent;
    try { const txt = await PriceImport.ocrText(files[+oc.dataset.ocr].file, (m) => (oc.textContent = '⏳ ' + m.slice(0, 22))); if (!txt) toast('ملقتش كلام واضح في الصورة', 'bad'); else { input.value = (input.value ? input.value + ' — ' : '') + txt.slice(0, 280); input.dispatchEvent(new Event('input')); toast('اتكتب الكلام في البيان — راجعه وعدّل لو فيه غلط', 'ok'); } }
    catch (er) { toast('تعذرت القراءة: ' + er.message, 'bad'); } finally { oc.disabled = false; oc.textContent = old; }
  });
  return {
    count: () => files.length,
    async upload(entity, id) {
      let n = 0;
      for (const f of files) { try { await POST('/api/attachments', { entity, entity_id: id, name: f.file.name, data: await fileToDataURL(f.file) }); n++; } catch (e) { toast(`${f.file.name}: ${e.message}`, 'bad'); } }
      files.length = 0; render(); return n;
    },
  };
}
// عرض المرفقات (صور مصغرة — دوس عليها تتفتح كبيرة)
async function attView(entity, id, el, opts = {}) {
  if (!el) return;
  try {
    const list = await GET('/api/attachments', { entity, entity_id: id });
    if (!SB) {
      el.innerHTML = list.length ? `<div class="att-view">${list.map((a) => `<a href="/api/attachments/${a.id}/file" target="_blank" class="att-thumb" title="${esc(a.name || '')} — ${esc(a.user_name || '')} ${esc((a.date || '').slice(0, 16))}">${/^image/.test(a.mime) ? `<img src="/api/attachments/${a.id}/file" alt="" loading="lazy">` : '<span>📄 PDF</span>'}</a>`).join('')}</div>` : (opts.empty || '');
      return;
    }
    // أونلاين: الصورة بتيجي من قاعدة البيانات وبنعرضها من الذاكرة
    el.innerHTML = list.length ? `<div class="att-view">${list.map((a) => `<a href="#" data-att="${a.id}" class="att-thumb" title="${esc(a.name || '')} — ${esc(a.user_name || '')} ${esc((a.date || '').slice(0, 16))}">${/^image/.test(a.mime) ? '<img alt="" style="min-width:60px;min-height:60px">' : '<span>📄 PDF</span>'}</a>`).join('')}</div>` : (opts.empty || '');
    for (const a of $$('[data-att]', el)) {
      attBlobUrl(+a.dataset.att).then((u) => { const img = $('img', a); if (img) img.src = u; a.onclick = (e) => { e.preventDefault(); window.open(u, '_blank'); }; }).catch(() => {});
    }
  } catch { el.innerHTML = ''; }
}
const ATT_CACHE = {};
function attBlobUrl(id) {
  if (!ATT_CACHE[id]) ATT_CACHE[id] = GET(`/api/attachments/${id}/file`).then((f) => fetch(f.data)).then((r) => r.blob()).then((b) => URL.createObjectURL(b));
  return ATT_CACHE[id];
}
function attModal(entity, id, title) {
  const m = modal({ title: `المرفقات — ${title}`, wide: 'wide', body: '<div id="av">جاري التحميل…</div>', buttons: [{ t: 'إغلاق' }] });
  attView(entity, id, $('#av', m.mb), { empty: '<div class="empty">مفيش مرفقات</div>' });
}
const attIcon = (r) => (r.att ? `<button class="btn ghost sm" data-act="att" title="المرفقات">📎 ${r.att}</button>` : '');

/* ---------------------------- واتساب ---------------------------- */
// رقم مصري 01xxxxxxxxx → 201xxxxxxxxx
function waPhone(p) { let d = String(p || '').replace(/[^\d]/g, ''); if (/^01\d{9}$/.test(d)) d = '2' + d; else if (/^1\d{9}$/.test(d)) d = '20' + d; else if (/^00/.test(d)) d = d.slice(2); return d; }
function openWhatsApp(phone, text) { const p = waPhone(phone); window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank'); }
function saleText(s) {
  const b = branchOf(s.branch_id); const isRet = s.kind === 'return';
  const L = [`*${b.name || ''}*${S.settings.company_name ? ' — ' + S.settings.company_name : ''}`, `${isRet ? 'إيصال مرتجع' : 'فاتورة'} رقم ${s.doc_no}`, `التاريخ: ${s.date.slice(0, 16)}`, ''];
  for (const i of s.items) L.push(`• ${i.name}\n   ${qf(i.qty)} × ${money(i.price)} = ${money(i.total)}`);
  L.push('', s.discount ? `الإجمالي: ${money(s.subtotal)}\nالخصم: ${money(s.discount)}` : '', `*الصافي: ${money(s.total)} ج.م*`);
  for (const p of s.pays) L.push(`${isRet ? 'مُسترد' : 'مدفوع'} ${mName(p.method)}: ${money(p.amount)}`);
  if (s.total - s.paid > 0.009) L.push(`متبقي آجل: ${money(s.total - s.paid)}`);
  if (s.customer_id && s.customer_balance != null) L.push(`رصيدك الحالي: ${money(s.customer_balance)}`);
  L.push('', b.receipt_footer || 'شكراً لزيارتكم 🌷', b.phone ? `📞 ${b.phone}` : '');
  return L.filter((x) => x !== '').join('\n').replace(/\n{3,}/g, '\n\n');
}
async function sendSaleWhatsApp(s) {
  const phone = s.cust_phone || (await promptBox('إرسال الفاتورة واتساب', 'رقم موبايل العميل (واتساب):', ''));
  if (phone == null) return;
  openWhatsApp(phone, saleText(s));
}
// شاشة بعد الحفظ: الباقي للعميل كبير وواضح + طباعة/واتساب
function saleDone(s) {
  const cashPay = (s.pays.find((p) => p.method === 'cash') || {}).amount || 0;
  const change = r2((s.cash_given || 0) - cashPay); const due = r2(s.total - s.paid);
  modal({ title: 'تم حفظ الفاتورة ✓', body: `<div style="text-align:center"><div class="badge ok" style="font-size:13px">فاتورة ${esc(s.doc_no)}</div>
      <div class="muted" style="margin-top:12px">الصافي</div><div class="num" style="font-size:30px;font-weight:800">${money(s.total)}</div>
      ${change > 0 ? `<div class="card" style="margin-top:12px;padding:14px;background:var(--ok-soft);border-color:#a7f3d0"><div class="ok" style="font-weight:800">الباقي للعميل</div><div class="num ok" style="font-size:36px;font-weight:800">${money(change)}</div></div>` : ''}
      ${due > 0.009 ? `<div class="card" style="margin-top:12px;padding:12px;background:var(--warn-soft);border-color:#fde68a"><b class="warn">آجل على العميل: <span class="num">${money(due)}</span></b></div>` : ''}
      <div style="margin-top:10px">${paysHTML(s.pays)}</div></div>`,
    buttons: [{ t: 'فاتورة جديدة (Enter)', cls: 'pri', fn: () => { const p = $('#ps'); if (p) p.focus(); } }, { t: `${icon('print')} طباعة`, fn: () => { printSale(s); return false; } }, { t: '💬 واتساب للعميل', fn: () => { sendSaleWhatsApp(s); return false; } }] });
}
function shiftText(s) {
  const b = branchOf(s.branch_id);
  return [`*تقفيل وردية — ${b.name || ''}*`, `الكاشير: ${s.user_name || ''}`, `من ${s.opened_at.slice(0, 16)} إلى ${(s.closed_at || '').slice(0, 16)}`, '', ...shiftReport(s).slice(3).map(([k, v]) => `${k}: ${v}`), s.notes ? `ملاحظات: ${s.notes}` : ''].filter(Boolean).join('\n');
}
function printVoucher({ title, branch_id, no, date, party, amount, method, notes, balance }) {
  const b = branchOf(branch_id);
  printHTML(`<h1>${esc(b.name)}</h1><div class="sub">${esc(b.phone || '')}</div><div class="hr"></div><div class="c" style="font-weight:bold">${title}</div>
    <table class="meta"><tr><td>رقم</td><td class="n">${no}</td></tr><tr><td>التاريخ</td><td class="n">${esc(date.slice(0, 16))}</td></tr><tr><td>الاسم</td><td class="n">${esc(party)}</td></tr><tr><td>طريقة الدفع</td><td class="n">${mName(method)}</td></tr>${notes ? `<tr><td>البيان</td><td class="n">${esc(notes)}</td></tr>` : ''}</table>
    <div class="hr"></div><table class="tot"><tr class="g"><td>المبلغ</td><td class="n">${money(amount)}</td></tr>${balance != null ? `<tr><td>الرصيد بعد السند</td><td class="n">${money(balance)}</td></tr>` : ''}</table>
    <div class="hr"></div><div class="ft">توقيع المستلم: ............................</div>`, true);
}

/* ---------------------------- البوابة: المدير العام أو الكاشير ---------------------------- */
// /admin = لوحة المدير العام ، /cashier = شاشة الكاشير ، / = شاشة اختيار
const relPath = () => (location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, ''));
const pathMode = () => (/^cashier/.test(relPath()) ? 'cashier' : /^admin/.test(relPath()) ? 'admin' : '');
S.mode = pathMode();
const isCashierMode = () => !isAdmin() || S.mode === 'cashier';
function goMode(m, replace) { S.mode = m; const p = BASE + (m ? m + '/' : ''); if (location.pathname !== p) history[replace ? 'replaceState' : 'pushState']({}, '', p + location.hash); }
window.addEventListener('popstate', () => { S.mode = pathMode(); if (S.user) { renderShell(); route(); } else renderLogin(); });
function renderChoice() {
  document.title = 'اختار الشاشة';
  const company = S.settings.company_name || 'برنامج الكاشير والمحاسبة';
  $('#app').innerHTML = `<div class="portal"><div class="portal-in">
    <div style="text-align:center;margin-bottom:26px"><span class="logo" style="margin:0 auto 14px;width:56px;height:56px">${icon('roller')}</span><h1>أهلاً بيك</h1><p>اختار الشاشة اللي عايز تدخل عليها</p></div>
    <div class="portal-cards">
      <a class="pcard2 owner" href="${BASE}admin/" data-m="admin"><div class="pi">👑</div><b>المدير العام</b><span>لوحة التحكم، الحركة المباشرة، الأرباح والتقارير، المشتريات والخزينة، المستخدمين والإعدادات</span><em>دخول المدير ←</em></a>
      <a class="pcard2 cashier" href="${BASE}cashier/" data-m="cashier"><div class="pi">🧾</div><b>الكاشير</b><span>شاشة البيع في المحل: فواتير، مرتجعات، عملاء، تحصيل، ووردية اليوم</span><em>دخول الكاشير ←</em></a>
    </div><div class="small" style="text-align:center;color:#7c8aa5;margin-top:22px">${esc(company)}</div></div></div>`;
  $$('[data-m]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); goMode(a.dataset.m); renderLogin(); }));
}
function renderLogin(msg) {
  if (!S.mode) return renderChoice();
  const adm = S.mode === 'admin';
  document.title = adm ? 'دخول المدير العام' : 'دخول الكاشير';
  $('#app').innerHTML = `<div class="login-wrap">
    <div class="login-art"><div class="swatches"><span style="background:#c8102e"></span><span style="background:#0b6e4f"></span><span style="background:#f59e0b"></span><span style="background:#3b82f6"></span><span style="background:#f5f5f4"></span></div>
      <div><h2>كاشير ومحاسبة<br>معارض الدهانات</h2><p>البيع والمخزون والحسابات للمعرضين في مكان واحد — وكل عملية بتوصل للمدير لحظتها.</p>
      <ul><li><i>🧾</i> فواتير وإيصالات ومرتجعات</li><li><i>💳</i> كاش، فيزا، إنستاباي، فودافون كاش</li><li><i>📊</i> أرباح وتقارير ومخزون لحظة بلحظة</li></ul></div>
      <div class="small" style="color:#7c8aa5">© ${new Date().getFullYear()}</div></div>
    <div class="login-side"><form class="login" id="lf"><div class="row" style="margin-bottom:18px"><span class="logo">${adm ? '👑' : '🧾'}</span><span class="sp"></span><a href="${BASE}" id="chg" class="btn sm ghost">⇄ تغيير الشاشة</a></div>
    <span class="badge ${adm ? 'pri' : 'ok'}" style="margin-bottom:8px">${adm ? 'شاشة المدير العام' : 'شاشة الكاشير'}</span>
    <h1>${adm ? 'دخول المدير العام' : 'دخول الكاشير'}</h1><p class="muted" style="margin:0 0 22px">${adm ? 'التقارير والحسابات وكل المعارض' : 'سجّل دخولك وابدأ البيع'}</p>
    ${adm
    ? `<div class="field"><label class="f">اسمك <span class="faint">(اختياري — بيتسجل إن المدير دخل بالاسم ده)</span></label><input class="in" name="username" autocomplete="name" value="${esc(LS.get('pos_admin_name', ''))}" placeholder="مثال: أبو محمد" style="padding:12px 14px"></div>`
    : `<div class="field"><label class="f">اسم المستخدم</label><input class="in" name="username" autocomplete="username" required dir="ltr" style="padding:12px 14px"></div>`}
    <div class="field"><label class="f">كلمة المرور</label><input class="in" type="password" name="password" autocomplete="current-password" required dir="ltr" style="padding:12px 14px"></div>
    <div id="lerr" class="bad small" style="min-height:20px">${esc(msg || '')}</div>
    <button class="btn pri lg" style="width:100%">دخول</button></form></div></div>`;
  (adm ? $('[name=password]') : $('[name=username]')).focus();
  $('#lf').onsubmit = async (e) => {
    e.preventDefault(); const b = $('#lf button'); b.disabled = true;
    try { const v = fv($('#lf')); if (adm) LS.set('pos_admin_name', v.username); await POST('/api/login', { ...v, mode: S.mode }); await boot(); } catch (er) { $('#lerr').textContent = er.message; } finally { b.disabled = false; }
  };
  $('#chg').onclick = (e) => { e.preventDefault(); goMode(''); renderChoice(); };
}
function changePassword(forced) {
  modal({
    title: forced ? 'غيّر كلمة المرور قبل البدء' : 'تغيير كلمة المرور',
    body: `${forced ? '<p class="warn" style="margin-top:0">لأمان حسابك لازم تغيّر كلمة المرور الافتراضية.</p>' : ''}
      <div class="field"><label class="f">كلمة المرور الحالية</label><input class="in" type="password" name="old_password" dir="ltr"></div>
      <div class="field"><label class="f">كلمة المرور الجديدة</label><input class="in" type="password" name="new_password" dir="ltr"></div>
      <div class="field"><label class="f">تأكيد كلمة المرور الجديدة</label><input class="in" type="password" name="confirm" dir="ltr"></div>`,
    buttons: [{ t: 'حفظ', cls: 'pri', fn: async (mb) => { const v = fv(mb); if (v.new_password !== v.confirm) throw new Error('كلمتين المرور مش متطابقين'); await POST('/api/me/password', v); S.user.must_change = false; toast('تم تغيير كلمة المرور', 'ok'); } }, ...(forced ? [] : [{ t: 'إلغاء' }])],
  });
}

/* ---------------------------- Shell ---------------------------- */
/* القوائم:
   - المدير العام (صاحب المكان): كل حاجة، مقسّمة في قائمة جانبية.
   - الكاشير في المحل: شاشة بسيطة البيع فيها أول حاجة (c: 1 = تظهر للكاشير، ct = اسمها عنده).
     أي صلاحية زيادة يديهاله المدير (مشتريات، جرد، تقارير…) بتظهر له كتبويب إضافي. */
const NAV = [
  { grp: 'نظرة عامة' },
  { id: 'dashboard', t: 'لوحة التحكم', i: 'home', perm: 'reports' },
  { id: 'live', t: 'حركة المعارض مباشر', i: 'pulse', perm: 'reports' },
  { id: 'reports', t: 'التقارير والأرباح', i: 'chart', perm: 'reports' },
  { grp: 'المبيعات' },
  { id: 'pos', t: 'نقطة البيع', ct: 'البيع', i: 'cart', c: 1 },
  { id: 'sales', t: 'الفواتير والمرتجعات', ct: 'فواتيري', i: 'receipt', c: 1 },
  { id: 'shifts', t: 'الورديات وتقفيل اليوم', ct: 'ورديتي', i: 'clock', c: 1 },
  { id: 'customers', t: 'العملاء', ct: 'العملاء', i: 'users', perm: 'customers', c: 1 },
  { grp: 'المخزون والمشتريات' },
  { id: 'products', t: 'الأصناف والأسعار', ct: 'الأسعار والمخزون', i: 'box', c: 1 },
  { id: 'stock', t: 'الجرد وتسوية المخزون', i: 'layers', perm: 'stock' },
  { id: 'purchases', t: 'المشتريات', i: 'truck', perm: 'purchases' },
  { id: 'suppliers', t: 'الموردين', i: 'factory', perm: 'suppliers' },
  { grp: 'الحسابات' },
  { id: 'payments', t: 'سندات القبض والصرف', ct: 'التحصيل', i: 'wallet', any: ['customers', 'suppliers'], c: 1 },
  { id: 'expenses', t: 'المصروفات', ct: 'مصروفات الدرج', i: 'cash', perm: 'expenses', c: 1 },
  { id: 'loans', t: 'السلف والاقتراض', ct: 'سلف واقتراض', i: 'coins', perm: 'loans', c: 1 },
  { id: 'treasury', t: 'الخزينة والبنك', i: 'safe', perm: 'treasury' },
  { grp: 'الإدارة', admin: true },
  { id: 'users', t: 'المستخدمين والصلاحيات', i: 'shield', admin: true },
  { id: 'settings', t: 'الإعدادات والنسخ الاحتياطي', i: 'gear', admin: true },
];
const navOk = (n) => (n.admin ? isAdmin() : n.perm ? can(n.perm) : n.any ? n.any.some(can) : true);
const navTitle = (n) => (isCashierMode() && n.ct ? n.ct : n.t);
// ترتيب تبويبات الكاشير: الأساسي الأول، وبعده أي صلاحيات زيادة (المدير على شاشة الكاشير بيشوف الأساسي بس)
const cashierNav = () => { const items = NAV.filter((n) => n.id && navOk(n)); return isAdmin() ? items.filter((n) => n.c) : [...items.filter((n) => n.c), ...items.filter((n) => !n.c)]; };
const allowedNav = () => (isCashierMode() ? cashierNav() : NAV.filter((n) => n.id && navOk(n)));
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const arDate = (d = new Date()) => `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'صباح الخير' : 'مساء الخير'; };
const initial = (s) => (String(s || '؟').trim()[0] || '؟');
function tickClock() { const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); $$('[data-clock]').forEach((e) => (e.textContent = t)); }
setInterval(tickClock, 15000);
const VIEWS = {};

async function logout() { await POST('/api/logout').catch(() => {}); S.user = null; clearInterval(S.notifyTimer); clearInterval(S.liveTimer); clearInterval(S.permTimer); dropCache(); renderLogin(); }
function setBranch(id) { S.branch = +id; LS.set('pos_branch', S.branch); dropCache(); if (isCashierMode()) { renderCashierShell(); route(); return; } $$('#brseg button').forEach((b) => b.classList.toggle('on', +b.dataset.b === S.branch)); route(); }
function renderShell() {
  const u = S.user;
  const company = S.settings.company_name || 'برنامج الكاشير';
  if (isCashierMode()) return renderCashierShell();
  // ===== المدير العام: قائمة جانبية كاملة =====
  const seg = `<div class="seg" id="brseg"><button data-b="0" class="${!S.branch ? 'on' : ''}">كل المعارض</button>${S.branches.map((b) => `<button data-b="${b.id}" class="${S.branch === b.id ? 'on' : ''}"><span class="dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</button>`).join('')}</div>`;
  $('#app').innerHTML = `<div class="shell"><aside class="side" id="side"><div class="brand"><span class="logo">${icon('roller')}</span><div><b>${esc(company)}</b><span>لوحة المدير العام</span></div></div>
    <nav>${NAV.filter(navOk).map((n) => (n.grp ? `<div class="grp">${n.grp}</div>` : `<a href="#/${n.id}" data-v="${n.id}">${icon(n.i)}${n.t}</a>`)).join('').replace(/<div class="grp">[^<]*<\/div>(?=<div class="grp">|$)/g, '')}</nav>
    <div class="me"><div class="row" style="flex-wrap:nowrap;gap:10px"><span class="avatar">${esc(initial(u.name))}</span><div style="min-width:0"><div style="color:#fff;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}</div><div style="color:#7c8aa5">المدير العام · كل المعارض</div></div></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" id="chpw">${icon('key')}كلمة المرور</button><button class="btn sm" id="logout">${icon('logout')}خروج</button></div></div></aside>
    <div class="main"><header class="top"><button class="btn ghost menu-btn" id="menu">${icon('menu')}</button><div class="sp"><h2 id="vt"></h2><div class="sub">${arDate()}</div></div>${seg}<a class="btn" href="${BASE}cashier/" target="_blank" title="فتح شاشة الكاشير في تاب جديد">${icon('cart')}شاشة الكاشير</a><button class="btn ghost" data-theme-btn title="الوضع الليلي">${themeIcon()}</button><span class="clock num" data-clock></span></header><main class="content" id="view"></main></div></div>`;
  $('#logout').onclick = logout;
  $('#chpw').onclick = () => changePassword(false);
  $('#menu').onclick = () => $('#side').classList.toggle('open');
  $$('#brseg button').forEach((b) => (b.onclick = () => setBranch(b.dataset.b)));
  $$('[data-theme-btn]').forEach((b) => (b.onclick = toggleTheme));
  tickClock();
}
// ===== الكاشير في المحل: شريط علوي وتبويبات، والبيع أول حاجة =====
function renderCashierShell() {
  const u = S.user; const b = branchOf(curBranch());
  // المدير لما يفتح شاشة الكاشير: يختار المعرض من فوق
  const adminSeg = isAdmin() ? `<div class="seg dark" id="brseg">${S.branches.map((x) => `<button data-b="${x.id}" class="${S.branch === x.id ? 'on' : ''}"><span class="dot" style="background:${esc(x.color)}"></span>${esc(x.name)}</button>`).join('')}</div><a class="btn sm" href="${BASE}admin/" style="background:rgba(255,255,255,.1);border-color:transparent;color:#fff">👑 لوحة المدير</a>` : '';
  $('#app').innerHTML = `<div class="cshell"><header class="ctop">
      <div class="cbrand"><span class="logo" style="background:linear-gradient(135deg,${esc(b.color || '#3b82f6')},#1e3a8a)">${icon('roller')}</span><div><b>${esc(b.name || '')}</b><span>${esc(S.settings.company_name || '')}</span></div></div>
      <nav class="ctabs">${cashierNav().map((n) => `<a href="#/${n.id}" data-v="${n.id}">${icon(n.i)}${navTitle(n)}</a>`).join('')}</nav>
      <div class="cright">${adminSeg}<span class="pill off" id="shiftPill" title="الوردية">…</span><button class="btn sm ghost" data-theme-btn title="الوضع الليلي" style="color:#fff">${themeIcon()}</button><span class="clock num" data-clock></span>
        <div class="umenu"><button id="um"><span class="avatar">${esc(initial(u.name))}</span>${esc(u.name.split(' ')[0])}</button><div class="dd hide" id="umd"><div class="small muted" style="padding:6px 10px">${esc(u.name)} — كاشير</div><button id="chpw">${icon('key')}تغيير كلمة المرور</button><button id="logout" class="bad">${icon('logout')}تسجيل خروج</button></div></div></div>
    </header><main class="content" id="view"></main></div>`;
  $('#um').onclick = (e) => { e.stopPropagation(); $('#umd').classList.toggle('hide'); };
  document.addEventListener('click', () => { const d = $('#umd'); if (d) d.classList.add('hide'); });
  $('#logout').onclick = logout;
  $('#chpw').onclick = () => changePassword(false);
  $('#shiftPill').onclick = () => (location.hash = '#/shifts');
  $$('[data-theme-btn]').forEach((x) => (x.onclick = toggleTheme));
  $$('#brseg button').forEach((x) => (x.onclick = () => { S.branch = +x.dataset.b; LS.set('pos_branch', S.branch); dropCache(); renderCashierShell(); route(); }));
  tickClock(); refreshShiftPill();
}
async function refreshShiftPill() {
  const p = $('#shiftPill'); if (!p) return;
  try { const sh = await GET('/api/shift/current', bq()); p.className = 'pill ' + (sh ? 'on' : 'off'); p.innerHTML = sh ? `<span class="live-dot"></span> وردية مفتوحة من ${esc(sh.opened_at.slice(11, 16))}` : '⚠ مفيش وردية مفتوحة'; } catch {}
}
function route() {
  if (!S.user) return;
  let v = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  if (!allowedNav().some((x) => x.id === v)) v = isCashierMode() ? 'pos' : 'dashboard';
  S.view = v;
  $$('nav a[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === v));
  if (v === 'live') { const b = $('nav a[data-v=live] .nbadge'); if (b) b.remove(); }
  clearInterval(S.liveTimer);
  if ($('#side')) $('#side').classList.remove('open');
  const nav = NAV.find((x) => x.id === v);
  if ($('#vt')) $('#vt').textContent = navTitle(nav);
  document.title = navTitle(nav) + ' — ' + (S.settings.company_name || 'الكاشير');
  if (isCashierMode()) refreshShiftPill();
  const el = $('#view'); el.innerHTML = '<div class="empty">جاري التحميل…</div>';
  Promise.resolve(VIEWS[v](el)).catch((e) => { el.innerHTML = `<div class="empty bad">${esc(e.message)}</div>`; });
}
window.addEventListener('hashchange', route);

function needBranch(el) {
  if (curBranch()) return true;
  el.innerHTML = `<div class="card" style="max-width:520px;margin:40px auto"><div class="bd" style="text-align:center"><h3 style="margin-top:0">اختار المعرض</h3><p class="muted">الشاشة دي بتشتغل على معرض واحد — اختار المعرض اللي عايز تشتغل عليه:</p>
    <div class="row" style="justify-content:center">${S.branches.map((b) => `<button class="btn lg" data-b="${b.id}"><span class="dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</button>`).join('')}</div></div></div>`;
  $$('[data-b]', el).forEach((x) => (x.onclick = () => setBranch(x.dataset.b)));
  return false;
}
const brName = (id) => { const b = branchOf(id); return b.name ? `<span class="branch-pill"><span class="dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</span>` : ''; };
const showBranchCol = () => isAdmin() && !S.branch;

async function boot() {
  try {
    const me = await GET('/api/me');
    S.user = me.user; S.branches = me.branches; S.settings = me.settings; S.methods = me.methods; S.allMethods = me.all_methods;
    if (isAdmin() && S.branch && !S.branches.some((b) => b.id === S.branch)) S.branch = 0;
    // الكاشير دايماً على شاشة الكاشير. المدير: لو مفيش شاشة محددة يروح لوحة المدير
    if (!isAdmin()) goMode('cashier', true); else if (!S.mode) goMode('admin', true);
    applyTheme();
    renderShell(); route(); startNotifier(); startPermWatch();
    if (S.user.must_change) changePassword(true);
  } catch (e) { if (!S.user) { applyTheme(); renderLogin(); } }
}
/* الكاشير: لو المدير غيّر صلاحياته، الشاشة بتتحدث لوحدها من غير خروج ودخول */
function startPermWatch() {
  clearInterval(S.permTimer);
  if (isAdmin()) return;
  const sig = (u) => JSON.stringify([u.perms, u.active, u.branch_id]);
  let last = sig(S.user), pending = false;
  S.permTimer = setInterval(async () => {
    if (!S.user) return clearInterval(S.permTimer);
    try {
      const me = await GET('/api/me');
      if (sig(me.user) === last && !pending) return;
      pending = true;
      if ($('.ov')) return; // في نافذة مفتوحة (دفع مثلاً) — نستنى لما تتقفل
      const before = S.user.perms; last = sig(me.user); pending = false;
      S.user = me.user; S.settings = me.settings; S.methods = me.methods;
      const on = PERMS.filter(([k]) => !before[k] && me.user.perms[k]).map(([, t]) => t), off = PERMS.filter(([k]) => before[k] && !me.user.perms[k]).map(([, t]) => t);
      renderShell(); route();
      toast(`المدير غيّر صلاحياتك${on.length ? ` — ✅ اتفتح: ${on.join('، ')}` : ''}${off.length ? ` — 🔒 اتقفل: ${off.join('، ')}` : ''}${before.max_discount !== me.user.perms.max_discount ? ` — أقصى خصم ${me.user.perms.max_discount}%` : ''}`, 'ok');
    } catch {}
  }, 20000);
}
/* الوضع الليلي */
function applyTheme() { try { document.documentElement.dataset.theme = LS.get('pos_theme', 'light'); } catch {} }
function toggleTheme() { const t = LS.get('pos_theme', 'light') === 'dark' ? 'light' : 'dark'; LS.set('pos_theme', t); applyTheme(); $$('[data-theme-btn]').forEach((b) => (b.innerHTML = themeIcon())); }
const themeIcon = () => (LS.get('pos_theme', 'light') === 'dark' ? '☀️' : '🌙');

/* =====================================================================
   لوحة التحكم
   ===================================================================== */
// كارت رقم: ic = أيقونة، tone = لونها
const stat = (k, v, s = '', cls = '', ic = '', tone = '') => `<div class="card stat" ${tone ? `style="--tone:${tone}"` : ''}>${ic ? `<div class="si">${icon(ic)}</div>` : ''}<div style="min-width:0"><div class="k">${k}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div></div>`;
VIEWS.dashboard = async (el) => {
  const d = await GET('/api/dashboard', bq());
  if (!d.can_full) {
    el.innerHTML = `<div class="grid g3" style="margin-bottom:16px">${stat('مبيعاتي اليوم', M(d.today.net), `${d.today.count} فاتورة`)}${stat('المرتجعات اليوم', M(d.today.returns))}<div class="card stat" style="display:flex;align-items:center;justify-content:center"><a class="btn pri lg" href="#/pos">${icon('cart')} افتح الكاشير</a></div></div>
      <div class="grid g2"><div class="card"><div class="hd">آخر فواتيري</div><div id="rc"></div></div><div class="card"><div class="hd">أصناف وصلت لحد الطلب</div><div id="ls"></div></div></div>`;
    mountTable($('#rc', el), [{ t: 'رقم', f: (r) => `<b class="num">${r.doc_no}</b>` }, { t: 'الوقت', f: (r) => dt(r.date) }, { t: 'الإجمالي', n: 1, f: (r) => M(r.kind === 'return' ? -r.total : r.total) }], d.recent, { click: (r) => saleModal(r.id) });
    mountTable($('#ls', el), [{ t: 'الصنف', k: 'name' }, { t: 'الرصيد', n: 1, f: (r) => `<b class="bad num">${qf(r.stock)}</b>` }], d.low_stock, { empty: 'كل الأصناف متوفرة ✓' });
    return;
  }
  const t = d.today, m = d.month; const sc = can('see_cost');
  const cashTot = r2(sumMap(d.cash));
  const cashSub = Object.entries(d.cash).filter(([, v]) => Math.abs(v) > 0.009).map(([k, v]) => `${mName(k)} ${money(v)}`).join(' · ') || 'لا توجد حركة';
  const where = S.branch ? branchOf(S.branch).name : 'كل المعارض';
  el.innerHTML = `
    <div class="hero"><div class="sp"><h1>${greet()}، ${esc(S.user.name)} 👋</h1><p>${arDate()} · ملخص ${esc(where)} — ${t.count} فاتورة النهارده بصافي ${money(t.net)} ج.م</p></div>
      <div class="qa">${isAdmin() ? `<a class="btn" href="#/live">${icon('pulse')}الحركة المباشرة</a>` : ''}${can('purchases') ? `<a class="btn" href="#/purchases">${icon('truck')}فاتورة شراء</a>` : ''}${can('expenses') ? `<a class="btn" href="#/expenses">${icon('cash')}مصروف</a>` : ''}<a class="btn" href="#/reports">${icon('chart')}التقارير</a><button class="btn" id="waDay">💬 ملخص اليوم واتساب</button></div></div>
    <div class="grid g4" style="margin-bottom:16px">
      ${stat('صافي مبيعات اليوم', M(t.net), `${t.count} فاتورة · مرتجع ${money(t.returns)}`, '', 'cart', '#2563eb')}
      ${sc ? stat('مجمل ربح اليوم', M(t.gross_profit), `مصروفات اليوم ${money(d.today_expenses)}`, t.gross_profit >= 0 ? 'ok' : 'bad', 'trend', '#059669') : stat('مصروفات اليوم', M(d.today_expenses), '', '', 'cash', '#d97706')}
      ${stat('صافي مبيعات الشهر', M(m.net), `${m.count} فاتورة · خصومات ${money(m.discounts)}`, '', 'receipt', '#6366f1')}
      ${sc ? stat('صافي ربح الشهر (تقريبي)', M(m.gross_profit - d.month_expenses), `مجمل ${money(m.gross_profit)} − مصروفات ${money(d.month_expenses)}`, m.gross_profit - d.month_expenses >= 0 ? 'ok' : 'bad', 'coins', '#0d9488') : stat('مصروفات الشهر', M(d.month_expenses), '', '', 'cash', '#d97706')}
    </div>
    <div class="card" style="margin-bottom:14px"><div class="hd"><span class="live-dot"></span> حركة اليوم في المعارض — مباشر<span class="sp"></span><span class="small faint" id="lvUpd"></span><a class="btn sm" href="#/live">عرض كامل</a></div>
      <div class="bd" style="padding-bottom:0"><div class="small muted" style="margin-bottom:6px">المبيعات اليوم حسب طريقة الدفع:</div><div class="grid g4" id="lvM" style="margin-bottom:14px"></div></div><div id="lvT"></div></div>
    <div class="grid g4" style="margin-bottom:16px">
      ${stat('رصيد الخزائن', M(cashTot), cashSub, '', 'safe', '#0e7490')}
      ${stat('مديونيات العملاء (لينا)', M(d.receivables), 'فلوس على العملاء', d.receivables > 0 ? 'warn' : '', 'users', '#d97706')}
      ${stat('مستحقات الموردين (علينا)', M(d.payables), 'فلوس للموردين', d.payables > 0 ? 'bad' : '', 'truck', '#dc2626')}
      ${stat('قيمة المخزون', sc ? M(d.inventory.cost) : M(d.inventory.price), sc ? `بسعر البيع ${money(d.inventory.price)} · ${d.inventory.items} صنف` : `بسعر البيع · ${d.inventory.items} صنف`, '', 'box', '#7c3aed')}
    </div>
    <div class="grid g21" style="margin-bottom:14px">
      <div class="card"><div class="hd">صافي المبيعات آخر 14 يوم</div><div class="bd" id="ch"></div></div>
      <div class="card"><div class="hd">${S.branch ? 'الأكثر مبيعاً هذا الشهر' : 'مبيعات المعارض هذا الشهر'}</div><div class="bd" id="bb" style="padding:0"></div></div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="hd">آخر الفواتير<span class="sp"></span><a class="btn sm" href="#/sales">الكل</a></div><div id="rc"></div></div>
      <div class="card"><div class="hd">نواقص (وصلت لحد الطلب) <span class="badge bad">${d.low_stock_count}</span><span class="sp"></span><a class="btn sm" href="#/products">الأصناف</a></div><div id="ls"></div></div>
    </div>`;
  const max = Math.max(1, ...d.chart.map((x) => x.v));
  $('#ch', el).innerHTML = `<div class="bars">${d.chart.map((x) => `<div class="b" title="${x.d}: ${money(x.v)}"><span class="num" style="font-size:10px">${x.v ? Math.round(x.v).toLocaleString('en-US') : ''}</span><i style="height:${Math.max(1, (x.v / max) * 120)}px"></i><span>${x.d.slice(8)}/${x.d.slice(5, 7)}</span></div>`).join('')}</div>`;
  if (S.branch) mountTable($('#bb', el), [{ t: 'الصنف', k: 'name' }, { t: 'الكمية', n: 1, f: (r) => Q(r.qty) }, { t: 'القيمة', n: 1, f: (r) => M(r.v) }], d.top, { empty: 'لا توجد مبيعات بعد' });
  else mountTable($('#bb', el), [{ t: 'المعرض', f: (r) => brName(r.branch_id) }, { t: 'صافي المبيعات', n: 1, f: (r) => M(r.v) }], S.branches.map((b) => ({ branch_id: b.id, v: (d.by_branch.find((x) => x.branch_id === b.id) || {}).v || 0 })));
  mountTable($('#rc', el), [{ t: 'رقم', f: (r) => `<b class="num">${r.doc_no}</b>` }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id) }] : []), { t: 'الوقت', f: (r) => dt(r.date) }, { t: 'العميل', k: 'customer_name' }, { t: 'الكاشير', k: 'user_name' }, { t: 'الإجمالي', n: 1, f: (r) => (r.kind === 'return' ? M(-r.total, 'bad') : M(r.total)) }], d.recent, { click: (r) => saleModal(r.id), empty: 'لا توجد فواتير بعد' });
  mountTable($('#ls', el), [{ t: 'الصنف', k: 'name' }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id) }] : []), { t: 'الرصيد', n: 1, f: (r) => `<b class="${r.stock <= 0 ? 'bad' : 'warn'} num">${qf(r.stock)}</b>` }, { t: 'حد الطلب', n: 1, f: (r) => Q(r.min_stock) }], d.low_stock, { empty: 'كل الأصناف متوفرة ✓' });
  $('#waDay', el).onclick = async () => {
    const a = await GET('/api/activity', bq());
    const txt = [`*ملخص يوم ${arDate()}*`, `📍 ${where}`, '',
      `🛒 صافي المبيعات: ${money(t.net)} (${t.count} فاتورة)`, t.returns ? `↩️ المرتجعات: ${money(t.returns)}` : '', sc ? `📈 مجمل الربح: ${money(t.gross_profit)}` : '', `💸 المصروفات: ${money(d.today_expenses)}`,
      '', '*التحصيل حسب طريقة الدفع:*', ...a.sales_by_method.filter((x) => Math.abs(x.v) > 0.009).map((x) => `• ${mName(x.method)}: ${money(x.v)}`), a.credit > 0.009 ? `• آجل: ${money(a.credit)}` : '',
      '', `💰 رصيد الخزائن: ${money(cashTot)}`, `📦 أصناف وصلت لحد الطلب: ${d.low_stock_count}`].filter((x, i, arr) => x !== '' || (arr[i - 1] !== '' && i)).join('\n');
    openWhatsApp(S.settings.owner_whatsapp || '', txt);
  };
  await liveBlock(el, 12);
};

/* =====================================================================
   الحركة المباشرة (كل عمليات الكاشير لحظة بلحظة)
   ===================================================================== */
const ACT_T = { sale: ['فاتورة بيع', 'pri'], return: ['مرتجع بيع', 'bad'], expense: ['مصروف', 'warn'], receipt: ['تحصيل من عميل', 'ok'], supplier_payment: ['سداد لمورد', 'bad'], purchase: ['فاتورة شراء', ''], purchase_return: ['مرتجع شراء', ''], deposit: ['إيداع', 'ok'], withdraw: ['سحب', 'bad'], transfer: ['تحويل بين الخزائن', ''], loan_in: ['اقتراض', 'warn'], loan_out: ['سلفة', 'warn'], loan_repay_in: ['تحصيل سلفة', 'ok'], loan_repay_out: ['سداد اقتراض', 'bad'] };
const actCols = (compact) => [
  { t: 'الوقت', f: (r) => `<span class="num">${esc(r.date.slice(11, 16))}</span>`, v: (r) => r.date },
  ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id), v: (r) => branchOf(r.branch_id).name }] : []),
  { t: 'الموظف', k: 'user_name' },
  { t: 'العملية', f: (r) => { const [n, c] = ACT_T[r.type] || [r.type, '']; return `<span class="badge ${c}">${n}</span>${r.doc_no ? ` <span class="num small">${esc(r.doc_no)}</span>` : ''}${r.status === 'void' ? ' <span class="badge bad">ملغاة</span>' : ''}${r.disc_pct >= (+S.settings.alert_discount || 10) ? ` <span class="badge bad">⚠ خصم ${r.disc_pct}%</span>` : ''}`; }, v: (r) => (ACT_T[r.type] || [r.type])[0] + (r.doc_no ? ' ' + r.doc_no : '') },
  { t: 'العميل / البيان', f: (r) => esc(r.party || '') + (r.notes && !compact ? `<div class="small faint">${esc(r.notes)}</div>` : ''), v: (r) => [r.party, r.notes].filter(Boolean).join(' — ') },
  { t: 'المبلغ', n: 1, f: (r) => M(r.dir < 0 ? -r.amount : r.amount, r.dir < 0 ? 'bad' : r.dir > 0 ? 'ok' : ''), v: (r) => (r.dir < 0 ? -r.amount : r.amount) },
  { t: 'طريقة الدفع', f: (r) => paysHTML(r.pays, r.type === 'sale' ? '<span class="badge warn">آجل</span>' : '') + (r.type === 'sale' && r.amount - r.paid > 0.009 && r.pays.length ? ` <span class="badge warn">آجل ${money(r.amount - r.paid)}</span>` : ''), v: (r) => r.pays.map((p) => `${mName(p.method)} ${p.amount}${p.ref ? ' #' + p.ref : ''}`).join(' + ') || 'آجل' },
];
const actClick = (r) => (r.type === 'sale' || r.type === 'return' ? saleModal(r.ref_id) : r.type === 'purchase' || r.type === 'purchase_return' ? purchaseModal(r.ref_id) : null);
function methodCards(list) {
  const rows = list.filter((x) => Math.abs(x.v) > 0.009);
  const tot = rows.reduce((s, x) => s + x.v, 0);
  return stat('إجمالي التحصيل من المبيعات', M(tot), '', '', 'coins', '#0f172a') + (rows.length ? rows.map((x) => stat(esc(mName(x.method)), M(x.v), `${tot ? Math.round((x.v / tot) * 100) : 0}% من التحصيل`, '', x.method === 'cash' ? 'cash' : 'wallet', M_COLOR[x.method] || '#475569')).join('') : stat('لا توجد مبيعات اليوم بعد', '—'));
}
async function liveBlock(el, limit) {
  const seen = new Set(); let first = true;
  const load = async () => {
    if (!document.body.contains(el) || !$('#lvT', el)) return false;
    const d = await GET('/api/activity', bq());
    $('#lvM', el).innerHTML = methodCards(d.sales_by_method) + (d.credit > 0.009 ? stat('بيع آجل اليوم', M(d.credit, 'warn')) : '');
    const rows = d.rows.slice(0, limit || 1000);
    mountTable($('#lvT', el), actCols(!!limit), rows, { click: actClick, empty: 'مفيش عمليات النهارده لسه', rowCls: (r) => (!first && !seen.has(r.k) ? 'fresh' : '') });
    d.rows.forEach((r) => seen.add(r.k)); first = false;
    $('#lvUpd', el).textContent = 'آخر تحديث ' + new Date().toLocaleTimeString('en-GB').slice(0, 5);
    return true;
  };
  await load();
  clearInterval(S.liveTimer);
  S.liveTimer = setInterval(async () => { try { if ((await load()) === false) clearInterval(S.liveTimer); } catch {} }, 10000);
}
VIEWS.live = async (el) => {
  const st = S.liveSt || (S.liveSt = { date: ymd(new Date()) });
  el.innerHTML = `<div class="toolbar"><label class="f" style="margin:0">اليوم</label><input type="date" class="in" id="ld" value="${st.date}" style="width:auto"><span class="row small muted"><span class="live-dot"></span> بيتحدّث تلقائي كل 10 ثواني</span><span class="sp"></span><span class="small faint" id="lvUpd"></span><button class="btn" id="csv">${icon('download')}Excel</button></div>
    <div class="grid g4" id="lvM" style="margin-bottom:14px"></div><div class="card" style="margin-bottom:14px"><div class="hd">صافي كل خزينة اليوم (داخل − خارج)</div><div id="lvB"></div></div><div id="lvT"></div>`;
  let last = null;
  const load = async () => {
    if (!document.body.contains(el) || !$('#lvT', el)) return false;
    const d = await GET('/api/activity', bq({ date: st.date })); last = d;
    $('#lvM', el).innerHTML = methodCards(d.sales_by_method) + (d.credit > 0.009 ? stat('بيع آجل', M(d.credit, 'warn')) : '');
    mountTable($('#lvB', el), [{ t: 'الخزينة', f: (r) => mBadge(r.method) }, { t: 'داخل', n: 1, f: (r) => M(r.inflow, 'ok') }, { t: 'خارج', n: 1, f: (r) => M(r.outflow, 'bad') }, { t: 'الصافي', n: 1, f: (r) => `<b>${M(r.net)}</b>` }], d.by_method, { empty: 'لا توجد حركة' });
    mountTable($('#lvT', el), actCols(false), d.rows, { click: actClick, empty: 'مفيش عمليات في اليوم ده' });
    $('#lvUpd', el).textContent = 'آخر تحديث ' + new Date().toLocaleTimeString('en-GB').slice(0, 5);
    return true;
  };
  $('#ld', el).onchange = (e) => { st.date = e.target.value; load(); };
  $('#csv', el).onclick = () => last && exportCSV('حركة-' + st.date, actCols(false), last.rows);
  await load();
  clearInterval(S.liveTimer);
  S.liveTimer = setInterval(async () => { try { if ((await load()) === false) clearInterval(S.liveTimer); } catch {} }, 10000);
};

/* إشعارات للمدير بأي عملية جديدة من الكاشير وهو في أي شاشة */
function startNotifier() {
  clearInterval(S.notifyTimer);
  if ((!isAdmin() && !can('reports')) || isCashierMode()) return;
  let known = null, knownLow = null;
  const toastLive = (html, alert, onClick, ms = 9000) => { const t = document.createElement('div'); t.className = 'toast live' + (alert ? ' alert' : ''); t.innerHTML = html; t.onclick = () => { t.remove(); onClick && onClick(); }; $('#toasts').append(t); setTimeout(() => t.remove(), alert ? 20000 : ms); };
  const tick = async () => {
    try {
      const d = await GET('/api/activity', {});
      const fresh = d.rows.filter((r) => r.user_id !== S.user.id && known && !known.has(r.k));
      known = new Set(d.rows.map((r) => r.k));
      const lim = +S.settings.alert_discount || 10;
      for (const r of fresh.slice(0, 4).reverse()) {
        const [n] = ACT_T[r.type] || [r.type];
        // تنبيه: خصم كبير، مرتجع، أو سحب من الخزينة
        const why = r.type === 'sale' && r.disc_pct >= lim ? `⚠ خصم كبير ${r.disc_pct}%` : r.type === 'return' ? '⚠ مرتجع' : r.type === 'withdraw' ? '⚠ سحب من الخزينة' : r.type === 'loan_in' ? '⚠ اقتراض' : r.type === 'loan_out' ? '⚠ سلفة خرجت' : '';
        toastLive(`${why ? `<div class="bad" style="font-weight:800">${why}</div>` : ''}<div class="small faint">${esc(branchOf(r.branch_id).name || '')} · ${esc(r.user_name)} · <span class="num">${r.date.slice(11, 16)}</span></div><div><b>${n}</b> ${r.doc_no ? `<span class="num">${esc(r.doc_no)}</span>` : ''} — ${M(r.amount)}</div><div style="margin-top:2px">${paysHTML(r.pays, '<span class="badge warn">آجل</span>')}</div>`, !!why, () => actClick(r));
      }
      // تنبيه: أصناف وصلت لحد الطلب بعد آخر بيع
      const lowNew = knownLow ? d.low_stock.filter((id) => !knownLow.has(id)) : [];
      knownLow = new Set(d.low_stock);
      if (lowNew.length) toastLive(`<div class="warn" style="font-weight:800">📦 أصناف وصلت لحد الطلب</div>${lowNew.slice(0, 5).map((id) => `<div class="small">• ${esc(d.low_names[id] || '')}</div>`).join('')}`, true, () => (location.hash = '#/products'));
      if (fresh.length || lowNew.length) {
        beep();
        const a = $('nav a[data-v=live]');
        if (a && S.view !== 'live') { let b = $('.nbadge', a); if (!b) { b = document.createElement('span'); b.className = 'nbadge'; a.append(b); } b.textContent = (+b.textContent || 0) + fresh.length; }
      }
    } catch {}
  };
  tick(); S.notifyTimer = setInterval(tick, 10000);
}
function beep() {
  if (!LS.get('pos_sound', true)) return;
  try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.08, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.35); } catch {}
}

/* =====================================================================
   نقطة البيع
   ===================================================================== */
function posState() { const b = curBranch(); if (!S.pos[b]) S.pos[b] = { cart: [], customer: null, disc: 0, discMode: 'amt', notes: '', cat: '' }; return S.pos[b]; }
VIEWS.pos = async (el) => {
  if (!needBranch(el)) return;
  const st = posState();
  const [prods, custs, shift] = await Promise.all([products(true), customers(), GET('/api/shift/current', bq())]);
  const cats = [...new Set(prods.map((p) => p.category).filter(Boolean))];
  const allowNeg = S.settings.allow_negative_stock;
  el.innerHTML = `
    ${shift || !isAdmin() ? '' : `<div class="card" style="padding:10px 14px;margin-bottom:12px;background:var(--warn-soft);border-color:#fde68a" id="noshift"><div class="row"><b class="warn">مفيش وردية مفتوحة.</b><span class="muted small">افتح وردية عشان تقدر تقفل الدرج آخر اليوم وتعرف العجز/الزيادة.</span><span class="sp"></span><button class="btn sm" id="openShift">فتح وردية</button></div></div>`}
    <div class="pos">
      <div class="left">
        <div class="search">${icon('search')}<input class="in" id="ps" placeholder="ابحث باسم الصنف أو الكود أو امسح الباركود…  (F2)" autocomplete="off"></div>
        <div id="filters"></div>
        <div class="pgrid" id="pg"></div>
      </div>
      <div class="card cart">
        <div class="hd" style="flex-wrap:wrap">${icon('receipt')} فاتورة جديدة <span class="sp"></span><button class="btn sm" id="holdBtn" title="تعليق الفاتورة والبيع لعميل تاني">⏸ تعليق</button><button class="btn sm" id="heldBtn"></button><button class="btn sm bad" id="clr">مسح</button></div>
        <div style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div class="row" style="flex-wrap:nowrap"><div style="flex:1;position:relative"><input class="in" id="cust" placeholder="العميل: نقدي (اكتب للبحث بالاسم أو الموبايل)" autocomplete="off"></div><button class="btn" id="newCust" title="عميل جديد">${icon('plus')}</button></div>
          <div id="custInfo" class="small muted" style="margin-top:4px"></div>
        </div>
        <div class="items" id="ci"></div>
        <div class="tot">
          <div class="r"><span>الإجمالي</span><b id="tSub" class="num"></b></div>
          <div class="r" style="align-items:center;gap:6px"><span>خصم</span><span class="sp"></span><input class="in sm" type="number" id="disc" min="0" step="any" style="width:90px" value="${st.disc || ''}"><select class="in sm" id="discMode" style="width:auto">${opt('amt', 'ج.م', st.discMode)}${opt('pct', '%', st.discMode)}</select></div>
          ${!isAdmin() ? `<div class="small faint">أقصى خصم مسموح: ${S.user.perms.max_discount || 0}%</div>` : ''}
          <div class="r grand"><span>الصافي</span><span id="tTot" class="num"></span></div>
          <input class="in sm" id="notes" placeholder="ملاحظات على الفاتورة (اختياري)" value="${esc(st.notes)}" style="margin:6px 0">
          <button class="btn ok lg" id="pay" style="width:100%">دفع وحفظ الفاتورة <span class="kbd" style="color:#d1fae5;border-color:#6ee7b7">F9</span></button>
        </div>
      </div>
    </div>`;
  const ps = $('#ps', el), pg = $('#pg', el);
  // فلتر الشركة + التصنيف (بيتلفّوا على كذا سطر، وجنب كل واحد العدد)
  const brandOf = (p) => brandLabel(p.brand);
  const brands = [...new Set(prods.map(brandOf))];
  if (st.brand && !brands.includes(st.brand)) st.brand = '';
  const renderFilters = () => {
    const inBrand = prods.filter((p) => !st.brand || brandOf(p) === st.brand);
    const catCount = {}; for (const p of inBrand) if (p.category) catCount[p.category] = (catCount[p.category] || 0) + 1;
    if (st.cat && !catCount[st.cat]) st.cat = '';
    const catList = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a]);
    $('#filters', el).innerHTML = (brands.length > 1 ? `<div class="chips brands">${[['', 'كل الشركات', prods.length], ...brands.map((b) => [b, b, prods.filter((p) => brandOf(p) === b).length])].map(([k, t, n]) => `<button class="chip brand ${st.brand === k ? 'on' : ''}" data-b="${esc(k)}">${esc(t)} <span class="cnt">${n}</span></button>`).join('')}</div>` : '')
      + `<div class="chips cats ${st.catsOpen ? 'open' : ''}" id="cats"><button class="chip ${st.cat ? '' : 'on'}" data-c="">الكل <span class="cnt">${inBrand.length}</span></button>${catList.map((c) => `<button class="chip ${st.cat === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)} <span class="cnt">${catCount[c]}</span></button>`).join('')}</div>`
      + (catList.length > 8 ? `<button class="btn sm ghost" id="catsMore" style="margin:-4px 0 6px">${st.catsOpen ? '▲ أقل' : `▼ كل التصنيفات (${catList.length})`}</button>` : '');
    const more = $('#catsMore', el); if (more) more.onclick = () => { st.catsOpen = !st.catsOpen; renderFilters(); };
  };
  const visible = () => { const q = ps.value.trim().toLowerCase(); return prods.filter((p) => (!st.brand || brandOf(p) === st.brand) && (!st.cat || p.category === st.cat) && (!q || prodMatch(p, q))); };
  const renderGrid = () => {
    const list = visible();
    pg.innerHTML = list.slice(0, 300).map((p) => `<button class="pcard ${p.stock <= 0 ? 'out' : ''}" data-id="${p.id}" style="--cc:${catColor(p.category)}"><span class="nm">${esc(p.name)}</span><span class="row between"><span class="pr"><span class="num">${money(p.price)}</span> <span class="faint small">ج.م</span></span><span class="stk ${p.stock <= 0 ? 'out' : p.stock <= p.min_stock ? 'low' : ''}">${p.stock <= 0 ? 'نفذ' : 'متاح ' + qf(p.stock)}</span></span><span class="st">كود ${esc(p.code)}${p.category ? ' · ' + esc(p.category) : ''}</span></button>`).join('')
      + (list.length > 300 ? `<div class="faint small" style="grid-column:1/-1;text-align:center">يظهر أول 300 صنف — اختار تصنيف أو اكتب للبحث</div>` : '') + (!list.length ? '<div class="empty" style="grid-column:1/-1">لا توجد أصناف مطابقة</div>' : '');
  };
  // سعر الجملة/المقاولين لو العميل جملة والصنف ليه سعر جملة
  const isWholesale = () => !!(st.customer && st.customer.tier === 'wholesale');
  const priceFor = (retail, price2) => (isWholesale() && price2 > 0 ? price2 : retail);
  const add = (p, qty = 1) => {
    const ex = st.cart.find((x) => x.product_id === p.id);
    const base = priceFor(p.price, p.price2);
    if (ex) ex.qty = r2(+ex.qty + qty); else st.cart.push({ product_id: p.id, name: p.name, price: base, base, retail: p.price, price2: p.price2 || 0, qty, stock: p.stock, unit: p.unit });
    renderCart(true);
  };
  const applyTier = () => { for (const x of st.cart) { const nb = priceFor(x.retail ?? x.base, x.price2); if (x.price === x.base) x.price = nb; x.base = nb; } renderCart(); };
  const subtotal = () => r2(st.cart.reduce((s, x) => s + x.qty * x.price, 0));
  const discAmt = () => { const s = subtotal(); const v = +st.disc || 0; return r2(Math.min(s, st.discMode === 'pct' ? (s * v) / 100 : v)); };
  const renderCart = (scroll) => {
    const ci = $('#ci', el);
    ci.innerHTML = st.cart.length ? st.cart.map((x, i) => {
      const over = !allowNeg && x.qty > x.stock;
      return `<div class="cline" data-i="${i}"><div class="nm">${esc(x.name)}${x.retail != null && x.base !== x.retail ? ' <span class="badge ok">سعر جملة</span>' : ''}</div><b class="num">${money(x.qty * x.price)}</b>
        <div class="ctl"><button class="qbtn" data-a="m">−</button><input class="in sm" type="number" step="any" min="0" data-a="q" value="${x.qty}"><button class="qbtn" data-a="p">+</button>
        <span class="faint small">×</span>${can('change_price') ? `<input class="in sm" type="number" step="any" min="0" data-a="pr" value="${x.price}" style="width:90px">` : `<span class="num small">${money(x.price)}</span>`}
        <span class="sp"></span>${over ? `<span class="bad small">المتاح ${qf(x.stock)}</span>` : ''}<button class="btn ghost sm" data-a="x" title="حذف">✕</button></div></div>`;
    }).join('') : `<div class="empty-cart">${icon('scan')}<b>الفاتورة فاضية</b><span class="small">دوس على صنف أو امسح الباركود — اختصار البحث F2</span></div>`;
    $('#tSub', el).textContent = money(subtotal());
    $('#tTot', el).textContent = money(subtotal() - discAmt());
    if (scroll) ci.scrollTop = ci.scrollHeight;
  };
  const renderCust = () => {
    const c = st.customer;
    $('#cust', el).value = c ? c.name : '';
    $('#custInfo', el).innerHTML = c ? `${c.tier === 'wholesale' ? '<span class="badge ok">عميل جملة / مقاول</span> ' : ''}${c.phone ? esc(c.phone) + ' · ' : ''}الرصيد الحالي: ${M(c.balance, c.balance > 0 ? 'warn' : '')} <button class="btn ghost sm" id="unCust">إلغاء</button>` : '';
    const u = $('#unCust', el); if (u) u.onclick = () => { st.customer = null; renderCust(); applyTier(); };
  };
  // ===== تعليق الفاتورة (العميل مستني خلطة اللون مثلاً) =====
  const heldKey = 'pos_held_' + curBranch();
  const held = () => LS.get(heldKey, []);
  const renderHeldBtn = () => { const n = held().length; $('#heldBtn', el).innerHTML = `${icon('clock')}المعلقة${n ? ` <b class="nbadge" style="margin:0">${n}</b>` : ''}`; };
  const holdCurrent = () => {
    if (!st.cart.length) return toast('الفاتورة فاضية', 'bad');
    const list = held(); list.push({ id: Date.now(), at: new Date().toLocaleTimeString('en-GB').slice(0, 5), customer: st.customer, cart: st.cart, disc: st.disc, discMode: st.discMode, notes: st.notes, total: r2(subtotal() - discAmt()) });
    LS.set(heldKey, list);
    st.cart = []; st.customer = null; st.disc = 0; st.notes = '';
    toast('اتعلقت الفاتورة — تقدر ترجعلها من "المعلقة"', 'ok'); route();
  };
  const showHeld = () => {
    const list = held();
    const m = modal({ title: `الفواتير المعلقة (${list.length})`, wide: 'wide', body: list.length ? `<div class="grid" style="gap:10px">${list.map((h) => `<div class="card" style="padding:12px 14px"><div class="row"><b>${esc(h.customer ? h.customer.name : 'عميل نقدي')}</b><span class="badge">${h.cart.length} صنف</span><span class="faint small num">${h.at}</span><span class="sp"></span><b class="num">${money(h.total)}</b><button class="btn sm pri" data-r="${h.id}">استرجاع</button><button class="btn sm bad" data-d="${h.id}">حذف</button></div><div class="small muted" style="margin-top:4px">${esc(h.cart.map((x) => `${x.name} ×${qf(x.qty)}`).join('، '))}</div>${h.notes ? `<div class="small faint">${esc(h.notes)}</div>` : ''}</div>`).join('')}</div>` : '<div class="empty">مفيش فواتير معلقة</div>', buttons: [{ t: 'إغلاق' }] });
    $$('[data-r]', m.mb).forEach((b) => (b.onclick = async () => {
      if (st.cart.length && !(await confirmBox('الفاتورة الحالية فيها أصناف — هتتعلّق هي كمان وتسترجع المختارة. موافق؟'))) return;
      const all = held(); const h = all.find((x) => x.id === +b.dataset.r); let rest = all.filter((x) => x.id !== h.id);
      if (st.cart.length) rest.push({ id: Date.now(), at: new Date().toLocaleTimeString('en-GB').slice(0, 5), customer: st.customer, cart: st.cart, disc: st.disc, discMode: st.discMode, notes: st.notes, total: r2(subtotal() - discAmt()) });
      LS.set(heldKey, rest); Object.assign(st, { cart: h.cart, customer: h.customer, disc: h.disc, discMode: h.discMode, notes: h.notes }); m.close(); route();
    }));
    $$('[data-d]', m.mb).forEach((b) => (b.onclick = async () => { if (!(await confirmBox('حذف الفاتورة المعلقة؟', 'حذف', 'bad'))) return; LS.set(heldKey, held().filter((x) => x.id !== +b.dataset.d)); m.close(); renderHeldBtn(); showHeld(); }));
  };
  // events
  pg.onclick = (e) => { const b = e.target.closest('[data-id]'); if (!b) return; add(prods.find((p) => p.id === +b.dataset.id)); };
  ps.oninput = debounce(renderGrid, 120);
  ps.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const q = ps.value.trim(); if (!q) return;
      const ex = prods.find((p) => prodExact(p, q)); const list = visible();
      const p = ex || (list.length ? list[0] : null);
      if (p) { add(p); ps.value = ''; renderGrid(); } else toast('مفيش صنف بالكود/الباركود ده', 'bad');
    } else if (e.key === 'Escape') { ps.value = ''; renderGrid(); }
  };
  $('#filters', el).onclick = (e) => {
    const b = e.target.closest('[data-b]'); if (b) { st.brand = b.dataset.b; st.cat = ''; renderFilters(); renderGrid(); return; }
    const c = e.target.closest('[data-c]'); if (c) { st.cat = c.dataset.c; renderFilters(); renderGrid(); }
  };
  renderFilters();
  $('#ci', el).addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return; const i = +a.closest('.cline').dataset.i; const x = st.cart[i];
    if (a.dataset.a === 'p') x.qty = r2(+x.qty + 1); else if (a.dataset.a === 'm') { x.qty = r2(+x.qty - 1); if (x.qty <= 0) st.cart.splice(i, 1); } else if (a.dataset.a === 'x') st.cart.splice(i, 1); else return;
    renderCart();
  });
  $('#ci', el).addEventListener('change', (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return; const i = +a.closest('.cline').dataset.i; const x = st.cart[i];
    if (a.dataset.a === 'q') { const v = r2(a.value); if (v > 0) x.qty = v; else st.cart.splice(i, 1); }
    if (a.dataset.a === 'pr') { const v = r2(a.value); if (v >= 0) x.price = v; }
    renderCart();
  });
  $('#disc', el).oninput = (e) => { st.disc = e.target.value; $('#tTot', el).textContent = money(subtotal() - discAmt()); };
  $('#discMode', el).onchange = (e) => { st.discMode = e.target.value; renderCart(); };
  $('#notes', el).oninput = (e) => (st.notes = e.target.value);
  const posAtt = attachUI($('#notes', el));
  $('#clr', el).onclick = async () => { if (st.cart.length && !(await confirmBox('مسح كل الأصناف من الفاتورة؟', 'مسح', 'bad'))) return; st.cart = []; st.customer = null; st.disc = 0; st.notes = ''; route(); };
  picker($('#cust', el), { items: () => S.cache['c' + curBranch()] || custs, match: (c, q) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q), label: (c) => esc(c.name), sub: (c) => `${esc(c.phone || '')} ${c.balance ? '· ' + money(c.balance) : ''}`, onPick: (c) => { st.customer = c.name === 'عميل نقدي' ? null : c; renderCust(); applyTier(); ps.focus(); } });
  $('#cust', el).addEventListener('blur', () => setTimeout(renderCust, 200));
  $('#newCust', el).onclick = () => customerForm(null, (c) => { st.customer = c; renderCust(); applyTier(); });
  $('#holdBtn', el).onclick = holdCurrent; $('#heldBtn', el).onclick = showHeld; renderHeldBtn();
  if ($('#openShift', el)) $('#openShift', el).onclick = () => openShiftModal(() => route());
  const checkout = () => {
    if (!st.cart.length) return toast('الفاتورة فاضية', 'bad');
    const total = r2(subtotal() - discAmt());
    payModal(total, st, async (pays, print) => {
      const body = { branch_id: curBranch(), customer_id: st.customer ? st.customer.id : null, items: st.cart.map((x) => ({ product_id: x.product_id, qty: x.qty, price: x.price })), discount: discAmt(), pays, notes: st.notes };
      const s = await POST('/api/sales', body);
      await posAtt.upload('sale', s.id);
      st.cart = []; st.customer = null; st.disc = 0; st.notes = '';
      S.cache['c' + curBranch()] = null;
      if (print) printSale(s);
      route();
      setTimeout(() => saleDone(s), 50);
      return s;
    });
  };
  $('#pay', el).onclick = checkout;
  S.posKeys = (e) => {
    if (S.view !== 'pos' || $('.ov')) return;
    if (e.key === 'F2') { e.preventDefault(); ps.focus(); ps.select(); }
    if (e.key === 'F9') { e.preventDefault(); checkout(); }
  };
  renderGrid(); renderCart(); renderCust(); ps.focus();
};
document.addEventListener('keydown', (e) => S.posKeys && S.posKeys(e));

function payModal(total, st, submit) {
  const autoPrint = LS.get('pos_autoprint', true);
  const hasCust = !!st.customer;
  modal({
    title: 'الدفع',
    body: `<div style="text-align:center;margin-bottom:14px"><div class="muted">المطلوب</div><div class="num" style="font-size:34px;font-weight:800">${money(total)}</div></div>
      <div class="mtiles">${METHODS().map(([k, v]) => `<button type="button" class="mtile" data-full="${k}" style="--mc:${M_COLOR[k] || '#475569'}">${esc(v)}</button>`).join('')}</div>
      <div class="row" style="margin:6px 0 10px"><span class="small muted">دوس على طريقة الدفع، أو</span><button type="button" class="btn sm ghost" id="pSplit" style="color:var(--pri)">قسّم المبلغ على أكتر من طريقة</button></div>
      ${METHODS().map(([k, v]) => `<div class="prow row field" data-row="${k}" style="flex-wrap:nowrap"><label class="f" style="width:110px;margin:0"><span class="dot" style="background:${M_COLOR[k] || '#475569'}"></span> ${esc(v)}</label><input class="in" type="number" step="any" min="0" data-m="${k}" placeholder="المبلغ" ${k === 'cash' ? 'autofocus' : ''}>${k === 'cash' ? '<span style="width:46%;flex:none"></span>' : `<input class="in" data-ref="${k}" placeholder="رقم العملية / رقم المحوِّل" style="width:46%;flex:none" dir="ltr">`}</div>`).join('')}
      <div class="card" style="padding:10px 14px;background:#f8fafc"><div class="row between"><span>المدفوع</span><b id="pPaid" class="num"></b></div><div class="row between" id="pChRow"><span>الباقي للعميل</span><b id="pCh" class="num ok"></b></div><div class="row between" id="pDueRow"><span>متبقي آجل</span><b id="pDue" class="num warn"></b></div></div>
      <div id="pWarn" class="small bad" style="margin-top:6px"></div>
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="pPrint" ${autoPrint ? 'checked' : ''}> طباعة الفاتورة بعد الحفظ</label>`,
    buttons: [{ t: 'تأكيد وحفظ (Enter)', cls: 'ok pri', fn: async (mb) => {
      const pays = $$('[data-m]', mb).map((i) => { const r = $(`[data-ref="${i.dataset.m}"]`, mb); return { method: i.dataset.m, amount: +i.value || 0, ref: r ? r.value.trim() : '' }; }).filter((p) => p.amount > 0);
      const print = $('#pPrint', mb).checked; LS.set('pos_autoprint', print);
      await submit(pays, print);
    } }, { t: 'رجوع' }],
    onOpen: (mb) => {
      const calc = () => {
        const paid = r2($$('[data-m]', mb).reduce((s, i) => s + (+i.value || 0), 0));
        const ch = r2(paid - total), due = r2(total - paid);
        $('#pPaid', mb).textContent = money(paid);
        $('#pCh', mb).textContent = money(Math.max(0, ch)); $('#pChRow', mb).style.display = ch > 0 ? '' : 'none';
        $('#pDue', mb).textContent = money(Math.max(0, due)); $('#pDueRow', mb).style.display = due > 0.009 ? '' : 'none';
        $('#pWarn', mb).textContent = due > 0.009 && !hasCust ? 'لو فيه مبلغ آجل لازم تختار عميل مسجل قبل الدفع.' : due > 0.009 && !can('credit_sale') ? 'ليس لديك صلاحية البيع الآجل.' : '';
      };
      let split = false;
      const showRows = () => {
        $$('.prow', mb).forEach((r) => r.classList.toggle('hide', !split && !(+$('[data-m]', r).value > 0)));
        $$('.mtile', mb).forEach((t) => t.classList.toggle('on', +$(`[data-m=${t.dataset.full}]`, mb).value > 0));
      };
      $$('[data-m]', mb).forEach((i) => (i.oninput = () => { calc(); $$('.mtile', mb).forEach((t) => t.classList.toggle('on', +$(`[data-m=${t.dataset.full}]`, mb).value > 0)); }));
      $$('[data-full]', mb).forEach((b) => (b.onclick = () => {
        $$('[data-m]', mb).forEach((i) => (i.value = '')); const inp = $(`[data-m=${b.dataset.full}]`, mb); inp.value = total; calc(); showRows();
        const ref = $(`[data-ref="${b.dataset.full}"]`, mb); setTimeout(() => (ref || inp).focus(), 30);
      }));
      $('#pSplit', mb).onclick = () => { split = true; showRows(); };
      $('[data-m=cash]', mb).value = total; calc(); showRows(); setTimeout(() => $('[data-m=cash]', mb).select(), 50);
    },
  });
}

/* =====================================================================
   الفواتير
   ===================================================================== */
VIEWS.sales = async (el) => {
  const st = S.salesSt || (S.salesSt = { ...newRange('today'), kind: '', q: '' });
  el.innerHTML = `<div class="toolbar">${rangeHTML(st)}<select class="in" id="sk">${opt('', 'الكل', st.kind)}${opt('sale', 'بيع', st.kind)}${opt('return', 'مرتجع', st.kind)}</select><input class="in" id="sq" placeholder="رقم الفاتورة أو اسم العميل" value="${esc(st.q)}" style="width:220px"><span class="sp"></span><button class="btn" id="csv">${icon('download')}Excel</button></div>
    <div class="grid g4" id="sum" style="margin-bottom:14px"></div><div id="tb"></div>`;
  let rows = [];
  const cols = [
    { t: 'رقم', f: (r) => `<b class="num">${r.doc_no}</b>${r.att ? ' <span title="فيها صور مرفقة">📎</span>' : ''}`, v: (r) => r.doc_no },
    ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id), v: (r) => branchOf(r.branch_id).name }] : []),
    { t: 'التاريخ', f: (r) => dt(r.date), v: (r) => r.date },
    { t: 'النوع', f: (r) => (r.kind === 'return' ? '<span class="badge bad">مرتجع</span>' : '<span class="badge pri">بيع</span>'), v: (r) => (r.kind === 'return' ? 'مرتجع' : 'بيع') },
    { t: 'العميل', k: 'customer' }, { t: 'الكاشير', k: 'user_name' },
    { t: 'الإجمالي', n: 1, f: (r) => M(r.total), v: (r) => r.total },
    { t: 'المدفوع', n: 1, f: (r) => M(r.paid), v: (r) => r.paid },
    { t: 'آجل', n: 1, f: (r) => (r.total - r.paid > 0.009 ? M(r.total - r.paid, 'warn') : ''), v: (r) => r2(r.total - r.paid) },
    { t: 'الدفع', f: (r) => paysHTML(r.pays, r.paid ? '' : '<span class="badge warn">آجل</span>'), v: (r) => r.pays.map((p) => `${mName(p.method)} ${p.amount}${p.ref ? ' #' + p.ref : ''}`).join(' + ') || 'آجل' },
    { t: 'الحالة', f: (r) => (r.status === 'void' ? '<span class="badge bad">ملغاة</span>' : '<span class="badge ok">سليمة</span>'), v: (r) => (r.status === 'void' ? 'ملغاة' : 'سليمة') },
  ];
  const load = async () => {
    rows = await GET('/api/sales', bq({ from: st.from, to: st.to, kind: st.kind, q: st.q }));
    const ok = rows.filter((r) => r.status === 'ok');
    const sales = ok.filter((r) => r.kind === 'sale'), rets = ok.filter((r) => r.kind === 'return');
    const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
    $('#sum', el).innerHTML = stat('المبيعات', M(sum(sales, 'total')), `${sales.length} فاتورة`) + stat('المرتجعات', M(sum(rets, 'total')), `${rets.length} مرتجع`) + stat('الصافي', M(sum(sales, 'total') - sum(rets, 'total'))) + stat('آجل على العملاء', M(sum(sales, 'total') - sum(sales, 'paid')));
    mountTable($('#tb', el), cols, rows, { click: (r) => saleModal(r.id, load), rowCls: (r) => (r.status === 'void' ? 'void' : ''), empty: 'لا توجد فواتير في الفترة دي' });
  };
  bindRange(el, st, load);
  $('#sk', el).onchange = (e) => { st.kind = e.target.value; load(); };
  $('#sq', el).oninput = debounce((e) => { st.q = e.target.value.trim(); load(); }, 300);
  $('#csv', el).onclick = () => exportCSV('فواتير-البيع', cols, rows);
  await load();
};
async function saleModal(id, onChange) {
  const s = await GET('/api/sales/' + id);
  const isSale = s.kind === 'sale';
  const sc = can('see_cost');
  const cost = r2(s.items.reduce((a, i) => a + i.qty * (i.cost || 0), 0));
  const m = modal({
    title: `${isSale ? 'فاتورة بيع' : 'مرتجع مبيعات'} ${s.doc_no}`, wide: 'wide',
    body: `<div class="grid g4" style="margin-bottom:12px;font-size:13px">
        <div><div class="faint small">التاريخ</div>${dt(s.date)}</div><div><div class="faint small">المعرض</div>${brName(s.branch_id)}</div>
        <div><div class="faint small">الكاشير</div>${esc(s.user_name)}</div><div><div class="faint small">العميل</div>${esc(s.cust_name || s.customer_name || 'نقدي')} ${s.customer_id && s.customer_balance != null ? `<div class="small">رصيده ${M(s.customer_balance)}</div>` : ''}</div></div>
      ${s.status === 'void' ? '<div class="badge bad" style="margin-bottom:10px">هذه الفاتورة ملغاة</div>' : ''}
      ${s.ref_doc ? `<div class="small muted" style="margin-bottom:8px">مرتجع على فاتورة <b>${esc(s.ref_doc)}</b></div>` : ''}
      <div id="it"></div>
      <div class="grid g2" style="margin-top:12px"><div>${s.notes ? `<div class="small muted">ملاحظات: ${esc(s.notes)}</div>` : ''}
        ${s.returns && s.returns.length ? `<div class="small" style="margin-top:6px">مرتجعات على الفاتورة: ${s.returns.map((r) => `<a href="#" data-r="${r.id}">${r.doc_no}</a> (${money(r.total)})`).join('، ')}</div>` : ''}</div>
        <table class="t" style="font-size:13px">${[['الإجمالي', M(s.subtotal)], s.discount ? ['الخصم', M(s.discount)] : null, ['الصافي', `<b>${M(s.total)}</b>`], ...s.pays.map((p) => [(isSale ? 'مدفوع ' : 'مُسترد ') + mBadge(p.method, null, p.ref), M(p.amount)]), s.total - s.paid > 0.009 ? [isSale ? 'آجل' : 'خصم من حساب العميل', M(s.total - s.paid, 'warn')] : null, sc && isSale ? ['التكلفة / مجمل الربح', `${M(cost)} / ${M(s.total - cost, 'ok')}`] : null].filter(Boolean).map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</table></div>`,
    buttons: [
      { t: `${icon('print')} طباعة`, cls: 'pri', fn: () => { printSale(s); return false; } },
      { t: 'طباعة A4', fn: () => { printSale(s, 'a4'); return false; } },
      { t: '💬 واتساب', fn: () => { sendSaleWhatsApp(s); return false; } },
      ...(isSale && s.status === 'ok' && can('returns') ? [{ t: 'عمل مرتجع', fn: (mb, close) => { close(); returnModal(s, onChange); } }] : []),
      ...(isAdmin() && s.status === 'ok' ? [{ t: 'إلغاء الفاتورة', cls: 'bad', fn: async (mb, close) => { const r = await promptBox('إلغاء الفاتورة', 'سبب الإلغاء (المخزون والخزينة هيرجعوا زي ما كانوا):'); if (r == null) return false; await POST(`/api/sales/${s.id}/void`, { reason: r }); toast('تم إلغاء الفاتورة', 'ok'); dropCache(); close(); onChange && onChange(); } }] : []),
      { t: 'إغلاق' },
    ],
  });
  mountTable($('#it', m.mb), [{ t: '#', f: (r) => s.items.indexOf(r) + 1 }, { t: 'الصنف', k: 'name' }, { t: 'الكمية', n: 1, f: (r) => Q(r.qty) }, { t: 'السعر', n: 1, f: (r) => M(r.price) }, ...(sc ? [{ t: 'التكلفة', n: 1, f: (r) => M(r.cost) }] : []), { t: 'الإجمالي', n: 1, f: (r) => M(r.total) }, ...(isSale ? [{ t: 'مرتجع', n: 1, f: (r) => (r.returned ? Q(r.returned) : '') }] : [])], s.items);
  $$('[data-r]', m.mb).forEach((a) => (a.onclick = (e) => { e.preventDefault(); saleModal(+a.dataset.r, onChange); }));
  const sa = document.createElement('div'); sa.style.marginTop = '12px'; m.mb.append(sa); attView('sale', s.id, sa);
}
function returnModal(s, onChange) {
  const factor = s.subtotal > 0 ? s.total / s.subtotal : 1;
  const lines = s.items.map((i) => ({ ...i, max: r2(i.qty - (i.returned || 0)), unit: (i.total / i.qty) * factor }));
  modal({
    title: `مرتجع على الفاتورة ${s.doc_no}`, wide: 'wide',
    body: `<p class="muted small" style="margin-top:0">اكتب الكمية المرتجعة لكل صنف. السعر محسوب بعد خصم الفاتورة.</p>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>الصنف</th><th class="n">المباع</th><th class="n">مرتجع قبل كده</th><th class="n">سعر الوحدة</th><th class="n">الكمية المرتجعة</th></tr></thead><tbody>
      ${lines.map((l, i) => `<tr><td>${esc(l.name)}</td><td class="n">${qf(l.qty)}</td><td class="n">${qf(l.returned || 0)}</td><td class="n">${money(l.unit)}</td><td class="n"><input class="in sm" type="number" min="0" max="${l.max}" step="any" data-i="${i}" style="width:90px" ${l.max <= 0 ? 'disabled' : ''}></td></tr>`).join('')}</tbody></table></div>
      <div class="grid g3" style="margin-top:12px"><div><label class="f">إجمالي المرتجع</label><div class="num" style="font-size:22px;font-weight:800" id="rt">0.00</div></div>
      <div><label class="f">طريقة رد المبلغ</label><select class="in" id="rm">${methodOpts('cash')}</select></div>
      <div><label class="f">المبلغ المُسترد للعميل</label><input class="in" type="number" min="0" step="any" id="rf" ${s.customer_id ? '' : 'readonly'}><div class="small faint">${s.customer_id ? 'الباقي يتخصم من حساب العميل' : 'لازم يترد بالكامل (عميل نقدي)'}</div></div></div>
      <div class="field" style="margin-top:10px"><label class="f">سبب المرتجع / ملاحظات</label><input class="in" id="rn"></div>`,
    buttons: [{ t: 'حفظ المرتجع', cls: 'pri', fn: async (mb) => {
      const items = $$('[data-i]', mb).map((i) => ({ sale_item_id: lines[+i.dataset.i].id, qty: +i.value || 0 })).filter((x) => x.qty > 0);
      if (!items.length) throw new Error('اكتب كمية مرتجعة لصنف واحد على الأقل');
      const r = await POST(`/api/sales/${s.id}/return`, { items, method: $('#rm', mb).value, refund: $('#rf', mb).value === '' ? null : +$('#rf', mb).value, notes: $('#rn', mb).value });
      if (mb._att) await mb._att.upload('sale', r.id);
      toast(`تم حفظ المرتجع ${r.doc_no}`, 'ok'); dropCache(); printSale(r); onChange && onChange();
    } }, { t: 'إلغاء' }],
    onOpen: (mb) => {
      const calc = () => { let t = 0; $$('[data-i]', mb).forEach((i) => { const l = lines[+i.dataset.i]; let v = +i.value || 0; if (v > l.max) { v = l.max; i.value = v; } t += v * l.unit; }); t = r2(t); $('#rt', mb).textContent = money(t); $('#rf', mb).value = t; };
      $$('[data-i]', mb).forEach((i) => (i.oninput = calc));
      mb._att = attachUI($('#rn', mb));
    },
  });
}

/* =====================================================================
   الأصناف
   ===================================================================== */
VIEWS.products = async (el) => {
  const st = S.prodSt || (S.prodSt = { q: '', cat: '', low: false, inactive: false });
  const sc = can('see_cost');
  el.innerHTML = `<div class="toolbar"><input class="in" id="pq" placeholder="بحث بالاسم / الكود / الباركود" value="${esc(st.q)}" style="width:240px"><select class="in" id="pc"></select>
    <label class="chk"><input type="checkbox" id="pl" ${st.low ? 'checked' : ''}> النواقص فقط</label>${isAdmin() ? `<label class="chk"><input type="checkbox" id="pi" ${st.inactive ? 'checked' : ''}> إظهار الموقوفة</label>` : ''}
    <span class="sp"></span>${can('products') ? `<button class="btn pri" id="pa">${icon('plus')}صنف جديد</button><button class="btn" id="pbulk">${icon('layers')}إضافة أصناف كتير</button>` : ''}${isAdmin() ? `<button class="btn" id="pimp">${icon('upload')}استيراد</button>` : ''}<button class="btn" id="pcsv">${icon('download')}Excel</button><button class="btn" id="pprn">${icon('print')}قائمة أسعار</button>${can('products') ? `<button class="btn" id="pbc">${icon('scan')}ملصقات باركود</button>` : ''}</div>
    <div class="grid g4" id="psum" style="margin-bottom:14px"></div><div id="ptb"></div>`;
  let all = [], rows = [];
  const cols = [
    { t: 'الكود', f: (r) => `<span class="num">${esc(r.code)}</span>`, v: (r) => r.code },
    ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id), v: (r) => branchOf(r.branch_id).name }] : []),
    { t: 'الصنف', f: (r) => `<b>${esc(r.name)}</b>${r.barcode ? `<div class="faint small num">${esc(r.barcode)}</div>` : ''}${r.active ? '' : ' <span class="badge">موقوف</span>'}`, v: (r) => r.name },
    { t: 'التصنيف', k: 'category' }, { t: 'الوحدة', k: 'unit' },
    { t: 'الرصيد', n: 1, f: (r) => `<b class="num ${r.stock <= 0 ? 'bad' : r.stock <= r.min_stock ? 'warn' : ''}">${qf(r.stock)}</b>`, v: (r) => r.stock },
    ...(sc ? [{ t: 'التكلفة', n: 1, f: (r) => M(r.cost), v: (r) => r.cost }] : []),
    { t: 'سعر البيع', n: 1, f: (r) => `<b>${M(r.price)}</b>`, v: (r) => r.price },
    ...(sc ? [{ t: 'هامش', n: 1, f: (r) => (r.cost > 0 ? `<span class="num small">${Math.round(((r.price - r.cost) / r.cost) * 100)}%</span>` : ''), noCsv: 1 }] : []),
    { t: '', noCsv: 1, f: () => `<span class="row" style="flex-wrap:nowrap">${can('products') ? '<button class="btn sm" data-act="edit">تعديل</button>' : ''}<button class="btn sm" data-act="card">كارت الصنف</button></span>` },
  ];
  const filter = () => {
    const q = st.q.toLowerCase();
    rows = all.filter((p) => (st.inactive || p.active) && (!st.cat || p.category === st.cat) && (!st.low || p.stock <= p.min_stock) && (!q || prodMatch(p, q)));
    const val = rows.reduce((s, p) => s + Math.max(0, p.stock) * (sc ? p.cost : p.price), 0);
    $('#psum', el).innerHTML = stat('عدد الأصناف', `<span class="num">${rows.length}</span>`) + stat('أصناف نفذت', `<span class="num bad">${rows.filter((p) => p.stock <= 0).length}</span>`) + stat('وصلت لحد الطلب', `<span class="num warn">${rows.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length}</span>`) + stat(sc ? 'قيمة المخزون بالتكلفة' : 'قيمة المخزون بسعر البيع', M(val));
    mountTable($('#ptb', el), cols, rows, { empty: 'لا توجد أصناف', act: (a, r) => (a === 'edit' ? productForm(r, load) : productCard(r.id)) });
  };
  const load = async () => {
    all = await GET('/api/products', bq({ all: isAdmin() ? 1 : '' }));
    const cats = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
    $('#pc', el).innerHTML = opt('', 'كل التصنيفات', st.cat) + cats.map((c) => opt(c, c, st.cat)).join('');
    S.cache['p' + curBranch()] = null; filter();
  };
  $('#pq', el).oninput = debounce((e) => { st.q = e.target.value.trim(); filter(); }, 150);
  $('#pc', el).onchange = (e) => { st.cat = e.target.value; filter(); };
  $('#pl', el).onchange = (e) => { st.low = e.target.checked; filter(); };
  if ($('#pi', el)) $('#pi', el).onchange = (e) => { st.inactive = e.target.checked; filter(); };
  if ($('#pa', el)) $('#pa', el).onclick = () => { if (!curBranch()) return toast('اختار المعرض من فوق الأول', 'bad'); productForm(null, load, all); };
  if ($('#pimp', el)) $('#pimp', el).onclick = () => {
    if (!curBranch()) return toast('اختار المعرض من فوق الأول', 'bad');
    const m = modal({ title: `استيراد أصناف وأسعار — ${branchOf(curBranch()).name}`, body: `<div class="grid g2">
      <button class="card imp-opt" data-k="pdf"><div style="font-size:30px">📄🖼️</div><b>من قائمة أسعار PDF أو صور</b><span class="small muted">ارفع ملف PDF أو صور لورق الأسعار (حتى لو متصوّرة بالموبايل). البرنامج يقرا الأصناف والأحجام والأسعار وتراجعها قبل الحفظ.</span></button>
      <button class="card imp-opt" data-k="csv"><div style="font-size:30px">📊</div><b>من ملف Excel (CSV)</b><span class="small muted">لو عندك الأصناف في جدول Excel منظم.</span></button></div>`, buttons: [{ t: 'إلغاء' }] });
    $$('.imp-opt', m.mb).forEach((b) => (b.onclick = () => { m.close(); if (b.dataset.k === 'pdf') priceImport(load); else importProducts(load); }));
  };
  $('#pcsv', el).onclick = () => exportCSV('الأصناف', cols, rows);
  if ($('#pbc', el)) $('#pbc', el).onclick = () => barcodeLabels(rows);
  if ($('#pbulk', el)) $('#pbulk', el).onclick = () => { if (!curBranch()) return toast('اختار المعرض من فوق الأول', 'bad'); bulkAdd(all, load); };
  $('#pprn', el).onclick = () => printReport('قائمة الأسعار', `${rows.length} صنف`, tableHTML([{ t: 'الكود', k: 'code' }, { t: 'الصنف', k: 'name' }, { t: 'التصنيف', k: 'category' }, { t: 'السعر', n: 1, f: (r) => money(r.price) }], rows));
  await load();
};
/* اقتراحات التصنيفات والشركات (الموجود + تصنيفات العدة والإكسسوار) */
const EXTRA_CATS = ['عدة وأدوات', 'فرش ورولات', 'إكسسوارات', 'سنفرة وصنفرة', 'شرائط ولواصق', 'تنر ومذيبات', 'أكياس ونايلون حماية', 'بخاخات (سبراي)', 'سيليكون وفوم'];
const catSuggestions = (list) => [...new Set([...(list || S.cache['p' + curBranch()] || []).map((x) => x.category).filter(Boolean), ...EXTRA_CATS])];
const brandSuggestions = (list) => [...new Set([...(list || S.cache['p' + curBranch()] || []).map((x) => x.brand).filter(Boolean), 'جوتن', 'باكين', 'سايبس', 'سكيب', 'جي إل سي', 'ناشونال', 'كابسي', 'توب'])];

/* إضافة أصناف كتير مرة واحدة (عدة، إكسسوار، شركات تانية) */
function bulkAdd(existing, onDone) {
  const sc = can('see_cost'); const br = branchOf(curBranch());
  const blank = () => ({ name: '', brand: '', category: '', unit: '', cost: '', price: '', stock: '', min_stock: '', barcode: '' });
  const rows = Array.from({ length: 6 }, blank);
  const others = S.branches.filter((x) => x.id !== curBranch());
  const m = modal({ title: `إضافة أصناف — ${br.name}`, wide: 'xwide', body: `
    <datalist id="bdc">${catSuggestions(existing).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="bdb">${brandSuggestions(existing).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="bdu">${[...new Set([...(S.settings.units || []), 'قطعة', 'علبة', 'طقم', 'لفة', 'كرتونة', 'دستة', 'متر'])].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row" style="margin-bottom:10px"><span class="muted small">اكتب كل صنف في سطر. الشركة والتصنيف والوحدة بيقترحوا عليك وانت بتكتب. السطور الفاضية بتتجاهل.</span><span class="sp"></span>
      <label class="small muted">تطبيق على الكل:</label><input class="in sm" id="allBrand" list="bdb" placeholder="الشركة" style="width:130px"><input class="in sm" id="allCat" list="bdc" placeholder="التصنيف" style="width:150px"><button class="btn sm" id="applyAll">تطبيق</button></div>
    <div class="tbl-wrap" style="max-height:52vh"><table class="t"><thead><tr><th>#</th><th>اسم الصنف *</th><th>الشركة</th><th>التصنيف</th><th>الوحدة</th>${sc ? '<th>التكلفة</th>' : ''}<th>سعر البيع *</th><th>الرصيد الحالي</th><th>حد الطلب</th><th>الباركود</th><th></th></tr></thead><tbody id="bt"></tbody></table></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" id="addRow">${icon('plus')}5 سطور كمان</button><span class="sp"></span>
      ${isAdmin() && others.length ? `<label class="chk"><input type="checkbox" id="both"> أضفهم كمان في ${esc(others.map((x) => x.name).join(' و'))} (بنفس السعر ومن غير رصيد)</label>` : ''}</div>`,
    buttons: [{ t: 'حفظ الأصناف', cls: 'pri', fn: async (mb) => {
      collect(mb);
      const ok = rows.filter((r) => r.name.trim());
      if (!ok.length) throw new Error('اكتب صنف واحد على الأقل');
      const badPrice = ok.find((r) => !(+r.price > 0)); if (badPrice) throw new Error(`اكتب سعر البيع لـ "${badPrice.name}"`);
      const exist = new Set((existing || []).map((p) => PriceImport.normName(p.name)));
      const dup = ok.filter((r) => exist.has(PriceImport.normName(r.name)));
      if (dup.length && !(await confirmBox(`فيه ${dup.length} صنف اسمه موجود قبل كده (زي "${esc(dup[0].name)}") — هيتحدّث سعره بدل ما يتضاف جديد. تكمّل؟`))) return false;
      const payload = ok.map((r) => ({ name: r.name.trim(), brand: r.brand.trim(), category: r.category.trim(), unit: r.unit.trim() || 'قطعة', cost: +r.cost || 0, price: +r.price, stock: +r.stock || 0, min_stock: r.min_stock === '' ? 1 : +r.min_stock, barcode: r.barcode.trim() }));
      const res = await POST('/api/products/import', { branch_id: curBranch(), rows: payload });
      let msg = `${br.name}: اتضاف ${res.added}${res.updated ? ` واتحدّث ${res.updated}` : ''}`;
      if ($('#both', mb) && $('#both', mb).checked) for (const o of others) { const r2_ = await POST('/api/products/import', { branch_id: o.id, rows: payload.map((x) => ({ ...x, stock: 0, barcode: x.barcode })) }); msg += ` — ${o.name}: اتضاف ${r2_.added}${r2_.updated ? ` واتحدّث ${r2_.updated}` : ''}`; }
      toast(msg + ' ✓', 'ok'); dropCache(); onDone && onDone();
    } }, { t: 'إلغاء' }] });
  const mb = m.mb;
  const F = ['name', 'brand', 'category', 'unit', ...(sc ? ['cost'] : []), 'price', 'stock', 'min_stock', 'barcode'];
  const LIST = { brand: 'bdb', category: 'bdc', unit: 'bdu' }; const NUMS = ['cost', 'price', 'stock', 'min_stock'];
  const W = { name: 230, brand: 110, category: 140, unit: 80, cost: 80, price: 85, stock: 75, min_stock: 65, barcode: 120 };
  const collect = () => $$('#bt tr', mb).forEach((tr, i) => F.forEach((k) => (rows[i][k] = $(`[data-k=${k}]`, tr).value)));
  const render = () => {
    $('#bt', mb).innerHTML = rows.map((r, i) => `<tr><td class="faint">${i + 1}</td>${F.map((k) => `<td><input class="in sm" data-k="${k}" ${LIST[k] ? `list="${LIST[k]}"` : ''} ${NUMS.includes(k) ? 'type="number" step="any" min="0"' : ''} ${k === 'barcode' ? 'dir="ltr"' : ''} value="${esc(r[k])}" style="width:${W[k]}px" ${k === 'name' ? 'placeholder="مثال: رول فوم 9 بوصة"' : ''}></td>`).join('')}<td><button class="btn ghost sm" data-del="${i}">✕</button></td></tr>`).join('');
  };
  mb.addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]'); if (d) { collect(); rows.splice(+d.dataset.del, 1); if (!rows.length) rows.push(blank()); render(); }
  });
  // Enter ينقل للخانة اللي بعدها (وفي آخر سطر يضيف سطر جديد)
  mb.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('#bt input')) return; e.preventDefault(); e.stopPropagation();
    const all = $$('#bt input', mb); const i = all.indexOf(e.target);
    if (i === all.length - 1) { collect(); rows.push(blank()); render(); $$('#bt input', mb)[i + 1].focus(); } else all[i + 1].focus();
  });
  $('#addRow', mb).onclick = () => { collect(); for (let i = 0; i < 5; i++) rows.push(blank()); render(); };
  $('#applyAll', mb).onclick = () => { collect(); const b = $('#allBrand', mb).value.trim(), c = $('#allCat', mb).value.trim(); rows.forEach((r) => { if (b) r.brand = b; if (c) r.category = c; }); render(); };
  render();
  setTimeout(() => $('#bt input', mb).focus(), 50);
}
function productForm(p, onSave, list) {
  const sc = can('see_cost'); const isNew = !p; p = p || { active: 1, unit: 'علبة', min_stock: 0 };
  const cats = catSuggestions(list);
  modal({
    title: isNew ? 'صنف جديد' : 'تعديل صنف', wide: 'wide',
    body: `<datalist id="dlc">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist><datalist id="dlu">${(S.settings.units || []).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="grid g2"><div class="field" style="grid-column:1/-1"><label class="f">اسم الصنف *</label><input class="in" name="name" value="${esc(p.name)}"></div>
      <div class="field"><label class="f">الكود (يتولد تلقائياً لو فاضي)</label><input class="in" name="code" value="${esc(p.code)}" dir="ltr"></div>
      <div class="field"><label class="f">الباركود</label><input class="in" name="barcode" value="${esc(p.barcode)}" dir="ltr" placeholder="امسح الباركود هنا"></div>
      <div class="field"><label class="f">التصنيف</label><input class="in" name="category" list="dlc" value="${esc(p.category)}"></div>
      <div class="field"><label class="f">الوحدة</label><input class="in" name="unit" list="dlu" value="${esc(p.unit)}"></div>
      <div class="field"><label class="f">الشركة / الماركة</label><input class="in" name="brand" list="dlb" value="${esc(p.brand)}" placeholder="جوتن، باكين، سايبس… أو اتركها فاضية للعدة"><datalist id="dlb">${brandSuggestions(list).map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label class="f">حد الطلب (تنبيه النواقص)</label><input class="in" type="number" step="any" name="min_stock" value="${p.min_stock ?? 0}"></div>
      ${sc ? `<div class="field"><label class="f">سعر التكلفة</label><input class="in" type="number" step="any" name="cost" value="${p.cost ?? ''}"></div>` : ''}
      <div class="field"><label class="f">سعر البيع (قطاعي) *</label><input class="in" type="number" step="any" name="price" value="${p.price ?? ''}"></div>
      <div class="field"><label class="f">سعر الجملة / المقاولين <span class="faint">(اختياري)</span></label><input class="in" type="number" step="any" name="price2" value="${p.price2 || ''}" placeholder="بيتطبق لما تختار عميل جملة"></div>
      ${isNew ? `<div class="field"><label class="f">رصيد أول المدة (الكمية الموجودة حالياً)</label><input class="in" type="number" step="any" name="stock" value=""></div>` : `<div class="field"><label class="f">الرصيد الحالي</label><div class="num" style="padding:8px 0;font-weight:800">${qf(p.stock)}</div><div class="small faint">لتعديل الرصيد استخدم شاشة الجرد أو فاتورة شراء</div></div>`}
      <div class="field" style="grid-column:1/-1"><label class="f">ملاحظات</label><input class="in" name="notes" value="${esc(p.notes)}"></div>
      <label class="chk"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> الصنف نشط ويظهر في الكاشير</label>
      ${isNew && isAdmin() && S.branches.length > 1 ? `<label class="chk"><input type="checkbox" name="both"> أضفه كمان في ${esc(S.branches.filter((x) => x.id !== curBranch()).map((x) => x.name).join(' و'))} (من غير رصيد)</label>` : ''}</div>`,
    buttons: [
      { t: 'حفظ', cls: 'pri', fn: async (mb) => {
        const v = fv(mb); v.branch_id = curBranch(); const both = v.both; delete v.both;
        if (isNew) {
          await POST('/api/products', v);
          // نفس الصنف في المعرض التاني (من غير رصيد — كل معرض بيسجّل مخزونه)
          if (both) for (const b of S.branches.filter((x) => x.id !== curBranch())) { try { await POST('/api/products', { ...v, branch_id: b.id, code: '', stock: 0 }); } catch (e) { toast(`${b.name}: ${e.message}`, 'bad'); } }
        } else await PUT('/api/products/' + p.id, v);
        toast(both ? 'اتضاف في المعرضين ✓' : 'تم الحفظ', 'ok'); dropCache(); onSave && onSave();
      } },
      ...(!isNew ? [{ t: 'حذف', cls: 'bad', fn: async (mb, close) => { if (!(await confirmBox(`حذف الصنف "${esc(p.name)}"؟ لو عليه حركات هيتوقف بس.`, 'حذف', 'bad'))) return false; const r = await DEL('/api/products/' + p.id); toast(r.deactivated ? 'الصنف عليه حركات — تم إيقافه' : 'تم الحذف', 'ok'); dropCache(); onSave && onSave(); } }] : []),
      { t: 'إلغاء' },
    ],
  });
}
async function productCard(id) {
  const d = await GET(`/api/products/${id}/moves`);
  const T = { sale: 'بيع', return: 'مرتجع بيع', purchase: 'شراء', purchase_return: 'مرتجع شراء', adjust: 'جرد / تسوية', opening: 'رصيد أول المدة' };
  const m = modal({ title: `كارت الصنف: ${d.product.name}`, wide: 'wide', body: `<div class="row" style="margin-bottom:10px"><span>الرصيد الحالي: <b class="num">${qf(d.product.stock)}</b></span><span class="faint">·</span><span>سعر البيع: ${M(d.product.price)}</span>${d.product.cost != null ? `<span class="faint">·</span><span>متوسط التكلفة: ${M(d.product.cost)}</span>` : ''}</div><div id="mv"></div>`, buttons: [{ t: 'إغلاق' }] });
  mountTable($('#mv', m.mb), [{ t: 'التاريخ', f: (r) => dt(r.date) }, { t: 'الحركة', f: (r) => T[r.type] || r.type }, { t: 'وارد', n: 1, f: (r) => (r.qty > 0 ? `<span class="ok num">${qf(r.qty)}</span>` : '') }, { t: 'منصرف', n: 1, f: (r) => (r.qty < 0 ? `<span class="bad num">${qf(-r.qty)}</span>` : '') }, { t: 'الرصيد', n: 1, f: (r) => `<b class="num">${qf(r.balance)}</b>` }, { t: 'المستخدم', k: 'user_name' }, { t: 'ملاحظات', k: 'notes' }], d.moves.slice().reverse(), { maxh: '60vh', empty: 'لا توجد حركات على الصنف' });
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  const sep = (text.split('\n')[0].match(/\t/) ? '\t' : text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
/* ---------- طباعة ملصقات باركود ---------- */
async function loadJsBarcode() {
  if (window.JsBarcode) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + 'vendor/jsbarcode/JsBarcode.all.min.js'; s.onload = res; s.onerror = () => rej(new Error('تعذر تحميل مولّد الباركود')); document.head.append(s); });
}
function barcodeLabels(list) {
  if (!list.length) return toast('مفيش أصناف — غيّر البحث أو الفلتر', 'bad');
  const sel = new Map(); // id → عدد الملصقات
  const m = modal({ title: 'طباعة ملصقات باركود', wide: 'wide', body: `
    <div class="grid g3" style="margin-bottom:12px"><div><label class="f">مقاس الملصق</label><select class="in" id="bs">${opt('a4', 'ورقة A4 (3 × 8 ملصق)')}${opt('roll', 'طابعة ملصقات 38×25 مم')}${opt('roll50', 'طابعة ملصقات 50×30 مم')}</select></div>
      <div><label class="f">يظهر على الملصق</label><label class="chk"><input type="checkbox" id="bp" checked> السعر</label><label class="chk"><input type="checkbox" id="bn" checked> اسم الصنف</label></div>
      <div class="small muted">الأصناف اللي معندهاش باركود بيتطبع لها الكود بتاعها كباركود — والكاشير يقدر يمسحه عادي.</div></div>
    <div class="toolbar"><input class="in" id="bq" placeholder="بحث" style="width:220px"><span class="sp"></span><button class="btn sm" id="ball">تحديد الكل</button><button class="btn sm" id="bnone">شيل الكل</button><b id="bcnt" class="small"></b></div>
    <div class="tbl-wrap" style="max-height:46vh"><table class="t"><thead><tr><th></th><th>الصنف</th><th>الباركود / الكود</th><th class="n">السعر</th><th class="n">عدد الملصقات</th></tr></thead><tbody id="btb"></tbody></table></div>`,
    buttons: [{ t: `${icon('print')} طباعة`, cls: 'pri', fn: async (mb) => {
      if (!sel.size) throw new Error('اختار صنف واحد على الأقل');
      await loadJsBarcode();
      const size = $('#bs', mb).value, showP = $('#bp', mb).checked, showN = $('#bn', mb).checked;
      const labels = [];
      for (const [id, n] of sel) {
        const p = list.find((x) => x.id === id); if (!p) continue;
        const code = String(p.barcode || p.code || p.id);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        try { JsBarcode(svg, code, { format: 'CODE128', height: size === 'roll' ? 32 : 40, width: size === 'roll' ? 1.3 : 1.6, fontSize: 11, margin: 0, displayValue: true }); } catch { continue; }
        const html = `<div class="lb">${showN ? `<div class="nm">${esc(p.name)}</div>` : ''}${svg.outerHTML}${showP ? `<div class="pr">${money(p.price)} ج.م</div>` : ''}</div>`;
        for (let i = 0; i < n; i++) labels.push(html);
      }
      const css = size === 'a4'
        ? `@page{size:A4;margin:8mm}body{margin:0}.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.lb{height:35.5mm;padding:2mm 3mm;border:1px dashed #ccc;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;page-break-inside:avoid}`
        : `@page{size:${size === 'roll' ? '38mm 25mm' : '50mm 30mm'};margin:0}body{margin:0}.lb{width:${size === 'roll' ? '38mm' : '50mm'};height:${size === 'roll' ? '25mm' : '30mm'};padding:1mm 1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;page-break-after:always}`;
      printHTML(`<div class="sheet">${labels.join('')}</div>`, false, css + `.nm{font-size:9px;font-weight:bold;text-align:center;line-height:1.2;max-height:2.4em;overflow:hidden;width:100%}.pr{font-size:12px;font-weight:bold;direction:rtl}svg{max-width:100%;height:auto}`);
      return false;
    } }, { t: 'إغلاق' }] });
  const mb = m.mb;
  const render = () => {
    const q = $('#bq', mb).value.trim().toLowerCase();
    $('#btb', mb).innerHTML = list.filter((p) => !q || prodMatch(p, q)).slice(0, 400).map((p) => `<tr data-id="${p.id}"><td><input type="checkbox" data-k="on" ${sel.has(p.id) ? 'checked' : ''}></td><td>${esc(p.name)}</td><td class="num small">${esc(p.barcode || p.code)}</td><td class="n">${M(p.price)}</td><td class="n"><input class="in sm" type="number" min="1" step="1" data-k="n" value="${sel.get(p.id) || 1}" style="width:70px"></td></tr>`).join('');
    $('#bcnt', mb).textContent = `${sel.size} صنف · ${[...sel.values()].reduce((a, b) => a + b, 0)} ملصق`;
  };
  $('#btb', mb).addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = +tr.dataset.id;
    if (e.target.dataset.k === 'on') { if (e.target.checked) sel.set(id, +$('[data-k=n]', tr).value || 1); else sel.delete(id); }
    if (e.target.dataset.k === 'n') { const n = Math.max(1, Math.min(500, +e.target.value || 1)); if (!sel.has(id)) $('[data-k=on]', tr).checked = true; sel.set(id, n); }
    $('#bcnt', mb).textContent = `${sel.size} صنف · ${[...sel.values()].reduce((a, b) => a + b, 0)} ملصق`;
  });
  $('#bq', mb).oninput = debounce(render, 150);
  $('#ball', mb).onclick = () => { list.forEach((p) => sel.has(p.id) || sel.set(p.id, 1)); render(); };
  $('#bnone', mb).onclick = () => { sel.clear(); render(); };
  render();
}
/* ---------- استيراد قائمة أسعار من PDF / صور مع شاشة مراجعة ---------- */
function priceImport(onDone) {
  const br = branchOf(curBranch());
  const st = { rows: [], products: [], filter: 'all', mode: 'sale', disc: '', margin: '', cat: '', update: true };
  const m = modal({ title: `قراءة قائمة أسعار — ${br.name}`, wide: 'xwide', body: `
    <label class="drop" id="dz"><input type="file" id="pf" accept=".pdf,image/*" multiple hidden>
      <div style="font-size:34px">📄 🖼️</div><b>اختار ملف PDF أو صور قائمة الأسعار</b><span class="small muted">أو اسحب الملفات وارميها هنا — ممكن أكتر من صورة/ملف مرة واحدة</span></label>
    <div id="pp" class="small muted" style="margin:10px 0;min-height:20px"></div>
    <div class="small faint">• ملفات PDF اللي فيها نص (زي قوائم الشركات) بتتقري بدقة عالية ومن غير إنترنت.<br>• الصور وملفات السكانر بتتقري ضوئياً (محتاجة إنترنت أول مرة بس) — صوّر الورقة مفرودة وفي نور كويس.<br>• في كل الأحوال هتراجع الأصناف وتعدّل أي غلط قبل ما تتحفظ.</div>`,
    buttons: [{ t: 'إلغاء' }] });
  const mb = m.mb;
  const prog = (t) => ($('#pp', mb).textContent = t);
  const run = async (files) => {
    files = [...files].filter((f) => /pdf|image/.test(f.type) || /\.(pdf|png|jpe?g|webp|bmp)$/i.test(f.name));
    if (!files.length) return toast('اختار ملف PDF أو صورة', 'bad');
    try {
      prog('جاري القراءة…');
      const [pages, prods] = await Promise.all([PriceImport.readFiles(files, prog), GET('/api/products', bq({ all: 1 }))]);
      const rows = PriceImport.parsePages(pages);
      if (!rows.length) { prog(''); return toast('ملقتش أسعار في الملف ده — جرّب صورة أوضح أو ملف تاني', 'bad'); }
      st.products = prods; st.rows = PriceImport.matchRows(rows, prods).map((r, i) => ({ ...r, i, on: true, cat: r.category || '' }));
      review();
    } catch (e) { console.error(e); prog(''); toast('حصلت مشكلة في قراءة الملف: ' + e.message, 'bad'); }
  };
  $('#pf', mb).onchange = (e) => run(e.target.files);
  const dz = $('#dz', mb);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); run(e.dataTransfer.files); };

  const prodById = (id) => st.products.find((p) => p.id === +id);
  const calc = (r) => {
    const v = +r.price || 0; const d = +st.disc || 0, mg = +st.margin || 0;
    if (st.mode === 'sale') return { sale: r2(v), cost: d ? r2(v * (1 - d / 100)) : null };
    return { cost: r2(v), sale: mg ? r2(v * (1 + mg / 100)) : null };
  };
  const status = (r) => {
    if (!r.on) return ['متشال', ''];
    if (!+r.match) return ['صنف جديد', 'pri'];
    const p = prodById(r.match); const { sale } = calc(r);
    if (!st.update) return ['موجود (مش هيتحدّث)', ''];
    if (sale != null && p && Math.abs(p.price - sale) > 0.009) return [`سعر جديد: ${money(p.price)} ← ${money(sale)}`, 'warn'];
    return ['موجود — نفس السعر', 'ok'];
  };
  function review() {
    m.el.querySelector('.mh').firstChild.textContent = `مراجعة الأصناف قبل الحفظ — ${br.name}`;
    mb.innerHTML = `<div class="card" style="padding:12px 14px;margin-bottom:12px;background:#f8fafc"><div class="grid g4" style="align-items:end">
        <div><label class="f">الأسعار اللي في الملف هي</label><select class="in" id="rm">${opt('sale', 'سعر البيع للمستهلك', st.mode)}${opt('cost', 'سعر الشراء (التكلفة)', st.mode)}</select></div>
        <div id="dW"><label class="f">خصم التاجر % (عشان نحسب التكلفة)</label><input class="in" type="number" min="0" max="100" step="any" id="rd" value="${st.disc}" placeholder="مثال: 20"></div>
        <div id="mW"><label class="f">نسبة ربحك % (عشان نحسب سعر البيع)</label><input class="in" type="number" min="0" step="any" id="rg" value="${st.margin}" placeholder="مثال: 25"></div>
        <div><label class="f">تصنيف للأصناف اللي من غير تصنيف</label><input class="in" id="rc" value="${esc(st.cat)}" placeholder="مثال: دهانات داخلية"></div></div>
        <label class="chk" style="margin-top:8px"><input type="checkbox" id="ru" ${st.update ? 'checked' : ''}> حدّث أسعار الأصناف الموجودة بالفعل في البرنامج</label></div>
      <div class="toolbar" id="rf"></div><div id="rt"></div>`;
    const sync = () => { $('#dW', mb).classList.toggle('hide', st.mode !== 'sale'); $('#mW', mb).classList.toggle('hide', st.mode !== 'cost'); };
    $('#rm', mb).onchange = (e) => { st.mode = e.target.value; sync(); table(); };
    $('#rd', mb).oninput = debounce((e) => { st.disc = e.target.value; table(); }, 300);
    $('#rg', mb).oninput = debounce((e) => { st.margin = e.target.value; table(); }, 300);
    $('#rc', mb).oninput = (e) => (st.cat = e.target.value);
    $('#ru', mb).onchange = (e) => { st.update = e.target.checked; table(); };
    // زرار الحفظ
    const mf = $('.mf', m.el); mf.innerHTML = '';
    const save = document.createElement('button'); save.className = 'btn pri'; save.id = 'rs'; mf.append(save);
    const back = document.createElement('button'); back.className = 'btn'; back.textContent = 'إلغاء'; back.onclick = m.close; mf.append(back);
    save.onclick = async () => {
      const send = [];
      for (const r of st.rows) {
        if (!r.on) continue; const { sale, cost } = calc(r);
        if (+r.match) { if (!st.update) continue; const p = prodById(r.match); if (sale != null && p && Math.abs(p.price - sale) < 0.01 && !cost) continue; send.push({ id: +r.match, name: r.name, price: sale ?? 0, cost: cost ?? 0, category: r.cat || st.cat }); }
        else { if (!(sale > 0)) continue; send.push({ name: r.name, price: sale, cost: cost ?? 0, category: r.cat || st.cat, unit: r.pack || 'عبوة', brand: br.brand || '' }); }
      }
      if (!send.length) return toast('مفيش تغييرات للحفظ', 'bad');
      save.disabled = true;
      try { const r = await POST('/api/products/import', { branch_id: curBranch(), rows: send }); toast(`تم: إضافة ${r.added} صنف جديد وتحديث ${r.updated} صنف`, 'ok'); dropCache(); m.close(); onDone && onDone(); }
      catch (e) { toast(e.message, 'bad'); save.disabled = false; }
    };
    sync(); table();
  }
  function table() {
    const counts = { all: st.rows.length, new: 0, change: 0, same: 0, off: 0 };
    for (const r of st.rows) { const [, c] = status(r); if (!r.on) counts.off++; else if (!+r.match) counts.new++; else if (c === 'warn') counts.change++; else counts.same++; }
    const F = [['all', 'الكل'], ['new', 'جديد'], ['change', 'سعر اتغير'], ['same', 'بدون تغيير'], ['off', 'متشال']];
    $('#rf', mb).innerHTML = F.map(([k, t]) => `<button class="chip ${st.filter === k ? 'on' : ''}" data-f="${k}">${t} <b class="num">${counts[k]}</b></button>`).join('') + `<span class="sp"></span><button class="btn sm" id="rall">تحديد الكل</button><button class="btn sm" id="rnone">شيل الكل</button>`;
    $$('[data-f]', mb).forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; table(); }));
    $('#rall', mb).onclick = () => { st.rows.forEach((r) => (r.on = true)); table(); };
    $('#rnone', mb).onclick = () => { st.rows.forEach((r) => (r.on = false)); table(); };
    const show = st.rows.filter((r) => { const [, c] = status(r); return st.filter === 'all' || (st.filter === 'off' ? !r.on : r.on && (st.filter === 'new' ? !+r.match : st.filter === 'change' ? +r.match && c === 'warn' : +r.match && c !== 'warn')); });
    $('#rt', mb).innerHTML = `<div class="tbl-wrap" style="max-height:52vh"><table class="t"><thead><tr><th></th><th>اسم الصنف (تقدر تعدّله)</th><th>التصنيف</th><th class="n">السعر في الملف</th><th class="n">سعر البيع</th><th class="n">التكلفة</th><th>يتربط بصنف موجود؟</th><th>الحالة</th></tr></thead><tbody>
      ${show.map((r) => { const { sale, cost } = calc(r); const [t, c] = status(r); return `<tr data-i="${r.i}" style="${r.on ? '' : 'opacity:.45'}">
        <td><input type="checkbox" data-k="on" ${r.on ? 'checked' : ''}></td>
        <td style="min-width:240px"><input class="in sm" data-k="name" value="${esc(r.name)}"></td>
        <td><input class="in sm" data-k="cat" value="${esc(r.cat)}" style="width:150px"></td>
        <td class="n"><input class="in sm" type="number" step="any" data-k="price" value="${r.price}" style="width:95px"></td>
        <td class="n">${sale != null ? `<b class="num">${money(sale)}</b>` : '<span class="faint">—</span>'}</td>
        <td class="n">${cost != null ? `<span class="num">${money(cost)}</span>` : '<span class="faint">—</span>'}</td>
        <td><select class="in sm" data-k="match" style="max-width:260px">${opt(0, '➕ صنف جديد', r.match)}${r.candidates.map((x) => opt(x.p.id, `${x.p.name} (${money(x.p.price)})`, r.match)).join('')}</select></td>
        <td><span class="badge ${c}">${t}</span></td></tr>`; }).join('')}</tbody></table></div>`;
    const on = st.rows.filter((r) => r.on);
    const upd = st.update ? on.filter((r) => +r.match && (status(r)[1] === 'warn' || calc(r).cost != null)).length : 0;
    const n = counts.new + upd;
    const sb = $('#rs', m.el); if (sb) { sb.textContent = `حفظ (${counts.new} جديد + ${upd} تحديث${st.mode === 'sale' && st.disc ? ' سعر/تكلفة' : st.mode === 'cost' ? ' تكلفة' : ' سعر'})`; sb.disabled = !n; }
  }
  mb.addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return; const r = st.rows[+tr.dataset.i]; const k = e.target.dataset.k;
    if (k === 'on') r.on = e.target.checked; else if (k === 'name') r.name = e.target.value.trim(); else if (k === 'cat') r.cat = e.target.value.trim(); else if (k === 'price') r.price = +e.target.value || 0; else if (k === 'match') r.match = +e.target.value; else return;
    if (k !== 'name' && k !== 'cat') table();
  });
}
function importProducts(onDone) {
  const MAP = { name: ['name', 'الاسم', 'الصنف', 'اسم الصنف'], code: ['code', 'الكود', 'كود'], barcode: ['barcode', 'الباركود', 'باركود'], category: ['category', 'التصنيف', 'القسم'], unit: ['unit', 'الوحدة'], brand: ['brand', 'الماركة'], cost: ['cost', 'التكلفة', 'سعر التكلفة', 'سعر الشراء'], price: ['price', 'السعر', 'سعر البيع'], stock: ['stock', 'الرصيد', 'الكمية'], min_stock: ['min_stock', 'حد الطلب'] };
  modal({
    title: `استيراد أصناف إلى ${branchOf(curBranch()).name}`, wide: 'wide',
    body: `<p class="muted" style="margin-top:0">اعمل ملف Excel فيه الأعمدة دي (أول صف عناوين) واحفظه بصيغة <b>CSV UTF-8</b>:<br><span class="num small">الكود، الصنف، الباركود، التصنيف، الوحدة، سعر التكلفة، سعر البيع، الرصيد، حد الطلب</span><br>الصنف اللي كوده موجود هيتحدّث سعره، والجديد هيتضاف.</p>
      <div class="row field"><input type="file" accept=".csv,.txt" id="if" class="in" style="width:auto"><button class="btn sm" id="tpl">${icon('download')}تنزيل نموذج</button></div>
      <div id="ip" class="small"></div>`,
    buttons: [{ t: 'استيراد', cls: 'pri', fn: async (mb) => {
      const data = mb._rows; if (!data || !data.length) throw new Error('اختار ملف الأول');
      const r = await POST('/api/products/import', { branch_id: curBranch(), rows: data });
      toast(`تم: إضافة ${r.added} وتحديث ${r.updated} صنف`, 'ok'); dropCache(); onDone && onDone();
    } }, { t: 'إلغاء' }],
    onOpen: (mb) => {
      $('#tpl', mb).onclick = () => exportCSV('نموذج-استيراد-أصناف', ['الكود', 'الصنف', 'الباركود', 'التصنيف', 'الوحدة', 'سعر التكلفة', 'سعر البيع', 'الرصيد', 'حد الطلب'].map((t) => ({ t, k: t })), [{ 'الكود': '2001', 'الصنف': 'مثال: باكين أستر مط 3.5 لتر', 'الباركود': '', 'التصنيف': 'دهانات داخلية', 'الوحدة': 'جالون', 'سعر التكلفة': 350, 'سعر البيع': 420, 'الرصيد': 10, 'حد الطلب': 2 }]);
      $('#if', mb).onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const rows = parseCSV(await f.text()); if (rows.length < 2) { $('#ip', mb).textContent = 'الملف فاضي'; return; }
        const head = rows[0].map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
        const idx = {}; for (const [k, names] of Object.entries(MAP)) idx[k] = head.findIndex((h) => names.includes(h));
        if (idx.name < 0) { $('#ip', mb).innerHTML = '<span class="bad">مش لاقي عمود "الصنف" أو "name" في أول صف</span>'; return; }
        mb._rows = rows.slice(1).map((r) => { const o = {}; for (const k in idx) if (idx[k] >= 0) o[k] = (r[idx[k]] || '').trim(); for (const k of ['cost', 'price', 'stock', 'min_stock']) if (o[k] != null) o[k] = o[k] === '' ? '' : +o[k].replace(/,/g, '') || 0; return o; }).filter((o) => o.name);
        $('#ip', mb).innerHTML = `<b class="ok">جاهز لاستيراد ${mb._rows.length} صنف.</b> أول 5:<br>${mb._rows.slice(0, 5).map((o) => esc(`${o.code || ''} ${o.name} — ${o.price ?? ''}`)).join('<br>')}`;
      };
    },
  });
}

/* =====================================================================
   الجرد
   ===================================================================== */
VIEWS.stock = async (el) => {
  if (!needBranch(el)) return;
  const prods = await products(true);
  const counted = {};
  el.innerHTML = `<div class="card" style="padding:12px 16px;margin-bottom:14px"><b>الجرد الفعلي:</b> <span class="muted">اكتب الكمية الموجودة فعلاً على الرف لكل صنف (سيب الخانة فاضية لو مفيش تغيير). الفرق بيتسجل كعجز أو زيادة مخزون في الأرباح والخسائر.</span></div>
    <div class="toolbar"><input class="in" id="sq" placeholder="بحث" style="width:240px"><label class="chk"><input type="checkbox" id="sch"> المعدّل فقط</label><span class="sp"></span><input class="in" id="sn" placeholder="ملاحظات الجرد" style="width:220px"><button class="btn pri" id="ssave">حفظ الجرد</button></div><div id="stb"></div>`;
  const render = () => {
    const q = $('#sq', el).value.trim().toLowerCase(); const ch = $('#sch', el).checked;
    const rows = prods.filter((p) => (!q || prodMatch(p, q)) && (!ch || counted[p.id] != null));
    $('#stb', el).innerHTML = `<div class="tbl-wrap" style="max-height:65vh"><table class="t"><thead><tr><th>الكود</th><th>الصنف</th><th class="n">الرصيد بالدفتر</th><th class="n">الرصيد الفعلي</th><th class="n">الفرق</th></tr></thead><tbody>
      ${rows.map((p) => { const c = counted[p.id]; const d = c != null ? r2(c - p.stock) : null; return `<tr><td class="num">${esc(p.code)}</td><td>${esc(p.name)}</td><td class="n">${qf(p.stock)}</td><td class="n"><input class="in sm" type="number" step="any" data-id="${p.id}" value="${c ?? ''}" style="width:100px"></td><td class="n" data-d="${p.id}">${d == null ? '' : `<b class="num ${d < 0 ? 'bad' : d > 0 ? 'ok' : ''}">${d > 0 ? '+' : ''}${qf(d)}</b>`}</td></tr>`; }).join('')}</tbody></table></div>`;
  };
  $('#stb', el).addEventListener('input', (e) => {
    const i = e.target.closest('[data-id]'); if (!i) return; const id = +i.dataset.id; const p = prods.find((x) => x.id === id);
    if (i.value === '') delete counted[id]; else counted[id] = +i.value;
    const d = counted[id] != null ? r2(counted[id] - p.stock) : null;
    $(`[data-d="${id}"]`, el).innerHTML = d == null ? '' : `<b class="num ${d < 0 ? 'bad' : d > 0 ? 'ok' : ''}">${d > 0 ? '+' : ''}${qf(d)}</b>`;
  });
  $('#stb', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-id]')) { e.preventDefault(); const all = $$('[data-id]', el); const i = all.indexOf(e.target); if (all[i + 1]) all[i + 1].focus(); } });
  $('#sq', el).oninput = debounce(render, 150); $('#sch', el).onchange = render;
  $('#ssave', el).onclick = async () => {
    const items = Object.entries(counted).map(([id, qty]) => ({ product_id: +id, qty })).filter((x) => { const p = prods.find((y) => y.id === x.product_id); return p && r2(x.qty - p.stock) !== 0; });
    if (!items.length) return toast('مفيش فروقات للحفظ', 'bad');
    if (!(await confirmBox(`حفظ تسوية ${items.length} صنف؟`))) return;
    try { const r = await POST('/api/stock/adjust', { branch_id: curBranch(), items, notes: $('#sn', el).value }); toast(`تم تسوية ${r.adjusted} صنف`, 'ok'); dropCache(); route(); } catch (e) { toast(e.message, 'bad'); }
  };
  render();
};

/* =====================================================================
   المشتريات
   ===================================================================== */
VIEWS.purchases = async (el) => {
  const st = S.purSt || (S.purSt = { ...newRange('month'), tab: 'list' });
  el.innerHTML = `<div class="tabs"><button data-t="list" class="${st.tab === 'list' ? 'on' : ''}">فواتير الشراء</button><button data-t="new" class="${st.tab === 'new' ? 'on' : ''}">فاتورة شراء / مرتجع جديد</button></div><div id="pv"></div>`;
  $$('.tabs button', el).forEach((b) => (b.onclick = () => { st.tab = b.dataset.t; route(); }));
  const pv = $('#pv', el);
  if (st.tab === 'new') return purchaseForm(pv);
  pv.innerHTML = `<div class="toolbar">${rangeHTML(st)}<span class="sp"></span><button class="btn" id="csv">${icon('download')}Excel</button></div><div id="tb"></div>`;
  let rows = [];
  const cols = [{ t: 'رقم', f: (r) => `<b class="num">${r.doc_no}</b>`, v: (r) => r.doc_no }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id), v: (r) => branchOf(r.branch_id).name }] : []), { t: 'التاريخ', f: (r) => dt(r.date), v: (r) => r.date }, { t: 'النوع', f: (r) => (r.kind === 'return' ? '<span class="badge bad">مرتجع شراء</span>' : '<span class="badge pri">شراء</span>') }, { t: 'المورد', k: 'supplier_name' }, { t: 'فاتورة المورد', k: 'supplier_ref' }, { t: 'الإجمالي', n: 1, f: (r) => M(r.total), v: (r) => r.total }, { t: 'المدفوع', n: 1, f: (r) => M(r.paid), v: (r) => r.paid }, { t: 'المتبقي', n: 1, f: (r) => (r.total - r.paid > 0.009 ? M(r.total - r.paid, 'warn') : ''), v: (r) => r2(r.total - r.paid) }, { t: 'الحالة', f: (r) => (r.status === 'void' ? '<span class="badge bad">ملغاة</span>' : '') }];
  const load = async () => { rows = await GET('/api/purchases', bq({ from: st.from, to: st.to })); mountTable($('#tb', pv), cols, rows, { click: (r) => purchaseModal(r.id, load), rowCls: (r) => (r.status === 'void' ? 'void' : ''), empty: 'لا توجد فواتير شراء' }); };
  bindRange(pv, st, load); $('#csv', pv).onclick = () => exportCSV('المشتريات', cols, rows);
  await load();
};
async function purchaseForm(el) {
  if (!needBranch(el)) return;
  const [prods, sups] = await Promise.all([products(true), suppliers(true)]);
  const f = S.purForm || (S.purForm = { kind: 'purchase', supplier_id: '', supplier_ref: '', date: ymd(new Date()), lines: [], discount: 0, paid: '', method: 'cash', notes: '' });
  const sc = can('see_cost');
  el.innerHTML = `<div class="card"><div class="bd">
    <div class="grid g4"><div class="field"><label class="f">نوع الفاتورة</label><select class="in" id="fk">${opt('purchase', 'فاتورة شراء (وارد)', f.kind)}${opt('return', 'مرتجع شراء (منصرف للمورد)', f.kind)}</select></div>
      <div class="field"><label class="f">المورد *</label><div class="row" style="flex-wrap:nowrap"><select class="in" id="fs">${opt('', '— اختار المورد —', f.supplier_id)}${sups.map((s) => opt(s.id, `${s.name}${s.balance ? ' (رصيد ' + money(s.balance) + ')' : ''}`, f.supplier_id)).join('')}</select>${can('suppliers') ? `<button class="btn" id="fns" title="مورد جديد">${icon('plus')}</button>` : ''}</div></div>
      <div class="field"><label class="f">رقم فاتورة المورد</label><input class="in" id="fr" value="${esc(f.supplier_ref)}"></div>
      <div class="field"><label class="f">التاريخ</label><input class="in" type="date" id="fd" value="${f.date}"></div></div>
    <div class="field"><label class="f">إضافة صنف</label><div><input class="in" id="fp" placeholder="اكتب اسم الصنف أو الكود أو امسح الباركود…" autocomplete="off"></div></div>
    <div id="fl"></div>
    <div class="grid g4" style="margin-top:14px">
      <div><label class="f">الخصم على الفاتورة</label><input class="in" type="number" step="any" min="0" id="fdisc" value="${f.discount || ''}"></div>
      <div><label class="f">المدفوع الآن</label><input class="in" type="number" step="any" min="0" id="fpaid" value="${f.paid}" placeholder="فاضي = آجل بالكامل"></div>
      <div><label class="f">طريقة الدفع</label><select class="in" id="fm">${methodOpts(f.method)}</select></div>
      <div><label class="f">صافي الفاتورة</label><div class="num" style="font-size:24px;font-weight:800" id="ftot"></div></div>
    </div>
    <div class="field" style="margin-top:10px"><label class="f">ملاحظات</label><input class="in" id="fn" value="${esc(f.notes)}"></div>
    <div class="row"><button class="btn pri lg" id="fsave">حفظ الفاتورة</button><button class="btn" id="fpaidall">دفع كامل المبلغ</button><button class="btn bad" id="fclr">مسح</button></div>
  </div></div>`;
  const sub = () => r2(f.lines.reduce((s, l) => s + l.qty * l.cost, 0));
  const renderLines = () => {
    $('#fl', el).innerHTML = f.lines.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>الصنف</th><th class="n">الرصيد الحالي</th><th class="n">الكمية</th><th class="n">سعر الشراء للوحدة</th>${f.kind === 'purchase' ? '<th class="n">سعر البيع (تحديث)</th>' : ''}<th class="n">الإجمالي</th><th></th></tr></thead><tbody>
      ${f.lines.map((l, i) => `<tr data-i="${i}"><td>${esc(l.name)}</td><td class="n">${qf(l.stock)}</td><td class="n"><input class="in sm" type="number" step="any" min="0" data-k="qty" value="${l.qty}" style="width:80px"></td><td class="n"><input class="in sm" type="number" step="any" min="0" data-k="cost" value="${l.cost}" style="width:100px"></td>${f.kind === 'purchase' ? `<td class="n"><input class="in sm" type="number" step="any" min="0" data-k="price" value="${l.price ?? ''}" placeholder="${money(l.cur_price)}" style="width:100px"></td>` : ''}<td class="n"><b class="num">${money(l.qty * l.cost)}</b></td><td><button class="btn ghost sm" data-k="x">✕</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td>الإجمالي</td><td></td><td class="n">${qf(f.lines.reduce((s, l) => s + +l.qty, 0))}</td><td></td>${f.kind === 'purchase' ? '<td></td>' : ''}<td class="n">${money(sub())}</td><td></td></tr></tfoot></table></div>` : '<div class="empty tbl-wrap">لم تُضف أصناف بعد</div>';
    $('#ftot', el).textContent = money(sub() - (+f.discount || 0));
  };
  picker($('#fp', el), { items: () => prods, match: prodMatch, exact: prodExact, label: (p) => esc(p.name), sub: (p) => `كود ${esc(p.code)} · رصيد ${qf(p.stock)}${sc ? ' · تكلفة ' + money(p.cost) : ''}`, onPick: (p) => {
    const ex = f.lines.find((l) => l.product_id === p.id); if (ex) ex.qty = r2(+ex.qty + 1); else f.lines.push({ product_id: p.id, name: p.name, qty: 1, cost: sc ? p.cost : 0, price: null, cur_price: p.price, stock: p.stock });
    $('#fp', el).value = ''; renderLines(); const q = $$('[data-k=qty]', el).pop(); if (q) { q.focus(); q.select(); }
  } });
  $('#fl', el).addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k || k === 'x') return; const l = f.lines[+e.target.closest('tr').dataset.i]; l[k] = e.target.value === '' ? (k === 'price' ? null : 0) : +e.target.value; const tr = e.target.closest('tr'); tr.querySelector('td:nth-last-child(2) b').textContent = money(l.qty * l.cost); $('#ftot', el).textContent = money(sub() - (+f.discount || 0)); });
  $('#fl', el).addEventListener('change', () => renderLines());
  $('#fl', el).addEventListener('click', (e) => { if (e.target.dataset.k === 'x') { f.lines.splice(+e.target.closest('tr').dataset.i, 1); renderLines(); } });
  $('#fk', el).onchange = (e) => { f.kind = e.target.value; renderLines(); };
  $('#fs', el).onchange = (e) => (f.supplier_id = e.target.value);
  $('#fr', el).oninput = (e) => (f.supplier_ref = e.target.value);
  $('#fd', el).onchange = (e) => (f.date = e.target.value);
  $('#fdisc', el).oninput = (e) => { f.discount = e.target.value; $('#ftot', el).textContent = money(sub() - (+f.discount || 0)); };
  $('#fpaid', el).oninput = (e) => (f.paid = e.target.value);
  $('#fm', el).onchange = (e) => (f.method = e.target.value);
  $('#fn', el).oninput = (e) => (f.notes = e.target.value);
  const purAtt = attachUI($('#fn', el)); // صورة فاتورة المورد
  $('#fpaidall', el).onclick = () => { f.paid = r2(sub() - (+f.discount || 0)); $('#fpaid', el).value = f.paid; };
  $('#fclr', el).onclick = () => { S.purForm = null; route(); };
  if ($('#fns', el)) $('#fns', el).onclick = () => partyForm('supplier', null, async (s) => { f.supplier_id = s.id; S.cache = {}; route(); });
  $('#fsave', el).onclick = async () => {
    try {
      if (!f.supplier_id) throw new Error('اختار المورد');
      if (!f.lines.length) throw new Error('أضف أصناف');
      const p = await POST('/api/purchases', { branch_id: curBranch(), kind: f.kind, supplier_id: +f.supplier_id, supplier_ref: f.supplier_ref, date: f.date, items: f.lines.map((l) => ({ product_id: l.product_id, qty: l.qty, cost: l.cost, price: l.price })), discount: +f.discount || 0, pays: f.paid ? [{ method: f.method, amount: +f.paid }] : [], notes: f.notes });
      await purAtt.upload('purchase', p.id);
      toast(`تم حفظ ${p.kind === 'purchase' ? 'فاتورة الشراء' : 'مرتجع الشراء'} ${p.doc_no}`, 'ok');
      S.purForm = null; dropCache(); S.purSt.tab = 'list'; route();
    } catch (e) { toast(e.message, 'bad'); }
  };
  renderLines();
}
async function purchaseModal(id, onChange) {
  const p = await GET('/api/purchases/' + id);
  const m = modal({
    title: `${p.kind === 'purchase' ? 'فاتورة شراء' : 'مرتجع شراء'} ${p.doc_no}`, wide: 'wide',
    body: `<div class="grid g4" style="margin-bottom:12px"><div><div class="faint small">التاريخ</div>${dt(p.date)}</div><div><div class="faint small">المورد</div>${esc(p.supplier_name)}</div><div><div class="faint small">فاتورة المورد</div>${esc(p.supplier_ref || '-')}</div><div><div class="faint small">المستخدم</div>${esc(p.user_name)}</div></div>
      ${p.status === 'void' ? '<div class="badge bad" style="margin-bottom:10px">ملغاة</div>' : ''}<div id="it"></div>
      <table class="t" style="width:320px;margin-top:12px;margin-right:auto">${[['الإجمالي', M(p.subtotal)], p.discount ? ['الخصم', M(p.discount)] : null, ['الصافي', `<b>${M(p.total)}</b>`], ['المدفوع', M(p.paid)], ['المتبقي', M(p.total - p.paid)]].filter(Boolean).map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</table>${p.notes ? `<p class="small muted">${esc(p.notes)}</p>` : ''}`,
    buttons: [
      { t: `${icon('print')} طباعة`, cls: 'pri', fn: () => { printReport(`${p.kind === 'purchase' ? 'فاتورة شراء' : 'مرتجع شراء'} ${p.doc_no}`, `المورد: ${p.supplier_name} — ${p.date.slice(0, 16)}`, tableHTML([{ t: 'الصنف', k: 'name' }, { t: 'الكمية', n: 1, f: (r) => qf(r.qty) }, { t: 'السعر', n: 1, f: (r) => money(r.cost) }, { t: 'الإجمالي', n: 1, f: (r) => money(r.total) }], p.items, ['الإجمالي', '', '', money(p.subtotal)]) + `<table class="tot"><tr><td>الخصم</td><td class="n">${money(p.discount)}</td></tr><tr class="g"><td>الصافي</td><td class="n">${money(p.total)}</td></tr><tr><td>المدفوع</td><td class="n">${money(p.paid)}</td></tr></table>`); return false; } },
      ...(isAdmin() && p.status === 'ok' ? [{ t: 'إلغاء الفاتورة', cls: 'bad', fn: async (mb, close) => { const r = await promptBox('إلغاء فاتورة الشراء', 'سبب الإلغاء:'); if (r == null) return false; await POST(`/api/purchases/${p.id}/void`, { reason: r }); toast('تم الإلغاء', 'ok'); dropCache(); close(); onChange && onChange(); } }] : []),
      { t: 'إغلاق' },
    ],
  });
  mountTable($('#it', m.mb), [{ t: 'الصنف', k: 'name' }, { t: 'الكمية', n: 1, f: (r) => Q(r.qty) }, { t: 'سعر الوحدة', n: 1, f: (r) => M(r.cost) }, { t: 'الإجمالي', n: 1, f: (r) => M(r.total) }], p.items);
  const pa = document.createElement('div'); pa.style.marginTop = '12px'; m.mb.append(pa); attView('purchase', p.id, pa);
}

/* =====================================================================
   العملاء والموردين
   ===================================================================== */
function customerForm(c, onSave) { partyForm('customer', c, onSave); }
function partyForm(kind, c, onSave) {
  const isNew = !c; c = c || {}; const lbl = kind === 'customer' ? 'عميل' : 'مورد';
  if (isNew && !curBranch()) return toast('اختار المعرض من فوق الأول', 'bad');
  modal({
    title: isNew ? `${lbl} جديد` : `تعديل ${lbl}`,
    body: `<div class="field"><label class="f">الاسم *</label><input class="in" name="name" value="${esc(c.name)}"></div>
      <div class="grid g2"><div class="field"><label class="f">الموبايل</label><input class="in" name="phone" value="${esc(c.phone)}" dir="ltr"></div>
      <div class="field"><label class="f">العنوان</label><input class="in" name="address" value="${esc(c.address)}"></div>
      ${isAdmin() ? `<div class="field"><label class="f">رصيد أول المدة ${kind === 'customer' ? '(مديونية عليه)' : '(مستحق له)'}</label><input class="in" type="number" step="any" name="opening" value="${c.opening || ''}"></div>` : ''}
      ${kind === 'customer' && isAdmin() ? `<div class="field"><label class="f">حد الائتمان (0 = بدون حد)</label><input class="in" type="number" step="any" name="credit_limit" value="${c.credit_limit || ''}"></div>
        <div class="field"><label class="f">نوع العميل</label><select class="in" name="tier">${opt('retail', 'قطاعي (السعر العادي)', c.tier || 'retail')}${opt('wholesale', 'جملة / مقاول (سعر الجملة)', c.tier)}</select></div>` : ''}</div>
      <div class="field"><label class="f">ملاحظات</label><input class="in" name="notes" value="${esc(c.notes)}"></div>
      ${!isNew ? `<label class="chk"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> نشط</label>` : ''}`,
    buttons: [{ t: 'حفظ', cls: 'pri', fn: async (mb) => {
      const v = fv(mb); v.branch_id = curBranch() || c.branch_id; if (isNew) v.active = true;
      const url = kind === 'customer' ? '/api/customers' : '/api/suppliers';
      const r = isNew ? await POST(url, v) : await PUT(`${url}/${c.id}`, v);
      if (mb._att) await mb._att.upload(kind, isNew ? r.id : c.id);
      toast('تم الحفظ', 'ok'); S.cache[(kind === 'customer' ? 'c' : 's') + curBranch()] = null;
      onSave && onSave(isNew ? r : { ...c, ...v });
    } }, { t: 'إلغاء' }],
    onOpen: (mb) => { mb._att = attachUI($('[name=notes]', mb)); if (!isNew) { const d = document.createElement('div'); d.style.marginTop = '8px'; $('[name=notes]', mb).closest('.field').append(d); attView(kind, c.id, d); } },
  });
}
function partyView(kind) {
  return async (el) => {
    const lbl = kind === 'customer' ? 'العميل' : 'المورد';
    el.innerHTML = `<div class="toolbar"><input class="in" id="q" placeholder="بحث بالاسم أو الموبايل" style="width:240px"><label class="chk"><input type="checkbox" id="debt"> ${kind === 'customer' ? 'عليهم مديونية فقط' : 'لهم مستحقات فقط'}</label><span class="sp"></span><button class="btn pri" id="add">${icon('plus')}${kind === 'customer' ? 'عميل جديد' : 'مورد جديد'}</button><button class="btn" id="csv">${icon('download')}Excel</button></div><div class="grid g3" id="sum" style="margin-bottom:14px"></div><div id="tb"></div>`;
    let all = [], rows = [];
    const cols = [{ t: 'الاسم', f: (r) => `<b>${esc(r.name)}</b>${r.tier === 'wholesale' ? ' <span class="badge ok">جملة</span>' : ''}${r.active ? '' : ' <span class="badge">موقوف</span>'}`, v: (r) => r.name }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id), v: (r) => branchOf(r.branch_id).name }] : []), { t: 'الموبايل', f: (r) => `<span class="num">${esc(r.phone || '')}</span>`, v: (r) => r.phone }, { t: 'العنوان', k: 'address' },
      { t: kind === 'customer' ? 'الرصيد (عليه)' : 'الرصيد (له)', n: 1, f: (r) => M(r.balance, r.balance > 0.009 ? (kind === 'customer' ? 'warn' : 'bad') : r.balance < -0.009 ? 'ok' : 'faint'), v: (r) => r.balance },
      { t: '', noCsv: 1, f: () => `<span class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="st">كشف حساب</button><button class="btn sm" data-act="pay">${kind === 'customer' ? 'تحصيل' : 'سداد'}</button><button class="btn sm" data-act="ed">تعديل</button></span>` }];
    const filter = () => {
      const q = $('#q', el).value.trim().toLowerCase(); const d = $('#debt', el).checked;
      rows = all.filter((c) => (!q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)) && (!d || c.balance > 0.009));
      const pos = all.reduce((s, c) => s + Math.max(0, c.balance), 0);
      $('#sum', el).innerHTML = stat(kind === 'customer' ? 'عدد العملاء' : 'عدد الموردين', `<span class="num">${all.length}</span>`) + stat(kind === 'customer' ? 'إجمالي المديونيات (لينا)' : 'إجمالي المستحقات (علينا)', M(pos), '', pos > 0 ? 'warn' : '') + stat(kind === 'customer' ? 'عملاء عليهم مديونية' : 'موردين لهم مستحقات', `<span class="num">${all.filter((c) => c.balance > 0.009).length}</span>`);
      mountTable($('#tb', el), cols, rows, { empty: 'لا يوجد', act: (a, r) => (a === 'st' ? statement(kind, r) : a === 'pay' ? paymentForm(kind, r, load) : partyForm(kind, r, load)) });
    };
    const load = async () => { all = await GET(kind === 'customer' ? '/api/customers' : '/api/suppliers', bq({ all: 1 })); filter(); };
    $('#q', el).oninput = debounce(filter, 150); $('#debt', el).onchange = filter;
    $('#add', el).onclick = () => partyForm(kind, null, load);
    $('#csv', el).onclick = () => exportCSV(kind === 'customer' ? 'العملاء' : 'الموردين', cols, rows);
    void lbl; await load();
  };
}
VIEWS.customers = partyView('customer');
VIEWS.suppliers = partyView('supplier');
async function statement(kind, c) {
  const d = await GET(`/api/${kind === 'customer' ? 'customers' : 'suppliers'}/${c.id}/statement`);
  const cols = [{ t: 'التاريخ', f: (r) => dt(r.date), v: (r) => r.date }, { t: 'المستند', f: (r) => `<span class="num">${esc(r.doc)}</span>`, v: (r) => r.doc }, { t: 'البيان', k: 'type' }, { t: kind === 'customer' ? 'مدين (عليه)' : 'دائن (له)', n: 1, f: (r) => (r.debit ? M(r.debit) : ''), v: (r) => r.debit }, { t: kind === 'customer' ? 'دائن (دفع)' : 'مدين (دفعنا)', n: 1, f: (r) => (r.credit ? M(r.credit) : ''), v: (r) => r.credit }, { t: 'الرصيد', n: 1, f: (r) => `<b>${M(r.balance)}</b>`, v: (r) => r.balance }, { t: 'ملاحظات', k: 'note' }];
  const rows = [{ date: '', doc: '', type: 'رصيد أول المدة', debit: 0, credit: 0, balance: d.opening, note: '' }, ...d.rows];
  const m = modal({ title: `كشف حساب: ${c.name}`, wide: 'xwide', body: `<div class="row" style="margin-bottom:10px"><span class="muted">${esc(c.phone || '')}</span><span class="sp"></span><span>الرصيد الحالي: <b>${M(d.balance, d.balance > 0 ? 'warn' : '')}</b> ${d.balance > 0 ? (kind === 'customer' ? '(عليه)' : '(له)') : ''}</span></div><div id="st"></div>`,
    buttons: [{ t: `${icon('print')} طباعة`, cls: 'pri', fn: () => { printReport(`كشف حساب ${kind === 'customer' ? 'عميل' : 'مورد'}: ${c.name}`, `${c.phone || ''} — الرصيد الحالي ${money(d.balance)}`, tableHTML(cols.filter((x) => x.k !== 'note'), rows)); return false; } }, { t: 'Excel', fn: () => { exportCSV(`كشف-حساب-${c.name}`, cols, rows); return false; } }, { t: 'إغلاق' }] });
  mountTable($('#st', m.mb), cols, rows, { maxh: '60vh', click: (r) => (r.ref === 'sale' ? saleModal(r.ref_id) : r.ref === 'purchase' ? purchaseModal(r.ref_id) : null) });
}
function paymentForm(kind, c, onSave) {
  modal({
    title: kind === 'customer' ? `سند قبض — تحصيل من ${c.name}` : `سند صرف — سداد إلى ${c.name}`,
    body: `<p class="muted" style="margin-top:0">الرصيد الحالي: <b>${M(c.balance)}</b></p>
      <div class="grid g2"><div class="field"><label class="f">المبلغ *</label><input class="in" type="number" step="any" min="0" name="amount" value="${c.balance > 0 ? c.balance : ''}"></div>
      <div class="field"><label class="f">طريقة الدفع</label><select class="in" name="method">${methodOpts()}</select></div></div>
      <div class="field" id="refF" style="display:none"><label class="f">رقم العملية / رقم المحوِّل</label><input class="in" name="ref" dir="ltr"></div>
      <div class="field"><label class="f">البيان</label><input class="in" name="notes"></div><label class="chk"><input type="checkbox" name="print" checked> طباعة السند</label>`,
    onOpen: (mb) => { const s = $('[name=method]', mb); s.onchange = () => ($('#refF', mb).style.display = s.value === 'cash' ? 'none' : ''); mb._att = attachUI($('[name=notes]', mb)); },
    buttons: [{ t: 'حفظ', cls: 'pri', fn: async (mb) => {
      const v = fv(mb);
      const r = await POST('/api/payments', { branch_id: c.branch_id, party: kind, party_id: c.id, amount: v.amount, method: v.method, notes: v.notes, ref: v.method === 'cash' ? '' : v.ref });
      if (mb._att) await mb._att.upload('payment', r.id);
      toast('تم حفظ السند', 'ok'); S.cache = {};
      if (v.print) printVoucher({ title: kind === 'customer' ? 'سند قبض نقدية' : 'سند صرف نقدية', branch_id: c.branch_id, no: r.id, date: r.date, party: r.party_name, amount: r.amount, method: r.method, notes: v.notes, balance: r.balance });
      onSave && onSave();
    } }, { t: 'إلغاء' }],
  });
}
VIEWS.payments = async (el) => {
  const st = S.paySt || (S.paySt = { ...newRange('month'), party: '' });
  el.innerHTML = `<div class="toolbar">${rangeHTML(st)}<select class="in" id="pp">${opt('', 'الكل', st.party)}${can('customers') ? opt('customer', 'سندات قبض (من العملاء)', st.party) : ''}${can('suppliers') ? opt('supplier', 'سندات صرف (للموردين)', st.party) : ''}</select><span class="sp"></span>
    ${can('customers') ? `<button class="btn pri" id="nc">${icon('plus')}سند قبض</button>` : ''}${can('suppliers') ? `<button class="btn" id="ns">${icon('plus')}سند صرف</button>` : ''}<button class="btn" id="csv">${icon('download')}Excel</button></div><div id="tb"></div>`;
  let rows = [];
  const cols = [{ t: 'رقم', f: (r) => `<span class="num">${r.id}</span>`, v: (r) => r.id }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id) }] : []), { t: 'التاريخ', f: (r) => dt(r.date), v: (r) => r.date }, { t: 'النوع', f: (r) => (r.party === 'customer' ? '<span class="badge ok">قبض</span>' : '<span class="badge bad">صرف</span>'), v: (r) => (r.party === 'customer' ? 'قبض' : 'صرف') }, { t: 'الاسم', k: 'party_name' }, { t: 'المبلغ', n: 1, f: (r) => M(r.amount), v: (r) => r.amount }, { t: 'الطريقة', f: (r) => mName(r.method) }, { t: 'البيان', f: (r) => `${esc(r.notes || '')} ${attIcon(r)}`, v: (r) => r.notes }, { t: 'المستخدم', k: 'user_name' }, { t: '', noCsv: 1, f: (r) => (r.status === 'void' ? '<span class="badge bad">ملغي</span>' : `<button class="btn sm" data-act="pr">طباعة</button>${isAdmin() ? ' <button class="btn sm bad" data-act="void">إلغاء</button>' : ''}`) }];
  const load = async () => {
    rows = await GET('/api/payments', bq({ from: st.from, to: st.to, party: st.party }));
    const ok = rows.filter((r) => r.status === 'ok');
    mountTable($('#tb', el), cols, rows, { rowCls: (r) => (r.status === 'void' ? 'void' : ''), empty: 'لا توجد سندات', foot: [...(showBranchCol() ? [''] : []), '', '', '', 'قبض − صرف', money(ok.reduce((s, r) => s + (r.party === 'customer' ? r.amount : -r.amount), 0)), '', '', '', ''],
      act: async (a, r) => {
        if (a === 'att') return attModal('payment', r.id, `${r.party_name} — ${money(r.amount)}`);
        if (a === 'pr') printVoucher({ title: r.party === 'customer' ? 'سند قبض نقدية' : 'سند صرف نقدية', branch_id: r.branch_id, no: r.id, date: r.date, party: r.party_name, amount: r.amount, method: r.method, notes: r.notes });
        if (a === 'void') { const why = await promptBox('إلغاء السند', 'سبب الإلغاء:'); if (why == null) return; try { await POST(`/api/payments/${r.id}/void`, { reason: why }); toast('تم الإلغاء', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } }
      } });
  };
  const choose = async (kind) => {
    if (!curBranch()) return toast('اختار المعرض من فوق الأول', 'bad');
    const list = kind === 'customer' ? await customers(true) : await suppliers(true);
    const m = modal({ title: kind === 'customer' ? 'اختار العميل' : 'اختار المورد', body: `<div><input class="in" id="pk" placeholder="اكتب للبحث…" autocomplete="off"></div>`, buttons: [{ t: 'إلغاء' }] });
    picker($('#pk', m.mb), { items: () => list.filter((x) => x.name !== 'عميل نقدي'), match: (c, q) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q), label: (c) => esc(c.name), sub: (c) => `رصيد ${money(c.balance)}`, onPick: (c) => { m.close(); paymentForm(kind, c, load); } });
  };
  bindRange(el, st, load); $('#pp', el).onchange = (e) => { st.party = e.target.value; load(); };
  if ($('#nc', el)) $('#nc', el).onclick = () => choose('customer'); if ($('#ns', el)) $('#ns', el).onclick = () => choose('supplier');
  $('#csv', el).onclick = () => exportCSV('السندات', cols, rows);
  await load();
};

/* =====================================================================
   المصروفات
   ===================================================================== */
VIEWS.expenses = async (el) => {
  const st = S.expSt || (S.expSt = newRange('month'));
  const cats = S.settings.expense_categories || [];
  el.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="hd">تسجيل مصروف</div><div class="bd"><div class="grid g4" id="ef">
      <div><label class="f">البند</label><select class="in" name="category">${cats.map((c) => opt(c, c)).join('')}</select></div>
      <div><label class="f">المبلغ</label><input class="in" type="number" step="any" min="0" name="amount"></div>
      <div><label class="f">دُفع من</label><select class="in" name="method">${methodOpts()}</select></div>
      <div><label class="f">البيان</label><input class="in" name="notes"></div></div>
      <button class="btn pri" id="esave" style="margin-top:12px">${icon('plus')}حفظ المصروف</button></div></div>
    <div class="toolbar">${rangeHTML(st)}<span class="sp"></span><button class="btn" id="csv">${icon('download')}Excel</button></div><div class="grid g21" style=""><div id="tb"></div><div id="bc"></div></div>`;
  let rows = [];
  const cols = [{ t: 'التاريخ', f: (r) => dt(r.date), v: (r) => r.date }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id) }] : []), { t: 'البند', k: 'category' }, { t: 'المبلغ', n: 1, f: (r) => M(r.amount), v: (r) => r.amount }, { t: 'من', f: (r) => mName(r.method) }, { t: 'البيان', f: (r) => `${esc(r.notes || '')} ${attIcon(r)}`, v: (r) => r.notes }, { t: 'المستخدم', k: 'user_name' }, { t: '', noCsv: 1, f: (r) => (r.status === 'void' ? '<span class="badge bad">ملغي</span>' : isAdmin() ? '<button class="btn sm bad" data-act="void">إلغاء</button>' : '') }];
  const att = attachUI($('#ef [name=notes]', el));
  const load = async () => {
    if ($('#esave', el)) $('#esave', el).disabled = !curBranch();
    rows = await GET('/api/expenses', bq({ from: st.from, to: st.to }));
    const ok = rows.filter((r) => r.status === 'ok'); const tot = ok.reduce((s, r) => s + r.amount, 0);
    mountTable($('#tb', el), cols, rows, { rowCls: (r) => (r.status === 'void' ? 'void' : ''), empty: 'لا توجد مصروفات', act: async (a, r) => { if (a === 'att') return attModal('expense', r.id, `${r.category} — ${money(r.amount)}`); if (a !== 'void') return; const why = await promptBox('إلغاء المصروف', 'سبب الإلغاء:'); if (why == null) return; try { await POST(`/api/expenses/${r.id}/void`, { reason: why }); toast('تم الإلغاء', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } });
    const by = {}; ok.forEach((r) => (by[r.category] = (by[r.category] || 0) + r.amount));
    $('#bc', el).innerHTML = `<div class="card"><div class="hd">حسب البند<span class="sp"></span>${M(tot)}</div>${tableHTML([{ t: 'البند', k: 'k' }, { t: 'المبلغ', n: 1, f: (r) => M(r.v) }, { t: '%', n: 1, f: (r) => `<span class="num">${tot ? Math.round((r.v / tot) * 100) : 0}%</span>` }], Object.entries(by).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v))}</div>`;
  };
  $('#esave', el).onclick = async () => {
    if (!curBranch()) return toast('اختار المعرض من فوق الأول', 'bad');
    const v = fv($('#ef', el));
    try { const r = await POST('/api/expenses', { ...v, branch_id: curBranch() }); const n = await att.upload('expense', r.id); toast(`تم حفظ المصروف${n ? ` مع ${n} صورة` : ''}`, 'ok'); $('[name=amount]', el).value = ''; $('[name=notes]', el).value = ''; load(); } catch (e) { toast(e.message, 'bad'); }
  };
  bindRange(el, st, load); $('#csv', el).onclick = () => exportCSV('المصروفات', cols, rows);
  await load();
};

/* =====================================================================
   الخزينة
   ===================================================================== */
/* ---------- السلف والاقتراض ---------- */
VIEWS.loans = async (el) => {
  const st = S.loanSt || (S.loanSt = { status: 'open' });
  el.innerHTML = `<div class="grid g4" id="ls" style="margin-bottom:16px"></div>
    <div class="toolbar"><div class="seg" id="lf">${[['open', 'مفتوحة'], ['done', 'مسددة'], ['all', 'الكل']].map(([k, t]) => `<button data-s="${k}" class="${st.status === k ? 'on' : ''}">${t}</button>`).join('')}</div><span class="sp"></span>
      <button class="btn ok" id="lin">${icon('plus')}اقتراض (فلوس داخلة للدرج)</button><button class="btn bad" id="lout">${icon('plus')}سلفة (فلوس خارجة من الدرج)</button></div><div id="lt"></div>`;
  let rows = [];
  const load = async () => {
    rows = await GET('/api/loans', bq());
    const ok = rows.filter((r) => r.status === 'ok');
    const owe = ok.filter((r) => r.view_dir === 'in').reduce((s, r) => s + r.remaining, 0), due = ok.filter((r) => r.view_dir === 'out').reduce((s, r) => s + r.remaining, 0);
    $('#ls', el).innerHTML = stat('علينا (اقترضناه ولسه مارجّعناش)', M(owe), `${ok.filter((r) => r.view_dir === 'in' && r.remaining > 0.009).length} اقتراض مفتوح`, owe > 0 ? 'bad' : '', 'coins', '#dc2626')
      + stat('لينا (سلّفناه ولسه ماتحصّلش)', M(due), `${ok.filter((r) => r.view_dir === 'out' && r.remaining > 0.009).length} سلفة مفتوحة`, due > 0 ? 'warn' : '', 'coins', '#d97706')
      + stat('الصافي', M(due - owe), due - owe >= 0 ? 'لينا أكتر من علينا' : 'علينا أكتر من لينا', '', 'trend', '#0e7490');
    const show = rows.filter((r) => st.status === 'all' || (st.status === 'open' ? r.status === 'ok' && r.remaining > 0.009 : r.status !== 'ok' || r.remaining <= 0.009));
    mountTable($('#lt', el), [
      { t: 'التاريخ', f: (r) => dt(r.date) }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.view_branch) }] : []),
      { t: 'النوع', f: (r) => (r.view_dir === 'in' ? '<span class="badge bad">اقتراض — علينا</span>' : '<span class="badge warn">سلفة — لينا</span>') },
      { t: 'من / إلى', f: (r) => (r.party_is_branch ? `🏬 ${esc(r.party_label || '')}` : `👤 ${esc(r.party_label || '')}${r.party_phone ? ` <span class="small faint num">${esc(r.party_phone)}</span>` : ''}`) },
      { t: 'المبلغ', n: 1, f: (r) => M(r.amount) }, { t: 'اتسدد', n: 1, f: (r) => (r.paid ? M(r.paid, 'ok') : '') }, { t: 'المتبقي', n: 1, f: (r) => `<b>${M(r.remaining, r.remaining > 0.009 ? (r.view_dir === 'in' ? 'bad' : 'warn') : 'ok')}</b>` },
      { t: 'ميعاد السداد', f: (r) => (r.due_date ? `<span class="num ${r.remaining > 0.009 && r.due_date < ymd(new Date()) ? 'bad' : ''}">${r.due_date}</span>` : '') },
      { t: 'ملاحظات', f: (r) => `${esc(r.notes || '')} ${attIcon(r)}` },
      { t: '', f: (r) => (r.status !== 'ok' ? '<span class="badge bad">ملغي</span>' : `<span class="row" style="flex-wrap:nowrap">${r.remaining > 0.009 ? `<button class="btn sm pri" data-act="pay">${r.view_dir === 'in' ? 'سداد' : 'تحصيل'}</button>` : '<span class="badge ok">مسددة ✓</span>'}<button class="btn sm" data-act="det">تفاصيل</button></span>`) },
    ], show, { empty: st.status === 'open' ? 'مفيش سلف أو قروض مفتوحة ✓' : 'لا يوجد', rowCls: (r) => (r.status !== 'ok' ? 'void' : ''), act: (a, r) => (a === 'pay' ? loanPay(r, load) : loanDetails(r.id, load)) });
  };
  $$('#lf button', el).forEach((b) => (b.onclick = () => { st.status = b.dataset.s; $$('#lf button', el).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  $('#lin', el).onclick = () => loanForm('in', load);
  $('#lout', el).onclick = () => loanForm('out', load);
  await load();
};
function loanForm(dir, onDone) {
  const b = curBranch(); if (!b) return toast('اختار المعرض من فوق الأول', 'bad');
  const others = S.branches.filter((x) => x.id !== b);
  // الكاشير مش شايف المعرض التاني في قايمته، فنجيب الأسماء من السيرفر
  const brOpts = others.length ? others : [];
  const m = modal({ title: dir === 'in' ? 'اقتراض — فلوس داخلة للدرج' : 'سلفة — فلوس خارجة من الدرج', body: `
    <p class="muted" style="margin-top:0">${dir === 'in' ? 'سجّل هنا لو خدت فلوس سلف من المعرض التاني أو من حد برّه. المبلغ هيتضاف لخزينتك ويتسجل "علينا" لحد ما يترجع.' : 'سجّل هنا لو اديت فلوس سلف للمعرض التاني أو لحد برّه. المبلغ هيخرج من خزينتك ويتسجل "لينا" لحد ما يتحصّل.'}</p>
    <div class="field"><label class="f">${dir === 'in' ? 'اقترضت من' : 'سلّفت لـ'}</label><div class="seg" id="pt"><button type="button" data-t="branch" class="on">🏬 المعرض التاني</button><button type="button" data-t="external">👤 شخص / جهة برّه</button></div></div>
    <div class="field" id="pbW"><label class="f">المعرض</label><select class="in" name="party_branch_id" id="pbs">${brOpts.map((x) => opt(x.id, x.name)).join('')}</select></div>
    <div class="grid g2 hide" id="pxW"><div class="field"><label class="f">الاسم *</label><input class="in" name="party_name" placeholder="مثال: أ/ محمد — مورد — قريب"></div><div class="field"><label class="f">الموبايل</label><input class="in" name="party_phone" dir="ltr"></div></div>
    <div class="grid g3"><div class="field"><label class="f">المبلغ *</label><input class="in" type="number" step="any" min="0" name="amount" autofocus></div><div class="field"><label class="f">${dir === 'in' ? 'دخل على' : 'خرج من'}</label><select class="in" name="method">${methodOpts()}</select></div><div class="field"><label class="f">ميعاد السداد (اختياري)</label><input class="in" type="date" name="due_date"></div></div>
    <div class="field"><label class="f">السبب / ملاحظات</label><input class="in" name="notes" placeholder="مثال: فكة للدرج — دفع إيجار — سلفة موظف"></div>
    <label class="chk"><input type="checkbox" name="print" checked> طباعة إيصال</label>`,
    buttons: [{ t: 'حفظ', cls: 'pri', fn: async (mb) => {
      const v = fv(mb); v.party_type = $('#pt .on', mb).dataset.t; v.direction = dir; v.branch_id = b;
      if (v.party_type === 'branch' && !v.party_branch_id) throw new Error('مفيش معرض تاني متاح — اختار "شخص / جهة برّه"');
      const r = await POST('/api/loans', v); await mb._att.upload('loan', r.id);
      toast(dir === 'in' ? `اتسجل الاقتراض من ${r.party_label} ✓` : `اتسجلت السلفة لـ ${r.party_label} ✓`, 'ok');
      if (v.print) printVoucher({ title: dir === 'in' ? 'إيصال استلام سلفة (اقتراض)' : 'إيصال صرف سلفة', branch_id: b, no: 'L' + r.id, date: r.date, party: r.party_label, amount: r.amount, method: r.method, notes: v.notes });
      onDone && onDone();
    } }, { t: 'إلغاء' }] });
  m.mb._att = attachUI($('[name=notes]', m.mb));
  const setT = (t) => { $$('#pt button', m.mb).forEach((x) => x.classList.toggle('on', x.dataset.t === t)); $('#pbW', m.mb).classList.toggle('hide', t !== 'branch'); $('#pxW', m.mb).classList.toggle('hide', t === 'branch'); };
  $$('#pt button', m.mb).forEach((x) => (x.onclick = () => setT(x.dataset.t)));
  if (!brOpts.length) { // الكاشير: نجيب أسماء المعارض التانية
    GET('/api/branches').then((list) => { const o = list.filter((x) => x.id !== b); $('#pbs', m.mb).innerHTML = o.map((x) => opt(x.id, x.name)).join(''); if (!o.length) setT('external'); }).catch(() => setT('external'));
  }
}
function loanPay(r, onDone) {
  const isIn = r.view_dir === 'in';
  modal({ title: isIn ? `سداد اقتراض — ${r.party_label}` : `تحصيل سلفة — ${r.party_label}`, body: `
    <div class="grid g3" style="margin-bottom:12px"><div><div class="small muted">المبلغ</div><b class="num">${money(r.amount)}</b></div><div><div class="small muted">اتسدد</div><b class="num ok">${money(r.paid)}</b></div><div><div class="small muted">المتبقي</div><b class="num ${isIn ? 'bad' : 'warn'}">${money(r.remaining)}</b></div></div>
    <div class="grid g2"><div class="field"><label class="f">${isIn ? 'المبلغ اللي بترجّعه' : 'المبلغ اللي اتحصّل'}</label><input class="in" type="number" step="any" min="0" name="amount" value="${r.remaining}" autofocus></div><div class="field"><label class="f">${isIn ? 'خرج من' : 'دخل على'}</label><select class="in" name="method">${methodOpts()}</select></div></div>
    <div class="field"><label class="f">ملاحظات</label><input class="in" name="notes"></div><label class="chk"><input type="checkbox" name="print" checked> طباعة إيصال</label>`,
    buttons: [{ t: 'حفظ', cls: 'pri', fn: async (mb) => {
      const v = fv(mb); const res = await POST(`/api/loans/${r.id}/pay`, v); await mb._att.upload('loan_pay', res.payment_id);
      toast(res.remaining <= 0.009 ? 'اتسددت بالكامل ✓' : `اتسجل — المتبقي ${money(res.remaining)}`, 'ok');
      if (v.print) printVoucher({ title: isIn ? 'إيصال سداد اقتراض' : 'إيصال تحصيل سلفة', branch_id: curBranch() || r.view_branch, no: 'L' + r.id + '-' + res.payment_id, date: res.date, party: r.party_label, amount: v.amount, method: v.method, notes: v.notes, balance: res.remaining });
      onDone && onDone();
    } }, { t: 'إلغاء' }], onOpen: (mb) => (mb._att = attachUI($('[name=notes]', mb))) });
}
async function loanDetails(id, onDone) {
  const l = await GET('/api/loans/' + id, bq());
  const m = modal({ title: `${l.view_dir === 'in' ? 'اقتراض من' : 'سلفة لـ'} ${l.party_label}`, wide: 'wide', body: `
    <div class="grid g4" style="margin-bottom:12px"><div><div class="small muted">التاريخ</div>${dt(l.date)}</div><div><div class="small muted">سجّلها</div>${esc(l.user_name || '')} — ${esc(l.branch_name || '')}</div><div><div class="small muted">المبلغ</div><b class="num">${money(l.amount)}</b> ${mBadge(l.method)}</div><div><div class="small muted">المتبقي</div><b class="num">${money(l.remaining)}</b></div></div>
    ${l.notes ? `<p class="muted">${esc(l.notes)}</p>` : ''}<div id="la" style="margin-bottom:12px"></div><b>الدفعات</b><div id="lp" style="margin-top:8px"></div>`,
    buttons: [...(isAdmin() && l.status === 'ok' ? [{ t: 'إلغاء العملية', cls: 'bad', fn: async (mb, close) => { const why = await promptBox('إلغاء السلفة/الاقتراض', 'السبب (الخزينة هترجع زي ما كانت في المعرضين):'); if (why == null) return false; await POST(`/api/loans/${l.id}/void`, { reason: why }); toast('اتلغت', 'ok'); close(); onDone && onDone(); } }] : []), { t: 'إغلاق' }] });
  mountTable($('#lp', m.mb), [{ t: 'التاريخ', f: (r) => dt(r.date) }, { t: 'المبلغ', n: 1, f: (r) => M(r.amount) }, { t: 'الطريقة', f: (r) => mBadge(r.method) }, { t: 'المستخدم', k: 'user_name' }, { t: 'ملاحظات', k: 'notes' }, { t: '', f: (r) => (r.status !== 'ok' ? '<span class="badge bad">ملغي</span>' : `<button class="btn ghost sm" data-act="att">📎</button>`) }], l.payments, { empty: 'لسه مفيش دفعات', act: (a, r) => attModal('loan_pay', r.id, `دفعة ${money(r.amount)}`) });
  attView('loan', l.id, $('#la', m.mb));
}

VIEWS.treasury = async (el) => {
  const st = S.trSt || (S.trSt = { ...newRange('month'), method: '' });
  el.innerHTML = `<div class="grid g4" id="bal" style="margin-bottom:14px"></div>
    <div class="toolbar">${rangeHTML(st)}<select class="in" id="tm">${opt('', 'كل الخزائن', st.method)}${methodOpts(st.method)}</select><span class="sp"></span>
    <button class="btn" data-op="deposit">${icon('plus')}إيداع</button><button class="btn" data-op="withdraw">سحب / مسحوبات</button><button class="btn" data-op="transfer">تحويل بين الخزائن</button><button class="btn" id="csv">${icon('download')}Excel</button><button class="btn" id="prn">${icon('print')}</button></div><div id="tb"></div>`;
  if (!$('#tm', el).value) $('#tm', el).value = st.method;
  let d = null;
  const cols = [{ t: 'التاريخ', f: (r) => dt(r.date), v: (r) => r.date }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id), v: (r) => branchOf(r.branch_id).name }] : []), { t: 'الخزينة', f: (r) => mName(r.method), v: (r) => mName(r.method) }, { t: 'الحركة', k: 'type_ar' }, { t: 'البيان', k: 'notes' }, { t: 'وارد', n: 1, f: (r) => (r.amount > 0 ? M(r.amount, 'ok') : ''), v: (r) => (r.amount > 0 ? r.amount : '') }, { t: 'منصرف', n: 1, f: (r) => (r.amount < 0 ? M(-r.amount, 'bad') : ''), v: (r) => (r.amount < 0 ? -r.amount : '') }, { t: 'الرصيد', n: 1, f: (r) => `<b>${M(r.balance)}</b>`, v: (r) => r.balance }, { t: 'المستخدم', k: 'user_name' }];
  const load = async () => {
    d = await GET('/api/treasury', bq({ from: st.from, to: st.to, method: st.method }));
    const tot = sumMap(d.balances);
    $('#bal', el).innerHTML = stat('الإجمالي', M(tot)) + Object.entries(d.balances).filter(([k, v]) => S.methods[k] || Math.abs(v) > 0.009).map(([k, v]) => stat(mName(k), M(v, v < 0 ? 'bad' : ''))).join('');
    const inn = d.rows.reduce((s, r) => s + Math.max(0, r.amount), 0), out = d.rows.reduce((s, r) => s + Math.max(0, -r.amount), 0);
    const rows = [{ date: '', type_ar: 'رصيد أول الفترة', notes: '', amount: 0, balance: d.opening, method: '' }, ...d.rows];
    mountTable($('#tb', el), cols, rows, { maxh: '62vh', foot: [...(showBranchCol() ? [''] : []), '', '', '', 'إجمالي الفترة', money(inn), money(out), money(d.closing), ''] });
    d._rows = rows;
  };
  $$('[data-op]', el).forEach((b) => (b.onclick = () => {
    if (!curBranch()) return toast('اختار المعرض من فوق الأول', 'bad');
    const op = b.dataset.op;
    modal({ title: op === 'deposit' ? 'إيداع في الخزينة' : op === 'withdraw' ? 'سحب من الخزينة' : 'تحويل بين الخزائن',
      body: `<div class="grid g2"><div class="field"><label class="f">${op === 'transfer' ? 'من' : 'الخزينة'}</label><select class="in" name="method">${methodOpts()}</select></div>${op === 'transfer' ? `<div class="field"><label class="f">إلى</label><select class="in" name="to_method">${methodOpts(Object.keys(S.methods)[1] || 'cash')}</select></div>` : ''}
        <div class="field"><label class="f">المبلغ</label><input class="in" type="number" step="any" min="0" name="amount"></div></div><div class="field"><label class="f">البيان</label><input class="in" name="notes" placeholder="${op === 'deposit' ? 'مثال: رأس مال / فكة' : op === 'withdraw' ? 'مثال: مسحوبات شخصية / توريد للبنك' : 'مثال: إيداع كاش البنك'}"></div>`,
      onOpen: (mb) => (mb._att = attachUI($('[name=notes]', mb))),
      buttons: [{ t: 'حفظ', cls: 'pri', fn: async (mb) => { const r = await POST('/api/treasury', { ...fv(mb), type: op, branch_id: curBranch() }); if (r.id) await mb._att.upload('treasury', r.id); toast('تم', 'ok'); load(); } }, { t: 'إلغاء' }] });
  }));
  bindRange(el, st, load); $('#tm', el).onchange = (e) => { st.method = e.target.value; load(); };
  $('#csv', el).onclick = () => exportCSV('حركة-الخزينة', cols, d._rows);
  $('#prn', el).onclick = () => printReport('حركة الخزينة', `${rangeLabel(st)} — ${st.method ? mName(st.method) : 'كل الخزائن'}`, tableHTML(cols.filter((c) => c.k !== 'user_name'), d._rows));
  await load();
};

/* =====================================================================
   الورديات
   ===================================================================== */
function openShiftModal(done) {
  modal({ title: 'فتح وردية جديدة', body: `<div class="field"><label class="f">النقدية الموجودة في الدرج (الفكة) عند البداية</label><input class="in" type="number" step="any" min="0" name="opening_cash" value="0"></div>`,
    buttons: [{ t: 'فتح الوردية', cls: 'pri', fn: async (mb) => { await POST('/api/shift/open', { ...fv(mb), branch_id: curBranch() }); toast('تم فتح الوردية', 'ok'); done && done(); } }, { t: 'إلغاء' }] });
}
function shiftReport(s) {
  const rows = [['فتح الوردية', s.opened_at.slice(0, 16)], ['قفل الوردية', (s.closed_at || '—').slice(0, 16)], ['الكاشير', s.user_name || S.user.name], ['عدد فواتير البيع', s.sales_count], ['إجمالي المبيعات', money(s.sales_total)], ['المرتجعات', money(s.returns_total)], ['فكة البداية', money(s.opening_cash)],
    ...Object.entries(s.cash_by_type).map(([k, v]) => [`نقدي — ${k}`, money(v)]), ...Object.entries(s.by_method).filter(([k, v]) => k !== 'cash' && Math.abs(v) > 0.009).map(([k, v]) => [mName(k), money(v)]), ['النقدية المتوقعة في الدرج', money(s.expected)], ...(s.closed_at ? [['النقدية الفعلية', money(s.counted_cash)], ['الفرق (عجز/زيادة)', money(s.diff)]] : [])];
  return rows;
}
VIEWS.shifts = async (el) => {
  const st = S.shSt || (S.shSt = newRange('month'));
  const cur = curBranch() ? await GET('/api/shift/current', bq()) : null;
  el.innerHTML = `<div class="grid g2" style="margin-bottom:16px"><div class="card"><div class="hd">ورديتي الحالية</div><div class="bd" id="cur"></div></div><div class="card"><div class="hd">إزاي بتشتغل الورديات؟</div><div class="bd muted small">١. في أول اليوم افتح وردية واكتب الفكة اللي في الدرج.<br>٢. البرنامج بيحسب كل الكاش الداخل والخارج من الدرج (مبيعات، مرتجعات، مصروفات، تحصيلات).<br>٣. آخر اليوم اعدّ الفلوس واكتب المبلغ الفعلي، البرنامج يطلعلك العجز أو الزيادة ويطبع تقرير التقفيل.</div></div></div>
    <div class="toolbar">${rangeHTML(st)}</div><div id="tb"></div>`;
  const c = $('#cur', el);
  if (!curBranch()) c.innerHTML = '<span class="muted">اختار المعرض من فوق</span>';
  else if (!cur) { c.innerHTML = `<p class="muted" style="margin-top:0">مفيش وردية مفتوحة.</p><button class="btn pri" id="op">فتح وردية</button>`; $('#op', c).onclick = () => openShiftModal(() => route()); }
  else {
    c.innerHTML = `<table class="t" style="margin-bottom:12px">${shiftReport(cur).map(([k, v]) => `<tr><td>${k}</td><td class="n"><b class="num">${esc(v)}</b></td></tr>`).join('')}</table>
      <div class="row"><input class="in" type="number" step="any" min="0" id="cc" placeholder="النقدية الفعلية في الدرج" style="width:220px"><input class="in" id="cn" placeholder="ملاحظات" style="width:180px"><button class="btn pri" id="cl">تقفيل الوردية</button></div>`;
    const shAtt = attachUI($('#cn', c)); // صورة ورقة عدّ الدرج مثلاً
    $('#cl', c).onclick = async () => {
      if ($('#cc', c).value === '') return toast('اكتب النقدية الفعلية اللي عديتها', 'bad');
      if (!(await confirmBox('تقفيل الوردية؟'))) return;
      try { const s = await POST('/api/shift/close', { branch_id: curBranch(), counted_cash: +$('#cc', c).value, notes: $('#cn', c).value }); s.user_name = S.user.name; await shAtt.upload('shift', s.id); route();
        // بعد التقفيل: نتيجة الدرج + طباعة + إرسال للمدير واتساب
        modal({ title: 'تم تقفيل الوردية ✓', body: `<div style="text-align:center"><div class="muted">الفرق في الدرج</div><div class="num ${s.diff < 0 ? 'bad' : s.diff > 0 ? 'ok' : ''}" style="font-size:34px;font-weight:800">${money(s.diff)}</div><div class="${s.diff < 0 ? 'bad' : 'ok'}" style="font-weight:800">${s.diff === 0 ? 'الدرج مظبوط ✓' : s.diff < 0 ? 'عجز' : 'زيادة'}</div></div><table class="t" style="margin-top:12px">${shiftReport(s).map(([k, v]) => `<tr><td>${k}</td><td class="n"><b class="num">${esc(v)}</b></td></tr>`).join('')}</table>`,
          buttons: [{ t: '💬 ابعت التقفيل للمدير', cls: 'pri', fn: () => { openWhatsApp(S.settings.owner_whatsapp || '', shiftText(s)); return false; } }, { t: `${icon('print')} طباعة`, fn: () => { printShift(s); return false; } }, { t: 'إغلاق' }] });
      } catch (e) { toast(e.message, 'bad'); }
    };
  }
  const cols = [{ t: '#', f: (r) => `<span class="num">${r.id}</span>` }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id) }] : []), { t: 'الكاشير', k: 'user_name' }, { t: 'الفتح', f: (r) => dt(r.opened_at) }, { t: 'القفل', f: (r) => (r.closed_at ? dt(r.closed_at) : '<span class="badge ok">مفتوحة</span>') }, { t: 'المبيعات', n: 1, f: (r) => M(r.sales_total) }, { t: 'المتوقع', n: 1, f: (r) => M(r.closed_at ? r.expected_cash : r.expected) }, { t: 'الفعلي', n: 1, f: (r) => (r.closed_at ? M(r.counted_cash) : '') }, { t: 'الفرق', n: 1, f: (r) => (r.closed_at ? M(r.diff, r.diff < 0 ? 'bad' : r.diff > 0 ? 'ok' : '') : '') }, { t: '', f: () => '<button class="btn sm" data-act="pr">طباعة</button>' }];
  const load = async () => { const rows = await GET('/api/shifts', bq({ from: st.from, to: st.to })); mountTable($('#tb', el), cols, rows, { empty: 'لا توجد ورديات', act: (a, r) => printShift(r) }); };
  bindRange(el, st, load); await load();
};
function printShift(s) {
  const b = branchOf(s.branch_id);
  printHTML(`<h1>${esc(b.name)}</h1><div class="sub">تقرير تقفيل وردية #${s.id}</div><div class="hr"></div><table class="meta">${shiftReport(s).map(([k, v]) => `<tr><td>${k}</td><td class="n"><b>${esc(v)}</b></td></tr>`).join('')}</table>${s.notes ? `<div class="hr"></div>${esc(s.notes)}` : ''}<div class="hr"></div><div class="ft">توقيع الكاشير: ............ توقيع المدير: ............</div>`, true);
}

/* =====================================================================
   التقارير
   ===================================================================== */
VIEWS.reports = async (el) => {
  const st = S.repSt || (S.repSt = { ...newRange('month'), tab: 'sales', group: 'day' });
  const tabs = [['sales', 'تقرير المبيعات'], ...(can('see_cost') ? [['pnl', 'الأرباح والخسائر']] : []), ...(S.branches.length > 1 ? [['compare', 'مقارنة المعارض']] : []), ['inv', 'تقييم المخزون'], ['bal', 'المديونيات'], ...(isAdmin() ? [['audit', 'سجل العمليات']] : [])];
  el.innerHTML = `<div class="tabs">${tabs.map(([k, t]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="rv"></div>`;
  $$('.tabs button', el).forEach((b) => (b.onclick = () => { st.tab = b.dataset.t; route(); }));
  const rv = $('#rv', el);
  const sub = () => `${rangeLabel(st)} — ${curBranch() ? branchOf(curBranch()).name : 'كل المعارض'}`;
  if (st.tab === 'sales') {
    const G = [['day', 'يومي'], ['month', 'شهري'], ['product', 'حسب الصنف'], ['category', 'حسب التصنيف'], ['user', 'حسب الكاشير'], ...(isAdmin() ? [['branch', 'حسب المعرض']] : [])];
    rv.innerHTML = `<div class="toolbar">${rangeHTML(st)}<select class="in" id="gg">${G.map(([k, t]) => opt(k, t, st.group)).join('')}</select><span class="sp"></span><button class="btn" id="csv">${icon('download')}Excel</button><button class="btn" id="prn">${icon('print')}طباعة</button></div><div class="grid g4" id="sm" style="margin-bottom:14px"></div><div id="tb"></div><div id="mt" style="margin-top:14px"></div>`;
    let d, cols;
    const load = async () => {
      d = await GET('/api/reports/sales', bq({ from: st.from, to: st.to, group: st.group }));
      const s = d.summary; const sc = can('see_cost');
      $('#sm', rv).innerHTML = stat('المبيعات', M(s.sales), `${s.count} فاتورة · خصومات ${money(s.discounts)}`) + stat('المرتجعات', M(s.returns)) + stat('صافي المبيعات', M(s.net)) + (sc ? stat('مجمل الربح', M(s.gross_profit), `تكلفة البضاعة ${money(s.cogs)} · هامش ${s.net ? Math.round((s.gross_profit / s.net) * 100) : 0}%`, 'ok') : stat('متوسط الفاتورة', M(s.count ? s.sales / s.count : 0)));
      const isItem = st.group === 'product' || st.group === 'category';
      cols = [...(st.group === 'product' ? [{ t: 'الكود', k: 'code' }] : []), { t: { day: 'اليوم', month: 'الشهر', product: 'الصنف', category: 'التصنيف', user: 'الكاشير', branch: 'المعرض' }[st.group], f: (r) => esc(r.label ?? '—'), v: (r) => r.label },
        ...(isItem ? [{ t: 'الكمية', n: 1, f: (r) => Q(r.qty), v: (r) => r.qty }] : [{ t: 'عدد الفواتير', n: 1, k: 'cnt' }, { t: 'المبيعات', n: 1, f: (r) => M(r.sales), v: (r) => r.sales }, { t: 'المرتجع', n: 1, f: (r) => M(r.returns), v: (r) => r.returns }, { t: 'الخصومات', n: 1, f: (r) => M(r.discount), v: (r) => r.discount }]),
        { t: 'الصافي', n: 1, f: (r) => `<b>${M(r.total)}</b>`, v: (r) => r.total }, ...(sc ? [{ t: 'التكلفة', n: 1, f: (r) => M(r.cost), v: (r) => r.cost }, { t: 'مجمل الربح', n: 1, f: (r) => M(r.profit, r.profit < 0 ? 'bad' : 'ok'), v: (r) => r.profit }, { t: 'الهامش', n: 1, f: (r) => `<span class="num">${r.total ? Math.round((r.profit / r.total) * 100) : 0}%</span>`, noCsv: 1 }] : [])];
      const sumK = (k) => money(d.rows.reduce((a, r) => a + (r[k] || 0), 0));
      const foot = cols.map((c, i) => (i === 0 ? 'الإجمالي' : c.v && ['total', 'cost', 'profit', 'sales', 'returns', 'discount'].some((k) => c.v({ [k]: 1 }) === 1) ? sumK(['total', 'cost', 'profit', 'sales', 'returns', 'discount'].find((k) => c.v({ [k]: 1 }) === 1)) : ''));
      mountTable($('#tb', rv), cols, d.rows, { foot, empty: 'لا توجد مبيعات في الفترة' });
      d.foot = foot;
      $('#mt', rv).innerHTML = `<div class="card" style="max-width:480px"><div class="hd">صافي التحصيل حسب طريقة الدفع</div>${tableHTML([{ t: 'الطريقة', f: (r) => mName(r.method) }, { t: 'المبلغ', n: 1, f: (r) => M(r.v) }], d.methods)}</div>`;
    };
    bindRange(rv, st, load); $('#gg', rv).onchange = (e) => { st.group = e.target.value; load(); };
    $('#csv', rv).onclick = () => exportCSV('تقرير-المبيعات', cols, d.rows);
    $('#prn', rv).onclick = () => printReport('تقرير المبيعات', sub(), tableHTML(cols.filter((c) => !c.noCsv), d.rows, d.foot.filter((_, i) => !cols[i].noCsv)));
    return load();
  }
  if (st.tab === 'compare') {
    st.months = st.months || 6;
    rv.innerHTML = `<div class="toolbar"><label class="f" style="margin:0">آخر</label><select class="in" id="cm">${[3, 6, 12].map((n) => opt(n, n + ' شهور', st.months)).join('')}</select><span class="sp"></span><button class="btn" id="prn">${icon('print')}طباعة</button></div><div id="cv"></div>`;
    const MN = (m) => `${AR_MONTHS[+m.slice(5) - 1]} ${m.slice(2, 4)}`;
    const load = async () => {
      const d = await GET('/api/reports/compare', { months: st.months });
      const sum = (id, k) => d.months.reduce((s, m) => s + (d.data[id][m][k] || 0), 0);
      const max = Math.max(1, ...d.branches.flatMap((b) => d.months.map((m) => d.data[b.id][m].net)));
      // كروت الإجمالي لكل معرض
      const cards = d.branches.map((b) => { const net = sum(b.id, 'net'), cnt = sum(b.id, 'cnt'), pr = d.see_cost ? sum(b.id, 'profit') : null;
        return `<div class="card" style="padding:16px 18px;border-top:4px solid ${esc(b.color)}"><div class="row"><span class="dot" style="background:${esc(b.color)}"></span><b>${esc(b.name)}</b><span class="sp"></span><span class="faint small">آخر ${st.months} شهور</span></div>
          <div class="grid g3" style="margin-top:10px;gap:10px"><div><div class="small muted">صافي المبيعات</div><b class="num" style="font-size:18px">${money(net)}</b></div><div><div class="small muted">عدد الفواتير</div><b class="num" style="font-size:18px">${cnt}</b></div>${pr != null ? `<div><div class="small muted">صافي الربح</div><b class="num ${pr < 0 ? 'bad' : 'ok'}" style="font-size:18px">${money(pr)}</b></div>` : `<div><div class="small muted">متوسط الفاتورة</div><b class="num" style="font-size:18px">${money(cnt ? net / cnt : 0)}</b></div>`}</div></div>`; }).join('');
      // رسم: عمودين لكل شهر
      const chart = `<div class="card" style="margin:16px 0"><div class="hd">صافي المبيعات شهر بشهر<span class="sp"></span>${d.branches.map((b) => `<span class="branch-pill"><span class="dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</span>`).join(' ')}</div><div class="bd"><div class="bars" style="height:200px;gap:14px">${d.months.map((m) => `<div class="b"><div style="display:flex;gap:3px;align-items:flex-end;height:100%;width:100%;justify-content:center">${d.branches.map((b) => { const v = d.data[b.id][m].net; return `<i title="${esc(b.name)}: ${money(v)}" style="height:${Math.max(2, (v / max) * 160)}px;background:${esc(b.color)};max-width:22px"></i>`; }).join('')}</div><span>${MN(m)}</span></div>`).join('')}</div></div></div>`;
      // جدول تفصيلي
      const head = `<tr><th>الشهر</th>${d.branches.map((b) => `<th class="n">${esc(b.name)}<br><span class="small faint">مبيعات</span></th><th class="n"><span class="small faint">فواتير</span></th>${d.see_cost ? '<th class="n"><span class="small faint">صافي ربح</span></th>' : ''}`).join('')}<th class="n">الإجمالي</th></tr>`;
      const body = d.months.slice().reverse().map((m) => `<tr><td><b>${MN(m)}</b></td>${d.branches.map((b) => { const x = d.data[b.id][m]; return `<td class="n">${M(x.net)}</td><td class="n">${x.cnt}</td>${d.see_cost ? `<td class="n">${M(x.profit, x.profit < 0 ? 'bad' : 'ok')}</td>` : ''}`; }).join('')}<td class="n"><b>${M(d.branches.reduce((s, b) => s + d.data[b.id][m].net, 0))}</b></td></tr>`).join('');
      const table = `<div class="tbl-wrap"><table class="t"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
      $('#cv', rv).innerHTML = `<div class="grid g2">${cards}</div>${chart}${table}`;
      $('#prn', rv).onclick = () => printReport('مقارنة المعارض', `آخر ${st.months} شهور`, `<table class="t"><thead>${head}</thead><tbody>${body}</tbody></table>`);
    };
    $('#cm', rv).onchange = (e) => { st.months = +e.target.value; load(); };
    return load();
  }
  if (st.tab === 'pnl') {
    rv.innerHTML = `<div class="toolbar">${rangeHTML(st)}<span class="sp"></span><button class="btn" id="prn">${icon('print')}طباعة</button></div><div id="pl" style="max-width:720px"></div>`;
    const load = async () => {
      const d = await GET('/api/reports/pnl', bq({ from: st.from, to: st.to }));
      const L = (k, v, cls = '', ind = 0) => `<tr class="${cls}"><td style="padding-right:${12 + ind * 20}px">${k}</td><td class="n">${M(v, v < 0 ? 'bad' : '')}</td></tr>`;
      const html = `<table class="t">${L('إجمالي المبيعات', d.sales)}${L('(−) مرتجعات المبيعات', -d.returns, '', 1)}${L('صافي المبيعات', d.net, 'b')}${L('(−) تكلفة البضاعة المباعة', -d.cogs, '', 1)}
        <tr><td><b>مجمل الربح</b></td><td class="n"><b>${M(d.gross_profit, d.gross_profit < 0 ? 'bad' : 'ok')}</b></td></tr>
        <tr><td colspan="2" style="background:#f8fafc;font-weight:700">المصروفات التشغيلية</td></tr>${d.expenses.map((e) => L(e.category, -e.v, '', 1)).join('') || '<tr><td colspan="2" class="faint" style="padding-right:32px">لا توجد مصروفات</td></tr>'}
        ${L('إجمالي المصروفات', -d.expenses_total)}${L('عجز / زيادة مخزون (من الجرد)', d.stock_adjust)}
        <tr><td style="font-size:16px"><b>صافي الربح</b></td><td class="n" style="font-size:18px"><b>${M(d.net_profit, d.net_profit < 0 ? 'bad' : 'ok')}</b></td></tr></table>
        <p class="small muted">مشتريات الفترة (للعلم، مش داخلة في الربح لأنها بتروح المخزون): ${M(d.purchases)}. الربح محسوب على متوسط تكلفة الصنف وقت البيع — عشان يكون دقيق لازم تسجل المشتريات أو تكلفة الأصناف.</p>`;
      $('#pl', rv).innerHTML = `<div class="card"><div class="hd">قائمة الدخل — ${esc(sub())}</div>${html}</div>`;
      $('#prn', rv).onclick = () => printReport('قائمة الدخل (الأرباح والخسائر)', sub(), html);
    };
    bindRange(rv, st, load); return load();
  }
  if (st.tab === 'inv') {
    const d = await GET('/api/reports/inventory', bq()); const sc = can('see_cost');
    rv.innerHTML = `<div class="toolbar"><span class="sp"></span><button class="btn" id="csv">${icon('download')}Excel</button><button class="btn" id="prn">${icon('print')}طباعة</button></div><div class="grid g3" style="margin-bottom:14px">${stat('عدد الأصناف', `<span class="num">${d.rows.length}</span>`)}${sc ? stat('قيمة المخزون بالتكلفة', M(d.total_cost)) : ''}${stat('قيمة المخزون بسعر البيع', M(d.total_price))}</div><div id="tb"></div>`;
    const cols = [{ t: 'الكود', k: 'code' }, ...(showBranchCol() ? [{ t: 'المعرض', k: 'branch_name' }] : []), { t: 'الصنف', k: 'name' }, { t: 'التصنيف', k: 'category' }, { t: 'الرصيد', n: 1, f: (r) => `<span class="num ${r.stock <= r.min_stock ? 'bad' : ''}">${qf(r.stock)}</span>`, v: (r) => r.stock }, ...(sc ? [{ t: 'التكلفة', n: 1, f: (r) => M(r.cost), v: (r) => r.cost }, { t: 'القيمة بالتكلفة', n: 1, f: (r) => M(r.value_cost), v: (r) => r.value_cost }] : []), { t: 'سعر البيع', n: 1, f: (r) => M(r.price), v: (r) => r.price }, { t: 'القيمة بالبيع', n: 1, f: (r) => M(r.value_price), v: (r) => r.value_price }];
    const foot = cols.map((c, i) => (i === 0 ? 'الإجمالي' : c.t === 'القيمة بالتكلفة' ? money(d.total_cost) : c.t === 'القيمة بالبيع' ? money(d.total_price) : ''));
    mountTable($('#tb', rv), cols, d.rows, { foot, maxh: '62vh' });
    $('#csv', rv).onclick = () => exportCSV('تقييم-المخزون', cols, d.rows);
    $('#prn', rv).onclick = () => printReport('تقييم المخزون', curBranch() ? branchOf(curBranch()).name : 'كل المعارض', tableHTML(cols, d.rows, foot));
    return;
  }
  if (st.tab === 'bal') {
    const d = await GET('/api/reports/balances', bq());
    rv.innerHTML = `<div class="grid g2"><div class="card"><div class="hd">مديونيات العملاء (لينا)<span class="sp"></span>${M(d.customers.reduce((s, c) => s + c.balance, 0))}</div><div id="c1"></div></div><div class="card"><div class="hd">مستحقات الموردين (علينا)<span class="sp"></span>${M(d.suppliers.reduce((s, c) => s + c.balance, 0))}</div><div id="c2"></div></div></div>`;
    const cc = [{ t: 'الاسم', k: 'name' }, ...(showBranchCol() ? [{ t: 'المعرض', f: (r) => brName(r.branch_id) }] : []), { t: 'الموبايل', k: 'phone' }, { t: 'الرصيد', n: 1, f: (r) => M(r.balance) }];
    mountTable($('#c1', rv), cc, d.customers, { empty: 'لا توجد مديونيات', click: (r) => statement('customer', r) });
    mountTable($('#c2', rv), cc, d.suppliers, { empty: 'لا توجد مستحقات', click: (r) => statement('supplier', r) });
    return;
  }
  if (st.tab === 'audit') {
    rv.innerHTML = `<div class="toolbar">${rangeHTML(st)}</div><div id="tb"></div>`;
    const load = async () => { const rows = await GET('/api/audit', { from: st.from, to: st.to }); mountTable($('#tb', rv), [{ t: 'الوقت', f: (r) => dt(r.date) }, { t: 'المستخدم', k: 'user_name' }, { t: 'العملية', k: 'action' }, { t: 'التفاصيل', k: 'details' }], rows, { maxh: '65vh' }); };
    bindRange(rv, st, load); return load();
  }
};

/* =====================================================================
   المستخدمين
   ===================================================================== */
const PERMS = [['change_price', 'تعديل سعر البيع في الكاشير'], ['credit_sale', 'البيع الآجل'], ['returns', 'عمل مرتجع مبيعات'], ['customers', 'العملاء وسندات القبض'], ['suppliers', 'الموردين وسندات الصرف'], ['purchases', 'فواتير المشتريات'], ['expenses', 'تسجيل المصروفات'], ['loans', 'السلف والاقتراض (من المعرض التاني أو جهة برّه)'], ['products', 'إضافة وتعديل الأصناف والأسعار'], ['stock', 'الجرد وتسوية المخزون'], ['treasury', 'الخزينة والبنك'], ['reports', 'التقارير ولوحة التحكم الكاملة'], ['see_cost', 'رؤية التكلفة والأرباح']];
const PERM_PRESETS = {
  basic: { t: 'كاشير عادي', hint: 'بيع ومرتجع وعملاء ومصروفات بسيطة — خصم لحد 5%', p: { max_discount: 5, credit_sale: true, returns: true, customers: true, expenses: true } },
  trusted: { t: 'كاشير موثوق / مشرف', hint: 'زيادة: تعديل السعر، المشتريات، الجرد، الأصناف — خصم لحد 10%', p: { max_discount: 10, change_price: true, credit_sale: true, returns: true, customers: true, suppliers: true, purchases: true, expenses: true, products: true, stock: true } },
  sales: { t: 'بيع بس', hint: 'بيع كاش فقط بدون آجل أو مرتجع أو خصم', p: { max_discount: 0 } },
};
// جدول الصلاحيات: صف لكل صلاحية وعمود لكل كاشير
function permMatrix(box, cashiers) {
  if (!cashiers.length) { box.innerHTML = '<div class="empty">مفيش كاشيرين لسه</div>'; return; }
  const render = () => {
    box.innerHTML = `<div class="tbl-wrap" style="border:0;border-radius:0 0 var(--r) var(--r)"><table class="t"><thead><tr><th>الصلاحية</th>${cashiers.map((c) => `<th style="text-align:center">${esc(c.name)}<div class="small faint" style="font-weight:600">${brName(c.branch_id)}${c.active ? '' : ' <span class="badge bad">موقوف</span>'}</div></th>`).join('')}</tr></thead><tbody>
      <tr><td><b>أقصى خصم مسموح %</b></td>${cashiers.map((c) => `<td style="text-align:center"><input class="in sm" type="number" min="0" max="100" data-u="${c.id}" data-p="max_discount" value="${c.perms.max_discount ?? 0}" style="width:76px;text-align:center"></td>`).join('')}</tr>
      ${PERMS.map(([k, t]) => `<tr><td>${t}</td>${cashiers.map((c) => `<td style="text-align:center"><label class="sw" title="${c.perms[k] ? 'مفعّلة — دوس للقفل' : 'مقفولة — دوس للتفعيل'}"><input type="checkbox" data-u="${c.id}" data-p="${k}" ${c.perms[k] ? 'checked' : ''}><i></i></label></td>`).join('')}</tr>`).join('')}
      <tr><td class="small muted">بسرعة</td>${cashiers.map((c) => `<td style="text-align:center"><button class="btn sm" data-preset2="basic" data-u="${c.id}">العادي</button> <button class="btn sm bad" data-preset2="lock" data-u="${c.id}">🔒 قفل الكل</button></td>`).join('')}</tr>
      </tbody></table></div>`;
  };
  const save = async (u, perms, msg) => {
    try { const res = await PUT(`/api/users/${u.id}/perms`, { perms }); u.perms = res.perms; toast(msg, 'ok'); } catch (e) { toast(e.message, 'bad'); }
    render();
  };
  box.addEventListener('change', (e) => {
    const i = e.target.closest('[data-p]'); if (!i) return; const u = cashiers.find((c) => c.id === +i.dataset.u); const k = i.dataset.p;
    const t = (PERMS.find((p) => p[0] === k) || [k, 'أقصى خصم'])[1];
    if (k === 'max_discount') save(u, { max_discount: +i.value || 0 }, `${u.name}: أقصى خصم ${+i.value || 0}%`);
    else save(u, { [k]: i.checked }, `${u.name}: ${i.checked ? '✅ اتفعّلت' : '🔒 اتقفلت'} "${t}"`);
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset2]'); if (!b) return; const u = cashiers.find((c) => c.id === +b.dataset.u);
    if (b.dataset.preset2 === 'lock') { const p = { max_discount: 0 }; PERMS.forEach(([k]) => (p[k] = false)); save(u, p, `🔒 ${u.name}: اتقفلت كل الصلاحيات (بيع كاش بس)`); }
    else { const p = { ...PERM_PRESETS.basic.p }; PERMS.forEach(([k]) => (p[k] = !!PERM_PRESETS.basic.p[k])); save(u, p, `${u.name}: رجع للصلاحيات العادية`); }
  });
  render();
}
VIEWS.users = async (el) => {
  const users = await GET('/api/users');
  el.innerHTML = `<div class="grid g2" style="margin-bottom:16px">
      <div class="role-card" style="background:linear-gradient(135deg,#eef4ff,#fff)"><h4>👑 المدير العام (صاحب المكان)</h4><ul><li>يشوف المعرضين مع بعض أو كل معرض لوحده</li><li>لوحة التحكم، الحركة المباشرة، التقارير والأرباح</li><li>المشتريات والموردين، الجرد، الخزينة والبنك</li><li>الأسعار واستيراد القوائم، المستخدمين والصلاحيات، الإعدادات</li></ul></div>
      <div class="role-card" style="background:linear-gradient(135deg,#ecfdf5,#fff)"><h4>🧾 الكاشير (اللي واقف في المحل)</h4><ul><li>شاشة بسيطة: البيع أول حاجة، وتبويبات فوق</li><li>فواتيره هو بس، والمرتجع (لو مسموح)</li><li>العملاء والتحصيل، الأسعار والمخزون (عرض بس)، مصروفات الدرج</li><li>ورديته: يفتحها الصبح ويقفلها آخر اليوم</li><li>مش بيشوف التكلفة ولا الأرباح ولا الخزينة ولا المعرض التاني</li></ul></div></div>
    <div class="card" style="margin-bottom:16px"><div class="hd">🔑 صلاحيات الكاشير — شغّل أو اقفل أي صلاحية بدوسة<span class="sp"></span><span class="small faint">بتتحفظ على طول وبتوصل لجهاز الكاشير في ثواني</span></div><div id="pm"></div></div>
    <div class="toolbar"><b>المستخدمين</b><span class="sp"></span><button class="btn pri" id="add">${icon('plus')}مستخدم جديد</button></div><div id="tb"></div>`;
  permMatrix($('#pm', el), users.filter((u) => u.role !== 'admin'));
  mountTable($('#tb', el), [{ t: 'اسم الدخول', f: (r) => `<b class="num">${esc(r.username)}</b>` }, { t: 'الاسم', k: 'name' }, { t: 'الصلاحية', f: (r) => (r.role === 'admin' ? '<span class="badge pri">مدير</span>' : '<span class="badge">كاشير</span>') }, { t: 'المعرض', f: (r) => (r.role === 'admin' ? 'كل المعارض' : brName(r.branch_id)) }, { t: 'الحالة', f: (r) => (r.active ? '<span class="badge ok">نشط</span>' : '<span class="badge bad">موقوف</span>') }, { t: 'آخر دخول', f: (r) => dt(r.last_login) }, { t: '', f: () => '<button class="btn sm" data-act="ed">تعديل</button>' }], users, { act: (a, r) => userForm(r) });
  $('#add', el).onclick = () => userForm(null);
};
function userForm(u) {
  const isNew = !u; u = u || { role: 'cashier', active: true, branch_id: S.branches[0] && S.branches[0].id, perms: { max_discount: 5, credit_sale: true, returns: true, customers: true, expenses: true } };
  const m = modal({
    title: isNew ? 'مستخدم جديد' : `تعديل المستخدم: ${u.name}`, wide: 'wide',
    body: `<div class="grid g2"><div class="field"><label class="f">اسم الدخول (إنجليزي) *</label><input class="in" name="username" value="${esc(u.username)}" dir="ltr"></div><div class="field"><label class="f">الاسم *</label><input class="in" name="name" value="${esc(u.name)}"></div>
      <div class="field"><label class="f">نوع المستخدم</label><select class="in" name="role">${opt('cashier', 'كاشير (معرض واحد)', u.role)}${opt('admin', 'مدير (كل الصلاحيات)', u.role)}</select></div>
      <div class="field" id="brf"><label class="f">المعرض</label><select class="in" name="branch_id">${S.branches.map((b) => opt(b.id, b.name, u.branch_id)).join('')}</select></div>
      <div class="field"><label class="f">${isNew ? 'كلمة المرور *' : 'كلمة مرور جديدة (سيبها فاضية لو مش عايز تغيرها)'}</label><input class="in" name="password" type="text" dir="ltr" autocomplete="off"></div>
      <div class="field"><label class="chk" style="margin-top:22px"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> الحساب نشط</label></div></div>
      <div id="pf"><hr class="sep"><div class="row"><b>صلاحيات الكاشير</b><span class="sp"></span><span class="small muted">قوالب جاهزة:</span>${Object.entries(PERM_PRESETS).map(([k, p]) => `<button type="button" class="btn sm" data-preset="${k}" title="${esc(p.hint)}">${p.t}</button>`).join('')}</div><div class="field" style="margin-top:10px"><label class="f">أقصى نسبة خصم مسموحة %</label><input class="in" type="number" min="0" max="100" data-p="max_discount" value="${u.perms.max_discount ?? 0}" style="width:120px"></div>
      <div class="perm-grid">${PERMS.map(([k, t]) => `<label class="chk"><input type="checkbox" data-p="${k}" ${u.perms[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>`,
    buttons: [{ t: 'حفظ', cls: 'pri', fn: async (mb) => {
      const v = fv(mb); v.perms = {}; $$('[data-p]', mb).forEach((i) => (v.perms[i.dataset.p] = i.type === 'checkbox' ? i.checked : +i.value));
      if (isNew) await POST('/api/users', v); else await PUT('/api/users/' + u.id, v);
      toast('تم الحفظ', 'ok'); route();
    } }, { t: 'إلغاء' }],
  });
  $$('[data-preset]', m.mb).forEach((b) => (b.onclick = () => { const p = PERM_PRESETS[b.dataset.preset].p; $$('[data-p]', m.mb).forEach((i) => { if (i.type === 'checkbox') i.checked = !!p[i.dataset.p]; else i.value = p[i.dataset.p] ?? 0; }); toast(`تم تطبيق قالب "${PERM_PRESETS[b.dataset.preset].t}"`, 'ok'); }));
  const sync = () => { const adm = $('[name=role]', m.mb).value === 'admin'; $('#pf', m.mb).classList.toggle('hide', adm); $('#brf', m.mb).classList.toggle('hide', adm); };
  $('[name=role]', m.mb).onchange = sync; sync();
}

/* =====================================================================
   الإعدادات
   ===================================================================== */
VIEWS.settings = async (el) => {
  const brs = await GET('/api/branches');
  el.innerHTML = `<div class="grid g2" style="margin-bottom:16px">${brs.map((b) => `<div class="card"><div class="hd"><span class="dot" style="background:${esc(b.color)}"></span>بيانات ${esc(b.name)}</div><div class="bd" data-b="${b.id}">
      <div class="grid g2"><div class="field"><label class="f">اسم المعرض</label><input class="in" name="name" value="${esc(b.name)}"></div><div class="field"><label class="f">كود الفواتير (حرف أو اتنين)</label><input class="in" name="code" value="${esc(b.code)}" dir="ltr" maxlength="4"></div>
      <div class="field"><label class="f">الماركة</label><input class="in" name="brand" value="${esc(b.brand)}"></div><div class="field"><label class="f">اللون المميز</label><input class="in" type="color" name="color" value="${esc(b.color || '#1d4ed8')}" style="height:38px;padding:3px"></div>
      <div class="field"><label class="f">التليفون</label><input class="in" name="phone" value="${esc(b.phone)}" dir="ltr"></div><div class="field"><label class="f">مقاس الطباعة الافتراضي</label><select class="in" name="print_format">${opt('thermal', 'إيصال حراري 80مم', b.print_format)}${opt('a4', 'ورقة A4', b.print_format)}</select></div></div>
      <div class="field"><label class="f">العنوان</label><input class="in" name="address" value="${esc(b.address)}"></div><div class="field"><label class="f">تذييل الفاتورة</label><input class="in" name="receipt_footer" value="${esc(b.receipt_footer)}"></div>
      <button class="btn pri" data-save="${b.id}">حفظ</button></div></div>`).join('')}</div>
    <div class="grid g2"><div class="card"><div class="hd">إعدادات عامة</div><div class="bd" id="gs">
      <div class="field"><label class="f">اسم الشركة (يظهر في الفواتير والتقارير)</label><input class="in" name="company_name" value="${esc(S.settings.company_name)}"></div>
      <label class="chk field"><input type="checkbox" name="allow_negative_stock" ${S.settings.allow_negative_stock ? 'checked' : ''}> السماح بالبيع لو الرصيد مش كفاية (رصيد بالسالب)</label>
      <div class="field"><label class="f">طرق الدفع المتاحة في الكاشير</label><div class="perm-grid" id="mth">${Object.entries(S.allMethods).map(([k, v]) => `<label class="chk"><input type="checkbox" data-mth="${k}" ${S.methods[k] ? 'checked' : ''} ${k === 'cash' ? 'disabled' : ''}> ${mBadge(k)}</label>`).join('')}</div></div>
      <label class="chk field"><input type="checkbox" id="snd" ${LS.get('pos_sound', true) ? 'checked' : ''}> صوت تنبيه لما الكاشير يعمل عملية (على الجهاز ده)</label>
      <div class="grid g2"><div class="field"><label class="f">رقم واتساب المدير (بيتبعتله ملخص اليوم وتقفيل الورديات)</label><input class="in" name="owner_whatsapp" value="${esc(S.settings.owner_whatsapp || '')}" dir="ltr" placeholder="01xxxxxxxxx"></div>
      <div class="field"><label class="f">نبّهني لو الخصم في فاتورة أكبر من %</label><input class="in" type="number" min="0" max="100" name="alert_discount" value="${S.settings.alert_discount ?? 10}"></div></div>
      <div class="grid g2"><div class="field"><label class="f">بنود المصروفات (كل بند في سطر)</label><textarea class="in" rows="7" id="ec">${esc((S.settings.expense_categories || []).join('\n'))}</textarea></div>
      <div class="field"><label class="f">وحدات الأصناف (كل وحدة في سطر)</label><textarea class="in" rows="7" id="un">${esc((S.settings.units || []).join('\n'))}</textarea></div></div>
      <button class="btn pri" id="gsave">حفظ الإعدادات</button></div></div>
      <div class="card"><div class="hd">النسخ الاحتياطي</div><div class="bd">${SB ? `<p class="muted" style="margin-top:0">البرنامج شغال <b>أونلاين</b> والبيانات محفوظة على Supabase. نزّل نسخة (ملف JSON) كل أسبوع واحتفظ بيها على فلاشة أو Google Drive.</p>
      <button class="btn pri" id="bkbtn">${icon('download')}تنزيل نسخة احتياطية الآن</button></div></div></div>` : `<p class="muted" style="margin-top:0">البرنامج بياخد نسخة احتياطية تلقائية كل يوم في فولدر <b>backups</b> جنب البرنامج (آخر 30 يوم).<br>ويُفضّل تنزّل نسخة على فلاشة أو Google Drive كل أسبوع.</p>
      <a class="btn pri" href="/api/backup" download id="bkbtn">${icon('download')}تنزيل نسخة احتياطية الآن</a>
      <p class="small faint">للاسترجاع: اقفل البرنامج، وحط ملف النسخة مكان <span class="num">data/pos.db</span> بنفس الاسم، وشغّل البرنامج تاني.</p></div></div></div>`}`;
  if (SB) $('#bkbtn', el).onclick = async () => {
    try {
      const d = await GET('/api/backup');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
      a.download = `pos-backup-${ymd(new Date())}.json`; document.body.append(a); a.click(); a.remove(); toast('تم تنزيل النسخة', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  };
  $$('[data-save]', el).forEach((b) => (b.onclick = async () => {
    const box = $(`[data-b="${b.dataset.save}"]`, el);
    try { await PUT('/api/branches/' + b.dataset.save, fv(box)); toast('تم الحفظ', 'ok'); const me = await GET('/api/me'); S.branches = me.branches; renderShell(); route(); } catch (e) { toast(e.message, 'bad'); }
  }));
  $('#gsave', el).onclick = async () => {
    const v = fv($('#gs', el));
    v.expense_categories = $('#ec', el).value.split('\n').map((x) => x.trim()).filter(Boolean);
    v.units = $('#un', el).value.split('\n').map((x) => x.trim()).filter(Boolean);
    v.methods_enabled = $$('[data-mth]', el).filter((i) => i.checked).map((i) => i.dataset.mth);
    LS.set('pos_sound', $('#snd', el).checked);
    try { await PUT('/api/settings', v); const me = await GET('/api/me'); S.settings = me.settings; S.methods = me.methods; toast('تم حفظ الإعدادات', 'ok'); renderShell(); route(); } catch (e) { toast(e.message, 'bad'); }
  };
};

boot();
