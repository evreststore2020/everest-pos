'use strict';
/* =====================================================================
   استيراد قوائم الأسعار من PDF أو صور
   - PDF فيه نص: بيتقري مباشرة (pdf.js — موجود جوه البرنامج)
   - صور أو PDF متصوّر (سكانر): قراءة ضوئية OCR عربي + إنجليزي (Tesseract)
   بعد القراءة بيظهر جدول مراجعة تعدّل فيه قبل الحفظ.
   ===================================================================== */
(function (root) {
  /* ---------------------------- تنظيف النص ---------------------------- */
  const toWestern = (s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/٫/g, '.').replace(/٬/g, ',');
  function normText(s, fromPdf) {
    s = toWestern(String(s || '').normalize('NFKC'))
      .replace(/[²¨±]/g, 'لأ') // حروف "لأ" اللي بتطلع غلط من بعض ملفات PDF
      .replace(/ـ/g, '') // التطويل ـــ
      .replace(/[‎‏‪-‮⁦-⁩]/g, '');
    if (fromPdf && /[؀-ۿ]/.test(s)) s = s.replace(/[()]/g, (c) => (c === '(' ? ')' : '(')); // الأقواس بتطلع معكوسة في PDF العربي
    return s.replace(/\s+/g, ' ').trim();
  }
  const normName = (s) => String(s || '').normalize('NFKC').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[()\-–_/\\.,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  /* ---------------------------- تصنيف الكلمات ---------------------------- */
  const NUM_RE = /^\d{1,3}(,\d{3})+(\.\d+)?$|^\d+(\.\d+)?$/;
  const UNITS = { 'لتر': 'لتر', 'لتر.': 'لتر', 'لت': 'لتر', 'ل': 'لتر', 'l': 'لتر', 'lt': 'لتر', 'ltr': 'لتر', 'liter': 'لتر', 'litre': 'لتر', 'لترات': 'لتر',
    'كجم': 'كجم', 'كج': 'كجم', 'كغ': 'كجم', 'كيلو': 'كجم', 'كيلوجرام': 'كجم', 'كيلوجرم': 'كجم', 'kg': 'كجم', 'كيلوغرام': 'كجم',
    'جم': 'جم', 'جرام': 'جم', 'g': 'جم', 'gm': 'جم', 'مل': 'مل', 'مللي': 'مل', 'ملي': 'مل', 'ml': 'مل', 'جالون': 'جالون', 'gal': 'جالون' };
  const unitOf = (s) => UNITS[String(s).toLowerCase().replace(/\.$/, '')] || null;
  const UNIT_ALT = Object.keys(UNITS).sort((a, b) => b.length - a.length).map((u) => u.replace(/\./g, '\\.')).join('|');
  const SIZE_A = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})$`, 'i');
  const SIZE_B = new RegExp(`^(${UNIT_ALT})\\s*(\\d+(?:\\.\\d+)?)$`, 'i');
  function parseNum(s) {
    if (/^\d{1,3}\.\d{3}$/.test(s)) return +s.replace('.', ''); // 1.495 = ألف وأربعمية (فاصلة آلاف بنقطة)
    return +s.replace(/,/g, '');
  }
  const JUNK = /السعر بال|اسم المنتج|اسم الصنف|حجم العبوة|شاملة ضريبة|ضريبة القيمة|قائمة اسعار|قائمة أسعار|الاسعار المذكورة|اسعار المذكورة|price list|www\.|\.com|for inquiries|sales representative/i;
  const CAT_RE = /^(عائلة|عائله|الدهانات|دهانات ال|منتجات|family|category|قسم)/i;
  const NOISE = /^(\(?جديد\)?|new|•|–|-|\*)$/i;
  const VARIANT_RE = /^(أبيض|ابيض|ألوان خاصة|الوان خاصة|ألوان جاهزة|الوان جاهزة)$/;

  /* ------- بعض ملفات PDF بتخزّن كل حرف عربي لوحده وبترتيب معكوس (زي قايمة باكين) ------- */
  const AR = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
  function mergeGlyphs(items) {
    const ar = items.filter((it) => AR.test(it.s));
    const single = ar.filter((it) => it.s.replace(/\s/g, '').length <= 2).length;
    if (ar.length < 20 || single / ar.length < 0.6) return items; // ملف عادي
    const hs = items.map((t) => t.h || 10).sort((a, b) => a - b); const lh = hs[Math.floor(hs.length / 2)] || 10;
    const lines = [];
    for (const it of [...items].sort((a, b) => a.y - b.y)) {
      let L = lines.find((l) => Math.abs(l.y - it.y) < lh * 0.45); if (!L) { L = { y: it.y, its: [] }; lines.push(L); } L.its.push(it);
    }
    const out = [];
    for (const L of lines) {
      const its = L.its.sort((a, b) => b.x - a.x); // من اليمين للشمال
      let cur = null;
      const flush = () => { if (cur) { out.push({ s: cur.parts.join(''), x: cur.x0, w: cur.x1 - cur.x0, y: cur.y, h: cur.h }); cur = null; } };
      for (const it of its) {
        const isAr = AR.test(it.s); const x1 = it.x + (it.w || 0);
        const gap = cur ? cur.x0 - x1 : 0, hh = it.h || lh;
        // حرف ملزوق في اللي قبله (مسافة ≈ صفر) → نفس الكلمة
        if (cur && isAr && cur.ar && gap < hh * 0.1) { cur.parts.push(it.s); cur.x0 = Math.min(cur.x0, it.x); continue; }
        // مسافة صغيرة (عرض مسافة عادية) → كلمة جديدة في نفس الخانة
        if (cur && isAr && cur.ar && gap < hh * 0.9) { cur.parts.push(' ', it.s); cur.x0 = Math.min(cur.x0, it.x); continue; }
        flush();
        cur = { parts: [it.s], x0: it.x, x1, y: it.y, h: it.h, ar: isAr };
        if (!isAr) flush();
      }
      flush();
    }
    return out;
  }

  /* ---------------------------- تحليل صفحة ---------------------------- */
  /* ------- جدول بعناوين أعمدة (الاسم / الوصف / العبوة / الوزن / السعر) زي قايمة باكين ------- */
  const HEAD = { name: /(الاسم|اسمالصنف|الصنف|اسمالمنتج|المنتج|product|item)/i, desc: /(الوصف|البيان|description)/i, pack: /(العبوة|التعبئة|pack)/i, size: /(الوزن|الحجم|السعة|المقاس|size|weight)/i, price: /(السعر|الثمن|price)/i };
  const sq = (s) => s.replace(/\s+/g, '');
  function headerRows(toks, lh) {
    const out = [];
    for (const p of toks.filter((t) => t.kind === 'text' && HEAD.price.test(sq(t.s)) && sq(t.s).length <= 8)) {
      const row = toks.filter((t) => Math.abs(t.yc - p.yc) < lh * 1.6 && t.kind !== 'num');
      const cols = {};
      for (const t of row) { const k = sq(t.s); if (/شكل/.test(k)) continue; for (const [c, re] of Object.entries(HEAD)) if (!cols[c] && re.test(k) && k.length <= 16) { cols[c] = t.xc; break; } }
      if (cols.price != null && (cols.name != null || cols.desc != null) && Object.keys(cols).length >= 3 && !out.some((h) => Math.abs(h.y - p.yc) < lh * 2)) out.push({ y: p.yc, cols });
    }
    return out.sort((a, b) => a.y - b.y);
  }
  const cleanNum = (n) => String(+n);
  // ") ابيض (" → "(ابيض)" وشيل أي قوس لوحده
  function fixParens(s) {
    s = String(s || '').replace(/\)\s*([^()]+?)\s*\(/g, '($1)').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    let open = 0; let out = '';
    for (const ch of s) { if (ch === '(') { open++; out += ch; } else if (ch === ')') { if (open) { open--; out += ch; } } else out += ch; }
    while (open-- > 0) out = out.replace(/\((?![^(]*\))/, '');
    return out.replace(/\(\s*\)/g, '').replace(/(\S)\(/g, '$1 (').replace(/\)(\S)/g, ') $1').replace(/\s+-\s*$/, '').replace(/^\s*-\s+/, '').replace(/\s+/g, ' ').trim();
  }
  const PACK_RE = /(جالون|بستل|شيكار|عبوة|عبوه|برميل|صفيح|علبة|علبه|كرتون|جوال|كيس|طقم|قطعة|لفة|درم|تنك|pail|gallon|drum|can|bag)/i;
  function parseTables(toks, lh) {
    const heads = headerRows(toks, lh);
    if (!heads.length) return null;
    const rows = [];
    heads.forEach((H, hi) => {
      const yEnd = hi + 1 < heads.length ? heads[hi + 1].y - lh * 2.5 : 1e9;
      // عمود كل كلمة = أقرب عنوان عمود ليها
      const cols = Object.entries(H.cols);
      const colOf = (t) => { let best = null, bd = 1e9; for (const [c, x] of cols) { const d = Math.abs(t.xc - x); if (d < bd) { bd = d; best = c; } } return best; };
      const body = toks.filter((t) => t.yc > H.y + lh * 0.8 && t.yc < yEnd && !JUNK.test(t.s));
      // عنوان القسم (فوق الجدول) = التصنيف
      const above = toks.filter((t) => t.yc < H.y - lh * 0.8 && t.yc > H.y - lh * 8 && t.kind !== 'num' && !JUNK.test(t.s) && !/إصدار|اصدار|ملاحظة|أغسطس|يضاف|ضريبة|شكل|^[():\-–]+$/.test(t.s) && !Object.values(HEAD).some((re) => re.test(sq(t.s)) && sq(t.s).length <= 16));
      const catLine = above.length ? (() => { const y = Math.max(...above.map((t) => t.yc)); return above.filter((t) => Math.abs(t.yc - y) < lh * 0.6).sort((a, b) => b.x - a.x).map((t) => t.s).join(' '); })() : '';
      const category = fixParens(catLine.replace(/^تابع\s*-?\s*/, ''));
      // سطور الأسعار (ونقف لو فيه فراغ كبير — يعني الجدول خلص وبعده كلام زي التليفونات)
      let prices = body.filter((t) => colOf(t) === 'price' && (t.kind === 'num' || NUM_RE.test(t.s))).sort((a, b) => a.yc - b.yc);
      if (!prices.length) return;
      const gaps = prices.slice(1).map((p, i) => p.yc - prices[i].yc).filter((g) => g > lh * 0.5).sort((a, b) => a - b);
      const step = gaps.length ? gaps[Math.floor(gaps.length / 2)] : lh * 3;
      const cut = prices.findIndex((p, i) => i && p.yc - prices[i - 1].yc > Math.max(step * 2.5, lh * 6));
      if (cut > 0) prices = prices.slice(0, cut);
      let lastName = '', lastDesc = '';
      prices.forEach((p, i) => {
        const top = i ? (prices[i - 1].yc + p.yc) / 2 : p.yc - step * 0.6;
        const bot = i + 1 < prices.length ? (p.yc + prices[i + 1].yc) / 2 : p.yc + step * 0.6;
        const band = body.filter((t) => t.yc >= top && t.yc < bot && t !== p);
        const cell = (c) => band.filter((t) => colOf(t) === c).sort((a, b) => a.yc - b.yc || b.x - a.x);
        const lines = (arr) => { const L = []; for (const t of arr) { let l = L.find((x) => Math.abs(x.y - t.yc) < lh * 0.6); if (!l) { l = { y: t.yc, t: [] }; L.push(l); } l.t.push(t); } return L.sort((a, b) => a.y - b.y).map((l) => l.t.sort((a, b) => b.x - a.x).map((t) => t.s).join(' ')).join(' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim(); };
        let name = lines(cell('name')), desc = lines(cell('desc'));
        // خانة مدموجة (اسم واحد لكذا سطر) → ناخد اسم السطر اللي قبله
        if (!name) name = lastName; if (!desc && !name) desc = lastDesc;
        lastName = name; lastDesc = desc;
        const pack = lines(cell('pack'));
        const sizeTxt = cell('size').sort((a, b) => b.x - a.x).map((t) => t.s).join(' ');
        // الوزن لازم يكون رقم واحد (مش "1-2-3" زي أرقام التليفونات)
        const nums = sizeTxt.match(/\d+(?:\.\d+)?/g) || [];
        const num = nums.length === 1 ? nums[0] : '';
        const unit = /لتر|ltr|lt\b|l\b/i.test(sizeTxt) ? 'لتر' : /جم|جرام|gm\b|g\b/i.test(sizeTxt) && !/كجم/.test(sizeTxt) ? 'جم' : /ك|كيلو|كجم|kg|قائم/i.test(sizeTxt) ? 'كجم' : /مل|ml/i.test(sizeTxt) ? 'مل' : '';
        const size = num ? cleanNum(num) : '';
        // سطر مش صنف (تليفون، عنوان…): لا عبوة معروفة ولا وزن بوحدته
        if (!PACK_RE.test(pack) && !(size && unit)) return;
        const title = [fixParens(name), desc && desc !== name ? fixParens(desc) : ''].filter(Boolean).join(' - ');
        if (!title) return;
        rows.push({ base: title, sub: '', variant: '', size, unit, pack, price: parseNum(p.s), category, y: p.yc, table: true,
          name: [title, size ? `${size} ${unit}` : '', !size && pack ? pack : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() });
      });
    });
    return rows.length ? rows : null;
  }

  function parsePage(items, fromPdf) {
    if (fromPdf) items = mergeGlyphs(items);
    const toks = [];
    for (const it of items) {
      const s = normText(it.s, fromPdf); if (!s) continue;
      const t = { s, x: it.x, w: Math.max(1, it.w), y: it.y, h: it.h || 10 }; t.xc = t.x + t.w / 2; t.yc = t.y + t.h / 2; t.x1 = t.x + t.w;
      let m;
      if (NUM_RE.test(s)) { t.kind = 'num'; t.v = parseNum(s); }
      else if (unitOf(s)) { t.kind = 'unit'; t.unit = unitOf(s); }
      else if ((m = s.match(SIZE_A))) { t.kind = 'size'; t.size = +m[1]; t.unit = unitOf(m[2]); }
      else if ((m = s.match(SIZE_B))) { t.kind = 'size'; t.size = +m[2]; t.unit = unitOf(m[1]); }
      else t.kind = 'text';
      toks.push(t);
    }
    if (!toks.length) return [];
    const hs = toks.map((t) => t.h).sort((a, b) => a - b); const lh = hs[Math.floor(hs.length / 2)] || 10;
    const tbl = parseTables(toks, lh); if (tbl) return tbl;

    // 1) أحجام العبوات: رقم جنب وحدة (20 لتر)
    const sizes = toks.filter((t) => t.kind === 'size').map((t) => ({ size: t.size, unit: t.unit, x0: t.x, x1: t.x1, xc: t.xc, yc: t.yc }));
    for (const u of toks.filter((t) => t.kind === 'unit')) {
      let best = null, bd = 1e9;
      for (const n of toks) {
        if (n.kind !== 'num' || n.paired) continue;
        const dy = Math.abs(n.yc - u.yc); if (dy > lh * 1.6) continue;
        const gap = Math.max(0, Math.max(n.x - u.x1, u.x - n.x1)); if (gap > Math.max(30, lh * 3)) continue;
        const d = gap + dy * 2; if (d < bd) { bd = d; best = n; }
      }
      if (best) { best.paired = true; u.paired = true; sizes.push({ size: best.v, unit: u.unit, x0: Math.min(best.x, u.x), x1: Math.max(best.x1, u.x1), xc: (Math.min(best.x, u.x) + Math.max(best.x1, u.x1)) / 2, yc: (best.yc + u.yc) / 2 }); }
    }
    // 2) الأسعار: أرقام مش جزء من حجم (ونشيل السنين والأرقام الصغيرة جداً)
    const prices = toks.filter((t) => t.kind === 'num' && !t.paired && t.v >= 1 && !(/^20[1-4]\d$/.test(t.s)));
    if (!prices.length) return [];
    // 3) عمود الأسماء: الناحية اللي فيها أغلب الكلام بالنسبة للأرقام
    const nums = [...prices, ...toks.filter((t) => t.paired || t.kind === 'size')];
    const numMin = Math.min(...nums.map((t) => t.x)), numMax = Math.max(...nums.map((t) => t.x1));
    const texts = toks.filter((t) => t.kind === 'text' || (t.kind === 'unit' && !t.paired));
    const right = texts.filter((t) => t.x > numMax + lh).length, left = texts.filter((t) => t.x1 < numMin - lh).length;
    const nameSide = right >= left ? 'right' : 'left';
    const inName = (t) => (nameSide === 'right' ? t.x > numMax + lh * 0.5 : t.x1 < numMin - lh * 0.5);
    // 4) نجمّع كلام عمود الأسماء في سطور ومقاطع
    const nameToks = texts.filter((t) => inName(t) && !NOISE.test(t.s));
    nameToks.sort((a, b) => a.yc - b.yc);
    const lines = [];
    for (const t of nameToks) { let L = lines.find((l) => Math.abs(l.yc - t.yc) < lh * 0.6); if (!L) { L = { yc: t.yc, toks: [] }; lines.push(L); } L.toks.push(t); }
    const segs = [];
    for (const L of lines) {
      const ts = L.toks.sort((a, b) => (nameSide === 'right' ? b.x - a.x : a.x - b.x)); // عربي: من اليمين للشمال
      let cur = null;
      for (const t of ts) {
        if (cur && Math.min(Math.abs(t.x1 - cur.x0), Math.abs(cur.x1 - t.x)) < lh * 4) { cur.parts.push(t.s); cur.x0 = Math.min(cur.x0, t.x); cur.x1 = Math.max(cur.x1, t.x1); }
        else { cur = { parts: [t.s], x0: t.x, x1: t.x1, yc: L.yc }; segs.push(cur); }
      }
    }
    for (const s of segs) { s.text = s.parts.join(' ').replace(/\s+/g, ' ').trim(); s.junk = JUNK.test(s.text); s.cat = !s.junk && CAT_RE.test(s.text); s.words = s.text.split(' ').length; }
    const nameSegs = segs.filter((s) => !s.junk && !s.cat && !VARIANT_RE.test(s.text)).sort((a, b) => a.yc - b.yc);
    const catSegs = segs.filter((s) => s.cat).sort((a, b) => a.yc - b.yc);
    // الكلام اللي في النص (بين الأسعار والأسماء) زي "ألوان خاصة / ألوان جاهزة"
    const midToks = texts.filter((t) => !inName(t) && !JUNK.test(t.s) && !NOISE.test(t.s));

    const nearest = (list, y) => { let best = null, bd = 1e9; for (const s of list) { const d = Math.abs(s.yc - y); if (d < bd) { bd = d; best = s; } } return [best, bd]; };
    // الاسم: الأولوية للسطر اللي جنب الحجم، بعدين اللي فوقه، والسطر اللي تحته غالباً وصف
    const nameFor = (sz, p) => {
      let best = null, bd = 1e9;
      if (sz) {
        // على نفس سطر الحجم: ناخد أطول مقطع (المقاطع القصيرة على الطرف غالباً عناوين جانبية)
        const same = nameSegs.filter((s) => Math.abs(s.yc - sz.yc) <= lh * 0.8).sort((a, b) => b.words - a.words || Math.abs(a.yc - sz.yc) - Math.abs(b.yc - sz.yc));
        if (same.length) { best = same[0]; bd = 0; }
        if (!best) [best, bd] = nearest(nameSegs.filter((s) => s.yc < sz.yc && sz.yc - s.yc <= lh * 3), sz.yc);
      }
      if (!best) [best, bd] = nearest(nameSegs, p.yc);
      if (!best || bd > lh * 6) return null;
      const overlaps = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -lh;
      const below = nameSegs.filter((s) => s.yc > best.yc + lh * 0.5 && s.yc - best.yc < lh * 1.8 && overlaps(s, best)).sort((a, b) => a.yc - b.yc)[0];
      let txt = best.text;
      // لو الاسم كلمة واحدة (زي "فاين") نضم السطر اللي فوقه في نفس العمود
      if (best.words <= 1) {
        const above = nameSegs.filter((s) => s.yc < best.yc - lh * 0.5 && best.yc - s.yc < lh * 1.8 && overlaps(s, best)).sort((a, b) => b.yc - a.yc)[0];
        if (above) txt = `${above.text} ${txt}`; else if (below) txt = `${txt} ${below.text}`;
      }
      return { text: txt, sub: below && best.words > 1 ? below.text : '' };
    };
    const catAt = (y) => { let c = ''; for (const s of catSegs) if (s.yc <= y + lh) c = s.text; return c; };

    // 5) كل سعر: نلاقي حجمه (نفس العمود فوقه، أو نفس السطر) واسمه
    const rows = [];
    for (const p of prices) {
      let sz = null, bd = 1e9;
      for (const s of sizes) {
        const dy = p.yc - s.yc; if (dy < -lh * 0.5 || dy > lh * 14) continue;
        const dx = Math.abs(s.xc - p.xc); if (dx > Math.max(40, (s.x1 - s.x0) * 0.9)) continue;
        const d = dy + dx * 0.5; if (d < bd) { bd = d; sz = s; }
      }
      if (!sz) { // جدول عادي: الحجم في عمود تاني على نفس السطر
        for (const s of sizes) { const dy = Math.abs(p.yc - s.yc); if (dy > lh * 0.7) continue; const d = Math.abs(s.xc - p.xc); if (d < bd) { bd = d; sz = s; } }
      }
      const nm = nameFor(sz, p);
      if (!nm) continue;
      // النوع (أبيض / ألوان خاصة / ألوان جاهزة): أقرب كلمة على نفس سطر السعر
      const vc = [...midToks.map((t) => ({ text: t.s, yc: t.yc })), ...segs.filter((s) => VARIANT_RE.test(s.text))]
        .filter((v) => Math.abs(v.yc - p.yc) < lh * 0.6).sort((a, b) => Math.abs(a.yc - p.yc) - Math.abs(b.yc - p.yc));
      const variant = vc.length ? vc[0].text : '';
      rows.push({ base: nm.text, sub: nm.sub, variant, size: sz ? sz.size : '', unit: sz ? sz.unit : '', price: p.v, category: catAt(p.yc), y: p.yc });
    }
    // نفس الاسم والحجم بسعرين مختلفين ومفيش نوع يفرّق بينهم → نضيف سطر الوصف (زي داخلي / خارجي)
    const dupKey = (r) => r.base + '|' + r.size + '|' + r.variant;
    const dupCount = {}; for (const r of rows) dupCount[dupKey(r)] = (dupCount[dupKey(r)] || 0) + 1;
    for (const r of rows) if (dupCount[dupKey(r)] > 1 && r.sub) r.base = `${r.base} ${r.sub}`;
    // لو المنتج فيه أكتر من نوع (أبيض / ألوان خاصة) نكتب النوع في الاسم
    const byBase = {};
    for (const r of rows) (byBase[r.base + '|' + r.size] = byBase[r.base + '|' + r.size] || []).push(r);
    for (const r of rows) {
      const grp = byBase[r.base + '|' + r.size];
      if (!r.variant && grp.length > 1 && grp.some((x) => x.variant && !/^(أبيض|ابيض)$/.test(x.variant))) r.variant = 'أبيض';
      const showVar = r.variant && (grp.length > 1 || !/^(أبيض|ابيض)$/.test(r.variant));
      r.name = [r.base, showVar ? r.variant : '', r.size !== '' ? `${r.size} ${r.unit}` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }
    return rows;
  }

  function parsePages(pages) {
    let out = []; const seen = new Set();
    pages.forEach((pg, i) => {
      for (const r of parsePage(pg.items, pg.fromPdf)) {
        const k = normName(r.name) + '|' + r.price; if (seen.has(k)) continue; seen.add(k);
        out.push({ ...r, page: i + 1 });
      }
    });
    // لو الملف فيه جداول بعناوين، نتجاهل الصفحات اللي مفيهاش جدول (غلاف، ملاحظات…)
    if (out.some((r) => r.table)) out = out.filter((r) => r.table);
    // نفس الاسم بسعرين مختلفين (الفرق في العبوة بس، زي شيكارة وبستلة) → نضيف العبوة للاسم
    const cnt = {}; for (const r of out) cnt[normName(r.name)] = (cnt[normName(r.name)] || 0) + 1;
    for (const r of out) if (cnt[normName(r.name)] > 1 && r.pack && !r.name.includes(r.pack)) r.name = `${r.name} ${r.pack}`;
    return out;
  }

  /* ---------------------------- قراءة الملفات ---------------------------- */
  let pdfjs = null;
  async function loadPdfjs() {
    if (!pdfjs) { pdfjs = await import((window.POS_BASE || '/') + 'vendor/pdfjs/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = (window.POS_BASE || '/') + 'vendor/pdfjs/pdf.worker.min.mjs'; }
    return pdfjs;
  }
  // كل ملفات القراءة الضوئية جوه البرنامج (من غير إنترنت)
  const OCR_PATHS = { workerPath: new URL((window.POS_BASE || '/') + 'vendor/tesseract/worker.min.js', location.href).href, corePath: new URL((window.POS_BASE || '/') + 'vendor/tesseract/core', location.href).href, langPath: new URL((window.POS_BASE || '/') + 'vendor/tesseract/lang', location.href).href, workerBlobURL: false };
  let ocrWorker = null;
  async function getOcr(progress) {
    if (ocrWorker) return ocrWorker;
    if (!root.Tesseract) {
      progress('بتجهيز أداة قراءة الصور…');
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = (window.POS_BASE || '/') + 'vendor/tesseract/tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('تعذر تحميل أداة قراءة الصور')); document.head.append(s); });
    }
    progress('بتجهيز القراءة العربي…');
    ocrWorker = await root.Tesseract.createWorker('ara+eng', 1, { ...OCR_PATHS, logger: (m) => { if (m.status === 'recognizing text') progress(`بيقرا الصورة… ${Math.round(m.progress * 100)}%`); } });
    await ocrWorker.setParameters({ preserve_interword_spaces: '1' });
    return ocrWorker;
  }
  // قراءة تانية للأرقام بس (القراءة العربي ساعات بتاكل أرقام زي 3.5 ← 5)
  let numWorker = null;
  async function getNumOcr() {
    if (numWorker) return numWorker;
    numWorker = await root.Tesseract.createWorker('eng', 1, { ...OCR_PATHS });
    await numWorker.setParameters({ tessedit_char_whitelist: '0123456789.,', tessedit_pageseg_mode: '7' });
    return numWorker;
  }
  async function ocrItems(img, progress) {
    const w = await getOcr(progress);
    const { data } = await w.recognize(img);
    const items = [];
    for (const wd of data.words || []) { const t = (wd.text || '').trim(); if (!t || wd.confidence < 20) continue; items.push({ s: toWestern(t), x: wd.bbox.x0, y: wd.bbox.y0, w: wd.bbox.x1 - wd.bbox.x0, h: wd.bbox.y1 - wd.bbox.y0 }); }
    // نقص كل رقم لوحده من الصورة ونقراه بالقارئ الإنجليزي (أدق بكتير في الأرقام والكسور)
    try {
      const numsIt = items.filter((it) => /\d/.test(it.s));
      if (numsIt.length && img.getContext) {
        const nw = await getNumOcr(); let i = 0;
        for (const it of numsIt) {
          if (++i % 10 === 0) progress(`بيراجع الأرقام… ${i} من ${numsIt.length}`);
          // نوسّع لحد الكلمة اللي جنبه (القارئ العربي ساعات بيشوف آخر جزء من الرقم بس: 3.5 ← 5)
          const pad = Math.round(it.h * 0.35), sc = 3, ext = it.h * 1.6;
          const sameLine = items.filter((o) => o !== it && Math.min(o.y + o.h, it.y + it.h) - Math.max(o.y, it.y) > it.h * 0.3);
          const leftB = Math.max(-1, ...sameLine.filter((o) => o.x + o.w <= it.x + 1).map((o) => o.x + o.w));
          const rightB = Math.min(img.width + 1, ...sameLine.filter((o) => o.x >= it.x + it.w - 1).map((o) => o.x));
          const x0 = Math.max(0, it.x - ext, leftB + 2), x1 = Math.min(img.width, it.x + it.w + ext, rightB - 2);
          const cx = Math.round(Math.min(x0, it.x - 1)), cy = Math.max(0, it.y - pad), cw = Math.round(Math.max(x1, it.x + it.w + 1) - cx), ch = Math.min(img.height - cy, it.h + pad * 2);
          if (cw < 4 || ch < 4) continue;
          const c = document.createElement('canvas'); c.width = cw * sc + 40; c.height = ch * sc + 40;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(img, cx, cy, cw, ch, 20, 20, cw * sc, ch * sc);
          const r = (await nw.recognize(c)).data; const t = (r.text || '').replace(/\s+/g, '').replace(/^[.,]+|[.,]+$/g, '');
          if (t && NUM_RE.test(t) && r.confidence >= 55 && t.replace(/\D/g, '').length >= it.s.replace(/\D/g, '').length) it.s = t;
        }
      }
    } catch (e) { console.warn('number pass failed', e); }
    return items;
  }
  async function readFiles(files, progress) {
    const pages = [];
    for (const f of files) {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        const lib = await loadPdfjs();
        const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        for (let p = 1; p <= doc.numPages; p++) {
          progress(`بيقرا ${f.name} — صفحة ${p} من ${doc.numPages}`);
          const page = await doc.getPage(p); const vp = page.getViewport({ scale: 1 });
          const tc = await page.getTextContent();
          let items = tc.items.filter((i) => i.str && i.str.trim()).map((i) => { const h = Math.hypot(i.transform[2], i.transform[3]) || i.height || 10; return { s: i.str, x: i.transform[4], y: vp.height - i.transform[5] - h, w: i.width, h }; });
          if (items.length) { pages.push({ items, fromPdf: true }); continue; }
          if (doc.numPages > 1 && (p === 1 || p === doc.numPages) && pages.some((x) => x.fromPdf)) continue; // غلاف أو صفحة أخيرة صورة
          // صفحة متصوّرة (مفيهاش نص) → نرسمها ونقراها ضوئياً
          const svp = page.getViewport({ scale: 2.5 }); const c = document.createElement('canvas'); c.width = svp.width; c.height = svp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: svp }).promise;
          items = await ocrItems(c, (m) => progress(`${f.name} — صفحة ${p}: ${m}`));
          pages.push({ items, fromPdf: false });
        }
      } else if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp)$/i.test(f.name)) {
        progress(`بيقرا الصورة ${f.name}…`);
        const items = await ocrItems(await prepImage(f), (m) => progress(`${f.name}: ${m}`));
        pages.push({ items, fromPdf: false });
      }
    }
    return pages;
  }
  // تكبير الصور الصغيرة وتحويلها رمادي عشان القراءة تبقى أدق
  async function prepImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(3, Math.max(1, 2200 / Math.max(bmp.width, bmp.height)));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.4)'; g.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------------------------- مطابقة مع الأصناف الموجودة ---------------------------- */
  const words = (s) => new Set(normName(s).split(' ').filter((w) => w.length > 1 && !/^\d/.test(w)));
  function similarity(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / (A.size + B.size - n); }
  const sizeKey = (s) => { const m = normName(s).match(/(\d+(?:\.\d+)?)\s*(لتر|كجم|جم|مل|جالون)/); return m ? +m[1] + m[2] : ''; };
  function matchRows(rows, products) {
    const exact = new Map(products.map((p) => [normName(p.name), p]));
    const used = new Set();
    // الأول المتطابق بالظبط، بعدين التقريبي (وكل صنف في البرنامج يتربط بسطر واحد بس)
    for (const r of rows) {
      const sk = sizeKey(r.name);
      r.candidates = products.map((p) => ({ p, s: similarity(r.name, p.name) * (sk && sizeKey(p.name) === sk ? 1 : sk && sizeKey(p.name) ? 0.3 : 0.8) })).filter((x) => x.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, 6);
      const ex = exact.get(normName(r.name));
      if (ex && !used.has(ex.id)) { r.match = ex.id; r.matchType = 'exact'; used.add(ex.id); if (!r.candidates.some((c) => c.p.id === ex.id)) r.candidates.unshift({ p: ex, s: 1 }); }
      else { r.match = 0; r.matchType = 'new'; }
    }
    // التقريبي: الأقرب في الاسم، ولو اتنين على نفس الصنف ياخده اللي سعره أقرب
    const fuzzy = [];
    for (const r of rows) if (!r.match) for (const c of r.candidates) {
      const samePrice = Math.abs((c.p.price || 0) - r.price) < 0.01; // نفس السعر بالظبط = دليل قوي إنه نفس الصنف
      if ((c.s >= 0.6 || (samePrice && c.s >= 0.45)) && !used.has(c.p.id)) fuzzy.push({ r, c, score: c.s + (samePrice ? 0.35 : -Math.min(0.3, Math.abs((c.p.price || 0) - r.price) / Math.max(1, r.price))) });
    }
    fuzzy.sort((a, b) => b.score - a.score);
    for (const f of fuzzy) { if (f.r.match || used.has(f.c.p.id)) continue; f.r.match = f.c.p.id; f.r.matchType = 'fuzzy'; used.add(f.c.p.id); }
    return rows;
  }

  // قراءة الكلام اللي في صورة (لخانة البيان)
  async function ocrText(file, progress) {
    const w = await getOcr(progress || (() => {}));
    const img = await prepImage(file);
    const { data } = await w.recognize(img);
    return toWestern(String(data.text || '')).split('\n').map((l) => l.trim()).filter(Boolean).join(' — ');
  }
  const API = { normText, normName, parsePage, parsePages, readFiles, matchRows, similarity, mergeGlyphs, ocrText };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PriceImport = API;
})(typeof window !== 'undefined' ? window : globalThis);
