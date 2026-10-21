/* =====================================================================
   MCA "Master Data" reader — shared by the browser and the server.
   Input: label/value pairs + director rows (from the MCA Excel download),
          or plain text (from the MCA PDF, read directly or by OCR).
   Output: client fields for the client master.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.McaMaster = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // label on the MCA page → our key (labels compared in lower case, single spaces)
  const LABELS = {
    'cin': 'cin', 'llpin': 'cin', 'company name': 'name', 'llp name': 'name', 'roc name': 'roc', 'registration number': 'regNo',
    'date of incorporation': 'incDate', 'email id': 'email', 'registered address': 'addr', 'registered office address': 'addr',
    'address at which the books of account are to be maintained': 'booksAddr', 'listed in stock exchange(s) (y/n)': 'listed',
    'category of company': 'category', 'subcategory of the company': 'subcategory', 'class of company': 'klass', 'active compliance': 'activeCompliance',
    'authorised capital (rs)': 'authCap', 'paid up capital (rs)': 'paidCap', 'date of last agm': 'lastAgmDate', 'date of balance sheet': 'lastBsDate',
    'company status': 'status', 'llp status': 'status', 'small company': 'small', 'roc (name and office)': 'rocOffice', 'rd (name and region)': 'rd',
    'number of partners': 'nPartners', 'number of designated partners': 'nDPs', 'total obligation of contribution': 'contribution',
    'main division of business activity to be carried out in india': 'activity', 'description of main division': 'activityDesc',
    'date of last financial year end date for which statement of accounts and solvency filed': 'lastBsDate',
    'date of latest annual return filed': 'lastReturnDate', 'date of last annual return filed': 'lastReturnDate',
  };
  const STOP = ['jurisdiction', 'index of charges', 'director/signatory details', 'director/ signatory details', 'directorsignatorydetails', 'director/signatorydetails', 'no records found', 'company information', 'llp information'];
  const DESIG = 'Managing Director|Whole[- ]?time Director|Additional Director|Nominee Director|Alternate Director|Independent Director|Director|Designated Partner|Partner|Company Secretary|CFO|CEO|Chief Financial Officer|Chief Executive Officer|Manager';
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const lc = s => norm(s).toLowerCase().replace(/\s*\(\s*/g, ' (').replace(/\s*\)\s*/g, ') ').trim();
  const NL = {}; Object.keys(LABELS).forEach(k => { NL[lc(k)] = LABELS[k]; });

  const toISO = s => { const m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(String(s || '')); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : ''; };
  const dash = s => { s = norm(s); return /^[-–—.]*$/.test(s) ? '' : s; };
  // "SHRI KRISHANNETI DHAM" → "Shri Krishanneti Dham"; keeps OPC / LLP / P.P. / numbers
  const KEEP_UP = /^(OPC|LLP|HUF|NCT|II|III|IV|NGO|IT|HR)$/i;
  function titleCase(s) {
    return norm(s).split(' ').map(w => {
      if (!w) return w;
      if (/\d/.test(w) || /^([A-Za-z]\.)+[A-Za-z]?\.?$/.test(w) || KEEP_UP.test(w)) return w.toUpperCase();
      return w.split(/([-/(&])/).map(p => p && /[A-Za-z]/.test(p[0]) ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p).join('');
    }).join(' ');
  }
  function cleanAddr(s) {
    const parts = norm(s).replace(/\s*\/\s*/g, '/').split(/\s*,\s*/).filter(Boolean), out = [];
    parts.forEach(p => { if (!out.length || out[out.length - 1].toLowerCase() !== p.toLowerCase()) out.push(p); });
    return out.join(', ');
  }
  const cleanEmail = s => norm(s).replace(/\s*\[\s*at\s*\]\s*/gi, '@').replace(/\s*\[\s*dot\s*\]\s*/gi, '.').replace(/\s+/g, '').toLowerCase();
  const cleanAmt = s => { s = norm(s).replace(/[^\d,.]/g, ''); return s; };

  // pairs: [[label, value]], dirRows: [[sr, din, name, desig, category, appt, cessation, signatory]]
  function fromPairs(pairs, dirRows) {
    const raw = {}, notes = [];
    (pairs || []).forEach(([l, v]) => { const k = NL[lc(l)]; if (k && raw[k] === undefined) raw[k] = norm(v); });
    const cin = norm(raw.cin).toUpperCase().replace(/\s/g, '');
    const out = { name: titleCase(raw.name || ''), cin, incDate: toISO(raw.incDate), addr: cleanAddr(dash(raw.addr)), email: cleanEmail(dash(raw.email)),
      authCap: cleanAmt(dash(raw.authCap)), paidCap: cleanAmt(dash(raw.paidCap)), lastAgmDate: toISO(raw.lastAgmDate), lastBsDate: toISO(raw.lastBsDate),
      roc: dash(raw.roc || raw.rocOffice), mcaStatus: dash(raw.status), regNo: dash(raw.regNo), category: dash(raw.category), subcategory: dash(raw.subcategory), rd: dash(raw.rd) };
    // company type
    const klass = lc(raw.klass || '');
    const isLLP = /^[A-Z]{3}-\d{4}$/.test(cin) || 'nPartners' in raw || 'nDPs' in raw;
    out.type = isLLP ? 'llp' : (/one person/.test(klass) || /OPC\d{6}$/.test(cin)) ? 'opc' : /public/.test(klass) ? 'public' : 'private';
    out.sec8 = /^[LU]\d{5}[A-Z]{2}\d{4}NPL\d{6}$/.test(cin) ? 'yes' : 'no';
    if (raw.small !== undefined) out.size = /^y/i.test(raw.small) ? 'small' : 'other';
    if (cin && !isLLP && !/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(cin)) notes.push('CIN “' + cin + '” does not look complete — please check it.');
    if (out.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(out.email)) notes.push('Check the email address.');
    // directors / KMP (people who have ceased are left out)
    const directors = [], kmp = [], ceased = [];
    (dirRows || []).forEach(r => {
      const [, idRaw, nm, desig, cat, appt, cess] = r.map(norm);
      const id = String(idRaw || '').toUpperCase().replace(/\s/g, ''), name = titleCase(nm || '');
      if (!name) return;
      const person = { name, din: /^\d{8}$/.test(id) ? id : '', pan: /^[A-Z]{5}\d{4}[A-Z]$/.test(id) ? id : '', desig: titleCase(desig || 'Director'), category: cat || '', appt: toISO(appt) };
      if (dash(cess) && toISO(cess)) { ceased.push(Object.assign(person, { cessation: toISO(cess) })); return; }
      if (/secretary|cfo|ceo|chief|manager/i.test(desig || '') && !/director/i.test(desig || '')) kmp.push(person); else directors.push(person);
    });
    if (out.type === 'llp') directors.forEach(d => { if (!/partner/i.test(d.desig)) d.desig = 'Designated Partner'; });
    out.directors = directors; out.kmp = kmp; out.ceased = ceased;
    const cs = kmp.find(p => /secretary/i.test(p.desig)); if (cs) out.csName = cs.name;
    out.notes = notes;
    return out;
  }

  // rows from every sheet of the MCA Excel: arrays of cell texts
  function fromRows(rows) {
    const pairs = [], dirs = []; let inDirs = false;
    rows.forEach(r => {
      const cells = r.map(norm); const filled = cells.filter(Boolean);
      if (!filled.length) return;
      if (filled.some(c => /^din\s*\/?\s*(pan|dpin)?/i.test(c)) && filled.some(c => /^name$/i.test(c))) { inDirs = true; return; }
      if (inDirs && filled.length >= 5 && /^\d+$/.test(filled[0])) { dirs.push(filled); return; }
      if (filled.length === 2) pairs.push(filled);
    });
    return fromPairs(pairs, dirs);
  }

  // text of the MCA PDF (one line per printed line), e.g. from OCR
  function fromText(text) {
    const lines = String(text || '').split(/\r?\n/).map(norm).filter(Boolean);
    const labels = Object.keys(NL).sort((a, b) => b.length - a.length);
    const starts = labels.map(lb => lb.split(' ').slice(0, 3).join(' '));
    const pairs = [], dirs = []; let last = null, section = 'info', orphan = [];
    const rowRe = new RegExp('^(\\d{1,2})\\s+(\\d{8}|[A-Z]{5}\\d{4}[A-Z])\\s+(.*?)\\s*(' + DESIG + ')\\s+(\\S+)\\s+(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})\\s+(\\S+)(?:\\s+(Yes|No))?', 'i');
    lines.forEach(line => {
      const l = lc(line);
      if (/director\s*\/\s*signatory|partner\s*\/\s*signatory|signatory details/.test(l)) { section = 'dirs'; last = null; return; }
      if (STOP.some(s => l.startsWith(s))) { last = null; if (section === 'info' && /^(index of charges|jurisdiction)/.test(l)) section = l.startsWith('jur') ? 'info' : 'charges'; return; }
      if (section === 'dirs') {
        const m = rowRe.exec(line);
        if (m) { const nm = [...orphan, m[3]].join(' ').replace(/[.|]+/g, ' '); dirs.push([m[1], m[2], nm, m[4], m[5], m[6], m[7], m[8] || '']); orphan = []; return; }
        if (/^(sr\.?|no\b|din|name|designation|category|date|appointment|cessation|signatory)/i.test(line)) return;
        const words = line.replace(/[^A-Za-z .]/g, ' ').replace(/\s+\.\s*$/, '').trim();
        if (words && !/\d/.test(line)) orphan.push(words);
        return;
      }
      if (section === 'charges') return;
      const hit = labels.find(lb => l.startsWith(lb + ' ') || l === lb);
      if (hit) { last = [hit, l.length === lc(line).length ? line.slice(line.length - (l.length - hit.length)).trim().replace(/^[:\-]\s*/, '') : '']; pairs.push(last); return; }
      if (starts.some(p => l.startsWith(p))) { last = null; return; } // another label (e.g. wrapped over two lines)
      if (last && NL[last[0]] === 'addr') { last[1] = (last[1] + ' ' + line).trim(); return; }
    });
    // trailing name parts printed below the last row
    if (orphan.length && dirs.length) dirs[dirs.length - 1][2] += ' ' + orphan.join(' ');
    return fromPairs(pairs, dirs);
  }

  // join pdf.js text items into lines (by y position)
  function linesFromPdfItems(items) {
    const rows = [];
    items.filter(it => it.str && it.str.trim()).forEach(it => {
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find(z => Math.abs(z.y - y) < 3);
      if (!r) { r = { y, parts: [] }; rows.push(r); }
      r.parts.push({ x, s: it.str });
    });
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ')).join('\n');
  }

  return { fromPairs, fromRows, fromText, linesFromPdfItems, titleCase, cleanAddr, cleanEmail, toISO };
});
