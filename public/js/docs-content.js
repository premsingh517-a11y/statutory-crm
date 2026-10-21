/* =====================================================================
   Document content — shared by the browser (lists, timeline, dashboard)
   and the server (Word generation).

   ctx = { kase, c:client, a:caFirm, d:signingDirector, f:formFields }
   kase: 'first' | 'agm' | 'casual'       auditor appointment (ADT-1)
         'dirapp' | 'dirres'              director appointment / resignation (DIR-12)
         'annual'                         annual filing (AOC-4, MGT-7 / MGT-7A)

   A document's build() returns "blocks":
     {p, al:'l|c|r|j', b, u, ind, hang, after, sz, keep}
     {gap:n}  {pb:true}  {tbl:[[...]], cols:[ratios], head:true}  {sign: image|null}
   Inside p:  **bold**   \n = line break   \t = tab
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DocsContent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- helpers ---------- */
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const NUMW = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  const BL = '____________';
  const isTok = s => typeof s === 'string' && /^\{\{[^{}]+\}\}$/.test(s);
  const tokSfx = (s, sfx) => '{{' + s.slice(2, -2) + ':' + sfx + '}}';
  const ord = n => { if (isTok(n)) return tokSfx(n, 'ord'); n = parseInt(n, 10); if (!n) return BL; const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const pd = s => { if (!s) return null; const [y, m, d] = String(s).split('-').map(Number); if (!y || !m || !d) return null; return new Date(Date.UTC(y, m - 1, d)); };
  const iso = dt => dt.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = pd(s); if (!d) return ''; d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const addMonths = (s, n) => { const d = pd(s); if (!d) return ''; const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return iso(d); };
  const ld = s => { if (isTok(s)) return s; const d = pd(s); if (!d) return BL; return ord(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + ', ' + d.getUTCFullYear(); };
  const sd = s => { if (isTok(s)) return tokSfx(s, 'short'); const d = pd(s); if (!d) return '—'; return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  const dayName = s => { if (isTok(s)) return tokSfx(s, 'day'); const d = pd(s); return d ? DAYS[d.getUTCDay()] : BL; };
  const yr = s => { const d = pd(s); return d ? d.getUTCFullYear() : null; };
  const tm = t => { if (isTok(t)) return t; if (!t) return BL; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'P.M.' : 'A.M.'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; };
  const v = x => (x === undefined || x === null || String(x).trim() === '') ? BL : String(x).trim();
  const oneLine = s => String(s || '').replace(/\s*\n\s*/g, ', ').trim();
  const fyStart = s => { const d = pd(s); if (!d) return null; return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
  // Sec 2(41): first FY ends on the 31st March after incorporation (incorporated on/after 1 Jan → 31st March of the following year)
  const firstFYEnd = inc => { const y = yr(inc); if (!y) return ''; const d = pd(inc); return (d.getUTCMonth() >= 3 ? y + 1 : y + 1) + '-03-31'; };
  const lines = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
  const cells = (s, n) => lines(s).map(l => { const p = l.split('|').map(t => t.trim()); while (p.length < n) p.push(''); return p.slice(0, n); });
  const parseDMY = s => { s = String(s || '').trim(); let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? s : ''; };
  const amt = x => (x === undefined || x === null || String(x).trim() === '') ? '–' : String(x).trim();
  const fyLabel = end => { const y = yr(end); return y ? (y - 1) + '-' + String(y).slice(2) : BL; };
  // Templates: T() records a computed phrase under a name; in template mode it returns {{name}} instead
  const T = (x, name, val) => { (x.vals || (x.vals = {}))[name] = val; return x.T ? '{{' + name + '}}' : val; };
  const F = (x, key, def) => T(x, key + 'Text', x.f[key] || def); // optional text field with standard wording
  let GID = 0;
  const tag = (blocks, name) => { const id = ++GID; blocks.forEach(b => { b.grp = name; b.gid = id; }); return blocks; };

  const CASES = ['first', 'agm', 'casual', 'dirapp', 'dirres', 'annual', 'allot', 'authcap', 'transfer', 'regoffice', 'inc20a', 'dpt3', 'msme1', 'stk2', 'llp', 'registers', 'yearly'];
  const CASE_TITLE = {
    first: 'First Auditor — Board Appointment u/s 139(6)',
    agm: 'Auditor Appointment at Annual General Meeting u/s 139(1)',
    casual: 'Auditor Casual Vacancy u/s 139(8)',
    dirapp: 'Appointment of Director — Sec 152 / 161(1)',
    dirres: 'Resignation of Director — Sec 168',
    annual: 'Annual Filing — AOC-4 and MGT-7 / MGT-7A',
    allot: 'Rights Issue & Allotment of Shares — Sec 62(1)(a), PAS-3',
    authcap: 'Increase in Authorised Capital — Sec 61, SH-7',
    transfer: 'Transfer of Shares — Sec 56, SH-4',
    regoffice: 'Shifting of Registered Office — Sec 12, INC-22',
    inc20a: 'Commencement of Business — Sec 10A, INC-20A',
    dpt3: 'Return of Deposits / Exempted Receipts — DPT-3',
    msme1: 'Outstanding Dues to Micro & Small Enterprises — MSME-1',
    stk2: 'Strike Off (Removal of Name) — Sec 248(2), STK-2',
    llp: 'LLP Annual Filing — Form 11 & Form 8',
    registers: 'Statutory Registers — MGT-1 & Register of Directors',
    yearly: 'Yearly Secretarial Records — Board Meetings, Notices, Minutes & Registers',
  };
  const CASE_SHORT = { first: 'First Auditor', agm: 'Auditor at AGM', casual: 'Auditor Casual Vacancy', dirapp: 'Director Appointment', dirres: 'Director Resignation', annual: 'AOC-4 & MGT-7',
    allot: 'Allotment PAS-3', authcap: 'Auth. Capital SH-7', transfer: 'Share Transfer SH-4', regoffice: 'Regd. Office INC-22', inc20a: 'INC-20A', dpt3: 'DPT-3', msme1: 'MSME-1', stk2: 'Strike Off STK-2', llp: 'LLP Form 11 & 8', registers: 'Registers', yearly: 'Yearly Records' };
  const LH_CO = 'company', LH_CA = 'ca', LH_NONE = 'none', LH_PLAIN = 'plain';

  /* ---------- context ---------- */
  function prep(ctx) {
    const x = Object.assign({ c: {}, a: {}, d: {}, f: {} }, ctx);
    x.c = x.c || {}; x.a = x.a || {}; x.d = x.d || {}; x.f = x.f || {};
    const f = x.f, dirs = x.c.directors || [];
    x.K = x.kase;
    x.venue = s => s || oneLine(x.c.addr);
    x.T = !!ctx.T; x.vals = {};
    x.firmDesc = T(x, 'auditorFirmDescription', (x.a.firm ? x.a.firm : BL) + ', Chartered Accountants (Firm Registration No. ' + v(x.a.frn) + ')');
    x.remun = T(x, 'remuneration', f.remun
      ? 'at a remuneration of ' + f.remun + ' plus applicable taxes and reimbursement of out-of-pocket expenses'
      : 'at such remuneration as may be mutually agreed upon between the Board of Directors and the Auditors');
    x.isRe = x.kase === 'agm' && f.apptType === 're';
    x.resign = x.kase === 'casual' && f.reason !== 'other';
    // second signing director (annual filing) and resigning director (from client master)
    // signing directors (multi-select): ds = all selected, d = first, d2 = second
    x.ds = (Array.isArray(ctx.ds) && ctx.ds.length ? ctx.ds : (x.d && x.d.name ? [x.d] : [])).filter(d => d && d.name);
    if (x.ds.length) x.d = x.ds[0];
    x.d2 = x.ds[1] || (f.dir2Index !== undefined && f.dir2Index !== '' ? (dirs[parseInt(f.dir2Index, 10)] || {}) : {});
    x.res = f.resIndex !== undefined && f.resIndex !== '' ? (dirs[parseInt(f.resIndex, 10)] || {}) : {};
    if (x.T) { x.res = { name: '{{resigningDirector}}', din: '{{resigningDirectorDin}}', desig: 'Director' }; if (!x.d2.name) x.d2 = { name: '{{director2}}', din: '{{director2Din}}', desig: 'Director' }; }
    // new director (appointment)
    const t = f.appTitle || 'Mr.';
    x.app = { title: t, name: f.appName || '', din: f.appDin || '', father: f.appFather || '', dob: f.appDob || '', addr: f.appAddr || '', email: f.appEmail || '',
      mobile: f.appMobile || '', pan: f.appPan || '', occ: f.appOcc || '', nat: f.appNat || 'Indian', qual: f.appQual || '', exp: f.appExp || '', sign: f.apptSign || null };
    x.app.full = T(x, 'newDirector', (t ? t + ' ' : '') + v(x.app.name));
    x.app.his = T(x, 'his', t === 'Mr.' ? 'his' : (t === 'Ms.' || t === 'Mrs.') ? 'her' : 'his/her');
    x.app.he = T(x, 'he', t === 'Mr.' ? 'he' : (t === 'Ms.' || t === 'Mrs.') ? 'she' : 'he/she');
    x.app.sonOf = T(x, 'sonOf', t === 'Mr.' ? 'son of' : (t === 'Ms.' || t === 'Mrs.') ? 'daughter of' : 'son/daughter of');
    x.app.cat = T(x, 'directorCategory', f.appCat === 'exec' ? 'Executive' : 'Non-Executive');
    x.egmApp = x.kase === 'dirapp' && f.apptMode === 'egm';
    x.regularise = x.kase === 'dirapp' && f.apptMode !== 'egm' && f.regularise === 'yes';
    x.appDate = x.kase === 'dirapp' ? (x.egmApp ? f.egmDate : f.bmDate) : '';
    x.resEff = x.kase === 'dirres' ? (f.resEffDate && f.resReceipt && f.resEffDate > f.resReceipt ? f.resEffDate : (f.resReceipt || f.resEffDate || '')) : '';
    // annual filing
    x.small = f.coSize !== 'other';
    x.retForm = x.small ? 'MGT-7A' : 'MGT-7';
    x.fyEnd = f.fyEnd || '';
    x.firstFY = !!(x.c.incDate && x.fyEnd && firstFYEnd(x.c.incDate) === x.fyEnd);
    x.fyFrom = x.firstFY ? x.c.incDate : (x.fyEnd ? addDays(addMonths(x.fyEnd, -12), 1) : '');
    x.prevFyEnd = x.fyEnd ? addMonths(x.fyEnd, -12) : '';
    x.bms = lines(f.bmList).map(parseDMY).filter(Boolean).sort();
    x.isOPC = x.c.type === 'opc';
    return x;
  }
  const prevDesc = f => isTok(f.prevFirm) ? '{{previousAuditor}}' : v(f.prevFirm) + ', Chartered Accountants' + (f.prevFrn ? ' (Firm Registration No. ' + f.prevFrn + ')' : '');
  const vacancyText = x => T(x, 'vacancyReason', x.f.reason === 'other' ? (v(x.f.reasonText) + ' of ' + prevDesc(x.f)) : ('the resignation of ' + prevDesc(x.f)));
  function meetingDate(x) { const f = x.f; return x.kase === 'first' ? f.bmDate : x.kase === 'agm' ? f.agmDate : (x.resign ? f.egmDate : f.bmDate); }
  function termText(x, mode) { return T(x, 'auditorTerm' + (mode ? mode[0].toUpperCase() + mode.slice(1) : ''), termText0(x, mode)); }
  function termText0(x, mode) {
    const f = x.f;
    if (x.kase === 'first') {
      if (mode === 'consent') return 'under Section 139(6) of the Companies Act, 2013, to hold office till the conclusion of the first Annual General Meeting of the Company';
      return 'to hold office from ' + (mode === 'letter' ? 'the date of appointment' : 'the conclusion of this meeting') + ' till the conclusion of the first Annual General Meeting of the Company';
    }
    if (x.kase === 'agm') {
      const n = parseInt(f.agmNo, 10), t = parseInt(f.term, 10) || 5, y = yr(f.agmDate);
      return 'for a term of ' + t + ' (' + (NUMW[t] || t) + ') consecutive years, to hold office from the conclusion of the ' + ord(n) + ' Annual General Meeting till the conclusion of the ' + (n ? ord(n + t) : BL) + ' Annual General Meeting of the Company to be held in the year ' + (y ? y + t : BL);
    }
    return 'to fill the casual vacancy caused by ' + vacancyText(x) + ', to hold office till the conclusion of the next Annual General Meeting of the Company';
  }

  /* ---------- reusable blocks ---------- */
  const addrLines = s => tag(String(s || BL).split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ p: l, after: 0 })), 'address');
  const subj = t => ({ p: '**Subject: ' + t + '**', al: 'j' });
  const numbered = (items, start) => items.map((t, i) => ({ p: (i + (start || 1)) + '.\t' + t, hang: true, al: 'j' }));
  const lettered = items => items.map((t, i) => ({ p: '(' + 'abcdefghij'[i] + ')\t' + t, hang: true, al: 'j' }));
  const head = t => ({ p: t, b: true, keep: true });
  const signoff = () => [{ p: 'Thanking you,', after: 0, keep: true }, { p: 'Yours faithfully,', keep: true }];
  function sigCompany(x, date, lead, who) { // all selected signing directors (or one specific person)
    const { c, f } = x, list = who ? [who] : (x.ds && x.ds.length ? x.ds : [x.d]);
    const out = [{ gap: 1 }, { p: lead || ('For ' + c.name), b: true, keep: true }];
    list.forEach((d, i) => { if (i) out.push({ gap: 1 }); out.push({ sign: d.sign || null }, { p: v(d.name), b: true, after: 0, keep: true }, { p: v(d.desig || 'Director'), after: 0, keep: true }, { p: 'DIN: ' + v(d.din), after: 0, keep: true }); });
    out.push({ p: 'Place: ' + v(f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 });
    return tag(out, 'signature');
  }
  // "X, Director (DIN), be and is hereby authorised" — or several selected directors, severally authorised
  const authWho = x => T(x, 'authorisedDirectors', authWho0(x));
  const authWho0 = x => x.ds && x.ds.length > 1
    ? x.ds.map(d => v(d.name) + ' (DIN: ' + v(d.din) + ')').join(', ').replace(/, ([^,]*)$/, ' and $1') + ', Directors of the Company, be and are hereby severally authorised'
    : v(x.d.name) + ', ' + v(x.d.desig || 'Director') + ' (DIN: ' + v(x.d.din) + '), be and is hereby authorised';
  function sigTwo(x, date) { // Board's report / financial statements: two directors (one for OPC)
    const one = d => [{ sign: d.sign || null }, { p: v(d.name), b: true, after: 0, keep: true }, { p: v(d.desig || 'Director'), after: 0, keep: true }, { p: 'DIN: ' + v(d.din), after: 0, keep: true }];
    return tag([{ gap: 1 }, { p: 'For and on behalf of the Board of Directors\nFor ' + x.c.name, b: true, keep: true }, ...one(x.d),
      ...(x.isOPC ? [] : [{ gap: 1 }, ...one(x.d2)]), { gap: 1 }, { p: 'Place: ' + v(x.f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }], 'board-signature');
  }
  function sigPerson(p, date, place, extra) {
    return tag([{ gap: 1 }, { sign: p.sign || null }, { p: 'Signature: ____________________', after: 0, keep: true }, { p: 'Name: ' + v(p.full || p.name), after: 0, keep: true },
      ...(p.din !== undefined ? [{ p: 'DIN: ' + v(p.din), after: 0, keep: true }] : []), ...(extra || []).map(t => ({ p: t, after: 0, keep: true })),
      { p: 'Place: ' + v(place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }], 'person-signature');
  }
  const toBoard = x => [{ p: 'To,', after: 0 }, { p: 'The Board of Directors', after: 0 }, { p: x.c.name, b: true, after: 0 }, ...addrLines(x.c.addr), { gap: 1 }];
  const toAuditor = (firm, addr, attn) => [{ p: 'To,', after: 0 }, { p: v(firm), b: true, after: 0 }, { p: 'Chartered Accountants', after: 0 }, ...addrLines(addr), ...(attn ? [{ p: 'Kind Attn.: ' + attn, after: 0 }] : []), { gap: 1 }];
  const ctcHead = (x, what, date, time, venue) => ({ p: 'CERTIFIED TRUE COPY OF THE ' + what + ' OF ' + String(x.c.name || '').toUpperCase() + ' HELD ON ' + dayName(date).toUpperCase() + ', ' + ld(date).toUpperCase() + ' AT ' + tm(time) + ' AT ' + oneLine(venue).toUpperCase(), b: true, al: 'j' });
  const formHead = (form, title, rule) => [{ p: form, b: true, al: 'c', after: 0 }, { p: title, b: true, al: 'c', after: 0 }, { p: '[' + rule + ']', al: 'c', sz: 20 }, { gap: 1 }];
  const STAT = '(including any statutory modification(s) or re-enactment(s) thereof for the time being in force)';
  const GM_NOTES = [
    'A MEMBER ENTITLED TO ATTEND AND VOTE AT THE MEETING IS ENTITLED TO APPOINT A PROXY TO ATTEND AND VOTE INSTEAD OF HIMSELF/HERSELF AND THE PROXY NEED NOT BE A MEMBER OF THE COMPANY. The instrument appointing the proxy, in order to be effective, must be deposited at the Registered Office of the Company not less than 48 hours before the commencement of the meeting. A person can act as proxy on behalf of members not exceeding fifty and holding in the aggregate not more than ten percent of the total share capital of the Company carrying voting rights.',
    'Corporate members intending to send their authorised representatives to attend the meeting are requested to send to the Company a certified copy of the Board Resolution authorising their representative to attend and vote on their behalf at the meeting, pursuant to Section 113 of the Companies Act, 2013.',
    'Members / proxies are requested to bring the attendance slip duly filled in for attending the meeting.',
    'All documents referred to in the Notice are open for inspection by the members at the Registered Office of the Company on all working days during business hours up to the date of the meeting.',
    'The Proxy Form (Form MGT-11), Attendance Slip and Route Map to the venue of the meeting are annexed to this Notice.'];
  // Notice of Board meeting. pre = field prefix: 'bm' → bmDate, bmTime, bmVenue, bmNotice
  function bmNoticeDoc(x, agenda, pre, id, title) {
    const { c, f } = x; pre = pre || 'bm';
    const D = f[pre + 'Date'], T = f[pre + 'Time'], V = f[pre + 'Venue'], N = f[pre + 'Notice'];
    return { id: id || 'bmnotice', title: title || 'Notice of Board Meeting', sub: 'Sec 173(3) & Secretarial Standard-1 (ICSI)', lh: LH_CO, build: () => [
      { p: 'Date: ' + ld(N), al: 'r' }, { p: 'To,', after: 0 }, { p: 'All the Directors of ' + c.name, after: 0 },
      ...tag((c.directors || []).map(d => ({ p: d.name + (d.din ? ' (DIN: ' + d.din + ')' : ''), after: 0 })), 'directors'), { gap: 1 },
      { p: 'NOTICE OF MEETING OF THE BOARD OF DIRECTORS', b: true, al: 'c', u: true },
      { p: 'Notice is hereby given that a Meeting of the Board of Directors of ' + c.name + ' will be held on ' + dayName(D) + ', ' + ld(D) + ' at ' + tm(T) + ' at ' + oneLine(x.venue(V)) + ', to transact the following business:', al: 'j' },
      { p: 'AGENDA', b: true, al: 'c' }, ...numbered(agenda),
      { p: 'Directors desirous of participating in the meeting through video conferencing or other audio-visual means, as permitted under Section 173(2) of the Companies Act, 2013, are requested to inform the Company in advance. The draft resolutions and the papers relating to the agenda items are available at the Registered Office for inspection.', al: 'j' },
      { p: 'You are requested to make it convenient to attend the meeting.' },
      ...sigCompany(x, N, 'By Order of the Board\nFor ' + c.name)] };
  }
  function gmNoticeBody(x, kind, md, mt, mv) { // opening line of AGM / EGM notice
    const label = kind === 'agm' ? ord(x.f.agmNo) + ' Annual General Meeting' : 'Extraordinary General Meeting';
    return [{ p: 'NOTICE', b: true, al: 'c', sz: 28 },
      { p: '**NOTICE** is hereby given that the ' + label + ' of the members of ' + x.c.name + ' will be held on ' + dayName(md) + ', ' + ld(md) + ' at ' + tm(mt) + ' at ' + oneLine(mv) + ' to transact the following business:', al: 'j' }];
  }
  const indent = b => Object.assign({}, b, { ind: 567, al: 'j' });

  /* =====================================================================
     AUDITOR APPOINTMENT (first / agm / casual)
     ===================================================================== */
  function resBoardFirst(x) {
    return [
      { p: '**APPOINTMENT OF FIRST STATUTORY AUDITORS OF THE COMPANY**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 139(6) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014 ' + STAT + ', and on the basis of the written consent and certificate of eligibility received under Sections 139(1) and 141 of the Act, ' + x.firmDesc + ', be and are hereby appointed as the First Statutory Auditors of the Company, ' + termText(x, 'board') + ', ' + x.remun + '.' },
      { p: '**RESOLVED FURTHER THAT** any Director of the Company be and is hereby severally authorised to intimate the said appointment to the Auditors, to sign and file e-Form ADT-1 with the Registrar of Companies, and to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution.”' }];
  }
  function resMembersAGM(x) {
    return [
      { p: '“**RESOLVED THAT** pursuant to the provisions of Sections 139, 141, 142 and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014 ' + STAT + ', and pursuant to the recommendation of the Board of Directors, ' + x.firmDesc + ', who have confirmed their eligibility under Section 141 of the Act, be and are hereby ' + (x.isRe ? 're-appointed' : 'appointed') + ' as the Statutory Auditors of the Company ' + termText(x) + ', ' + x.remun + '.' },
      { p: '**RESOLVED FURTHER THAT** the Board of Directors of the Company be and is hereby authorised to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution, including filing of e-Form ADT-1 with the Registrar of Companies.”' }];
  }
  function resBoardAGM(x) {
    const f = x.f, re = x.isRe ? 're-' : '';
    return [
      { p: '**1. RECOMMENDATION FOR ' + re.toUpperCase() + 'APPOINTMENT OF STATUTORY AUDITORS**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Sections 139, 141, 142 and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014, and on the basis of the written consent and certificate of eligibility received from ' + x.firmDesc + ', the Board of Directors hereby recommends to the members of the Company the ' + re + 'appointment of ' + v(x.a.firm) + ' as the Statutory Auditors of the Company ' + termText(x) + ', ' + x.remun + '.”' },
      { p: '**2. APPROVAL OF NOTICE OF THE ' + ord(f.agmNo).toUpperCase() + ' ANNUAL GENERAL MEETING**', u: true },
      { p: '“**RESOLVED THAT** the ' + ord(f.agmNo) + ' Annual General Meeting of the members of the Company be held on ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(f.agmTime) + ' at ' + oneLine(x.venue(f.agmVenue)) + ', and the draft Notice convening the said meeting, as placed before the Board, be and is hereby approved.' },
      { p: '**RESOLVED FURTHER THAT** ' + authWho(x) + ' to sign and issue the Notice of the Annual General Meeting to the members, directors and auditors of the Company and to do all such acts, deeds and things as may be necessary in this regard.”' }];
  }
  function resBoardCasual(x) {
    const f = x.f, res = x.resign, out = [];
    if (res) out.push({ p: '**1. TAKING NOTE OF RESIGNATION OF STATUTORY AUDITORS**', u: true },
      { p: '“**RESOLVED THAT** the resignation of ' + prevDesc(f) + ' from the office of Statutory Auditors of the Company with effect from ' + ld(f.vacDate) + ', tendered vide their letter dated ' + T(x, 'resignationLetterDate', ld(f.resignLetter || f.vacDate)) + ', be and is hereby taken note of.”' });
    out.push({ p: '**' + (res ? '2. ' : '') + 'APPOINTMENT OF STATUTORY AUDITORS TO FILL THE CASUAL VACANCY**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 139(8) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014 ' + STAT + ', and on the basis of the written consent and certificate of eligibility received under Sections 139(1) and 141 of the Act, ' + x.firmDesc + ', be and are hereby appointed as the Statutory Auditors of the Company ' + termText(x) + ', ' + x.remun + (res ? ', subject to the approval of the members of the Company at a general meeting to be held within three months of the recommendation of the Board' : '') + '.' });
    if (res) out.push({ p: '**RESOLVED FURTHER THAT** an Extraordinary General Meeting of the members of the Company be held on ' + dayName(f.egmDate) + ', ' + ld(f.egmDate) + ' at ' + tm(f.egmTime) + ' at ' + oneLine(x.venue(f.egmVenue)) + ' to seek the approval of the members for the above appointment, and the draft Notice convening the said meeting, along with the Explanatory Statement under Section 102 of the Act, as placed before the Board, be and is hereby approved.' });
    out.push({ p: '**RESOLVED FURTHER THAT** ' + authWho(x) + ' to ' + (res ? 'sign and issue the Notice of the Extraordinary General Meeting, to ' : '') + 'intimate the said appointment to the Auditors, to sign and file e-Form ADT-1 with the Registrar of Companies, and to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution.”' });
    return out;
  }
  function resMembersCasual(x) {
    return [
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 139(8) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014 ' + STAT + ', and pursuant to the recommendation of the Board of Directors, the appointment of ' + x.firmDesc + ' as the Statutory Auditors of the Company ' + termText(x) + ', ' + x.remun + ', be and is hereby approved.' },
      { p: '**RESOLVED FURTHER THAT** the Board of Directors of the Company be and is hereby authorised to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution, including filing of e-Form ADT-1 with the Registrar of Companies.”' }];
  }
  function adtPeriod(x) {
    const f = x.f;
    if (x.kase === 'first') return { from: f.incDate, to: firstFYEnd(f.incDate), n: '1' };
    if (x.kase === 'agm') { const s = fyStart(f.agmDate), t = parseInt(f.term, 10) || 5; return s ? { from: s + '-04-01', to: (s + t) + '-03-31', n: String(t) } : { from: '', to: '', n: String(t) }; }
    const s = fyStart(f.vacDate); return s ? { from: s + '-04-01', to: (s + 1) + '-03-31', n: '1' } : { from: '', to: '', n: '1' };
  }

  function auditorDocs(x) {
    const { c, a, f } = x, K = x.kase, D = [];
    const apptName = T(x, 'appointmentName', (x.isRe ? 're-appointment' : 'appointment') + ' as ' + (K === 'first' ? 'First ' : '') + 'Statutory Auditors');

    const consent = { id: 'consent', title: 'Consent & Certificate of Eligibility', sub: 'From auditor — Sec 139(1), 141 & Rule 4', lh: LH_CA, build: () => {
      const date = f.consentDate;
      const rows = [['Name of the Firm / FRN', v(a.firm) + ' / ' + v(a.frn)], ['Constitution / PAN', v(a.const) + ' / ' + v(a.pan)], ['Address', oneLine(a.addr) || BL], ['Email', v(a.email)]];
      if (a.peer) rows.push(['Peer Review Certificate No.', a.peer]);
      return [{ p: 'Date: ' + ld(date), al: 'r' }, ...toBoard(x),
        subj('Consent and Certificate of Eligibility for ' + apptName + ' under Sections 139(1) and 141 of the Companies Act, 2013'),
        { p: 'Dear Sir / Madam,' },
        { p: 'We, ' + x.firmDesc + ', hereby give our consent to act as the ' + (K === 'first' ? 'First ' : '') + 'Statutory Auditors of ' + c.name + ' (CIN: ' + v(c.cin) + ') ' + termText(x, 'consent') + ', if ' + (K === 'agm' ? 'appointed by the members' : 'appointed') + '.', al: 'j' },
        { p: 'Pursuant to the proviso to Section 139(1) of the Companies Act, 2013 (“the Act”) read with Rule 4 of the Companies (Audit and Auditors) Rules, 2014, we hereby certify that:', al: 'j' },
        ...lettered(['we are eligible for appointment and are not disqualified for appointment under the Companies Act, 2013, the Chartered Accountants Act, 1949 and the rules or regulations made thereunder;',
          'the proposed appointment is as per the term provided under the Act;',
          'the proposed appointment is within the limits laid down by or under the authority of the Act;',
          'the list of proceedings against us or any partner of the firm pending with respect to professional matters of conduct, as disclosed in this certificate, is true and correct — there are no such proceedings pending as on the date of this certificate; and',
          'we satisfy the criteria provided in Section 141 of the Act.' + (a.peer ? ' We also hold a valid Peer Review Certificate (No. ' + a.peer + ') issued by the Peer Review Board of the Institute of Chartered Accountants of India.' : '')]),
        { p: 'Particulars of the firm for the purpose of e-Form ADT-1:', b: true }, { tbl: rows },
        ...signoff(), ...sigCA(x, date)];
    } };

    const prevComm = { id: 'prevcomm', title: 'Communication with Previous Auditor', sub: 'ICAI — Clause (8), Part I, First Schedule, CA Act 1949', lh: LH_CA, build: () => [
      { p: 'Date: ' + ld(f.consentDate), al: 'r' }, { p: '**By Registered Post A.D. / Email**' }, ...toAuditor(f.prevFirm, F(x, 'prevAddr', '') + (f.prevEmail ? '\nEmail: ' + f.prevEmail : '')),
      subj('Communication under Clause (8) of Part I of the First Schedule to the Chartered Accountants Act, 1949 — ' + c.name + ' (CIN: ' + v(c.cin) + ')'),
      { p: 'Dear Sir / Madam,' },
      { p: 'We have been approached by ' + c.name + ' (“the Company”) to accept appointment as its Statutory Auditors' + (K === 'casual' ? ' to fill the casual vacancy in the office of the Statutory Auditors' : '') + '. We understand that you ' + (K === 'casual' ? 'were' : 'are') + ' the Statutory Auditors of the Company.', al: 'j' },
      { p: 'Before accepting the said appointment, and in compliance with Clause (8) of Part I of the First Schedule to the Chartered Accountants Act, 1949, we request you to kindly let us know whether there are any professional or other reasons which, in your opinion, should be brought to our notice and which may prevent us from accepting the said appointment.', al: 'j' },
      { p: 'We shall be grateful for an early reply. In case we do not hear from you within a reasonable time, we shall presume that you have no objection to our accepting the appointment.', al: 'j' },
      ...signoff(), ...sigCA(x, f.consentDate)] };

    const boardCTC = { id: 'boardctc', title: 'Certified True Copy of Board Resolution', sub: 'Attachment to e-Form ADT-1', lh: LH_CO, build: () => {
      const res = K === 'first' ? resBoardFirst(x) : K === 'agm' ? resBoardAGM(x) : resBoardCasual(x);
      const single = K === 'first' || (K === 'casual' && !x.resign);
      return [ctcHead(x, 'RESOLUTION' + (single ? '' : 'S') + ' PASSED AT THE MEETING OF THE BOARD OF DIRECTORS', f.bmDate, f.bmTime, x.venue(f.bmVenue)), { gap: 1 },
        ...res.map(b => Object.assign({}, b, { al: b.al || 'j' })), { p: 'Certified True Copy', b: true }, ...sigCompany(x, f.bmDate)];
    } };

    const apptLetter = { id: 'apptletter', title: 'Intimation of Appointment to Auditor', sub: 'Sec 139(1) read with Rule 4(2)', lh: LH_CO, build: () => {
      const md = meetingDate(x);
      const by = K === 'agm' ? 'the members of the Company at the ' + ord(f.agmNo) + ' Annual General Meeting held on ' + ld(f.agmDate)
        : 'the Board of Directors of the Company at its meeting held on ' + ld(f.bmDate) + (x.resign ? ', which appointment has been approved by the members at the Extraordinary General Meeting held on ' + ld(f.egmDate) + ',' : '');
      return [{ p: 'Date: ' + ld(md), al: 'r' }, ...toAuditor(a.firm, a.addr, a.partner ? a.partner + ', ' + (a.desig || 'Partner') : ''),
        subj('Intimation of ' + apptName + ' of ' + c.name + ' (CIN: ' + v(c.cin) + ')'),
        { p: 'Dear Sir / Madam,' },
        { p: 'We are pleased to inform you that ' + by + ' has ' + (x.isRe ? 're-appointed' : 'appointed') + ' your firm, ' + x.firmDesc + ', as the ' + (K === 'first' ? 'First ' : '') + 'Statutory Auditors of the Company ' + termText(x, 'letter') + ', ' + x.remun + '.', al: 'j' },
        { p: 'This intimation is given pursuant to Section 139(1) of the Companies Act, 2013 read with Rule 4(2) of the Companies (Audit and Auditors) Rules, 2014. A certified true copy of the resolution is enclosed for your records. The Company shall file e-Form ADT-1 with the Registrar of Companies within the prescribed time.', al: 'j' },
        { p: 'Kindly confirm your acceptance of the appointment.', al: 'j' },
        ...signoff(), ...sigCompany(x, md), { gap: 1 }, { p: 'Encl.: Certified true copy of the resolution' }];
    } };

    const accept = { id: 'accept', title: 'Acceptance of Appointment by Auditor', sub: 'From auditor, on CA letterhead', lh: LH_CA, build: () => {
      const md = meetingDate(x), hasPrev = K === 'casual' || (K === 'agm' && !x.isRe && f.prevFirm);
      return [{ p: 'Date: ' + ld(md), al: 'r' }, ...toBoard(x),
        subj('Acceptance of ' + apptName),
        { p: 'Dear Sir / Madam,' },
        { p: 'We thank you for your letter dated ' + ld(md) + ' intimating our ' + apptName + ' of ' + c.name + ' (CIN: ' + v(c.cin) + ') ' + termText(x, 'letter') + '.', al: 'j' },
        { p: 'We hereby accept the said ' + (x.isRe ? 're-appointment' : 'appointment') + '. We confirm that we continue to be eligible for appointment and are not disqualified under Section 141 of the Companies Act, 2013' + (hasPrev ? ', and that we have communicated with the previous auditors in compliance with Clause (8) of Part I of the First Schedule to the Chartered Accountants Act, 1949' : '') + '.', al: 'j' },
        ...signoff(), ...sigCA(x, md)];
    } };

    const gmNotice = kind => ({ id: kind + 'notice', title: 'Notice of ' + (kind === 'agm' ? ord(f.agmNo) + ' Annual' : 'Extraordinary') + ' General Meeting', sub: kind === 'agm' ? 'Sec 101 & Secretarial Standard-2 — ordinary business' : 'Sec 101, 102 & SS-2 — with explanatory statement', lh: LH_CO, build: () => {
      const date = kind === 'agm' ? f.agmNotice : f.egmNotice, md = kind === 'agm' ? f.agmDate : f.egmDate, mt = kind === 'agm' ? f.agmTime : f.egmTime, mv = x.venue(kind === 'agm' ? f.agmVenue : f.egmVenue);
      const out = gmNoticeBody(x, kind, md, mt, mv);
      if (kind === 'agm') {
        out.push({ p: 'ORDINARY BUSINESS:', b: true, u: true },
          { p: '1.\tTo receive, consider and adopt the Audited Financial Statements of the Company for the financial year ended ' + ld(f.fyEnd) + ', together with the Reports of the Board of Directors and the Auditors thereon.', hang: true, al: 'j' },
          { p: '2.\tTo ' + (x.isRe ? 're-appoint' : 'appoint') + ' the Statutory Auditors of the Company and to fix their remuneration, and in this regard to consider and, if thought fit, to pass the following resolution as an **Ordinary Resolution**:', hang: true, al: 'j' },
          ...resMembersAGM(x).map(indent));
      } else {
        out.push({ p: 'SPECIAL BUSINESS:', b: true, u: true },
          { p: '1.\t**Appointment of Statutory Auditors to fill the casual vacancy caused by resignation**', hang: true },
          { p: 'To consider and, if thought fit, to pass the following resolution as an **Ordinary Resolution**:', ind: 567, al: 'j' },
          ...resMembersCasual(x).map(indent));
      }
      out.push(...sigCompany(x, date, 'By Order of the Board\nFor ' + c.name), { gap: 1 }, { p: 'NOTES:', b: true, u: true },
        ...numbered(kind === 'agm' ? GM_NOTES : ['An Explanatory Statement pursuant to Section 102(1) of the Companies Act, 2013, setting out the material facts concerning the business under Item No. 1, is annexed hereto.', ...GM_NOTES]));
      if (kind === 'egm') out.push({ pb: true }, { p: 'EXPLANATORY STATEMENT PURSUANT TO SECTION 102(1) OF THE COMPANIES ACT, 2013', b: true, al: 'c' }, { p: 'Item No. 1', b: true, u: true },
        { p: prevDesc(f) + ', the Statutory Auditors of the Company, have resigned from the said office with effect from ' + ld(f.vacDate) + ' vide their letter dated ' + T(x, 'resignationLetterDate', ld(f.resignLetter || f.vacDate)) + ', resulting in a casual vacancy in the office of the Statutory Auditors of the Company.', al: 'j' },
        { p: 'Pursuant to Section 139(8) of the Companies Act, 2013, the Board of Directors at its meeting held on ' + ld(f.bmDate) + ' appointed ' + x.firmDesc + ' as the Statutory Auditors of the Company to fill the said casual vacancy, to hold office till the conclusion of the next Annual General Meeting of the Company. As the casual vacancy has been caused by the resignation of the auditor, the appointment is required to be approved by the members of the Company at a general meeting convened within three months of the recommendation of the Board.', al: 'j' },
        { p: v(a.firm) + ' have given their written consent to act as the Statutory Auditors and have confirmed that their appointment, if approved, will be in accordance with the conditions prescribed under Sections 139 and 141 of the Act.', al: 'j' },
        { p: 'The Board recommends the Ordinary Resolution set out at Item No. 1 of the Notice for approval of the members.', al: 'j' },
        { p: 'None of the Directors or Key Managerial Personnel of the Company or their relatives is, in any way, concerned or interested, financially or otherwise, in the resolution set out at Item No. 1 of the Notice.', al: 'j' },
        ...sigCompany(x, date, 'By Order of the Board\nFor ' + c.name));
      return out;
    } });

    const membersCTC = kind => ({ id: kind + 'ctc', title: 'Certified True Copy of Members’ Resolution', sub: 'Passed at ' + (kind === 'agm' ? 'AGM' : 'EGM') + ' — attachment to e-Form ADT-1', lh: LH_CO, build: () => {
      const md = kind === 'agm' ? f.agmDate : f.egmDate, mt = kind === 'agm' ? f.agmTime : f.egmTime, mv = x.venue(kind === 'agm' ? f.agmVenue : f.egmVenue);
      return [ctcHead(x, 'ORDINARY RESOLUTION PASSED BY THE MEMBERS AT THE ' + (kind === 'agm' ? ord(f.agmNo).toUpperCase() + ' ANNUAL GENERAL MEETING' : 'EXTRAORDINARY GENERAL MEETING'), md, mt, mv), { gap: 1 },
        { p: '**' + (kind === 'agm' ? (x.isRe ? 'RE-' : '') + 'APPOINTMENT OF STATUTORY AUDITORS' : 'APPOINTMENT OF STATUTORY AUDITORS TO FILL THE CASUAL VACANCY CAUSED BY RESIGNATION') + '**', u: true },
        ...(kind === 'agm' ? resMembersAGM(x) : resMembersCasual(x)).map(b => Object.assign({}, b, { al: 'j' })), { p: 'Certified True Copy', b: true }, ...sigCompany(x, md)];
    } });

    const checklist = { id: 'adt1', title: 'e-Form ADT-1 Data Sheet & Checklist', sub: 'Internal — for the executive filing on MCA V3', lh: LH_NONE, build: () => {
      const nature = K === 'first' ? 'Appointment of first auditor by the Board — Section 139(6)' : K === 'agm' ? (x.isRe ? 'Re-appointment' : 'Appointment') + ' in AGM — Section 139(1)' : 'Appointment to fill casual vacancy — Section 139(8)';
      const per = adtPeriod(x), meet = meetingDate(x), boardOnly = K === 'first' || (K === 'casual' && !x.resign);
      const atts = ['Certified true copy of the ' + (boardOnly ? 'Board resolution' : 'members’ resolution'), 'Consent and certificate of eligibility of the auditor', 'Copy of the intimation (appointment letter) sent to the auditor'];
      if (x.resign) atts.push('Certified true copy of the Board resolution', 'Copy of the resignation letter of the outgoing auditor');
      if (K === 'agm') atts.push('Copy of the Board resolution recommending the appointment (optional attachment)');
      return [{ p: 'e-FORM ADT-1 — DATA SHEET & FILING CHECKLIST', b: true, al: 'c', sz: 28 }, { p: c.name + ' (CIN: ' + v(c.cin) + ')', al: 'c' },
        head('A. Company details'), { tbl: [['CIN', v(c.cin)], ['Name of the company', c.name], ['Registered office', oneLine(c.addr)], ['Email ID of the company', v(c.email)]] },
        head('B. Appointment details'), { tbl: [['Nature of appointment', nature], ['Whether joint auditors appointed', 'No'], ['Date of ' + (boardOnly ? 'Board meeting' : 'general meeting'), sd(meet)], ['Period of account — from', sd(per.from)], ['Period of account — to', sd(per.to)], ['Number of financial years', per.n],
          ...(K === 'casual' ? [['Previous auditor', prevDesc(f)], ['Date of vacancy', sd(f.vacDate)], ['Reason for vacancy', f.reason === 'other' ? v(f.reasonText) : 'Resignation (obtain SRN of ADT-3 filed by the outgoing auditor)']] : []),
          ...(K === 'agm' && !x.isRe && f.prevFirm ? [['Previous auditor', prevDesc(f)]] : [])] },
        head('C. Auditor details'), { tbl: [['Category of auditor', 'Auditor’s firm'], ['Name of the firm', v(a.firm)], ['Firm Registration No.', v(a.frn)], ['PAN of the firm', v(a.pan)], ['Address', oneLine(a.addr) || BL], ['Email ID', v(a.email)], ['Signing ' + (a.desig || 'Partner') + ' / Membership No.', v(a.partner) + ' / ' + v(a.mno)]] },
        head('D. Due dates'), { tbl: [['e-Form ADT-1 to be filed by', '**' + sd(addDays(meet, 15)) + '** (within 15 days of the meeting — Rule 4(2))'],
          ...(K === 'first' ? [['Board meeting deadline', sd(addDays(f.incDate, 30)) + ' (30 days from incorporation — Sec 139(6))']] : []),
          ...(K === 'casual' ? [['Board appointment deadline', sd(addDays(f.vacDate, 30)) + ' (30 days from vacancy — Sec 139(8))']] : []),
          ...(x.resign ? [['Members’ approval deadline', sd(addMonths(f.bmDate, 3)) + ' (3 months from Board recommendation)'], ['ADT-3 by outgoing auditor', sd(addDays(f.vacDate, 30)) + ' (Sec 140(2))']] : [])] },
        head('E. Attachments to ADT-1'), ...numbered(atts),
        head('F. Before filing'), ...numbered(['Verify the auditor’s FRN and firm details on the ICAI website.', 'Ensure the consent and eligibility certificate is dated before the meeting.',
          ...(K === 'casual' || (K === 'agm' && !x.isRe) ? ['Ensure the new auditor’s written communication with the previous auditor (ICAI Clause 8) is complete before acceptance.'] : []),
          'The form is to be digitally signed by an authorised Director whose DSC is registered on MCA.', 'Keep the SRN and challan of ADT-1 in the client file.']),
        { p: 'Internal working paper. Verify all particulars against the live MCA V3 form fields at the time of filing.', sz: 18 }];
    } };

    if (K === 'first') {
      D.push(consent, bmNoticeDoc(x, ['To elect the Chairperson of the meeting.', 'To grant leave of absence, if any.', 'To appoint the First Statutory Auditors of the Company under Section 139(6) of the Companies Act, 2013.', 'To authorise Director(s) to file e-Form ADT-1 with the Registrar of Companies.', 'Any other business with the permission of the Chairperson.']), boardCTC, apptLetter, accept, checklist);
    } else if (K === 'agm') {
      if (!x.isRe && f.prevFirm) D.push(prevComm);
      D.push(consent, bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To consider and recommend to the members the ' + (x.isRe ? 're-' : '') + 'appointment of the Statutory Auditors of the Company.', 'To approve the Notice of the ' + ord(f.agmNo) + ' Annual General Meeting and fix the date, time and venue thereof.', 'To authorise a Director to sign and issue the Notice of the Annual General Meeting.', 'Any other business with the permission of the Chairperson.']), boardCTC, gmNotice('agm'), membersCTC('agm'), apptLetter, accept, checklist);
    } else {
      D.push(prevComm, consent, bmNoticeDoc(x, ['To grant leave of absence, if any.', x.resign ? 'To take note of the resignation of ' + v(f.prevFirm) + ', Statutory Auditors of the Company.' : 'To take note of the casual vacancy in the office of the Statutory Auditors.', 'To appoint the Statutory Auditors to fill the casual vacancy under Section 139(8) of the Companies Act, 2013.', ...(x.resign ? ['To approve the Notice of the Extraordinary General Meeting for approval of the members.'] : []), 'To authorise a Director to file e-Form ADT-1 and to do all incidental acts.', 'Any other business with the permission of the Chairperson.']), boardCTC);
      if (x.resign) D.push(gmNotice('egm'), membersCTC('egm'));
      D.push(apptLetter, accept, checklist);
    }
    return D;
  }
  function sigCA(x, date) {
    const { a, f } = x;
    return tag([{ gap: 1 }, { p: 'For ' + v(a.firm), b: true, after: 0, keep: true }, { p: 'Chartered Accountants', after: 0, keep: true },
      { p: 'FRN: ' + v(a.frn), after: 0, keep: true }, { sign: a.sign || null }, { p: '(' + v(a.partner) + ')', b: true, after: 0, keep: true },
      { p: v(a.desig || 'Partner'), after: 0, keep: true }, { p: 'Membership No.: ' + v(a.mno), after: 0, keep: true },
      ...(f.udin ? [{ p: 'UDIN: ' + f.udin, after: 0, keep: true }] : []),
      { p: 'Place: ' + v(f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }], 'ca-signature');
  }

  /* =====================================================================
     DIRECTOR APPOINTMENT (dirapp)
     ===================================================================== */
  function directorDetailsTable(x) { // SS-2 para 1.2.5 details of director seeking appointment
    const p = x.app, f = x.f, others = cells(f.appOther, 3).filter(r => !r[2]);
    return { tbl: [['Name', p.full], ['DIN', v(p.din)], ['Date of birth', sd(p.dob)], ['Qualification', v(p.qual)], ['Brief profile / experience', v(p.exp)],
      ['Terms and conditions of appointment, including remuneration', f.appRemun || ('Appointed as ' + p.cat + ' Director' + (f.retire === 'yes' ? ', liable to retire by rotation' : ', not liable to retire by rotation') + '. No remuneration other than sitting fees, if any, as may be approved by the Board.')],
      ['Date of first appointment on the Board', x.egmApp ? 'Proposed: ' + ld(f.egmDate) : ld(f.bmDate)], ['Shareholding in the Company', f.appShares || 'Nil'],
      ['Relationship with other Directors / KMP', f.appRel || 'None'], ['Directorships in other companies', others.length ? others.map(r => r[0]).join('; ') : 'None'],
      ['Number of Board meetings attended during the year', x.egmApp ? 'Not applicable' : 'Not applicable (appointed during the year)']] };
  }
  function resAdditional(x) {
    const p = x.app, f = x.f;
    return [{ p: '**APPOINTMENT OF ' + p.full.toUpperCase() + ' (DIN: ' + v(p.din) + ') AS AN ADDITIONAL DIRECTOR**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 161(1) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Appointment and Qualification of Directors) Rules, 2014 ' + STAT + ' and as authorised by the Articles of Association of the Company, ' + p.full + ' (DIN: ' + v(p.din) + '), who has given ' + p.his + ' consent to act as a Director in Form DIR-2 and has confirmed that ' + p.he + ' is not disqualified from being appointed as a Director under Section 164 of the Act, be and is hereby appointed as an Additional Director (' + p.cat + ') of the Company with effect from ' + ld(f.bmDate) + ', to hold office up to the date of the next Annual General Meeting of the Company or the last date on which the Annual General Meeting should have been held, whichever is earlier.' },
      { p: '**RESOLVED FURTHER THAT** the disclosures received from ' + p.full + ' in Form DIR-2 (consent), Form DIR-8 (intimation under Section 164(2)) and Form MBP-1 (disclosure of interest under Section 184(1)) be and are hereby taken on record.' },
      { p: '**RESOLVED FURTHER THAT** any Director of the Company be and is hereby severally authorised to issue a letter of appointment, to sign and file e-Form DIR-12 with the Registrar of Companies, to make the necessary entries in the Register of Directors and Key Managerial Personnel maintained under Section 170 of the Act, and to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution.”' }];
  }
  function resMembersDirector(x) {
    const p = x.app, f = x.f;
    const via = x.egmApp ? '' : ', who was appointed as an Additional Director of the Company by the Board of Directors with effect from ' + ld(f.bmDate) + ' under Section 161(1) of the Act and who holds office up to the date of the next Annual General Meeting';
    return [{ p: '“**RESOLVED THAT** pursuant to the provisions of Section 152 and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Appointment and Qualification of Directors) Rules, 2014 ' + STAT + ', ' + p.full + ' (DIN: ' + v(p.din) + ')' + via + (x.c.type === 'public' ? ', and in respect of whom the Company has received a notice in writing from a member under Section 160 of the Act proposing ' + p.his + ' candidature for the office of Director' : '') + ', and who has given ' + p.his + ' consent to act as a Director, be and is hereby appointed as a Director of the Company' + (x.egmApp ? ' with effect from the date of this meeting' : '') + ', ' + (f.retire === 'yes' ? 'liable to retire by rotation' : 'not liable to retire by rotation') + '.' },
      { p: '**RESOLVED FURTHER THAT** the Board of Directors of the Company be and is hereby authorised to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution, including filing of e-Form DIR-12 with the Registrar of Companies.”' }];
  }

  function dirAppDocs(x) {
    const { c, f } = x, p = x.app, D = [];
    const appDate = x.appDate, needEGM = x.egmApp || x.regularise;

    D.push({ id: 'dir2', title: 'Form DIR-2 — Consent to act as Director', sub: 'Sec 152(5) & Rule 8 — signed by the new director', lh: LH_PLAIN, build: () => [
      ...formHead('FORM DIR-2', 'Consent to act as a Director of a Company', 'Pursuant to Section 152(5) and Rule 8 of the Companies (Appointment and Qualification of Directors) Rules, 2014'),
      ...toBoard(x), subj('Consent to act as a Director'),
      { p: 'I, ' + p.full + ', hereby give my consent to act as a Director of ' + c.name + ' pursuant to sub-section (5) of Section 152 of the Companies Act, 2013 and certify that I am not disqualified to become a Director under the Companies Act, 2013.', al: 'j' },
      { p: 'I attach herewith the following particulars:' },
      { tbl: [['1. Director Identification Number (DIN)', v(p.din)], ['2. Name (in full)', v(p.name)], ['3. Father’s name', v(p.father)], ['4. Address', oneLine(p.addr) || BL], ['5. E-mail ID', v(p.email)], ['6. Mobile No.', v(p.mobile)], ['7. Income-tax PAN', v(p.pan)], ['8. Occupation', v(p.occ)], ['9. Date of birth', sd(p.dob)], ['10. Nationality', v(p.nat)],
        ['11. No. of companies in which I am already a Director, and the names of companies in which I am Managing Director / CEO / Whole-time Director / Secretary / CFO / Manager', (() => { const o = cells(f.appOther, 3).filter(r => !r[2]); return o.length ? o.length + ' — ' + o.map(r => r[0]).join('; ') : 'Nil'; })()],
        ['12. Particulars of membership No. and Certificate of Practice No., if a member of any professional institute', f.appProf || 'Not applicable']], cols: [48, 52] },
      ...sigPerson(p, f.consentDate || appDate, f.place)] });

    D.push({ id: 'dir8', title: 'Form DIR-8 — Intimation by Director', sub: 'Sec 164(2) & Rule 14(1) — non-disqualification', lh: LH_PLAIN, build: () => {
      const rows = cells(f.appOther, 3);
      return [...formHead('FORM DIR-8', 'Intimation by Director', 'Pursuant to Section 164(2) and Rule 14(1) of the Companies (Appointment and Qualification of Directors) Rules, 2014'),
        ...toBoard(x),
        { p: 'I, ' + p.full + ', ' + p.sonOf + ' ' + v(p.father) + ', resident of ' + (oneLine(p.addr) || BL) + ', director in ' + c.name + ', hereby give notice that I am / was a director in the following companies during the last three years:', al: 'j' },
        { tbl: [['S. No.', 'Name of the Company', 'Date of appointment', 'Date of cessation'], ...(rows.length ? rows.map((r, i) => [String(i + 1), r[0], r[1], r[2] || '—']) : [['1', 'NIL', '—', '—']])], cols: [8, 46, 23, 23], head: true },
        { p: 'I further confirm that I have not incurred disqualification under Section 164(2) of the Companies Act, 2013 in any of the above companies, in the previous financial year, and that I, at present, stand free from any disqualification from being a director.', al: 'j' },
        ...sigPerson(p, f.consentDate || appDate, f.place)];
    } });

    D.push({ id: 'mbp1', title: 'Form MBP-1 — Disclosure of Interest', sub: 'Sec 184(1) & Rule 9(1) — signed by the new director', lh: LH_PLAIN, build: () => {
      const rows = cells(f.appInterest, 4);
      return [...formHead('FORM MBP-1', 'Notice of interest by Director', 'Pursuant to Section 184(1) and Rule 9(1) of the Companies (Meetings of Board and its Powers) Rules, 2014'),
        ...toBoard(x), { p: 'Dear Sir(s),' },
        { p: 'I, ' + p.full + ', ' + p.sonOf + ' ' + v(p.father) + ', resident of ' + (oneLine(p.addr) || BL) + ', being a director in the Company, hereby give notice of my interest or concern in the following company or companies, bodies corporate, firms or other association of individuals:', al: 'j' },
        { tbl: [['S. No.', 'Names of the companies / bodies corporate / firms / association of individuals', 'Nature of interest or concern / change in interest or concern', 'Shareholding', 'Date on which interest or concern arose / changed'],
          ...(rows.length ? rows.map((r, i) => [String(i + 1), r[0], r[1], r[2], r[3]]) : [['1', 'NIL', '—', '—', '—']])], cols: [7, 33, 26, 14, 20], head: true },
        ...sigPerson(p, f.consentDate || appDate, f.place)];
    } });

    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.',
      x.egmApp ? 'To consider and recommend to the members the appointment of ' + p.full + ' (DIN: ' + v(p.din) + ') as a Director of the Company.' : 'To appoint ' + p.full + ' (DIN: ' + v(p.din) + ') as an Additional Director of the Company under Section 161(1) of the Companies Act, 2013.',
      'To take note of the disclosures received in Form DIR-2, Form DIR-8 and Form MBP-1.',
      ...(needEGM ? ['To approve the Notice of the Extraordinary General Meeting and fix the date, time and venue thereof.'] : []),
      'To authorise a Director to file e-Form DIR-12 with the Registrar of Companies and to do all incidental acts.', 'Any other business with the permission of the Chairperson.']));

    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolution', sub: 'Attachment to e-Form DIR-12', lh: LH_CO, build: () => {
      const out = [ctcHead(x, 'RESOLUTIONS PASSED AT THE MEETING OF THE BOARD OF DIRECTORS', f.bmDate, f.bmTime, x.venue(f.bmVenue)), { gap: 1 }];
      if (x.egmApp) {
        out.push({ p: '**1. RECOMMENDATION FOR APPOINTMENT OF ' + p.full.toUpperCase() + ' (DIN: ' + v(p.din) + ') AS A DIRECTOR**', u: true },
          { p: '“**RESOLVED THAT** pursuant to the provisions of Section 152 and other applicable provisions, if any, of the Companies Act, 2013, and on the basis of the consent in Form DIR-2 and the intimation in Form DIR-8 received from ' + p.full + ', the Board of Directors hereby recommends to the members of the Company the appointment of ' + p.full + ' (DIN: ' + v(p.din) + ') as a Director of the Company, ' + (f.retire === 'yes' ? 'liable' : 'not liable') + ' to retire by rotation.”', al: 'j' });
      } else out.push(...resAdditional(x).map(b => Object.assign({}, b, { al: b.al || 'j' })));
      if (needEGM) out.push({ p: '**' + (x.egmApp ? '2' : '') + (x.egmApp ? '. ' : '') + 'CONVENING OF EXTRAORDINARY GENERAL MEETING**', u: true },
        { p: '“**RESOLVED THAT** an Extraordinary General Meeting of the members of the Company be held on ' + dayName(f.egmDate) + ', ' + ld(f.egmDate) + ' at ' + tm(f.egmTime) + ' at ' + oneLine(x.venue(f.egmVenue)) + ' to consider the ' + (x.egmApp ? 'appointment' : 'regularisation') + ' of ' + p.full + ' as a Director of the Company, and the draft Notice convening the said meeting, along with the Explanatory Statement under Section 102 of the Act, as placed before the Board, be and is hereby approved.', al: 'j' },
        { p: '**RESOLVED FURTHER THAT** ' + authWho(x) + ' to sign and issue the Notice of the Extraordinary General Meeting to the members, directors and auditors of the Company.”', al: 'j' });
      out.push({ p: 'Certified True Copy', b: true }, ...sigCompany(x, f.bmDate));
      return out;
    } });

    if (needEGM) {
      D.push({ id: 'egmnotice', title: 'Notice of Extraordinary General Meeting', sub: 'Sec 101, 102 & SS-2 — with director details', lh: LH_CO, build: () => {
        const out = gmNoticeBody(x, 'egm', f.egmDate, f.egmTime, x.venue(f.egmVenue));
        out.push({ p: 'SPECIAL BUSINESS:', b: true, u: true },
          { p: '1.\t**' + (x.egmApp ? 'Appointment of ' : 'Regularisation of ') + p.full + ' (DIN: ' + v(p.din) + ') as a Director of the Company**', hang: true },
          { p: 'To consider and, if thought fit, to pass the following resolution as an **Ordinary Resolution**:', ind: 567, al: 'j' },
          ...resMembersDirector(x).map(indent),
          ...sigCompany(x, f.egmNotice, 'By Order of the Board\nFor ' + c.name), { gap: 1 }, { p: 'NOTES:', b: true, u: true },
          ...numbered(['An Explanatory Statement pursuant to Section 102(1) of the Companies Act, 2013, setting out the material facts concerning the business under Item No. 1, is annexed hereto.', ...GM_NOTES]),
          { pb: true }, { p: 'EXPLANATORY STATEMENT PURSUANT TO SECTION 102(1) OF THE COMPANIES ACT, 2013', b: true, al: 'c' }, { p: 'Item No. 1', b: true, u: true },
          { p: x.egmApp ? 'The Board of Directors at its meeting held on ' + ld(f.bmDate) + ' recommended the appointment of ' + p.full + ' (DIN: ' + v(p.din) + ') as a Director of the Company, subject to the approval of the members.'
            : 'The Board of Directors at its meeting held on ' + ld(f.bmDate) + ' appointed ' + p.full + ' (DIN: ' + v(p.din) + ') as an Additional Director of the Company under Section 161(1) of the Companies Act, 2013. ' + (p.he === 'he' ? 'He' : p.he === 'she' ? 'She' : 'He/She') + ' holds office up to the date of the next Annual General Meeting. It is proposed to appoint ' + (p.his === 'his' ? 'him' : p.his === 'her' ? 'her' : 'him/her') + ' as a Director of the Company under Section 152 of the Act.', al: 'j' },
          { p: p.full + ' has given ' + p.his + ' consent to act as a Director in Form DIR-2 and has confirmed in Form DIR-8 that ' + p.he + ' is not disqualified from being appointed as a Director under Section 164 of the Act.' + (c.type === 'public' ? ' The Company has received a notice in writing from a member under Section 160 of the Act proposing ' + p.his + ' candidature for the office of Director.' : ''), al: 'j' },
          { p: 'Details of the Director seeking appointment, as required under Secretarial Standard-2 on General Meetings issued by the Institute of Company Secretaries of India:', al: 'j' }, directorDetailsTable(x),
          { p: 'The Board recommends the Ordinary Resolution set out at Item No. 1 of the Notice for approval of the members.', al: 'j' },
          { p: 'Except ' + p.full + ' and ' + p.his + ' relatives, none of the Directors or Key Managerial Personnel of the Company or their relatives is, in any way, concerned or interested, financially or otherwise, in the resolution set out at Item No. 1 of the Notice.', al: 'j' },
          ...sigCompany(x, f.egmNotice, 'By Order of the Board\nFor ' + c.name));
        return out;
      } });
      D.push({ id: 'egmctc', title: 'Certified True Copy of Members’ Resolution', sub: 'Passed at EGM — attachment to e-Form DIR-12', lh: LH_CO, build: () => [
        ctcHead(x, 'ORDINARY RESOLUTION PASSED BY THE MEMBERS AT THE EXTRAORDINARY GENERAL MEETING', f.egmDate, f.egmTime, x.venue(f.egmVenue)), { gap: 1 },
        { p: '**' + (x.egmApp ? 'APPOINTMENT' : 'REGULARISATION') + ' OF ' + p.full.toUpperCase() + ' (DIN: ' + v(p.din) + ') AS A DIRECTOR**', u: true },
        ...resMembersDirector(x).map(b => Object.assign({}, b, { al: 'j' })), { p: 'Certified True Copy', b: true }, ...sigCompany(x, f.egmDate)] });
    }

    D.push({ id: 'apptletter', title: 'Letter of Appointment to Director', sub: 'Issued by the company — attachment to e-Form DIR-12', lh: LH_CO, build: () => [
      { p: 'Date: ' + ld(appDate), al: 'r' }, { p: 'To,', after: 0 }, { p: p.full, b: true, after: 0 }, ...addrLines(p.addr), { gap: 1 },
      subj('Letter of appointment as ' + (x.egmApp ? 'Director' : 'Additional Director (' + p.cat + ')') + ' of ' + c.name),
      { p: T(x, 'salutation', 'Dear ' + (p.title || 'Sir / Madam') + ' ' + v(p.name).split(' ').slice(-1)[0] + ',') },
      { p: 'We are pleased to inform you that ' + (x.egmApp ? 'the members of the Company at the Extraordinary General Meeting held on ' + ld(f.egmDate) + ' have appointed you as a Director of the Company with effect from ' + ld(f.egmDate) + ', ' + (f.retire === 'yes' ? 'liable' : 'not liable') + ' to retire by rotation.' : 'the Board of Directors of the Company at its meeting held on ' + ld(f.bmDate) + ' has appointed you as an Additional Director (' + p.cat + ') of the Company with effect from ' + ld(f.bmDate) + ' under Section 161(1) of the Companies Act, 2013. You will hold office up to the date of the next Annual General Meeting of the Company, or the last date on which it should have been held, whichever is earlier, unless appointed as a Director by the members.'), al: 'j' },
      { p: 'The terms of your appointment are as follows:', b: true },
      ...numbered([
        'Your appointment is subject to the provisions of the Companies Act, 2013 (“the Act”), the rules made thereunder and the Articles of Association of the Company.',
        'Remuneration: ' + F(x, 'appRemun', 'You will not be entitled to any remuneration other than sitting fees for attending meetings of the Board, if any, as may be decided by the Board, and reimbursement of expenses incurred for attending such meetings.'),
        'Duties: As a Director, you shall discharge the duties specified in Section 166 of the Act, namely to act in accordance with the Articles of the Company; to act in good faith in order to promote the objects of the Company for the benefit of its members as a whole, and in the best interests of the Company, its employees, shareholders, the community and the environment; to exercise your duties with due and reasonable care, skill and diligence and independent judgment; not to be involved in a situation in which you may have a direct or indirect interest that conflicts with the interest of the Company; not to achieve or attempt to achieve any undue gain or advantage; and not to assign your office.',
        'Disclosures: You are required to disclose your interest in other entities in Form MBP-1 at the first meeting of the Board in every financial year and whenever there is any change, and to give intimation in Form DIR-8 under Section 164(2). You are also required to complete your DIN KYC (Form DIR-3 KYC) every year as prescribed.',
        'Confidentiality: You shall keep confidential all information relating to the Company that comes to your knowledge as a Director, except where disclosure is required by law.',
        'Your appointment may be terminated in accordance with the provisions of the Act, and you may resign by giving notice in writing to the Company under Section 168 of the Act.']),
      { p: 'Kindly sign and return the duplicate copy of this letter as a token of your acceptance.', al: 'j' },
      ...sigCompany(x, appDate), { gap: 1 },
      { p: 'ACCEPTANCE', b: true, al: 'c' }, { p: 'I accept the above terms of appointment.' }, ...sigPerson(p, appDate, f.place)] });

    D.push({ id: 'dir12', title: 'e-Form DIR-12 Data Sheet & Checklist', sub: 'Internal — appointment filing on MCA V3', lh: LH_NONE, build: () => [
      { p: 'e-FORM DIR-12 — DATA SHEET & FILING CHECKLIST (APPOINTMENT)', b: true, al: 'c', sz: 28 }, { p: c.name + ' (CIN: ' + v(c.cin) + ')', al: 'c' },
      head('A. Company details'), { tbl: [['CIN', v(c.cin)], ['Name of the company', c.name], ['Registered office', oneLine(c.addr)], ['Email ID of the company', v(c.email)]] },
      head('B. Director details'), { tbl: [['DIN', v(p.din)], ['Name', p.full], ['Father’s name', v(p.father)], ['Date of birth', sd(p.dob)], ['Address', oneLine(p.addr) || BL], ['Email / Mobile', v(p.email) + ' / ' + v(p.mobile)], ['PAN', v(p.pan)], ['Nationality', v(p.nat)], ['Occupation', v(p.occ)]] },
      head('C. Appointment details'), { tbl: [['Purpose', 'Appointment'], ['Designation', x.egmApp ? 'Director' : 'Additional Director'], ['Category', p.cat], ['Date of appointment', sd(appDate)], ['Appointed by', x.egmApp ? 'Members at EGM held on ' + sd(f.egmDate) : 'Board of Directors at meeting held on ' + sd(f.bmDate) + ' (Sec 161(1))'], ['Liable to retire by rotation', f.retire === 'yes' ? 'Yes' : 'No'],
        ...(x.regularise ? [['Change in designation (Additional → Director)', 'File a separate DIR-12 for change in designation after the EGM on ' + sd(f.egmDate)]] : [])] },
      head('D. Due dates'), { tbl: [['e-Form DIR-12 to be filed by', '**' + sd(addDays(appDate, 30)) + '** (within 30 days of appointment — Sec 170(2) & Rule 18)'],
        ...(!x.egmApp && !x.regularise ? [['Regularisation', 'At the next AGM — Additional Director holds office only till then (Sec 161(1))']] : [])] },
      head('E. Attachments to DIR-12'), ...numbered(['Letter of appointment', 'Consent to act as Director in Form DIR-2', 'Certified true copy of the ' + (x.egmApp ? 'members’' : 'Board') + ' resolution', 'Declaration under Section 164 (Form DIR-8) — optional attachment']),
      head('F. Before filing'), ...numbered(['Check that the DIN is approved and its DIR-3 KYC status is active on MCA.', 'The appointee must not be disqualified under Section 164; check the MCA director master data.', 'Ensure the total number of directorships does not exceed the limit under Section 165 (20 companies, of which not more than 10 public companies).', 'Update the Register of Directors and KMP (Sec 170) and keep Forms DIR-2, DIR-8 and MBP-1 in the company records.', 'The form is to be digitally signed by an authorised Director whose DSC is registered on MCA.']),
      { p: 'Internal working paper. Verify all particulars against the live MCA V3 form fields at the time of filing.', sz: 18 }] });
    return D;
  }

  /* =====================================================================
     DIRECTOR RESIGNATION (dirres)
     ===================================================================== */
  function dirResDocs(x) {
    const { c, f } = x, r = x.res, eff = x.resEff, D = [], EFF = T(x, 'effectiveDate', ld(x.resEff));
    const effText = T(x, 'effectiveFromText', f.resEffDate && f.resReceipt && f.resEffDate > f.resReceipt ? 'with effect from ' + ld(f.resEffDate) : 'with effect from the date of receipt of this letter by the Company');
    const reason = F(x, 'resReason', 'personal reasons and pre-occupation');

    D.push({ id: 'resletter', title: 'Resignation Letter by Director', sub: 'Sec 168(1) — signed by the resigning director', lh: LH_PLAIN, build: () => [
      { p: 'Date: ' + ld(f.resLetter), al: 'r' }, ...toBoard(x), subj('Resignation from the office of Director'),
      { p: 'Dear Sir / Madam,' },
      { p: 'I, ' + v(r.name) + ' (DIN: ' + v(r.din) + '), hereby tender my resignation from the office of Director of ' + c.name + ' (CIN: ' + v(c.cin) + ') ' + effText + ', due to ' + reason + '.', al: 'j' },
      { p: 'I request the Board to take note of my resignation and to file the necessary intimation in e-Form DIR-12 with the Registrar of Companies within thirty days in terms of Section 168(1) of the Companies Act, 2013 read with Rule 15 of the Companies (Appointment and Qualification of Directors) Rules, 2014.', al: 'j' },
      { p: 'I confirm that there are no other material reasons for my resignation other than those mentioned above.', al: 'j' },
      { p: 'I thank the Board and the members for the support extended to me during my tenure as a Director of the Company.', al: 'j' },
      ...signoff(), ...sigPerson({ name: r.name, din: r.din, sign: r.sign }, f.resLetter, f.place)] });

    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To take note of the resignation of ' + v(r.name) + ' (DIN: ' + v(r.din) + ') from the office of Director.', 'To authorise a Director to file e-Form DIR-12 with the Registrar of Companies and to do all incidental acts.', 'Any other business with the permission of the Chairperson.']));

    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolution', sub: 'Taking note of resignation — record / DIR-12', lh: LH_CO, build: () => [
      ctcHead(x, 'RESOLUTION PASSED AT THE MEETING OF THE BOARD OF DIRECTORS', f.bmDate, f.bmTime, x.venue(f.bmVenue)), { gap: 1 },
      { p: '**TAKING NOTE OF RESIGNATION OF ' + String(v(r.name)).toUpperCase() + ' (DIN: ' + v(r.din) + ') FROM THE OFFICE OF DIRECTOR**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 168 and other applicable provisions, if any, of the Companies Act, 2013 read with Rule 15 of the Companies (Appointment and Qualification of Directors) Rules, 2014 ' + STAT + ', the resignation tendered by ' + v(r.name) + ' (DIN: ' + v(r.din) + ') from the office of Director of the Company vide letter dated ' + ld(f.resLetter) + ', received by the Company on ' + ld(f.resReceipt) + ', be and is hereby taken note of, and the cessation of ' + v(r.name) + ' as a Director be effective from ' + EFF + '.', al: 'j' },
      { p: '**RESOLVED FURTHER THAT** the Board places on record its sincere appreciation for the valuable contribution made by ' + v(r.name) + ' during the tenure as a Director of the Company.', al: 'j' },
      { p: '**RESOLVED FURTHER THAT** any Director of the Company be and is hereby severally authorised to sign and file e-Form DIR-12 with the Registrar of Companies within thirty days of the resignation, to make the necessary entries in the Register of Directors and Key Managerial Personnel maintained under Section 170 of the Act, and to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution.”', al: 'j' },
      { p: 'Certified True Copy', b: true }, ...sigCompany(x, f.bmDate)] });

    D.push({ id: 'ackletter', title: 'Acknowledgement of Resignation', sub: 'From the company to the resigning director', lh: LH_CO, build: () => [
      { p: 'Date: ' + ld(f.resReceipt), al: 'r' }, { p: 'To,', after: 0 }, { p: v(r.name), b: true, after: 0 }, { p: 'DIN: ' + v(r.din), after: 0 }, { gap: 1 },
      subj('Acknowledgement of your resignation from the office of Director'),
      { p: 'Dear Sir / Madam,' },
      { p: 'We acknowledge receipt on ' + ld(f.resReceipt) + ' of your letter dated ' + ld(f.resLetter) + ' tendering your resignation from the office of Director of ' + c.name + '. In terms of Section 168(2) of the Companies Act, 2013, your resignation is effective from ' + EFF + '.', al: 'j' },
      { p: 'The Company will file the necessary intimation in e-Form DIR-12 with the Registrar of Companies within the prescribed time. You may, if you so wish, also forward a copy of your resignation along with detailed reasons to the Registrar in Form DIR-11 within thirty days of resignation, as permitted under the proviso to Section 168(1).', al: 'j' },
      { p: 'The Board places on record its appreciation of your contribution to the Company.', al: 'j' },
      ...signoff(), ...sigCompany(x, f.resReceipt)] });

    D.push({ id: 'dir12', title: 'e-Form DIR-12 Data Sheet & Checklist', sub: 'Internal — cessation filing on MCA V3', lh: LH_NONE, build: () => {
      const left = (c.directors || []).filter(d => d !== r).length, min = c.type === 'public' ? 3 : c.type === 'opc' ? 1 : 2;
      return [{ p: 'e-FORM DIR-12 — DATA SHEET & FILING CHECKLIST (CESSATION)', b: true, al: 'c', sz: 28 }, { p: c.name + ' (CIN: ' + v(c.cin) + ')', al: 'c' },
        head('A. Company details'), { tbl: [['CIN', v(c.cin)], ['Name of the company', c.name], ['Registered office', oneLine(c.addr)]] },
        head('B. Cessation details'), { tbl: [['DIN', v(r.din)], ['Name of the director', v(r.name)], ['Designation', v(r.desig || 'Director')], ['Purpose', 'Cessation'], ['Reason', 'Resignation'], ['Date of resignation letter', sd(f.resLetter)], ['Date of receipt by company', sd(f.resReceipt)], ['Date of cessation (effective)', sd(eff) + ' (date of receipt, or later date specified in the notice — Sec 168(2))']] },
        head('C. Due dates'), { tbl: [['e-Form DIR-12 to be filed by', '**' + sd(addDays(eff, 30)) + '** (within 30 days of resignation — Sec 168(1) & Rule 15)'], ['Form DIR-11 by the director (optional)', sd(addDays(eff, 30))]] },
        head('D. Attachments to DIR-12'), ...numbered(['Notice of resignation (resignation letter of the director)', 'Evidence of cessation / proof of receipt — acknowledgement letter', 'Certified true copy of the Board resolution (optional attachment)']),
        head('E. Before filing'), ...numbered([
          'Directors remaining after this resignation: ' + left + ' (minimum required for a ' + (c.type === 'public' ? 'public' : c.type === 'opc' ? 'one person' : 'private') + ' company: ' + min + ', Sec 149(1)).' + (left < min ? ' WARNING: appoint a new director before filing.' : ''),
          'If the resigning director is the only DSC signatory on MCA, ensure another director’s DSC is registered.',
          'Update the Register of Directors and KMP (Sec 170) and the director list in this portal.',
          'Mention the resignation in the Board’s Report for this financial year (Sec 134(3)(q) & Rule 8(5)(iii)).',
          'The form is to be digitally signed by an authorised Director (other than the resigning director) whose DSC is registered on MCA.']),
        { p: 'Internal working paper. Verify all particulars against the live MCA V3 form fields at the time of filing.', sz: 18 }];
    } });
    return D;
  }

  /* =====================================================================
     ANNUAL FILING — AOC-4 & MGT-7 / MGT-7A (annual)
     ===================================================================== */
 function fsWords(x) { // components of financial statements (cash flow not required for small company / OPC — Sec 2(40))
    return T(x, 'financialStatementsList', fsWords0(x)); }
  function fsWords0(x) {
    return 'the Balance Sheet as at ' + ld(x.fyEnd) + ', the Statement of Profit and Loss' + (x.small ? '' : ', the Cash Flow Statement') + ' for the ' + (x.firstFY ? 'period from ' + ld(x.fyFrom) + ' to ' + ld(x.fyEnd) : 'financial year ended on that date') + ' and the notes thereto';
  }
  function bmGapOK(x) { for (let i = 1; i < x.bms.length; i++) { if ((pd(x.bms[i]) - pd(x.bms[i - 1])) / 864e5 > 120) return false; } return true; }
  function resAdoption(x) {
    return [{ p: '“**RESOLVED THAT** the Audited Financial Statements of the Company for the ' + T(x, 'periodWord', x.firstFY ? 'period' : 'financial year') + ' ended ' + ld(x.fyEnd) + ', comprising ' + fsWords(x) + ', together with the Reports of the Board of Directors and the Auditors thereon, be and are hereby received, considered and adopted.”' }];
  }
  function boardsReport(x) {
    const { c, a, f } = x, out = [], full = !x.small;
    const unit = f.amtUnit || 'Amount in Rs.';
    let n = 0; const sec = (t, ...paras) => { out.push({ p: (++n) + '. ' + t.toUpperCase(), b: true, keep: true }, ...paras.map(p => typeof p === 'string' ? { p, al: 'j' } : p)); };
    out.push({ p: 'BOARD’S REPORT', b: true, al: 'c', sz: 28 }, { p: 'To,', after: 0 }, { p: 'The Members,', after: 0 }, { p: c.name, b: true },
      { p: 'Your Directors have pleasure in presenting their Report on the business and operations of the Company together with the Audited Financial Statements for the ' + T(x, 'reportPeriod', x.firstFY ? 'period from ' + ld(x.fyFrom) + ' to ' + ld(x.fyEnd) : 'financial year ended ' + ld(x.fyEnd)) + '.' + (x.small ? ' This Report is prepared in accordance with Section 134 of the Companies Act, 2013 read with Rule 8A of the Companies (Accounts) Rules, 2014, applicable to ' + (x.isOPC ? 'One Person Companies' : 'small companies') + '.' : ''), al: 'j' });
    sec('Financial summary / highlights', { p: '(' + unit + ')', al: 'r', after: 0 },
      { tbl: [['Particulars', 'FY ' + fyLabel(x.fyEnd), x.firstFY ? 'Previous year' : 'FY ' + fyLabel(x.prevFyEnd)],
        ['Total revenue (including other income)', amt(f.revCur), x.firstFY ? '–' : amt(f.revPrev)], ['Profit / (Loss) before tax', amt(f.pbtCur), x.firstFY ? '–' : amt(f.pbtPrev)],
        ['Less: Tax expense', amt(f.taxCur), x.firstFY ? '–' : amt(f.taxPrev)], ['Profit / (Loss) after tax', amt(f.patCur), x.firstFY ? '–' : amt(f.patPrev)]], cols: [50, 25, 25], head: true });
    sec('State of company’s affairs', T(x, 'affairsText', f.affairs || ('During the year under review, the Company recorded total revenue of ' + (f.revCur ? 'Rs. ' + f.revCur : BL) + ' and a profit / (loss) after tax of ' + (f.patCur ? 'Rs. ' + f.patCur : BL) + '. The Directors are continuously looking for avenues for the future growth of the Company.')));
    sec('Change in the nature of business', F(x, 'natureChange', 'There was no change in the nature of business of the Company during the year under review.'));
    sec('Dividend', F(x, 'dividend', 'The Board of Directors does not recommend any dividend for the year under review.'));
    sec('Transfer to reserves', F(x, 'reserves', 'The Company has not transferred any amount to the reserves during the year under review.'));
    sec('Material changes and commitments', F(x, 'material', 'There are no material changes and commitments affecting the financial position of the Company which have occurred between the end of the financial year of the Company to which the financial statements relate and the date of this Report.'));
    const bmText0 = x.bms.length ? 'During the year under review, the Board of Directors met ' + x.bms.length + ' (' + (NUMW[x.bms.length] || x.bms.length) + ') time' + (x.bms.length > 1 ? 's' : '') + ', on ' + x.bms.map(ld).join('; ') + '.' + (!x.small && bmGapOK(x) && x.bms.length > 1 ? ' The intervening gap between two consecutive meetings did not exceed one hundred and twenty days, as prescribed under Section 173(1) of the Companies Act, 2013.' : x.small ? ' The meetings were held in compliance with Section 173 of the Companies Act, 2013.' : '') : 'During the year under review, the Board of Directors met ' + BL + ' times.';
    sec('Number of meetings of the Board', T(x, 'boardMeetingsText', bmText0));
    sec('Directors and Key Managerial Personnel', 'As on the date of this Report, the Board of Directors of the Company comprises:',
      { tbl: [['S. No.', 'Name', 'DIN', 'Designation'], ...(c.directors || []).map((d, i) => [String(i + 1), d.name, d.din || '—', d.desig || 'Director'])], cols: [8, 46, 20, 26], head: true },
      F(x, 'dirChanges', 'There was no change in the composition of the Board of Directors during the year under review.'));
    if (full) sec('Deposits', F(x, 'deposits', 'The Company has not accepted any deposits within the meaning of Sections 73 and 76 of the Companies Act, 2013 read with the Companies (Acceptance of Deposits) Rules, 2014 during the year under review.'));
    if (full) sec('Particulars of loans, guarantees or investments', F(x, 'loans186', 'The Company has not given any loans or guarantees, or provided any security, or made any investments covered under the provisions of Section 186 of the Companies Act, 2013 during the year under review.'));
    sec('Particulars of contracts or arrangements with related parties', f.rpt === 'yes'
      ? 'All contracts or arrangements entered into by the Company with related parties referred to in Section 188(1) of the Companies Act, 2013 during the year under review were in the ordinary course of business and on an arm’s length basis. The particulars of such contracts or arrangements are given in Form AOC-2, annexed to this Report as **Annexure-I**.'
      : 'There were no contracts or arrangements entered into by the Company with related parties referred to in Section 188(1) of the Companies Act, 2013 during the year under review. Hence, the disclosure in Form AOC-2 is not applicable.');
    sec('Annual return', c.web ? 'Pursuant to Section 92(3) read with Section 134(3)(a) of the Companies Act, 2013, the Annual Return of the Company for the financial year ' + fyLabel(x.fyEnd) + ' is available on the website of the Company at ' + c.web + '.'
      : 'The Company does not have a website. Accordingly, the requirement of placing the Annual Return on the website under Section 134(3)(a) of the Companies Act, 2013 is not applicable.');
    sec('Statutory auditors and auditors’ report', T(x, 'auditorsIntro', a.firm ? x.firmDesc + ', are the Statutory Auditors of the Company' + (f.audTerm ? ', ' + f.audTerm : '') + '. ' : '') + F(x, 'audQual', 'The Auditors’ Report on the financial statements for the year under review does not contain any qualification, reservation, adverse remark or disclaimer.'));
    sec('Details of fraud reported by the auditors', 'During the year under review, the Statutory Auditors have not reported to the Board any instance of fraud committed against the Company by its officers or employees under Section 143(12) of the Companies Act, 2013.');
    if (full) {
      sec('Conservation of energy, technology absorption and foreign exchange', '(A) Conservation of energy: ' + F(x, 'energy', 'The operations of the Company are not energy-intensive; however, adequate measures have been taken to conserve energy wherever possible.'),
        '(B) Technology absorption: ' + F(x, 'tech', 'The Company has not imported any technology during the year under review.'),
        '(C) Foreign exchange earnings and outgo: Earnings — ' + F(x, 'fxEarn', 'Nil') + '; Outgo — ' + F(x, 'fxOut', 'Nil') + '.');
      sec('Risk management', 'The Company has identified the elements of risk relevant to its business. In the opinion of the Board, there are no elements of risk which may threaten the existence of the Company.');
      sec('Corporate social responsibility', F(x, 'csr', 'The provisions of Section 135 of the Companies Act, 2013 relating to Corporate Social Responsibility are not applicable to the Company.'));
      sec('Internal financial controls', 'The Company has in place adequate internal financial controls with reference to the financial statements, commensurate with the size and nature of its business.');
      sec('Subsidiaries, joint ventures and associate companies', F(x, 'subs', 'The Company does not have any subsidiary, joint venture or associate company.'));
      sec('Maintenance of cost records', 'Maintenance of cost records as specified by the Central Government under Section 148(1) of the Companies Act, 2013 is not required for the business carried on by the Company.');
      sec('Proceedings under the Insolvency and Bankruptcy Code, 2016', 'No application has been made and no proceeding is pending against the Company under the Insolvency and Bankruptcy Code, 2016 during the year under review. Disclosure of the difference in valuation on a one-time settlement with banks or financial institutions is not applicable.');
    }
    sec('Significant and material orders', 'No significant or material orders were passed by the regulators or courts or tribunals impacting the going concern status and the Company’s operations in future.');
    sec('Prevention of sexual harassment at the workplace', 'The Company is committed to providing a safe workplace and complies, to the extent applicable, with the provisions relating to the constitution of an Internal Committee under the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013. Details for the year under review: (a) number of complaints of sexual harassment received: ' + F(x, 'poshRecd', '0') + '; (b) number of complaints disposed of: ' + F(x, 'poshDisp', '0') + '; (c) number of cases pending for more than ninety days: ' + F(x, 'poshPend', '0') + '.');
    sec('Compliance with the Maternity Benefit Act, 1961', 'The Company has complied with the provisions of the Maternity Benefit Act, 1961, to the extent applicable.');
    sec('Employees', 'As on ' + ld(x.fyEnd) + ', the number of employees of the Company was: Female — ' + F(x, 'empF', '0') + '; Male — ' + F(x, 'empM', '0') + '; Transgender — ' + F(x, 'empT', '0') + '.');
    sec('Compliance with Secretarial Standards', 'The Company has complied with the applicable Secretarial Standards on Meetings of the Board of Directors (SS-1) and on General Meetings (SS-2) issued by the Institute of Company Secretaries of India.');
    sec('Directors’ responsibility statement', 'Pursuant to Section 134(3)(c) and Section 134(5) of the Companies Act, 2013, the Board of Directors, to the best of their knowledge and ability, confirm that:',
      ...lettered(['in the preparation of the annual accounts, the applicable accounting standards had been followed along with proper explanation relating to material departures;',
        'the directors had selected such accounting policies and applied them consistently and made judgments and estimates that are reasonable and prudent so as to give a true and fair view of the state of affairs of the Company at the end of the financial year and of the profit and loss of the Company for that period;',
        'the directors had taken proper and sufficient care for the maintenance of adequate accounting records in accordance with the provisions of the Act for safeguarding the assets of the Company and for preventing and detecting fraud and other irregularities;',
        'the directors had prepared the annual accounts on a going concern basis; and',
        'the directors had devised proper systems to ensure compliance with the provisions of all applicable laws and that such systems were adequate and operating effectively.']));
    sec('Acknowledgement', 'Your Directors place on record their sincere appreciation for the assistance and co-operation received from the bankers, Government authorities, customers, vendors and members during the year under review.');
    out.push(...sigTwo(x, f.bmDate));
    if (f.rpt === 'yes') {
      const rows = cells(f.rptList, 6);
      out.push({ pb: true }, { p: 'Annexure-I', b: true, al: 'r' }, ...formHead('FORM NO. AOC-2', 'Particulars of contracts / arrangements made with related parties', 'Pursuant to clause (h) of sub-section (3) of Section 134 of the Act and Rule 8(2) of the Companies (Accounts) Rules, 2014'),
        { p: 'Form for disclosure of particulars of contracts / arrangements entered into by the company with related parties referred to in sub-section (1) of Section 188 of the Companies Act, 2013, including certain arm’s length transactions under the third proviso thereto.', al: 'j' },
        { p: '1. Details of contracts or arrangements or transactions not at arm’s length basis:', b: true }, { p: F(x, 'rptNotArm', 'There were no contracts or arrangements or transactions entered into during the year that were not at arm’s length basis.'), al: 'j' },
        { p: '2. Details of material contracts or arrangements or transactions at arm’s length basis:', b: true },
        { tbl: [['Name of the related party and nature of relationship', 'Nature of contracts / arrangements / transactions', 'Duration', 'Salient terms, including value, if any', 'Date(s) of approval by the Board, if any', 'Amount paid as advances, if any'],
          ...(rows.length ? rows : [['NIL', '', '', '', '', '']])], cols: [22, 18, 12, 20, 14, 14], head: true },
        ...sigTwo(x, f.bmDate));
    }
    return out;
  }

  function annualDocs(x) {
    const { c, a, f } = x, D = [], FYW = T(x, 'periodWord', x.firstFY ? 'period' : 'financial year');
    const shareholders = (c.shareholders || []).filter(s => s.name);
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To confirm the minutes of the previous meeting of the Board.',
      'To consider and approve the Audited Financial Statements of the Company for the ' + FYW + ' ended ' + ld(x.fyEnd) + ', together with the Auditors’ Report thereon.',
      'To consider and approve the Board’s Report' + (f.rpt === 'yes' ? ' along with the annexure (Form AOC-2)' : '') + ' for the ' + FYW + ' ended ' + ld(x.fyEnd) + '.',
      'To fix the date, time and venue of the ' + ord(f.agmNo) + ' Annual General Meeting and to approve the Notice thereof.',
      'To authorise Directors to sign the financial statements and the Board’s Report, and to file e-Form AOC-4 and e-Form ' + x.retForm + ' with the Registrar of Companies.',
      'Any other business with the permission of the Chairperson.']));

    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolutions', sub: 'Approval of accounts, Board’s Report & AGM notice — Sec 134', lh: LH_CO, build: () => {
 const two = T(x, 'signingDirectorsPair', x.isOPC ? v(x.d.name) + ' (DIN: ' + v(x.d.din) + '), Director' : v(x.d.name) + ' (DIN: ' + v(x.d.din) + ') and ' + v(x.d2.name) + ' (DIN: ' + v(x.d2.din) + '), Directors');
      return [ctcHead(x, 'RESOLUTIONS PASSED AT THE MEETING OF THE BOARD OF DIRECTORS', f.bmDate, f.bmTime, x.venue(f.bmVenue)), { gap: 1 },
        { p: '**1. APPROVAL OF AUDITED FINANCIAL STATEMENTS FOR THE ' + FYW.toUpperCase() + ' ENDED ' + ld(x.fyEnd).toUpperCase() + '**', u: true },
        { p: '“**RESOLVED THAT** pursuant to the provisions of Section 134 and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Accounts) Rules, 2014 ' + STAT + ', the Audited Financial Statements of the Company for the ' + FYW + ' ended ' + ld(x.fyEnd) + ', comprising ' + fsWords(x) + ', as placed before the Board, be and are hereby approved.', al: 'j' },
        { p: '**RESOLVED FURTHER THAT** ' + two + ' of the Company, be and ' + (x.isOPC ? 'is' : 'are') + ' hereby authorised to sign the said Financial Statements on behalf of the Board in terms of Section 134(1) of the Act and to submit the same to the Statutory Auditors for their report thereon.”', al: 'j' },
        { p: '**2. APPROVAL OF BOARD’S REPORT**', u: true },
        { p: '“**RESOLVED THAT** the Board’s Report for the ' + FYW + ' ended ' + ld(x.fyEnd) + (f.rpt === 'yes' ? ', together with the annexure in Form AOC-2,' : '') + ' prepared in accordance with Section 134(3) of the Companies Act, 2013' + (x.small ? ' read with Rule 8A of the Companies (Accounts) Rules, 2014' : ' read with Rule 8 of the Companies (Accounts) Rules, 2014') + ', as placed before the Board, be and is hereby approved, and that ' + two + ', be and ' + (x.isOPC ? 'is' : 'are') + ' hereby authorised to sign the same in terms of Section 134(6) of the Act.”', al: 'j' },
        { p: '**3. CONVENING OF THE ' + ord(f.agmNo).toUpperCase() + ' ANNUAL GENERAL MEETING**', u: true },
        { p: '“**RESOLVED THAT** the ' + ord(f.agmNo) + ' Annual General Meeting of the members of the Company be held on ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(f.agmTime) + ' at ' + oneLine(x.venue(f.agmVenue)) + ', and the draft Notice convening the said meeting, as placed before the Board, be and is hereby approved.' + (f.shortNotice === 'yes' ? ' The meeting may be held at a shorter notice subject to the consent of not less than ninety-five per cent of the members entitled to vote thereat, in terms of the proviso to Section 101(1) of the Act.' : ''), al: 'j' },
        { p: '**RESOLVED FURTHER THAT** ' + authWho(x) + ' to sign and issue the Notice of the Annual General Meeting to the members, directors and auditors of the Company.”', al: 'j' },
        { p: '**4. AUTHORISATION FOR ANNUAL FILINGS**', u: true },
        { p: '“**RESOLVED THAT** any Director of the Company be and is hereby severally authorised to sign and file e-Form AOC-4 (financial statements) and e-Form ' + x.retForm + ' (annual return) with the Registrar of Companies for the ' + FYW + ' ended ' + ld(x.fyEnd) + ', and to do all such acts, deeds, matters and things as may be necessary in this regard.”', al: 'j' },
        { p: 'Certified True Copy', b: true }, ...sigCompany(x, f.bmDate)];
    } });

    D.push({ id: 'boardreport', title: 'Board’s Report' + (x.small ? ' (Rule 8A — small company / OPC)' : ' (Sec 134(3) & Rule 8)'), sub: 'Attachment to e-Form AOC-4' + (f.rpt === 'yes' ? ' — with Form AOC-2' : ''), lh: LH_CO, build: () => boardsReport(x) });

    D.push({ id: 'agmnotice', title: 'Notice of ' + ord(f.agmNo) + ' AGM with Attendance Slip & Proxy (MGT-11)', sub: 'Sec 101, 96 & SS-2 — adoption of accounts', lh: LH_CO, build: () => {
      const out = gmNoticeBody(x, 'agm', f.agmDate, f.agmTime, x.venue(f.agmVenue));
      out.push({ p: 'ORDINARY BUSINESS:', b: true, u: true },
        { p: '1.\tTo receive, consider and adopt the Audited Financial Statements of the Company for the ' + FYW + ' ended ' + ld(x.fyEnd) + ', together with the Reports of the Board of Directors and the Auditors thereon, and in this regard to consider and, if thought fit, to pass the following resolution as an **Ordinary Resolution**:', hang: true, al: 'j' },
        ...resAdoption(x).map(indent),
        ...sigCompany(x, f.agmNotice, 'By Order of the Board\nFor ' + c.name), { gap: 1 }, { p: 'NOTES:', b: true, u: true },
        ...numbered([...GM_NOTES, ...(f.shortNotice === 'yes' ? ['The meeting is being convened at a shorter notice with the consent of not less than ninety-five per cent of the members entitled to vote thereat, in terms of the proviso to Section 101(1) of the Companies Act, 2013.'] : [])]));
      // attendance slip
      out.push({ pb: true }, { p: c.name.toUpperCase(), b: true, al: 'c', after: 0 }, { p: 'CIN: ' + v(c.cin), al: 'c', after: 0 }, { p: 'Regd. Office: ' + oneLine(c.addr), al: 'c' },
        { p: 'ATTENDANCE SLIP', b: true, al: 'c', u: true },
        { p: ord(f.agmNo) + ' Annual General Meeting — ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(f.agmTime), al: 'c' },
        { tbl: [['Folio No. / DP ID & Client ID', ''], ['Name and address of the member', ''], ['No. of shares held', ''], ['Name of the proxy (if any)', '']] },
        { p: 'I hereby record my presence at the ' + ord(f.agmNo) + ' Annual General Meeting of the Company held on ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(f.agmTime) + ' at ' + oneLine(x.venue(f.agmVenue)) + '.', al: 'j' },
        { gap: 2 }, { p: 'Signature of the Member / Proxy', al: 'r' });
      // MGT-11
      out.push({ pb: true }, ...formHead('Form No. MGT-11', 'Proxy Form', 'Pursuant to Section 105(6) of the Companies Act, 2013 and Rule 19(3) of the Companies (Management and Administration) Rules, 2014'),
        { tbl: [['CIN', v(c.cin)], ['Name of the company', c.name], ['Registered office', oneLine(c.addr)]] },
        { tbl: [['Name of the member(s)', ''], ['Registered address', ''], ['E-mail ID', ''], ['Folio No. / Client ID', ''], ['DP ID', '']] },
        { p: 'I / We, being the member(s) of ____________ shares of the above named company, hereby appoint:', al: 'j', sz: 21 },
        ...[1, 2, 3].map(i => ({ p: i + '.\tName: __________________ Address: ________________________\nE-mail ID: __________________ Signature: ______________' + (i < 3 ? ', or failing him/her' : ''), hang: true, sz: 21, after: 60 })),
        { sz: 21, p: 'as my / our proxy to attend and vote (on a poll) for me / us and on my / our behalf at the ' + ord(f.agmNo) + ' Annual General Meeting of the Company, to be held on ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(f.agmTime) + ' at ' + oneLine(x.venue(f.agmVenue)) + ' and at any adjournment thereof in respect of such resolutions as are indicated below:', al: 'j' },
        { tbl: [['Res. No.', 'Resolution', 'For', 'Against'], ['1', 'Adoption of the Audited Financial Statements for the ' + FYW + ' ended ' + ld(x.fyEnd) + ' together with the Reports of the Board and the Auditors (Ordinary Resolution)', '', '']], cols: [12, 64, 12, 12], head: true },
        { p: 'Signed this ______ day of ______________ 20___', sz: 21 },
        { tbl: [['Signature of the shareholder', '', 'Affix\nRevenue\nStamp'], ['Signature of the proxy holder(s)', '', '']], cols: [35, 45, 20] },
        { p: 'Note: This form of proxy, in order to be effective, should be duly completed and deposited at the Registered Office of the Company not less than 48 hours before the commencement of the meeting.', sz: 20, al: 'j' });
      return out;
    } });

    if (f.shortNotice === 'yes') D.push({ id: 'shortnotice', title: 'Consent of Members for Shorter Notice', sub: 'Proviso to Sec 101(1) — 95% of members', lh: LH_PLAIN, build: () => {
      const list = shareholders.length ? shareholders : [{ name: '', shares: '' }];
      const out = [];
      list.forEach((s, i) => {
        if (i) out.push({ pb: true });
        out.push({ p: 'CONSENT FOR HOLDING THE ANNUAL GENERAL MEETING AT A SHORTER NOTICE', b: true, al: 'c' }, { gap: 1 }, { p: 'Date: ' + ld(f.agmNotice || f.bmDate), al: 'r' }, ...toBoard(x),
          { p: 'I / We, ' + (s.name || BL) + ', holding ' + (s.shares || BL) + ' equity shares of the Company, being a member of ' + c.name + ', hereby give my / our consent, pursuant to the proviso to Section 101(1) of the Companies Act, 2013, to hold the ' + ord(f.agmNo) + ' Annual General Meeting of the Company on ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(f.agmTime) + ' at ' + oneLine(x.venue(f.agmVenue)) + ' at a shorter notice.', al: 'j' },
          { gap: 2 }, { p: 'Signature: ____________________', after: 0 }, { p: 'Name of the member: ' + (s.name || BL), after: 0 }, { p: 'Folio No.: ' + (s.folio || BL), after: 0 });
      });
      return out;
    } });

    D.push({ id: 'agmctc', title: 'Certified True Copy of Members’ Resolution', sub: 'Adoption of accounts at AGM', lh: LH_CO, build: () => [
      ctcHead(x, 'ORDINARY RESOLUTION PASSED BY THE MEMBERS AT THE ' + ord(f.agmNo).toUpperCase() + ' ANNUAL GENERAL MEETING', f.agmDate, f.agmTime, x.venue(f.agmVenue)), { gap: 1 },
      { p: '**ADOPTION OF AUDITED FINANCIAL STATEMENTS FOR THE ' + FYW.toUpperCase() + ' ENDED ' + ld(x.fyEnd).toUpperCase() + '**', u: true },
      ...resAdoption(x).map(b => Object.assign({}, b, { al: 'j' })), { p: 'Certified True Copy', b: true }, ...sigCompany(x, f.agmDate)] });

    if (shareholders.length) D.push({ id: 'shlist', title: 'List of Shareholders as on ' + sd(x.fyEnd), sub: 'Attachment to e-Form ' + x.retForm, lh: LH_CO, build: () => {
      const tot = shareholders.reduce((s, h) => s + (parseFloat(String(h.shares).replace(/,/g, '')) || 0), 0);
      const pct = h => { const n = parseFloat(String(h.shares).replace(/,/g, '')) || 0; return tot ? (n * 100 / tot).toFixed(2) + '%' : '—'; };
      return [{ p: 'LIST OF SHAREHOLDERS AS ON ' + ld(x.fyEnd).toUpperCase(), b: true, al: 'c' }, { p: 'Face value per equity share: Rs. ' + v(c.faceValue), al: 'c' },
        { tbl: [['S. No.', 'Name of the shareholder', 'Folio No.', 'Category', 'No. of equity shares', '% of holding'], ...shareholders.map((h, i) => [String(i + 1), h.name, h.folio || '—', h.cat || '—', String(h.shares || '—'), pct(h)]), ['', '**Total**', '', '', '**' + tot.toLocaleString('en-IN') + '**', '**100.00%**']], cols: [7, 33, 12, 16, 17, 15], head: true },
        { p: 'Certified to be true', b: true }, ...sigCompany(x, f.agmDate)];
    } });

    D.push({ id: 'annualsheet', title: 'AOC-4 & ' + x.retForm + ' Data Sheet & Checklist', sub: 'Internal — annual filing on MCA V3', lh: LH_NONE, build: () => {
      const agmDue = x.fyEnd ? addMonths(x.fyEnd, x.firstFY ? 9 : 6) : '';
      const tot = shareholders.reduce((s, h) => s + (parseFloat(String(h.shares).replace(/,/g, '')) || 0), 0);
      return [{ p: 'e-FORM AOC-4 & ' + x.retForm + ' — DATA SHEET & FILING CHECKLIST', b: true, al: 'c', sz: 28 }, { p: c.name + ' (CIN: ' + v(c.cin) + ') — FY ' + fyLabel(x.fyEnd), al: 'c' },
        head('A. Company details'), { tbl: [['CIN', v(c.cin)], ['Name of the company', c.name], ['Registered office', oneLine(c.addr)], ['Email / Website', v(c.email) + ' / ' + (c.web || 'None')], ['Category', c.type === 'opc' ? 'One Person Company' : c.type === 'public' ? 'Public company (unlisted)' : 'Private company'], ['Small company / OPC (MGT-7A)', x.small ? 'Yes' : 'No — MGT-7']] },
        head('B. Financial year & meetings'), { tbl: [['Financial year', sd(x.fyFrom) + ' to ' + sd(x.fyEnd) + (x.firstFY ? ' (first financial year)' : '')], ['Board meeting approving accounts', sd(f.bmDate)], ['AGM', ord(f.agmNo) + ' AGM on ' + sd(f.agmDate) + (f.shortNotice === 'yes' ? ' (shorter notice)' : '')], ['Number of Board meetings during the year', String(x.bms.length || BL)], ['Dates of Board meetings', x.bms.map(sd).join(', ') || BL]] },
        head('C. Share capital & members'), { tbl: [['Authorised capital (Rs.)', v(c.authCap)], ['Paid-up capital (Rs.)', v(c.paidCap)], ['Face value per share (Rs.)', v(c.faceValue)], ['Total equity shares (as per shareholder list)', tot ? tot.toLocaleString('en-IN') : BL], ['Number of shareholders', shareholders.length ? String(shareholders.length) : BL]] },
        head('D. Turnover & net worth'), { tbl: [['Turnover (Rs.)', v(f.turnover)], ['Net worth (Rs.)', v(f.netWorth)], ['Total revenue / Profit after tax (Rs.)', amt(f.revCur) + ' / ' + amt(f.patCur)]] },
        head('E. Directors'), { tbl: [['Name', 'DIN', 'Designation'], ...(c.directors || []).map(d => [d.name, d.din || '—', d.desig || 'Director'])], cols: [50, 20, 30], head: true },
        head('F. Statutory auditor'), { tbl: [['Firm / FRN', v(a.firm) + ' / ' + v(a.frn)], ['Signing partner / M. No.', v(a.partner) + ' / ' + v(a.mno)]] },
        head('G. Due dates'), { tbl: [['AGM due by', sd(agmDue) + ' (' + (x.firstFY ? '9 months from end of first FY' : '6 months from end of FY') + ', Sec 96)'], ['e-Form AOC-4 due by', '**' + sd(addDays(f.agmDate, 30)) + '** (30 days from AGM — Sec 137)'], ['e-Form ' + x.retForm + ' due by', '**' + sd(addDays(f.agmDate, 60)) + '** (60 days from AGM — Sec 92(4))']] },
        head('H. Attachments to AOC-4'), ...numbered(['Financial statements — ' + fsWords(x) + ' (prepared and signed separately)', 'Auditors’ Report (with UDIN)', 'Board’s Report' + (f.rpt === 'yes' ? ', with Form AOC-2 (Annexure-I)' : ''), 'Statement of subsidiaries in Form AOC-1 and CSR annexure — only if applicable']),
        head('I. Attachments to ' + x.retForm), ...numbered([shareholders.length ? 'List of shareholders as on ' + sd(x.fyEnd) : 'List of shareholders (add shareholders in the client master to generate it)', 'Approval letter for extension of AGM — only if an extension was granted', ...(!x.small ? ['Form MGT-8 (certificate by a Company Secretary in practice) — required if paid-up capital ≥ Rs. 10 crore or turnover ≥ Rs. 50 crore'] : [])]),
        head('J. Before filing'), ...numbered(['Financial statements signed as per Sec 134(1) and the Board’s Report as per Sec 134(6) before the AGM notice is issued.', 'The auditor’s UDIN is generated and quoted on the Auditors’ Report.', 'Directors’ DIN KYC (DIR-3 KYC) is active; the signing director’s DSC is registered on MCA.', 'File AOC-4 XBRL instead of AOC-4 if the company is covered by the XBRL rules (listed, paid-up ≥ Rs. 5 crore or turnover ≥ Rs. 100 crore).', 'File AOC-4 first and MGT-7/7A after it; keep the SRNs and challans in the client file.']),
        { p: 'Internal working paper. Verify all particulars against the live MCA V3 form fields at the time of filing.', sz: 18 }];
    } });
    return D;
  }

  /* =====================================================================
     SHARED HELPERS FOR THE CASES BELOW
     ===================================================================== */
  const num = s => parseFloat(String(s == null ? '' : s).replace(/[,\s₹]|Rs\.?/gi, '')) || 0;
  const inr = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words(n) { // Indian numbering: crore / lakh / thousand
    n = Math.floor(Math.abs(n)); if (!n) return 'Zero';
    const two = k => k < 20 ? ONES[k] : TENS[Math.floor(k / 10)] + (k % 10 ? ' ' + ONES[k % 10] : '');
    const three = k => (k >= 100 ? ONES[Math.floor(k / 100)] + ' Hundred' + (k % 100 ? ' ' : '') : '') + (k % 100 ? two(k % 100) : '');
    const parts = [], cr = Math.floor(n / 1e7), lk = Math.floor(n / 1e5) % 100, th = Math.floor(n / 1e3) % 100, rest = n % 1000;
    if (cr) parts.push((cr >= 1000 ? words(cr) : three(cr)) + ' Crore'); if (lk) parts.push(two(lk) + ' Lakh'); if (th) parts.push(two(th) + ' Thousand'); if (rest) parts.push(three(rest));
    return parts.join(' ');
  }
  const rupees = n => 'Rs. ' + inr(n) + '/- (Rupees ' + words(n) + ' Only)';
  const sharesW = n => inr(n) + ' (' + words(n) + ')';
  const totalShares = c => (c.shareholders || []).reduce((s, h) => s + num(h.shares), 0);
  const stmtNote = (t) => ({ p: t, sz: 18 });
  const WORKPAPER = 'Internal working paper. Verify all particulars against the live MCA V3 form fields at the time of filing.';
  const sheetHead = (title, x) => [{ p: title, b: true, al: 'c', sz: 28 }, { p: x.c.name + ' (' + (x.c.type === 'llp' ? 'LLPIN' : 'CIN') + ': ' + v(x.c.cin) + ')', al: 'c' }];
  const coTable = x => ({ tbl: [[x.c.type === 'llp' ? 'LLPIN' : 'CIN', v(x.c.cin)], ['Name', x.c.name], ['Registered office', oneLine(x.c.addr)], ['Email ID', v(x.c.email)]] });
  const ctcBoard = (x, pre, res, single) => {
    const f = x.f, D = f[(pre || 'bm') + 'Date'], T = f[(pre || 'bm') + 'Time'], V = f[(pre || 'bm') + 'Venue'];
    return [ctcHead(x, (single ? 'RESOLUTION' : 'RESOLUTIONS') + ' PASSED AT THE MEETING OF THE BOARD OF DIRECTORS', D, T, x.venue(V)), { gap: 1 },
      ...res.map(b => Object.assign({ al: 'j' }, b)), { p: 'Certified True Copy', b: true }, ...sigCompany(x, D)];
  };
  const egmDocs = (x, item, resText, explanatory, kind) => { // EGM notice (special/ordinary business) + CTC
    const f = x.f, c = x.c, RT = kind === 'special' ? 'Special Resolution' : 'Ordinary Resolution';
    return [{ id: 'egmnotice', title: 'Notice of Extraordinary General Meeting', sub: 'Sec 100, 101, 102 & SS-2 — with explanatory statement', lh: LH_CO, build: () => [
      ...gmNoticeBody(x, 'egm', f.egmDate, f.egmTime, x.venue(f.egmVenue)),
      { p: 'SPECIAL BUSINESS:', b: true, u: true }, { p: '1.\t**' + item + '**', hang: true },
      { p: 'To consider and, if thought fit, to pass the following resolution as a **' + RT + '**:', ind: 567, al: 'j' },
      ...resText.map(indent),
      ...sigCompany(x, f.egmNotice, 'By Order of the Board\nFor ' + c.name), { gap: 1 }, { p: 'NOTES:', b: true, u: true },
      ...numbered(['An Explanatory Statement pursuant to Section 102(1) of the Companies Act, 2013, setting out the material facts concerning the business under Item No. 1, is annexed hereto.', ...GM_NOTES]),
      { pb: true }, { p: 'EXPLANATORY STATEMENT PURSUANT TO SECTION 102(1) OF THE COMPANIES ACT, 2013', b: true, al: 'c' }, { p: 'Item No. 1', b: true, u: true },
      ...explanatory.map(t => ({ p: t, al: 'j' })),
      { p: 'The Board recommends the ' + RT + ' set out at Item No. 1 of the Notice for approval of the members.', al: 'j' },
      { p: 'None of the Directors or Key Managerial Personnel of the Company or their relatives is, in any way, concerned or interested, financially or otherwise, in the resolution set out at Item No. 1 of the Notice, except to the extent of their shareholding, if any.', al: 'j' },
      ...sigCompany(x, f.egmNotice, 'By Order of the Board\nFor ' + c.name)] },
    { id: 'egmctc', title: 'Certified True Copy of Members’ ' + RT, sub: 'Passed at EGM', lh: LH_CO, build: () => [
      ctcHead(x, RT.toUpperCase() + ' PASSED BY THE MEMBERS AT THE EXTRAORDINARY GENERAL MEETING', f.egmDate, f.egmTime, x.venue(f.egmVenue)), { gap: 1 },
      { p: '**' + item.toUpperCase() + '**', u: true }, ...resText.map(b => Object.assign({}, b, { al: 'j' })), { p: 'Certified True Copy', b: true }, ...sigCompany(x, f.egmDate)] }];
  };
  const dematNote = x => x.c.size === 'other' && x.c.type === 'private'
    ? 'Rule 9B of the Companies (Prospectus and Allotment of Securities) Rules, 2014: a private company that is not a small company must issue and transfer securities only in dematerialised form (ISIN through a depository). Check applicability before issuing physical certificates.' : '';

  /* =====================================================================
     RIGHTS ISSUE & ALLOTMENT — PAS-3 (allot)
     ===================================================================== */
  function allotRows(x) { return cells(x.f.allottees, 6).map(r => ({ name: r[0], folio: r[1], shares: num(r[2]), amount: r[3] ? num(r[3]) : num(r[2]) * x.price, date: parseDMY(r[4]), mode: r[5] || 'Bank transfer' })); }
  function allotDocs(x) {
    const { c, f } = x, D = [], fv = num(c.faceValue) || 10, prem = num(f.premium), price = fv + prem; x.price = price;
    const offer = num(f.offerShares), held = totalShares(c), rows = allotRows(x), allotted = rows.reduce((s, r) => s + r.shares, 0);
    const desc0 = sharesW(offer) + ' equity shares of Rs. ' + inr(fv) + '/- each at a price of Rs. ' + inr(price) + '/- per share' + (prem ? ' (including a premium of Rs. ' + inr(prem) + '/- per share)' : ' (at par)');
    const desc = T(x, 'issueDescription', desc0), ratio = T(x, 'issueBasis', f.ratio || 'in proportion to their existing shareholding');
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To consider and approve the offer of ' + desc + ' to the existing equity shareholders on a rights basis under Section 62(1)(a) of the Companies Act, 2013.', 'To approve the draft Letter of Offer and authorise a Director to dispatch it to the shareholders.', 'Any other business with the permission of the Chairperson.']));
    D.push({ id: 'offerctc', title: 'Certified True Copy of Board Resolution — Rights Offer', sub: 'Sec 62(1)(a)', lh: LH_CO, build: () => ctcBoard(x, 'bm', [
      { p: '**OFFER OF EQUITY SHARES ON RIGHTS BASIS TO THE EXISTING SHAREHOLDERS**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 62(1)(a) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Share Capital and Debentures) Rules, 2014 ' + STAT + ' and the Articles of Association of the Company, the consent of the Board be and is hereby accorded to offer ' + desc + ', aggregating to ' + T(x, 'issueAmount', rupees(offer * price)) + ', to the persons who, on the date of the offer, are holders of equity shares of the Company, ' + ratio + ', by way of a Letter of Offer.' },
      { p: '**RESOLVED FURTHER THAT** the offer shall be made by a notice specifying the number of shares offered and shall remain open for a period of ' + T(x, 'offerDays', f.offerDays || '15') + ' days from the date of the offer, i.e. from ' + ld(f.offerDate) + ' to ' + ld(f.lastDate) + ', within which the offer, if not accepted, shall be deemed to have been declined' + (num(f.offerDays) && num(f.offerDays) < 15 ? ', the shorter period being with the consent of not less than ninety per cent of the members' : '') + '.' },
      { p: '**RESOLVED FURTHER THAT** the offer shall include a right exercisable by the shareholders to renounce the shares offered to them, or any of them, in favour of any other person, and that the Board may dispose of the shares not taken up in such manner as it thinks most beneficial to the Company and not dis-advantageous to the shareholders.' },
      { p: '**RESOLVED FURTHER THAT** ' + authWho(x) + ' to sign and dispatch the Letter of Offer to the shareholders and to do all such acts, deeds and things as may be necessary to give effect to this resolution.”' }]) });
    D.push({ id: 'offerletter', title: 'Letter of Offer with Acceptance / Renunciation Form', sub: 'One page set per shareholder from the client master', lh: LH_CO, build: () => {
      const list = (c.shareholders || []).filter(h => h.name).length ? c.shareholders.filter(h => h.name) : [{ name: '', folio: '', shares: '' }];
      const out = [];
      list.forEach((h, i) => {
        const ent = held && offer ? Math.floor(num(h.shares) * offer / held) : 0;
        if (i) out.push({ pb: true });
        out.push({ p: 'Date: ' + ld(f.offerDate), al: 'r' }, { p: 'To,', after: 0 }, { p: v(h.name), b: true, after: 0 }, { p: 'Folio No.: ' + v(h.folio), after: 0 }, { gap: 1 },
          subj('Letter of Offer — rights issue of equity shares under Section 62(1)(a) of the Companies Act, 2013'), { p: 'Dear Shareholder,' },
          { p: 'The Board of Directors of ' + c.name + ' at its meeting held on ' + ld(f.bmDate) + ' has decided to offer ' + desc + ' to the existing equity shareholders ' + ratio + '.', al: 'j' },
          { tbl: [['Your present holding (equity shares)', h.shares ? inr(num(h.shares)) : BL], ['Shares offered to you (entitlement)', ent ? inr(ent) : BL], ['Issue price per share', 'Rs. ' + inr(price) + (prem ? ' (face value Rs. ' + inr(fv) + ' + premium Rs. ' + inr(prem) + ')' : '')], ['Amount payable', ent ? rupees(ent * price) : BL], ['Offer opens on', ld(f.offerDate)], ['Last date for acceptance', ld(f.lastDate)]] },
          { p: 'If you wish to accept the offer, please sign Part A of the enclosed form and send it to the Registered Office along with the payment on or before ' + ld(f.lastDate) + ' by bank transfer to the Company’s account' + (f.bank ? ' (' + f.bank + ')' : '') + '. You may also renounce the shares offered to you, in whole or in part, in favour of any other person by signing Part B. If the offer is not accepted by the last date, it shall be deemed to have been declined.', al: 'j' },
          ...sigCompany(x, f.offerDate, 'For ' + c.name),
          { pb: true }, { p: 'FORM OF ACCEPTANCE / RENUNCIATION', b: true, al: 'c', u: true }, { p: 'Rights issue of equity shares of ' + c.name + ' — Letter of Offer dated ' + ld(f.offerDate), al: 'c' },
          { p: 'PART A — ACCEPTANCE', b: true },
          { p: 'I / We, ' + v(h.name) + ' (Folio No. ' + v(h.folio) + '), accept ________ equity shares offered to me / us and enclose / have remitted Rs. ____________ towards the full amount payable. I / We agree to accept the shares subject to the Memorandum and Articles of Association of the Company.', al: 'j' },
          { gap: 1 }, { p: 'Signature: ____________________     Date: ____________', after: 0 },
          { gap: 1 }, { p: 'PART B — RENUNCIATION (to be filled only if renouncing)', b: true },
          { p: 'I / We hereby renounce ________ equity shares offered to me / us in favour of the person named below.', al: 'j' },
          { tbl: [['Name of the renouncee', ''], ['Address', ''], ['PAN', ''], ['Signature of the shareholder (renouncer)', ''], ['Signature of the renouncee (accepting the shares)', '']] });
      });
      return out;
    } });
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To take note of the acceptances received against the Letter of Offer dated ' + ld(f.offerDate) + '.', 'To allot equity shares to the shareholders / renouncees who have accepted the offer and paid the application money.', 'To authorise the issue of share certificates and the filing of e-Form PAS-3.', 'Any other business with the permission of the Chairperson.'], 'al', 'alnotice', 'Notice of Board Meeting for Allotment'));
    D.push({ id: 'allotctc', title: 'Certified True Copy of Board Resolution — Allotment', sub: 'Sec 62(1)(a) & 39 — attachment to PAS-3', lh: LH_CO, build: () => ctcBoard(x, 'al', [
      { p: '**ALLOTMENT OF ' + T(x, 'sharesAllotted', inr(allotted)) + ' EQUITY SHARES ON RIGHTS BASIS**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Sections 39 and 62(1)(a) and other applicable provisions, if any, of the Companies Act, 2013 read with the rules made thereunder ' + STAT + ', and in terms of the Letter of Offer dated ' + ld(f.offerDate) + ', the Board hereby allots ' + T(x, 'sharesAllottedWords', sharesW(allotted)) + ' fully paid-up equity shares of Rs. ' + T(x, 'faceValue', inr(fv)) + '/- each at a price of Rs. ' + T(x, 'issuePrice', inr(price)) + '/- per share to the following persons, the full application money having been received in the bank account of the Company:' },
      { tbl: [['S. No.', 'Name of the allottee', 'Folio No.', 'No. of equity shares', 'Amount received (Rs.)'], ...rows.map((r, i) => [String(i + 1), r.name, r.folio || '—', inr(r.shares), inr(r.amount)]), ['', '**Total**', '', '**' + inr(allotted) + '**', '**' + inr(rows.reduce((s, r) => s + r.amount, 0)) + '**']], cols: [8, 40, 12, 18, 22], head: true },
      { p: '**RESOLVED FURTHER THAT** the said equity shares shall rank pari passu in all respects with the existing equity shares of the Company; that the names of the allottees be entered in the Register of Members; and that share certificates' + (dematNote(x) ? ' / credit to the demat accounts' : '') + ' be issued within two months from the date of allotment in terms of Section 56(4)(a) of the Act, signed by two Directors of the Company.' },
      { p: '**RESOLVED FURTHER THAT** any Director of the Company be and is hereby severally authorised to file the return of allotment in e-Form PAS-3 with the Registrar of Companies within thirty days of allotment under Section 39(4) of the Act and to do all such acts, deeds and things as may be necessary.”' }]) });
    if (!dematNote(x)) D.push({ id: 'sh1', title: 'Share Certificates — Form SH-1', sub: 'One per allottee — signed by two Directors', lh: LH_PLAIN, build: () => {
      let no = num(f.certFrom) || 1, dn = num(f.distFrom) || (held + 1); const out = [];
      rows.forEach((r, i) => {
        if (i) out.push({ pb: true });
        out.push(...formHead('Form No. SH-1', 'SHARE CERTIFICATE', 'Pursuant to sub-section (3) of Section 46 of the Companies Act, 2013 and Rule 5(2) of the Companies (Share Capital and Debentures) Rules, 2014'),
          { p: c.name.toUpperCase(), b: true, al: 'c', sz: 30, after: 0 }, { p: 'CIN: ' + v(c.cin), al: 'c', after: 0 }, { p: 'Registered Office: ' + oneLine(c.addr), al: 'c' },
          { p: 'This is to certify that the person(s) named in this certificate is / are the registered holder(s) of the within-mentioned share(s) bearing the distinctive number(s) herein specified in the above-named Company, subject to the Memorandum and Articles of Association of the Company, and that the amount endorsed herein has been paid up on each such share.', al: 'j' },
          { tbl: [['Certificate No.', String(no)], ['Folio No.', v(r.folio)], ['Name of the holder', v(r.name)], ['Kind / class of shares', 'Equity shares of Rs. ' + inr(fv) + '/- each'], ['Amount paid-up per share', 'Rs. ' + inr(fv) + '/-'], ['Number of shares', sharesW(r.shares)], ['Distinctive numbers', 'From ' + inr(dn) + ' to ' + inr(dn + r.shares - 1)]] },
          { p: 'Given under the authority of the Board of Directors on ' + ld(f.alDate) + (f.place ? ' at ' + f.place : '') + '.', al: 'j' },
          { gap: 1 }, ...signRow(x, [x.d, x.d2.name ? x.d2 : {}]),
          stmtNote('Note: No transfer of the share(s) comprised in this certificate can be registered unless accompanied by this certificate. Stamp duty on the certificate is payable as per the applicable State Stamp Act.'));
        no++; dn += r.shares;
      });
      return out.length ? out : [{ p: 'Enter the allottees to generate share certificates.' }];
    } });
    D.push({ id: 'pas3', title: 'e-Form PAS-3 Data Sheet & Checklist', sub: 'Internal — return of allotment', lh: LH_NONE, build: () => [
      ...sheetHead('e-FORM PAS-3 — RETURN OF ALLOTMENT — DATA SHEET & CHECKLIST', x), head('A. Company'), coTable(x),
      head('B. Allotment'), { tbl: [['Date of allotment (Board meeting)', sd(f.alDate)], ['Type of issue', 'Rights issue — Section 62(1)(a)'], ['Consideration', 'Cash'], ['Number of equity shares allotted', inr(allotted)], ['Nominal value / premium per share (Rs.)', inr(fv) + ' / ' + inr(prem)], ['Total consideration (Rs.)', inr(rows.reduce((s, r) => s + r.amount, 0))], ['Paid-up capital before allotment (Rs.)', v(c.paidCap)], ['Paid-up capital after allotment (Rs.)', inr(num(c.paidCap) + allotted * fv)], ['Authorised capital (Rs.)', v(c.authCap)]] },
      head('C. Due dates'), { tbl: [['e-Form PAS-3 to be filed by', '**' + sd(addDays(f.alDate, 30)) + '** (within 30 days of allotment — Sec 39(4) & Rule 12)'], ['Share certificates to be issued by', sd(addMonths(f.alDate, 2)) + ' (within two months — Sec 56(4)(a))']] },
      head('D. Attachments'), ...numbered(['Certified true copy of the Board resolution for allotment', 'List of allottees (name, address, PAN, number of shares, amount)', 'Copy of the Letter of Offer (optional)']),
      head('E. Before filing'), ...numbered(['Check that authorised capital is enough for the new paid-up capital; if not, increase it first (SH-7).', 'Confirm that the application money was received in the Company’s bank account from the allottees’ own accounts.', 'Update the Register of Members (MGT-1) and pay stamp duty on share certificates as per the State Stamp Act.', ...(dematNote(x) ? [dematNote(x)] : []), 'Rights issue does not need Form PAS-4 / special resolution; a private placement under Section 42 does — not covered by this set.']),
      stmtNote(WORKPAPER)] });
    return D;
  }
  function signRow(x, ds) { // two signatures one after another for certificates
    const out = [];
    ds.forEach((d, i) => { if (i) out.push({ gap: 1 }); out.push({ sign: d.sign || null }, { p: (d.name || BL) + ' — Director', b: true, after: 0, keep: true }, { p: 'DIN: ' + v(d.din), after: 0, keep: true }); });
    return tag(out, 'signatures');
  }

  /* =====================================================================
     INCREASE IN AUTHORISED CAPITAL — SH-7 (authcap)
     ===================================================================== */
  function authCapDocs(x) {
    const { c, f } = x, fv = num(c.faceValue) || 10, oldC = num(f.oldCap || c.authCap), newC = num(f.newCap), special = f.resType === 'special';
    const clause = T(x, 'capitalClause', 'V. The Authorised Share Capital of the Company is ' + rupees(newC) + ' divided into ' + sharesW(newC / fv) + ' Equity Shares of Rs. ' + inr(fv) + '/- (Rupees ' + words(fv) + ' Only) each.');
    const OLD = T(x, 'oldCapital', rupees(oldC) + ' divided into ' + sharesW(oldC / fv) + ' Equity Shares of Rs. ' + inr(fv) + '/- each'), NEW = T(x, 'newCapital', rupees(newC) + ' divided into ' + sharesW(newC / fv) + ' Equity Shares of Rs. ' + inr(fv) + '/- each');
    const OLDR = T(x, 'oldCapitalAmount', rupees(oldC)), NEWR = T(x, 'newCapitalAmount', rupees(newC)), CREATED = T(x, 'newSharesCreated', sharesW((newC - oldC) / fv) + ' new Equity Shares of Rs. ' + inr(fv) + '/- each');
    const res = [{ p: '“**RESOLVED THAT** pursuant to the provisions of Sections 13, 61(1)(a) and 64 and other applicable provisions, if any, of the Companies Act, 2013 read with the rules made thereunder ' + STAT + ', the Authorised Share Capital of the Company be and is hereby increased from ' + OLD + ' to ' + NEW + ', by the creation of ' + CREATED + ' ranking pari passu with the existing Equity Shares of the Company.' },
      { p: '**RESOLVED FURTHER THAT** the existing Clause V of the Memorandum of Association of the Company be and is hereby substituted by the following clause:' }, { p: clause, ind: 567, b: true },
      { p: '**RESOLVED FURTHER THAT** the Board of Directors of the Company be and is hereby authorised to file e-Form SH-7' + (special ? ' and e-Form MGT-14' : '') + ' with the Registrar of Companies and to do all such acts, deeds and things as may be necessary to give effect to this resolution.”' }];
    const D = [];
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To consider and recommend to the members the increase in the Authorised Share Capital of the Company from ' + OLDR + ' to ' + NEWR + ' and the consequent alteration of Clause V of the Memorandum of Association.', 'To approve the Notice of the Extraordinary General Meeting and fix the date, time and venue thereof.', 'Any other business with the permission of the Chairperson.']));
    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolution', sub: 'Recommending increase & convening EGM', lh: LH_CO, build: () => ctcBoard(x, 'bm', [
      { p: '**1. RECOMMENDATION FOR INCREASE IN AUTHORISED SHARE CAPITAL**', u: true },
      { p: '“**RESOLVED THAT** the Board hereby recommends to the members of the Company the increase in the Authorised Share Capital of the Company from ' + OLDR + ' to ' + NEWR + ' and the consequent alteration of Clause V of the Memorandum of Association, by way of an ' + (special ? 'special' : 'ordinary') + ' resolution under Sections 13 and 61 of the Companies Act, 2013.”' },
      { p: '**2. CONVENING OF EXTRAORDINARY GENERAL MEETING**', u: true },
      { p: '“**RESOLVED THAT** an Extraordinary General Meeting of the members of the Company be held on ' + dayName(f.egmDate) + ', ' + ld(f.egmDate) + ' at ' + tm(f.egmTime) + ' at ' + oneLine(x.venue(f.egmVenue)) + ', and the draft Notice along with the Explanatory Statement under Section 102 of the Act, as placed before the Board, be and is hereby approved; and that ' + authWho(x) + ' to sign and issue the Notice.”' }]) });
    D.push(...egmDocs(x, 'Increase in the Authorised Share Capital and alteration of the Capital Clause of the Memorandum of Association', res,
      ['The present Authorised Share Capital of the Company is ' + OLD + '. To meet the future requirements of funds and to enable the Company to issue further shares, the Board of Directors at its meeting held on ' + ld(f.bmDate) + ' recommended increasing the Authorised Share Capital to ' + NEWR + '.',
        'The increase requires the alteration of Clause V of the Memorandum of Association and the approval of the members under Sections 13 and 61 of the Companies Act, 2013. A copy of the Memorandum of Association, along with the proposed alteration, is available for inspection at the Registered Office.'], special ? 'special' : 'ordinary'));
    D.push({ id: 'moa', title: 'Altered Clause V of Memorandum (Capital Clause)', sub: 'Attachment to SH-7 — replace in the MoA print', lh: LH_PLAIN, build: () => [
      { p: 'MEMORANDUM OF ASSOCIATION OF ' + c.name.toUpperCase(), b: true, al: 'c' }, { p: '(Clause V as altered by the members at the Extraordinary General Meeting held on ' + ld(f.egmDate) + ')', al: 'c' }, { gap: 1 },
      { p: clause, al: 'j', b: true }, { gap: 1 },
      { p: 'Certified to be the altered capital clause of the Memorandum of Association of the Company.', al: 'j' }, ...sigCompany(x, f.egmDate)] });
    D.push({ id: 'sh7', title: 'e-Form SH-7 Data Sheet & Checklist', sub: 'Internal — notice of alteration of share capital', lh: LH_NONE, build: () => [
      ...sheetHead('e-FORM SH-7 — ALTERATION OF SHARE CAPITAL — DATA SHEET & CHECKLIST', x), head('A. Company'), coTable(x),
      head('B. Alteration'), { tbl: [['Purpose', 'Increase in authorised share capital — Sec 61(1)(a)'], ['Date of members’ resolution (EGM)', sd(f.egmDate)], ['Type of resolution', special ? 'Special resolution (also file MGT-14)' : 'Ordinary resolution'], ['Existing authorised capital (Rs.)', inr(oldC) + ' (' + inr(oldC / fv) + ' shares of Rs. ' + inr(fv) + ')'], ['Revised authorised capital (Rs.)', inr(newC) + ' (' + inr(newC / fv) + ' shares of Rs. ' + inr(fv) + ')'], ['Increase (Rs.)', inr(newC - oldC)]] },
      head('C. Due dates'), { tbl: [['e-Form SH-7 to be filed by', '**' + sd(addDays(f.egmDate, 30)) + '** (within 30 days of the resolution — Sec 64(1))'], ...(special ? [['e-Form MGT-14 to be filed by', sd(addDays(f.egmDate, 30)) + ' (Sec 117)']] : [])] },
      head('D. Attachments'), ...numbered(['Certified true copy of the members’ resolution', 'Altered Memorandum of Association (and Articles, if the capital is mentioned there)', 'Notice of the EGM with explanatory statement']),
      head('E. Before filing'), ...numbered(['Check whether the Articles of Association require a special resolution for alteration of capital.', 'MCA fee and stamp duty on the increase are calculated in the form as per the Companies (Registration Offices and Fees) Rules, 2014 and the State Stamp Act — keep the amount ready.', 'Update the authorised capital in the client master of this portal after approval.']),
      stmtNote(WORKPAPER)] });
    return D;
  }

  /* =====================================================================
     TRANSFER OF SHARES — SH-4 (transfer)
     ===================================================================== */
  function transferDocs(x) {
    const { c, f } = x, fv = num(c.faceValue) || 10, n = num(f.trShares), cons = num(f.consideration);
    const h = x.T ? { name: '{{transferor}}', folio: '{{transferorFolio}}', shares: '' } : (c.shareholders || [])[parseInt(f.fromIndex, 10)] || {};
    const stamp = Math.ceil(cons * 0.00015);
    const NS = T(x, 'sharesTransferred', sharesW(n)), FV = T(x, 'faceValue', inr(fv)), NN = T(x, 'sharesTransferredCount', inr(n));
    const D = [];
    D.push({ id: 'sh4', title: 'Form SH-4 — Securities Transfer Form', sub: 'Sec 56 & Rule 11 — signed by transferor, transferee & witness', lh: LH_PLAIN, build: () => [
      ...formHead('Form No. SH-4', 'Securities Transfer Form', 'Pursuant to Section 56 of the Companies Act, 2013 and sub-rule (1) of Rule 11 of the Companies (Share Capital and Debentures) Rules, 2014'),
      { p: 'Date of execution: ' + ld(f.execDate), al: 'r' },
      { p: 'FOR THE CONSIDERATION stated below, the “Transferor(s)” named do hereby transfer to the “Transferee(s)” named the securities specified below, subject to the conditions on which the said securities are now held by the Transferor(s), and the Transferee(s) do hereby agree to accept and hold the said securities subject to the conditions aforesaid.', al: 'j' },
      { tbl: [['CIN', v(c.cin)], ['Name of the company (in full)', c.name], ['Name of the Stock Exchange where the company is listed, if any', 'Not applicable']] },
      head('DESCRIPTION OF SECURITIES'),
      { tbl: [['Kind / class of securities', 'Nominal value of each unit', 'Amount called up per unit', 'Amount paid up per unit'], ['Equity shares', 'Rs. ' + inr(fv), 'Rs. ' + inr(fv), 'Rs. ' + inr(fv)]], head: true },
      { tbl: [['No. of securities being transferred', inr(n) + ' (' + words(n) + ')'], ['Consideration received (Rs.)', inr(cons) + ' (Rupees ' + words(cons) + ' Only)'], ['Distinctive number', 'From ' + v(f.distFrom) + ' to ' + v(f.distTo)], ['Corresponding certificate no(s).', v(f.certNo)]] },
      head('TRANSFEROR’S PARTICULARS'), { tbl: [['Registered folio number', v(h.folio)], ['Name(s) in full', v(h.name)], ['Signature(s)', '']] },
      { p: 'I hereby confirm that the Transferor has signed before me.', after: 0 }, { tbl: [['Signature of the witness', ''], ['Name and address of the witness', '']] },
      head('TRANSFEREE’S PARTICULARS'), { tbl: [['Name in full', v(f.toName)], ['Father’s / mother’s / spouse’s name', v(f.toFather)], ['Address and e-mail ID', (oneLine(f.toAddr) || BL) + (f.toEmail ? ' — ' + f.toEmail : '')], ['Occupation', v(f.toOcc)], ['PAN', v(f.toPan)], ['Existing folio no., if any', v(f.toFolio)], ['Signature', '']] },
      { tbl: [['Value of stamp affixed (Rs.)', stamp ? inr(stamp) + ' (0.015% of consideration — Indian Stamp Act, 1899; verify the current rate)' : BL], ['Enclosures', '(1) Share certificate no. ' + v(f.certNo) + '  (2) Copy of PAN of the transferee  (3) Others: ____']] },
      head('FOR OFFICE USE ONLY'), { tbl: [['Checked by', ''], ['Signature tallied by', ''], ['Entered in the Register of Transfer on ____ vide Transfer No. ____', ''], ['Approval date', sd(f.bmDate)]] }] });
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To consider and approve the transfer of ' + NN + ' equity shares from ' + v(h.name) + ' to ' + v(f.toName) + '.', 'Any other business with the permission of the Chairperson.']));
    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolution — Transfer', sub: 'Approval & registration of transfer — Sec 56', lh: LH_CO, build: () => ctcBoard(x, 'bm', [
      { p: '**APPROVAL OF TRANSFER OF EQUITY SHARES**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 56 and other applicable provisions, if any, of the Companies Act, 2013 read with Rule 11 of the Companies (Share Capital and Debentures) Rules, 2014 and the Articles of Association of the Company, the transfer of ' + NS + ' equity shares of Rs. ' + FV + '/- each, bearing distinctive numbers ' + v(f.distFrom) + ' to ' + v(f.distTo) + ' comprised in share certificate no. ' + v(f.certNo) + ', from ' + v(h.name) + ' (Folio No. ' + v(h.folio) + ') to ' + v(f.toName) + ', as per the instrument of transfer in Form SH-4 dated ' + ld(f.execDate) + ', duly stamped and executed, be and is hereby approved and registered.' },
      { p: '**RESOLVED FURTHER THAT** the name of ' + v(f.toName) + ' be entered in the Register of Members in respect of the said shares, and that the share certificate be endorsed in favour of the transferee (or a new certificate be issued) and delivered within one month from the date of receipt of the instrument of transfer, in terms of Section 56(4)(c) of the Act; and that any Director of the Company be and is hereby authorised to sign the endorsement and to do all acts necessary in this regard.”' }], true) });
    D.push({ id: 'trletter', title: 'Intimation of Registration of Transfer', sub: 'To the transferee, with the endorsed certificate', lh: LH_CO, build: () => [
      { p: 'Date: ' + ld(f.bmDate), al: 'r' }, { p: 'To,', after: 0 }, { p: v(f.toName), b: true, after: 0 }, ...addrLines(f.toAddr), { gap: 1 },
      subj('Registration of transfer of ' + NN + ' equity shares of ' + c.name), { p: 'Dear Sir / Madam,' },
      { p: 'We are pleased to inform you that the Board of Directors at its meeting held on ' + ld(f.bmDate) + ' has approved the transfer of ' + NS + ' equity shares of Rs. ' + FV + '/- each (distinctive numbers ' + v(f.distFrom) + ' to ' + v(f.distTo) + ') from ' + v(h.name) + ' in your favour, and your name has been entered in the Register of Members' + (f.toFolio ? ' under Folio No. ' + f.toFolio : '') + '.', al: 'j' },
      { p: 'The share certificate no. ' + v(f.certNo) + ', duly endorsed in your favour, is enclosed. Kindly acknowledge receipt.', al: 'j' },
      ...signoff(), ...sigCompany(x, f.bmDate), { gap: 1 }, { p: 'Encl.: Share certificate no. ' + v(f.certNo) }] });
    D.push({ id: 'trsheet', title: 'Share Transfer Checklist', sub: 'Internal', lh: LH_NONE, build: () => [
      ...sheetHead('SHARE TRANSFER — CHECKLIST', x),
      { tbl: [['Transferor', v(h.name) + ' (Folio ' + v(h.folio) + ', holding ' + (h.shares ? inr(num(h.shares)) : BL) + ' shares)'], ['Transferee', v(f.toName)], ['Shares transferred', inr(n)], ['Consideration (Rs.)', inr(cons)], ['Stamp duty @ 0.015% (Rs.)', stamp ? inr(stamp) : BL], ['Date of execution of SH-4', sd(f.execDate)], ['Lodge with company by', sd(addDays(f.execDate, 60)) + ' (within 60 days of execution — Rule 11(2))'], ['Register & deliver certificate by', sd(addMonths(f.bmDate, 1)) + ' (within one month — Sec 56(4)(c))']] },
      ...numbered(['Check the Articles of Association for restrictions on transfer (right of first refusal / Board approval) — Sec 2(68).', 'Stamp duty is payable on the instrument; for physical shares it is usually paid through the State e-stamp / stock-holding portal — verify the current procedure.', ...(dematNote(x) ? [dematNote(x)] : []), 'If the price differs from the fair market value, check the income-tax provisions (Sec 50CA / 56(2)(x)) with the client.', 'Update the Register of Members (MGT-1) and the shareholder list in this portal; the change is reported in the next MGT-7 / MGT-7A.', 'No e-form is filed with the ROC for a share transfer.']),
      stmtNote(WORKPAPER)] });
    return D;
  }

  /* =====================================================================
     SHIFTING OF REGISTERED OFFICE — INC-22 (regoffice)
     ===================================================================== */
  function regOfficeDocs(x) {
    const { c, f } = x, roc = f.scope === 'roc', D = [], newA = oneLine(f.newAddr) || BL;
    const boardRes = roc
      ? [{ p: '**1. RECOMMENDATION FOR SHIFTING OF REGISTERED OFFICE OUTSIDE THE LOCAL LIMITS**', u: true },
        { p: '“**RESOLVED THAT** the Board hereby recommends to the members of the Company, by way of a special resolution under Section 12(5) of the Companies Act, 2013, the shifting of the Registered Office of the Company from ' + oneLine(c.addr) + ' to ' + newA + ', which is outside the local limits of the city / town / village where the Registered Office is presently situated but within the jurisdiction of the same Registrar of Companies.”' },
        { p: '**2. CONVENING OF EXTRAORDINARY GENERAL MEETING**', u: true },
        { p: '“**RESOLVED THAT** an Extraordinary General Meeting of the members of the Company be held on ' + dayName(f.egmDate) + ', ' + ld(f.egmDate) + ' at ' + tm(f.egmTime) + ' at ' + oneLine(x.venue(f.egmVenue)) + ', and the draft Notice along with the Explanatory Statement, as placed before the Board, be and is hereby approved; and that ' + authWho(x) + ' to sign and issue the Notice.”' }]
      : [{ p: '**SHIFTING OF REGISTERED OFFICE WITHIN THE LOCAL LIMITS**', u: true },
        { p: '“**RESOLVED THAT** pursuant to the provisions of Section 12 and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Incorporation) Rules, 2014 ' + STAT + ', the Registered Office of the Company be and is hereby shifted from ' + oneLine(c.addr) + ' to ' + newA + ', within the local limits of the same city / town / village, with effect from ' + ld(f.effDate) + '.' },
        { p: '**RESOLVED FURTHER THAT** any Director of the Company be and is hereby severally authorised to file e-Form INC-22 with the Registrar of Companies within thirty days of the change, to paint or affix the name of the Company outside the new office, to update the letterheads and other documents, and to do all such acts, deeds and things as may be necessary to give effect to this resolution.”' }];
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', roc ? 'To consider and recommend to the members the shifting of the Registered Office of the Company to ' + newA + '.' : 'To consider the shifting of the Registered Office of the Company to ' + newA + ' within the local limits.', ...(roc ? ['To approve the Notice of the Extraordinary General Meeting.'] : []), 'To authorise a Director to file e-Form INC-22.', 'Any other business with the permission of the Chairperson.']));
    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolution', sub: 'Sec 12' + (roc ? ' — recommending special resolution' : ' — shifting within local limits'), lh: LH_CO, build: () => ctcBoard(x, 'bm', boardRes, !roc) });
    if (roc) D.push(...egmDocs(x, 'Shifting of the Registered Office of the Company outside the local limits of the city', [
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 12(5) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Incorporation) Rules, 2014 ' + STAT + ', the consent of the members be and is hereby accorded to shift the Registered Office of the Company from ' + oneLine(c.addr) + ' to ' + newA + ', within the jurisdiction of the same Registrar of Companies, with effect from ' + ld(f.effDate) + '.' },
      { p: '**RESOLVED FURTHER THAT** the Board of Directors be and is hereby authorised to file e-Forms MGT-14 and INC-22 with the Registrar of Companies and to do all such acts, deeds and things as may be necessary to give effect to this resolution.”' }],
      ['For operational convenience and better administrative control, the Board of Directors at its meeting held on ' + ld(f.bmDate) + ' recommended shifting the Registered Office of the Company from ' + oneLine(c.addr) + ' to ' + newA + '.', 'As the new premises are outside the local limits of the city / town / village where the Registered Office is presently situated, the approval of the members by way of a special resolution is required under Section 12(5) of the Companies Act, 2013.'], 'special'));
    D.push({ id: 'noc', title: 'No-Objection Certificate from Owner of Premises', sub: 'Attachment to INC-22 — signed by the owner', lh: LH_PLAIN, build: () => [
      { p: 'NO OBJECTION CERTIFICATE', b: true, al: 'c', u: true }, { gap: 1 }, { p: 'Date: ' + T(x, 'nocDate', ld(f.nocDate || f.bmDate)), al: 'r' }, ...toBoard(x),
      { p: 'I / We, ' + v(f.ownerName) + ', ' + T(x, 'ownerRelationText', f.ownerRel ? f.ownerRel + ', ' : '') + 'being the owner(s) of the premises situated at ' + newA + ', hereby give my / our no objection to ' + c.name + ' (CIN: ' + v(c.cin) + ') for using the said premises as its Registered Office' + T(x, 'leaseText', (f.premises || 'rented') === 'rented' ? ' under the rent / lease agreement dated ' + ld(f.leaseDate) : '') + ', and for the purpose of correspondence with all authorities.', al: 'j' },
      { p: 'I / We have no objection to the Company filing this certificate with the Registrar of Companies and other authorities.', al: 'j' },
      ...sigPerson({ name: f.ownerName }, f.nocDate || f.bmDate, f.place, ['Address: ' + (oneLine(f.ownerAddr) || BL)])] });
    D.push({ id: 'inc22', title: 'e-Form INC-22 Data Sheet & Checklist', sub: 'Internal — notice of situation / change of registered office', lh: LH_NONE, build: () => [
      ...sheetHead('e-FORM INC-22 — CHANGE OF REGISTERED OFFICE — DATA SHEET & CHECKLIST', x), head('A. Company'), coTable(x),
      head('B. Change'), { tbl: [['Purpose', roc ? 'Change outside local limits, within the same ROC — Sec 12(5)' : 'Change within local limits — Sec 12(4)'], ['Old address', oneLine(c.addr)], ['New address', newA], ['Effective date', sd(f.effDate)], ['Premises', f.premises === 'owned' ? 'Owned by the company' : f.premises === 'director' ? 'Owned by a director / relative' : 'Rented / leased'], ['Date of Board resolution', sd(f.bmDate)], ...(roc ? [['Date of special resolution (EGM)', sd(f.egmDate)]] : [])] },
      head('C. Due dates'), { tbl: [['e-Form INC-22 to be filed by', '**' + sd(addDays(roc ? f.egmDate : f.effDate, 30)) + '** (within 30 days of the change — Sec 12(4))'], ...(roc ? [['e-Form MGT-14 to be filed by', sd(addDays(f.egmDate, 30)) + ' (Sec 117)']] : [])] },
      head('D. Attachments'), ...numbered(['Proof of the registered office address: registered conveyance / lease deed / rent agreement (with rent receipts)', 'Proof of evidence of any utility service (telephone, gas, electricity etc.) not older than two months', 'No-objection certificate from the owner', 'Certified true copy of the ' + (roc ? 'special resolution' : 'Board resolution'), 'Other attachments required by the form at the time of filing (e.g. photographs of the office, if asked)']),
      head('E. After filing'), ...numbered(['Paint or affix the name of the Company and its address outside the new office (Sec 12(3)(a)).', 'Update letterheads, invoices, bank, GST, PAN / TAN and other registrations.', 'Update the address in this portal’s client master (option “Update client master”).', 'Shifting to another State or to another ROC within the State needs Regional Director approval (INC-23) — not covered by this set.']),
      stmtNote(WORKPAPER)] });
    return D;
  }

  /* =====================================================================
     COMMENCEMENT OF BUSINESS — INC-20A (inc20a)
     ===================================================================== */
  function inc20aDocs(x) {
    const { c, f } = x, D = [];
    const subs = cells(f.subscribers, 5).length ? cells(f.subscribers, 5) : (c.shareholders || []).filter(h => h.name).map(h => [h.name, h.shares, String(num(h.shares) * (num(c.faceValue) || 10)), '', '']);
    const tbl = { tbl: [['S. No.', 'Name of the subscriber', 'No. of shares', 'Amount paid (Rs.)', 'Date of payment', 'Mode / bank reference'], ...subs.map((r, i) => [String(i + 1), r[0], r[1] ? inr(num(r[1])) : '—', r[2] ? inr(num(r[2])) : '—', r[3] || '—', r[4] || '—'])], cols: [7, 30, 13, 16, 14, 20], head: true };
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To take note of the receipt of subscription money from all the subscribers to the Memorandum of Association.', 'To authorise a Director to file the declaration for commencement of business in e-Form INC-20A.', 'Any other business with the permission of the Chairperson.']));
    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolution', sub: 'Sec 10A — subscription money & INC-20A', lh: LH_CO, build: () => ctcBoard(x, 'bm', [
      { p: '**DECLARATION FOR COMMENCEMENT OF BUSINESS**', u: true },
      { p: '“**RESOLVED THAT** the Board hereby takes note and confirms that every subscriber to the Memorandum of Association of the Company has paid the value of the shares agreed to be taken by him / her, the details of which are as follows:' }, tbl,
      { p: '**RESOLVED FURTHER THAT** pursuant to Section 10A(1)(a) of the Companies Act, 2013 read with Rule 23A of the Companies (Incorporation) Rules, 2014, ' + authWho(x) + ' to sign and file the declaration for commencement of business in e-Form INC-20A with the Registrar of Companies within one hundred and eighty days of incorporation, along with the proof of payment of subscription money, and to do all such acts, deeds and things as may be necessary.”' }], true) });
    D.push({ id: 'decl', title: 'Declaration by Director — Commencement of Business', sub: 'Content of e-Form INC-20A — signed by the director', lh: LH_CO, build: () => [
      { p: 'DECLARATION FOR COMMENCEMENT OF BUSINESS', b: true, al: 'c', u: true }, { p: '[Pursuant to Section 10A(1)(a) of the Companies Act, 2013 and Rule 23A of the Companies (Incorporation) Rules, 2014]', al: 'c', sz: 20 }, { gap: 1 },
      { p: 'I, ' + v(x.d.name) + ', Director (DIN: ' + v(x.d.din) + ') of ' + c.name + ' (CIN: ' + v(c.cin) + '), incorporated on ' + ld(c.incDate) + ', do hereby declare that every subscriber to the Memorandum of Association of the Company has paid the value of the shares agreed to be taken by him / her, as under:', al: 'j' }, tbl,
      { p: 'The subscription money has been received in the bank account of the Company' + T(x, 'bankText', f.bank ? ' maintained with ' + f.bank : '') + '. The proof of payment is attached.', al: 'j' },
      ...sigCompany(x, f.declDate || f.bmDate)] });
    D.push({ id: 'inc20a', title: 'e-Form INC-20A Data Sheet & Checklist', sub: 'Internal', lh: LH_NONE, build: () => [
      ...sheetHead('e-FORM INC-20A — COMMENCEMENT OF BUSINESS — DATA SHEET & CHECKLIST', x), head('A. Company'), coTable(x),
      { tbl: [['Date of incorporation', sd(c.incDate)], ['Paid-up capital (Rs.)', v(c.paidCap)], ['Bank account', v(f.bank)]] },
      head('B. Due date'), { tbl: [['e-Form INC-20A to be filed by', '**' + sd(addDays(c.incDate, 180)) + '** (within 180 days of incorporation — Sec 10A(1))'], ['Penalty for default', 'Company Rs. 50,000; every officer in default Rs. 1,000 per day, up to Rs. 1,00,000 (Sec 10A(2)) — verify current amounts']] },
      head('C. Attachments'), ...numbered(['Proof of payment of subscription money by each subscriber (bank statement / receipts)', 'Certified true copy of the Board resolution (optional)']),
      head('D. Before filing'), ...numbered(['Applies to companies incorporated after 2 November 2018 having share capital.', 'Registered office verification (INC-22) should also be complete if not done at incorporation.', 'Professional certification / DSC as required by the form at the time of filing.']),
      stmtNote(WORKPAPER)] });
    return D;
  }

  /* =====================================================================
     RETURN OF DEPOSITS — DPT-3 (dpt3)
     ===================================================================== */
  function dpt3Docs(x) {
    const { c, f } = x, rows = cells(f.dptRows, 4), D = [];
    const dirLoans = rows.filter(r => /director|relative/i.test(r[0]));
    const tbl = { tbl: [['S. No.', 'Category (Rule 2(1)(c) of the Companies (Acceptance of Deposits) Rules, 2014)', 'Name of the party', 'Received during the year (Rs.)', 'Outstanding as on ' + sd(f.fyEnd) + ' (Rs.)'], ...(rows.length ? rows.map((r, i) => [String(i + 1), r[0], r[1], r[2] ? inr(num(r[2])) : '—', r[3] ? inr(num(r[3])) : '—']) : [['1', 'NIL', '', '', '']]), ['', '**Total**', '', '**' + inr(rows.reduce((s, r) => s + num(r[2]), 0)) + '**', '**' + inr(rows.reduce((s, r) => s + num(r[3]), 0)) + '**']], cols: [7, 33, 24, 18, 18], head: true };
    dirLoans.forEach((r, i) => {
      const d = (c.directors || []).find(dd => dd.name && r[1] && dd.name.toLowerCase() === r[1].toLowerCase()) || { name: r[1] };
      D.push({ id: 'decl' + i, title: 'Declaration by Lender — ' + (r[1] || 'Director'), sub: 'Rule 2(1)(c)(viii) — not out of borrowed funds', lh: LH_PLAIN, build: () => [
        { p: 'DECLARATION', b: true, al: 'c', u: true }, { p: '[Pursuant to Rule 2(1)(c)(viii) of the Companies (Acceptance of Deposits) Rules, 2014]', al: 'c', sz: 20 }, { gap: 1 }, ...toBoard(x),
        { p: 'I, ' + v(r[1]) + ', ' + (/relative/i.test(r[0]) ? 'a relative of a Director' : 'a Director') + ' of ' + c.name + ', hereby declare that the amount of Rs. ' + (r[3] ? inr(num(r[3])) : BL) + ' outstanding as on ' + ld(f.fyEnd) + ', given by me to the Company by way of loan, is not out of funds acquired by me by borrowing or accepting loans or deposits from others.', al: 'j' },
        ...sigPerson({ name: r[1], din: d.din, sign: d.sign }, f.declDate || f.fyEnd, f.place)] });
    });
    D.push({ id: 'stmt', title: 'Statement of Outstanding Receipts (not deposits)', sub: 'Rule 16A(3) — company letterhead', lh: LH_CO, build: () => [
      { p: 'STATEMENT OF OUTSTANDING RECEIPT OF MONEY OR LOAN NOT CONSIDERED AS DEPOSITS AS ON ' + ld(f.fyEnd).toUpperCase(), b: true, al: 'c' },
      { p: '[Pursuant to Rule 16A(3) of the Companies (Acceptance of Deposits) Rules, 2014]', al: 'c', sz: 20 },
      { p: 'The Company has not accepted any deposits within the meaning of Section 73 of the Companies Act, 2013. The particulars of money or loans received by the Company that are not considered as deposits in terms of Rule 2(1)(c), outstanding as on ' + ld(f.fyEnd) + ', are as follows:', al: 'j' }, tbl,
      ...sigCompany(x, f.declDate || f.fyEnd)] });
    if (f.audCert === 'yes') D.push({ id: 'audcert', title: 'Auditor’s Certificate for DPT-3', sub: 'From the statutory auditor — CA letterhead', lh: LH_CA, build: () => [
      { p: 'TO WHOMSOEVER IT MAY CONCERN', b: true, al: 'c', u: true }, { p: 'AUDITOR’S CERTIFICATE', b: true, al: 'c' },
      { p: 'We, ' + x.firmDesc + ', the Statutory Auditors of ' + c.name + ' (CIN: ' + v(c.cin) + '), have examined the books of account and other relevant records of the Company for the purpose of certifying the particulars of outstanding receipts of money or loans as on ' + ld(f.fyEnd) + ' for e-Form DPT-3.', al: 'j' },
      { p: 'Based on our examination and the information and explanations given to us, we certify that the Company has not accepted any deposits within the meaning of Section 73 of the Companies Act, 2013 and that the particulars of money or loans received and not considered as deposits under Rule 2(1)(c) of the Companies (Acceptance of Deposits) Rules, 2014, outstanding as on ' + ld(f.fyEnd) + ', are as under:', al: 'j' }, tbl,
      { p: 'This certificate is issued at the request of the Company for filing e-Form DPT-3 with the Registrar of Companies and should not be used for any other purpose.', al: 'j' },
      ...sigCA(x, f.declDate || f.fyEnd)] });
    D.push({ id: 'dpt3', title: 'e-Form DPT-3 Data Sheet & Checklist', sub: 'Internal — annual return of deposits / exempted receipts', lh: LH_NONE, build: () => [
      ...sheetHead('e-FORM DPT-3 — DATA SHEET & CHECKLIST — FY ' + fyLabel(f.fyEnd), x), head('A. Company'), coTable(x),
      { tbl: [['Paid-up capital (Rs.)', v(c.paidCap)], ['Net worth as on ' + sd(f.fyEnd) + ' (Rs.)', v(f.netWorth)], ['Type of return', 'Particulars of transactions not considered as deposits (Rule 16A(3))']] },
      head('B. Outstanding receipts'), tbl,
      head('C. Due date'), { tbl: [['e-Form DPT-3 to be filed by', '**' + (yr(f.fyEnd) ? '30/06/' + yr(f.fyEnd) : BL) + '** (on or before 30 June — Rule 16 / 16A)']] },
      head('D. Attachments'), ...numbered(['Auditor’s certificate (mandatory for return of deposits; attach for exempted receipts if required by the form)', 'List of lenders / particulars, if required', 'Declarations from directors / relatives for loans under Rule 2(1)(c)(viii) — keep on record']),
      head('E. Before filing'), ...numbered(['Figures must match the audited balance sheet as on ' + sd(f.fyEnd) + '.', 'Loans from directors’ relatives are exempt only for private companies (Rule 2(1)(c)(viii)).', 'Advances for supply of goods / services not adjusted within 365 days become deposits — check ageing.']),
      stmtNote(WORKPAPER)] });
    return D;
  }

  /* =====================================================================
     MSME-1 — DUES TO MICRO & SMALL ENTERPRISES (msme1)
     ===================================================================== */
  function msmeDocs(x) {
    const { c, f } = x, rows = cells(f.msmeRows, 6), y = num(f.msmeYear) || yr(addDays(new Date().toISOString().slice(0, 10), 0));
    const h1 = f.half !== 'h2', from = h1 ? (y - 1) + '-04-01' : (y - 1) + '-10-01', to = h1 ? (y - 1) + '-09-30' : y + '-03-31', due = h1 ? (y - 1) + '-10-31' : y + '-04-30';
    const tbl = { tbl: [['S. No.', 'Name of the supplier', 'PAN', 'Udyam Reg. No.', 'Amount due (Rs.)', 'Due since', 'Reason for delay'], ...(rows.length ? rows.map((r, i) => [String(i + 1), r[0], r[1] || '—', r[2] || '—', r[3] ? inr(num(r[3])) : '—', r[4] || '—', r[5] || '—']) : [['1', 'NIL', '', '', '', '', '']]), ['', '**Total**', '', '', '**' + inr(rows.reduce((s, r) => s + num(r[3]), 0)) + '**', '', '']], cols: [6, 22, 12, 16, 13, 12, 19], head: true };
    return [{ id: 'msmestmt', title: 'Statement of Outstanding Dues to MSE Suppliers', sub: 'Half year ' + sd(from) + ' to ' + sd(to), lh: LH_CO, build: () => [
      { p: 'STATEMENT OF OUTSTANDING PAYMENTS TO MICRO AND SMALL ENTERPRISE SUPPLIERS', b: true, al: 'c' }, { p: T(x, 'halfYearPeriod', 'For the half year from ' + ld(from) + ' to ' + ld(to)), al: 'c' },
      { p: 'Pursuant to Section 405 of the Companies Act, 2013 read with the Specified Companies (Furnishing of information about payment to micro and small enterprise suppliers) Order, 2019, the details of amounts due to micro and small enterprise suppliers which remained unpaid for more than forty-five days from the date of acceptance or deemed acceptance of the goods or services (Section 9 of the MSMED Act, 2006) are as follows:', al: 'j' }, tbl,
      ...sigCompany(x, f.declDate || to)] },
    { id: 'msme1', title: 'e-Form MSME-1 Data Sheet & Checklist', sub: 'Internal — half-yearly return', lh: LH_NONE, build: () => [
      ...sheetHead('e-FORM MSME-1 — DATA SHEET & CHECKLIST', x), head('A. Company'), coTable(x),
      { tbl: [['Period', sd(from) + ' to ' + sd(to)], ['Total amount outstanding (Rs.)', inr(rows.reduce((s, r) => s + num(r[3]), 0))], ['Number of suppliers', String(rows.length)]] },
      head('B. Due date'), { tbl: [['e-Form MSME-1 to be filed by', '**' + sd(due) + '** (' + (h1 ? '31 October for April–September' : '30 April for October–March') + ')']] },
      head('C. Checklist'), ...numbered(['File only if any amount due to a micro / small enterprise supplier is outstanding for more than 45 days; otherwise no filing is required.', 'Verify each supplier’s Udyam registration and whether it is a micro or small (not medium) enterprise.', 'Interest under Section 16 of the MSMED Act is payable on delayed payments; disclose in the financial statements.', 'Income-tax: unpaid MSE dues beyond the agreed period are disallowed under Section 43B(h) — inform the client.']),
      stmtNote(WORKPAPER)] }];
  }

  /* =====================================================================
     STRIKE OFF — STK-2 (stk2)
     ===================================================================== */
  function stk2Docs(x) {
    const { c, f } = x, D = [], dirs = (c.directors || []).filter(d => d.name);
    const ground = T(x, 'strikeOffGround', f.ground === 'nocomm' ? 'has not commenced its business since its incorporation' : 'has not been carrying on any business or operation for a period of two immediately preceding financial years and has not made any application within such period for obtaining the status of a dormant company under Section 455');
    const special = [{ p: '“**RESOLVED THAT** pursuant to the provisions of Section 248(2) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Removal of Names of Companies from the Register of Companies) Rules, 2016 ' + STAT + ', and since the Company ' + ground + ', and has extinguished all its liabilities, the consent of the members be and is hereby accorded to make an application to the Registrar of Companies for removing the name of the Company from the Register of Companies.' },
      { p: '**RESOLVED FURTHER THAT** the Board of Directors of the Company be and is hereby authorised to file e-Form STK-2 along with the indemnity bonds (STK-3), affidavits (STK-4), statement of accounts and other documents, and to do all such acts, deeds and things as may be necessary to give effect to this resolution.”' }];
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To consider the proposal for removal of the name of the Company from the Register of Companies under Section 248(2) of the Companies Act, 2013.', 'To approve the statement of accounts as on ' + ld(f.accDate) + '.', 'To approve the Notice of the Extraordinary General Meeting.', 'Any other business with the permission of the Chairperson.']));
    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolution', sub: 'Proposal for strike off — Sec 248(2)', lh: LH_CO, build: () => ctcBoard(x, 'bm', [
      { p: '**1. PROPOSAL FOR REMOVAL OF NAME OF THE COMPANY FROM THE REGISTER OF COMPANIES**', u: true },
      { p: '“**RESOLVED THAT** the Company ' + ground + ' and has no assets or liabilities as per the statement of accounts as on ' + ld(f.accDate) + ', which is hereby approved; and the Board hereby recommends to the members that an application be made to the Registrar of Companies under Section 248(2) of the Companies Act, 2013 for removing the name of the Company from the Register of Companies.' },
      { p: '**RESOLVED FURTHER THAT** every Director of the Company be and is hereby authorised to execute the indemnity bond in Form STK-3 and the affidavit in Form STK-4, and that ' + authWho(x) + ' to sign and file e-Form STK-2.”' },
      { p: '**2. CONVENING OF EXTRAORDINARY GENERAL MEETING**', u: true },
      { p: '“**RESOLVED THAT** an Extraordinary General Meeting of the members of the Company be held on ' + dayName(f.egmDate) + ', ' + ld(f.egmDate) + ' at ' + tm(f.egmTime) + ' at ' + oneLine(x.venue(f.egmVenue)) + ', and the draft Notice along with the Explanatory Statement, as placed before the Board, be and is hereby approved.”' }]) });
    D.push(...egmDocs(x, 'Removal of the name of the Company from the Register of Companies under Section 248(2)', special,
      ['The Company ' + ground + '. The Company has no assets and has extinguished all its liabilities. The Board of Directors at its meeting held on ' + ld(f.bmDate) + ' decided to apply to the Registrar of Companies for the removal of the name of the Company from the Register of Companies under Section 248(2) of the Companies Act, 2013.', 'Such an application requires a special resolution of the members, or the consent of seventy-five per cent of the members in terms of paid-up share capital.'], 'special'));
    D.push({ id: 'stk3', title: 'Form STK-3 — Indemnity Bonds (one per director)', sub: 'Rule 4(3)(i) — on stamp paper, notarised', lh: LH_PLAIN, build: () => {
      const out = [];
      (dirs.length ? dirs : [{}]).forEach((d, i) => {
        if (i) out.push({ pb: true });
        out.push(...formHead('FORM STK-3', 'Indemnity Bond', 'Pursuant to Section 248(2) of the Companies Act, 2013 and Rule 4(3)(i) of the Companies (Removal of Names of Companies from the Register of Companies) Rules, 2016'),
          { p: '(To be given individually by every director, on non-judicial stamp paper of the value prescribed under the State Stamp Act, and notarised)', al: 'c', sz: 18 },
          { p: 'KNOW ALL MEN BY THESE PRESENTS that I, ' + v(d.name) + ' (DIN: ' + v(d.din) + '), son / daughter of ____________, resident of ____________________, a Director of ' + c.name + ' (CIN: ' + v(c.cin) + '), do hereby indemnify the Registrar of Companies, the Central Government and any person who may suffer any loss or damage arising out of the striking off of the name of the Company from the Register of Companies.', al: 'j' },
          { p: 'I undertake to pay and discharge all liabilities and obligations of the Company, if any, which may come to notice after the name of the Company has been struck off, and to indemnify any person for any loss that may arise pursuant to the removal of the name of the Company from the Register of Companies.', al: 'j' },
          { p: 'IN WITNESS WHEREOF I have signed this Indemnity Bond on ' + ld(f.bondDate || f.egmDate) + ' at ' + v(f.place) + '.', al: 'j' },
          ...sigPerson({ name: d.name, din: d.din, sign: d.sign }, f.bondDate || f.egmDate, f.place),
          { gap: 1 }, { tbl: [['Witness 1 — name, address & signature', ''], ['Witness 2 — name, address & signature', '']] });
      });
      return out;
    } });
    D.push({ id: 'stk4', title: 'Form STK-4 — Affidavits (one per director)', sub: 'Rule 4(3)(ii) — on stamp paper, notarised', lh: LH_PLAIN, build: () => {
      const out = [];
      (dirs.length ? dirs : [{}]).forEach((d, i) => {
        if (i) out.push({ pb: true });
        out.push(...formHead('FORM STK-4', 'Affidavit', 'Pursuant to Section 248(2) of the Companies Act, 2013 and Rule 4(3)(ii) of the Companies (Removal of Names of Companies from the Register of Companies) Rules, 2016'),
          { p: '(To be given by every director individually, on non-judicial stamp paper, and notarised)', al: 'c', sz: 18 },
          { p: 'I, ' + v(d.name) + ' (DIN: ' + v(d.din) + '), son / daughter of ____________, resident of ____________________, Director of ' + c.name + ' (CIN: ' + v(c.cin) + '), do solemnly affirm and declare that:', al: 'j' },
          ...lettered(['the Company ' + ground + ';', 'the Company has no assets and liabilities as on the date of the application;', 'the Company has not, within the last three months, changed its name or shifted its registered office from one State to another, made a disposal for value of property or rights held by it immediately before cessation of trading, or engaged in any other activity except as required for making the application (Section 249(1));', 'no inquiry, inspection, investigation or prosecution is pending against the Company, and the Company is not the subject of an application for compromise or arrangement or of winding-up proceedings;', 'the Company is not a listed company, is not a Section 8 company, and is not a company covered under Rule 3 of the said Rules which cannot apply for removal of its name; and', 'the contents of the application and the documents attached are true and correct.']),
          { p: 'DEPONENT', b: true, al: 'r' }, ...sigPerson({ name: d.name, din: d.din, sign: d.sign }, f.bondDate || f.egmDate, f.place),
          { p: 'VERIFICATION', b: true }, { p: 'Verified at ' + v(f.place) + ' on ' + ld(f.bondDate || f.egmDate) + ' that the contents of the above affidavit are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.', al: 'j' }, { gap: 1 }, { p: 'DEPONENT', b: true, al: 'r' });
      });
      return out;
    } });
    D.push({ id: 'stk8', title: 'Statement of Accounts (assets & liabilities) — CA certified', sub: 'Rule 4(3)(iii) — not older than 30 days', lh: LH_CA, build: () => {
      const items = cells(f.stkItems, 2);
      return [{ p: 'STATEMENT OF ACCOUNTS OF ' + c.name.toUpperCase() + ' AS ON ' + ld(f.accDate).toUpperCase(), b: true, al: 'c' }, { p: '(CIN: ' + v(c.cin) + ')', al: 'c' },
        { tbl: [['Particulars', 'Amount (Rs.)'], ...(items.length ? items.map(r => [r[0], r[1] ? inr(num(r[1])) : 'Nil']) : [['Assets', 'Nil'], ['Liabilities', 'Nil'], ['Paid-up share capital', v(c.paidCap)], ['Accumulated profit / (loss)', BL]])], head: true },
        { p: 'We have examined the books of account and other records of the Company and certify that the above statement of accounts as on ' + ld(f.accDate) + ' is true and correct, and that the Company has no assets and liabilities as on that date.', al: 'j' },
        ...sigCA(x, f.accDate), { gap: 1 }, { p: 'Approved by the Board of Directors', b: true }, ...sigCompany(x, f.accDate)];
    } });
    D.push({ id: 'stk2', title: 'e-Form STK-2 Data Sheet & Checklist', sub: 'Internal — application for removal of name', lh: LH_NONE, build: () => [
      ...sheetHead('e-FORM STK-2 — STRIKE OFF — DATA SHEET & CHECKLIST', x), head('A. Company'), coTable(x),
      { tbl: [['Ground', f.ground === 'nocomm' ? 'Not commenced business since incorporation' : 'No business / operation for two immediately preceding financial years'], ['Date of Board meeting', sd(f.bmDate)], ['Date of special resolution (EGM)', sd(f.egmDate)], ['Statement of accounts as on', sd(f.accDate) + ' (must be within 30 days of filing)'], ['Bank account closed on', sd(f.bankClosed)]] },
      head('B. Attachments to STK-2'), ...numbered(['Indemnity bond in Form STK-3 from every director (notarised, on stamp paper)', 'Affidavit in Form STK-4 from every director (notarised, on stamp paper)', 'Statement of accounts certified by a Chartered Accountant (not older than 30 days)', 'Certified true copy of the special resolution (or consent of 75% members by paid-up capital)', 'Statement regarding pending litigations, if any', 'Bank account closure certificate / bank statement']),
      head('C. Before filing'), ...numbered(['All overdue e-Forms AOC-4 and MGT-7 / 7A up to the end of the financial year in which the company ceased business must be filed first.', 'File MGT-14 for the special resolution within 30 days (Sec 117).', 'Cancel GST registration and close the bank account; settle all statutory dues.', 'No pending charge (CHG-4 for satisfaction filed); DIR-3 KYC of directors active.', 'Fee for STK-2 as prescribed (currently Rs. 10,000 — verify).']),
      stmtNote(WORKPAPER)] });
    return D;
  }

  /* =====================================================================
     LLP ANNUAL FILING — FORM 8 & FORM 11 (llp)
     ===================================================================== */
  function llpDocs(x) {
    const { c, f } = x, D = [];
    const parts = cells(f.partners, 4).length ? cells(f.partners, 4) : (c.directors || []).filter(d => d.name).map(d => [d.name, d.din, 'Yes', '']);
    const totC = parts.reduce((s, r) => s + num(r[3]), 0), y = yr(f.fyEnd);
    const dps = parts.filter(r => !/^n/i.test(r[2]));
    const ptbl = { tbl: [['S. No.', 'Name of partner', 'DPIN / DIN / PAN', 'Designated partner', 'Contribution (Rs.)'], ...parts.map((r, i) => [String(i + 1), r[0], r[1] || '—', /^n/i.test(r[2]) ? 'No' : 'Yes', r[3] ? inr(num(r[3])) : '—']), ['', '**Total**', '', '', '**' + inr(totC) + '**']], cols: [7, 35, 20, 16, 22], head: true };
    const audit = num(f.turnover) > 4000000 || totC > 2500000;
    D.push({ id: 'llpres', title: 'Resolution of Partners — Approval of Accounts & Annual Return', sub: 'Rule 24 & 25 of LLP Rules, 2009', lh: LH_CO, build: () => [
      { p: 'CERTIFIED TRUE COPY OF THE RESOLUTION PASSED BY THE PARTNERS OF ' + c.name.toUpperCase() + ' (LLPIN: ' + v(c.cin) + ') ON ' + ld(f.approveDate).toUpperCase() + ' AT ' + oneLine(c.addr).toUpperCase(), b: true, al: 'j' }, { gap: 1 },
      { p: '“**RESOLVED THAT** the Statement of Account and Solvency of the Limited Liability Partnership for the financial year ended ' + ld(f.fyEnd) + ', comprising the Statement of Assets and Liabilities as at that date and the Statement of Income and Expenditure for the year ended on that date' + (audit ? ', together with the Auditors’ Report thereon' : '') + ', as placed before the partners, be and is hereby approved, and that the designated partners be and are hereby authorised to sign the same in terms of Rule 24 of the Limited Liability Partnership Rules, 2009.', al: 'j' },
      { p: '**RESOLVED FURTHER THAT** the designated partners be and are hereby severally authorised to file Form 11 (Annual Return) and Form 8 (Statement of Account & Solvency) with the Registrar of Companies within the prescribed time, and to do all such acts, deeds and things as may be necessary in this regard.”', al: 'j' },
      { p: 'Certified True Copy', b: true }, { gap: 1 }, { p: 'For ' + c.name, b: true }, ...signRow(x, [x.d, x.d2.name ? x.d2 : {}]), { p: 'Designated Partners', after: 0 }, { p: 'Place: ' + v(f.place), after: 0 }, { p: 'Date: ' + ld(f.approveDate) }] });
    D.push({ id: 'solvency', title: 'Statement of Solvency (Form 8 — Part A)', sub: 'Signed by two designated partners', lh: LH_CO, build: () => [
      { p: 'STATEMENT OF SOLVENCY', b: true, al: 'c', u: true }, { p: '[Pursuant to Section 34 of the Limited Liability Partnership Act, 2008 and Rule 24 of the LLP Rules, 2009]', al: 'c', sz: 20 }, { gap: 1 },
      { p: 'The designated partners of ' + c.name + ' (LLPIN: ' + v(c.cin) + ') hereby state that, for the financial year ended ' + ld(f.fyEnd) + ':', al: 'j' },
      ...lettered([f.solvent === 'no' ? 'the Limited Liability Partnership is NOT able to meet its liabilities (both contingent and otherwise) in full as they become due in the normal course of business;' : 'the Limited Liability Partnership is able to meet its liabilities (both contingent and otherwise) in full as they become due in the normal course of business;',
        'the Statement of Account and Solvency has been prepared in accordance with the books of account maintained under Section 34 of the Act and gives a true and fair view of the state of affairs of the Limited Liability Partnership;', 'the turnover of the Limited Liability Partnership for the year was Rs. ' + T(x, 'turnover', f.turnover ? inr(num(f.turnover)) : BL) + ' and the total contribution of the partners was Rs. ' + T(x, 'totalContribution', inr(totC)) + '.']),
      { gap: 1 }, { p: 'For ' + c.name, b: true }, ...signRow(x, [x.d, x.d2.name ? x.d2 : {}]), { p: 'Designated Partners', after: 0 }, { p: 'Place: ' + v(f.place), after: 0 }, { p: 'Date: ' + ld(f.approveDate) }] });
    D.push({ id: 'llpsheet', title: 'Form 11 & Form 8 Data Sheet & Checklist', sub: 'Internal — LLP annual filing', lh: LH_NONE, build: () => [
      ...sheetHead('LLP FORM 11 & FORM 8 — DATA SHEET & CHECKLIST — FY ' + fyLabel(f.fyEnd), x), head('A. LLP'), coTable(x),
      head('B. Partners and contribution (Form 11)'), ptbl,
      { tbl: [['Number of partners / designated partners', parts.length + ' / ' + dps.length], ['Changes in partners during the year', f.partnerChanges || 'None'], ['Turnover (Rs.)', f.turnover ? inr(num(f.turnover)) : BL], ['Total contribution (Rs.)', inr(totC)], ['Audit of accounts required?', audit ? 'Yes — turnover > Rs. 40 lakh or contribution > Rs. 25 lakh (Rule 24(8))' : 'No (turnover ≤ Rs. 40 lakh and contribution ≤ Rs. 25 lakh)']] },
      head('C. Due dates'), { tbl: [['Form 11 (Annual Return)', '**' + (y ? '30/05/' + y : BL) + '** (within 60 days of the end of the financial year — Rule 25)'], ['Form 8 (Statement of Account & Solvency)', '**' + (y ? '30/10/' + y : BL) + '** (within 30 days from the end of six months of the financial year — Rule 24)']] },
      head('D. Checklist'), ...numbered(['Form 11 needs certification by a Company Secretary in practice if total contribution exceeds Rs. 50 lakh or turnover exceeds Rs. 5 crore.', 'Form 8 is signed by two designated partners and certified as required by the form (CA / CS / CMA in practice); attach the auditors’ report if audit is required.', 'Check DIR-3 KYC of all designated partners and the DSC of the signing partners.', 'Additional fee applies at Rs. 100 per day of delay for each form — verify current rules.']),
      stmtNote(WORKPAPER)] });
    return D;
  }

  /* =====================================================================
     STATUTORY REGISTERS (registers)
     ===================================================================== */
  function registerDocs(x) {
    const { c, f } = x, fv = num(c.faceValue) || 10;
    let dn = 1;
    const mem = (c.shareholders || []).filter(h => h.name).map((h, i) => { const n = num(h.shares), r = [String(i + 1), h.folio || '', h.name, '', '', '', h.cat || '', '', inr(n), n ? inr(dn) + ' – ' + inr(dn + n - 1) : '', inr(n * fv), '', '']; dn += n; return r; });
    return [{ id: 'mgt1', title: 'Register of Members — Form MGT-1', sub: 'Sec 88 & Rule 3 — pre-filled from client master', lh: LH_NONE, landscape: true, build: () => [
      ...formHead('Form No. MGT-1', 'Register of Members', 'Pursuant to Section 88(1)(a) of the Companies Act, 2013 and Rule 3(1) of the Companies (Management and Administration) Rules, 2014'),
      { p: c.name + ' (CIN: ' + v(c.cin) + ') — Equity shares of Rs. ' + inr(fv) + '/- each — as on ' + ld(f.asOn || new Date().toISOString().slice(0, 10)), al: 'c', b: true },
      { tbl: [['S. No.', 'Folio No.', 'Name of the member', 'Address / e-mail', 'PAN / CIN', 'Father’s / spouse’s name', 'Category / status', 'Date of becoming member', 'No. of shares', 'Distinctive nos.', 'Amount paid (Rs.)', 'Date of cessation', 'Remarks'], ...(mem.length ? mem : [['1', '', '', '', '', '', '', '', '', '', '', '', '']])], cols: [4, 5, 12, 14, 8, 10, 7, 8, 7, 9, 7, 6, 7], head: true },
      stmtNote('Columns not available in the portal are left blank — complete them from the company records. Keep the register at the registered office (Sec 94).')] },
    { id: 'regdir', title: 'Register of Directors and KMP', sub: 'Sec 170 & Rule 17 — pre-filled from client master', lh: LH_NONE, landscape: true, build: () => [
      { p: 'REGISTER OF DIRECTORS AND KEY MANAGERIAL PERSONNEL AND THEIR SHAREHOLDING', b: true, al: 'c' }, { p: '[Pursuant to Section 170(1) of the Companies Act, 2013 and Rule 17 of the Companies (Appointment and Qualification of Directors) Rules, 2014]', al: 'c', sz: 20 },
      { p: c.name + ' (CIN: ' + v(c.cin) + ')', al: 'c', b: true },
      { tbl: [['S. No.', 'DIN / PAN', 'Full name', 'Father’s / spouse’s name', 'Residential address', 'Date of birth', 'Nationality', 'Occupation', 'Designation', 'Date of appointment', 'Date of cessation', 'Shares held', 'Remarks'],
        ...(c.directors || []).map((d, i) => { const h = (c.shareholders || []).find(s => s.name && d.name && s.name.toLowerCase() === d.name.toLowerCase()); return [String(i + 1), d.din || '', d.name, '', '', '', 'Indian', '', d.desig || 'Director', '', '', h ? inr(num(h.shares)) : '', '']; }),
        ...(c.csName ? [[String((c.directors || []).length + 1), '', c.csName, '', '', '', 'Indian', '', 'Company Secretary (' + (c.csMno || '') + ')', '', '', '', '']] : [])], cols: [4, 8, 11, 10, 14, 7, 6, 7, 8, 7, 6, 6, 6], head: true },
      stmtNote('Columns not available in the portal are left blank — complete them from DIR-2 / DIR-12 records.')] }];
  }

  /* =====================================================================
     YEARLY SECRETARIAL RECORDS (yearly) — Board meetings, notices, minutes, AGM minutes, registers
     ===================================================================== */
  function meetingsBefore(c, fyEnd, count) {
    if (!c.incDate || !fyEnd) return 0;
    let n = 0;
    for (let e = firstFYEnd(c.incDate), k = 0; e && e < fyEnd && k < 30; e = addMonths(e, 12), k++) n += fyMeetings(c, e, { count }).length;
    return n;
  }
  function yearlyDocs(x) {
    const { c, f } = x, dirs = (c.directors || []).filter(d => d.name), D = [];
    const fyE = x.fyEnd, first = isFirstFY(c, fyE), from = fyFromOf(c, fyE), FYL = 'FY ' + fyLabel(fyE);
    const chair = dirs[parseInt(f.chair, 10) || 0] || dirs[0] || {};
    const dates = x.bms.length ? x.bms : fyMeetings(c, fyE, { count: f.bmCount, accounts: f.accBm }).map(o => o.date);
    const base = meetingsBefore(c, fyE, f.bmCount);
    const prevEnd = fyE ? addMonths(fyE, -12) : '', prevLast = first ? '' : (fyMeetings(c, prevEnd, { count: f.bmCount }).slice(-1)[0] || {}).date || '';
    const agmNo = parseInt(f.prevAgmNo, 10) || 0, hasAgm = !first && !!f.agmDate;
    const audAtAgm = hasAgm && agmNo > 0 && (agmNo - 1) % 5 === 0; // auditors are appointed at the 1st, 6th, 11th … AGM (Sec 139(1))
    const venue = x.venue(f.bmVenue), time = f.bmTime || '11:00', agmVenue = x.venue(f.agmVenue), agmTime = f.agmTime || '11:00';
    const prevRet = x.small ? 'MGT-7A' : 'MGT-7', nextFY = fyE ? fyLabel(addMonths(fyE, 12)) : BL;
    const dirNames = dirs.map(d => d.name + (d.din ? ' (DIN: ' + d.din + ')' : '')).join(', ').replace(/, ([^,]*)$/, ' and $1') || BL;
    const kindOf = (d, i) => (first && i === 0) ? 'first' : (f.accBm && d === f.accBm) ? 'accounts' : (() => { const m = pd(d).getUTCMonth() + 1; return m >= 4 && m <= 7 ? 'q1' : m >= 10 && m <= 12 ? 'h1' : m <= 3 ? 'yearend' : 'review'; })();
    const M = dates.map((d, i) => ({ i, no: base + i + 1, date: d, notice: defBmNotice(d), kind: kindOf(d, i), prev: i ? dates[i - 1] : prevLast }));
    const KIND = { first: 'First Board meeting after incorporation', accounts: 'Approval of accounts of FY ' + fyLabel(prevEnd) + ' & convening of AGM', q1: 'First-quarter review', h1: 'Half-yearly review', yearend: 'Year-end review & plan for next year', review: 'Review of business' };
    const R = t => ({ res: t }); // resolution text
    // business of each meeting: {t: heading, ag: agenda line, min: minutes text | res: resolution}
    const business = m => {
      const L = [];
      L.push({ t: 'Chairperson of the meeting', ag: 'To elect the Chairperson of the meeting.', min: chair.name ? v(chair.name) + ', Director, was unanimously elected as the Chairperson of the meeting and took the Chair.' : BL + ' was elected as the Chairperson of the meeting.' });
      L.push({ t: 'Quorum', min: 'The Chairperson confirmed that the requisite quorum was present throughout the meeting in terms of Section 174 of the Companies Act, 2013, and called the meeting to order.' });
      L.push({ t: 'Leave of absence', ag: 'To grant leave of absence, if any.', min: 'All the Directors were present at the meeting. No request for leave of absence was received.' });
      if (m.prev) L.push({ t: 'Confirmation of the minutes of the previous meeting', ag: 'To confirm the minutes of the previous meeting of the Board held on ' + ld(m.prev) + '.', min: 'The minutes of the previous meeting of the Board of Directors held on ' + ld(m.prev) + ', as circulated, were taken as read, confirmed and signed by the Chairperson.' });
      if (m.kind === 'first') {
        L.push({ t: 'Certificate of Incorporation', ag: 'To take note of the Certificate of Incorporation of the Company.', min: 'The Board took note of the Certificate of Incorporation dated ' + ld(c.incDate) + ' issued by the Registrar of Companies, Central Registration Centre, bearing Corporate Identity Number ' + v(c.cin) + '.' });
        L.push({ t: 'Memorandum and Articles of Association', ag: 'To take note of the Memorandum and Articles of Association of the Company.', min: 'The Board took note of the Memorandum and Articles of Association of the Company as registered with the Registrar of Companies.' });
        L.push({ t: 'First Directors and registered office', ag: 'To take note of the first Directors and the situation of the registered office.', min: 'The Board noted that ' + dirNames + ' are the first Directors of the Company in terms of its Articles of Association, and that the registered office of the Company is situated at ' + oneLine(c.addr) + '.' });
        L.push({ t: 'Appointment of first Statutory Auditors', ag: 'To appoint the first Statutory Auditors of the Company under Section 139(6) of the Companies Act, 2013.',
          res: '“**RESOLVED THAT** pursuant to Section 139(6) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014 ' + STAT + ', and on the basis of the written consent and certificate of eligibility received under Sections 139(1) and 141 of the Act, ' + x.firmDesc + ', be and are hereby appointed as the first Statutory Auditors of the Company to hold office from the conclusion of this meeting till the conclusion of the first Annual General Meeting of the Company, ' + x.remun + '.\n**RESOLVED FURTHER THAT** ' + authWho(x) + ' to intimate the Auditors and to file e-Form ADT-1 with the Registrar of Companies.”' });
        L.push({ t: 'Financial year', ag: 'To take note of the first financial year of the Company.', min: 'The Board noted that, in terms of Section 2(41) of the Companies Act, 2013, the first financial year of the Company is from ' + ld(from) + ' to ' + ld(fyE) + ', and each subsequent financial year shall be from 1st April to 31st March.' });
        L.push({ t: 'Opening of bank account', ag: 'To open a bank account in the name of the Company.', res: '“**RESOLVED THAT** a current account be opened in the name of the Company with ____________ Bank, ____________ Branch, and that ' + authWho(x) + ' to sign the account opening forms and to operate the said account, and the Bank be furnished with a certified copy of this resolution.”' });
        L.push({ t: 'Issue of share certificates to subscribers', ag: 'To issue share certificates to the subscribers to the Memorandum of Association.', res: '“**RESOLVED THAT** share certificates in Form SH-1 be issued to the subscribers to the Memorandum of Association for the shares subscribed by them, within two months from the date of incorporation in terms of Section 56(4)(a) of the Companies Act, 2013, under the signature of two Directors.”' });
        L.push({ t: 'Commencement of business', ag: 'To take note of the requirement of filing the declaration for commencement of business.', min: 'The Board noted that the declaration for commencement of business in e-Form INC-20A is to be filed within 180 days of incorporation, i.e. by ' + ld(addDays(c.incDate, 180)) + ', after the subscribers have paid the value of the shares agreed to be taken by them (Section 10A).' });
      }
      if (m.i === 0) L.push({ t: 'Disclosures by Directors', ag: 'To take note of the disclosures of interest in Form MBP-1 and the declarations in Form DIR-8 received from the Directors.', min: 'The Board took note of the disclosures of interest in Form MBP-1 under Section 184(1) of the Companies Act, 2013 and the intimations in Form DIR-8 under Section 164(2) of the Act received from ' + dirNames + ' for the financial year ' + fyLabel(fyE) + '. None of the Directors is disqualified from being appointed as a Director.' });
      if (m.kind === 'accounts') {
        const ap = 'the ' + (isFirstFY(c, prevEnd) ? 'period' : 'financial year') + ' ended ' + ld(prevEnd);
        L.push({ t: 'Approval of the audited financial statements for ' + ap, ag: 'To consider and approve the audited financial statements of the Company for ' + ap + ', together with the Auditors’ Report thereon.',
          res: '“**RESOLVED THAT** pursuant to Section 134 of the Companies Act, 2013, the audited financial statements of the Company for ' + ap + ', comprising the Balance Sheet, the Statement of Profit and Loss' + (x.small ? '' : ', the Cash Flow Statement') + ' and the notes thereto, together with the Auditors’ Report thereon, as placed before the Board, be and are hereby approved, and that the same be signed by two Directors on behalf of the Board in terms of Section 134(1) of the Act.”' });
        L.push({ t: 'Approval of the Board’s Report', ag: 'To consider and approve the Board’s Report for ' + ap + '.', res: '“**RESOLVED THAT** the Board’s Report for ' + ap + ', prepared in accordance with Section 134(3) of the Companies Act, 2013, as placed before the Board, be and is hereby approved, and the Chairperson / any two Directors be and are hereby authorised to sign the same in terms of Section 134(6) of the Act.”' });
        L.push({ t: 'Convening of the ' + ord(agmNo) + ' Annual General Meeting', ag: 'To fix the date, time and venue of the ' + ord(agmNo) + ' Annual General Meeting and to approve the Notice thereof.',
          res: '“**RESOLVED THAT** the ' + ord(agmNo) + ' Annual General Meeting of the members of the Company be held on ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(agmTime) + ' at ' + oneLine(agmVenue) + ', and the draft Notice convening the said meeting, as placed before the Board, be and is hereby approved.\n**RESOLVED FURTHER THAT** ' + authWho(x) + ' to sign and issue the Notice to the members, Directors and Auditors of the Company.”' });
        if (audAtAgm) L.push({ t: 'Recommendation for appointment of Statutory Auditors', ag: 'To recommend to the members the appointment of Statutory Auditors for a term of five years.',
          res: '“**RESOLVED THAT** pursuant to Section 139(1) of the Companies Act, 2013 and the Rules made thereunder, and on the basis of the written consent and certificate of eligibility received, the Board recommends to the members the appointment of ' + x.firmDesc + ', as the Statutory Auditors of the Company for a term of five consecutive years, to hold office from the conclusion of the ' + ord(agmNo) + ' Annual General Meeting till the conclusion of the ' + ord(agmNo + 5) + ' Annual General Meeting, and that the same be included in the Notice of the ' + ord(agmNo) + ' Annual General Meeting.”' });
        L.push({ t: 'Authorisation for annual filings', ag: 'To authorise the filing of e-Forms AOC-4 and ' + prevRet + ' with the Registrar of Companies.', res: '“**RESOLVED THAT** any Director of the Company be and is hereby severally authorised to sign and file e-Form AOC-4 and e-Form ' + prevRet + ' for ' + ap + ' with the Registrar of Companies within the time prescribed under Sections 137 and 92 of the Companies Act, 2013.”' });
      }
      if (m.kind === 'q1') {
        L.push({ t: 'Review of business', ag: 'To review the business performance of the Company.', min: 'The Board reviewed the business operations and the financial performance of the Company for the period from 1st April' + (yr(m.date) ? ', ' + yr(m.date) : '') + ' up to the date of the meeting, and discussed the plans for the year.' });
        if (!first) L.push({ t: 'Statutory compliances', ag: 'To take note of the statutory compliances for the year.', min: 'The Board took note of the filing of e-Form DPT-3 for the financial year ' + fyLabel(prevEnd) + ' (due by 30th June), e-Form MSME-1 for October–March (due by 30th April, if applicable) and the DIR-3 KYC of all the Directors (due by 30th September).' });
      }
      if (m.kind === 'h1') {
        L.push({ t: 'Review of half-yearly performance', ag: 'To review the performance of the Company for the half-year ended 30th September.', min: 'The Board reviewed the financial performance of the Company for the half-year ended 30th September' + (yr(m.date) ? ', ' + yr(m.date) : '') + ' and expressed satisfaction with the progress made.' });
        L.push({ t: 'Statutory compliances', ag: 'To take note of the status of statutory filings.', min: (hasAgm ? 'The Board took note of the filing of e-Forms AOC-4 and ' + prevRet + ' for the financial year ' + fyLabel(prevEnd) + ' with the Registrar of Companies, ' : 'The Board took note of the status of statutory filings, ') + 'and of e-Form MSME-1 for April–September (due by 31st October, if applicable).' });
      }
      if (m.kind === 'yearend') L.push({ t: 'Review of performance and plan for the next year', ag: 'To review the performance of the Company and to consider the business plan for the financial year ' + nextFY + '.', min: 'The Board reviewed the performance of the Company during the financial year ' + fyLabel(fyE) + ' and discussed the business plan and budget for the financial year ' + nextFY + '.' });
      if (m.kind === 'review') L.push({ t: 'Review of business', ag: 'To review the business operations of the Company.', min: 'The Board reviewed the business operations of the Company and the status of statutory compliances.' });
      L.push({ t: 'Any other business', ag: 'Any other business with the permission of the Chairperson.', min: 'No other business was transacted.' });
      return L;
    };
    const title = m => ord(m.no).toUpperCase() + ' MEETING OF THE BOARD OF DIRECTORS';

    D.push({ id: 'ycal', title: 'Meeting Calendar & Compliance Summary — ' + FYL, sub: 'Internal — dates of all Board meetings and the AGM', lh: LH_NONE, build: () => {
      const gaps = M.map((m, i) => i ? Math.round((pd(m.date) - pd(M[i - 1].date)) / 864e5) : (m.prev ? Math.round((pd(m.date) - pd(m.prev)) / 864e5) : null));
      const need = x.isOPC ? 1 : String(f.bmCount) === '2' ? 2 : 4;
      return [{ p: 'BOARD MEETINGS & AGM — ' + FYL, b: true, al: 'c', sz: 28 }, { p: c.name + ' (CIN: ' + v(c.cin) + ') — ' + ld(from) + ' to ' + ld(fyE), al: 'c' },
        { tbl: [['S. No.', 'Meeting No.', 'Date', 'Day', 'Notice by', 'Days since last', 'Main business'], ...M.map((m, i) => [String(i + 1), ord(m.no), sd(m.date), dayName(m.date), sd(m.notice), gaps[i] == null ? '—' : String(gaps[i]), KIND[m.kind]]),
          ...(hasAgm ? [['AGM', ord(agmNo) + ' AGM', sd(f.agmDate), dayName(f.agmDate), sd(defAgmNotice(f.agmDate)), '—', 'Adoption of accounts of FY ' + fyLabel(prevEnd) + (audAtAgm ? '; appointment of auditors for 5 years' : '')]] : [])], cols: [6, 10, 12, 13, 12, 9, 38], head: true },
        head('Checks'), ...numbered([
          'Board meetings in the year: ' + M.length + ' (minimum ' + (x.isOPC ? 'one in each half of the calendar year for an OPC / small company, at least 90 days apart — Sec 173(5)' : need === 2 ? 'one in each half of the calendar year, at least 90 days apart — Sec 173(5), small company' : 'four, not more than 120 days between two meetings — Sec 173(1)') + ').',
          'Largest gap between two meetings: ' + (Math.max(0, ...gaps.filter(g => g != null)) || '—') + ' days' + (need === 4 && gaps.some(g => g > 120) ? ' — EXCEEDS 120 DAYS, change the dates.' : '.'),
          first ? 'First Board meeting within 30 days of incorporation (Sec 173(1)): by ' + sd(addDays(c.incDate, 30)) + '.' : 'AGM for FY ' + fyLabel(prevEnd) + ' due by ' + sd(agmDueOf(c, prevEnd)) + ' (Sec 96).',
          'Notice of every Board meeting: at least 7 days in advance to all Directors (Sec 173(3)); minutes to be entered within 30 days (SS-1).',
          'Dates avoid Sundays and national holidays; change any date in “Dates of Board meetings”.']),
        { p: 'Internal working paper.', sz: 18 }];
    } });

    D.push({ id: 'ynotices', title: 'Notices & Agenda of Board Meetings — ' + FYL, sub: 'Sec 173(3) & SS-1 — one page per meeting', lh: LH_CO, build: () => {
      const out = [];
      M.forEach((m, k) => {
        if (k) out.push({ pb: true });
        out.push({ p: 'Date: ' + ld(m.notice), al: 'r' }, { p: 'To,', after: 0 }, { p: 'All the Directors of ' + c.name, after: 0 },
          ...dirs.map(d => ({ p: d.name + (d.din ? ' (DIN: ' + d.din + ')' : ''), after: 0 })), { gap: 1 },
          { p: 'NOTICE OF THE ' + title(m), b: true, al: 'c', u: true },
          { p: 'Notice is hereby given that the ' + ord(m.no) + ' Meeting of the Board of Directors of ' + c.name + ' will be held on ' + dayName(m.date) + ', ' + ld(m.date) + ' at ' + tm(time) + ' at ' + oneLine(venue) + ', to transact the following business:', al: 'j' },
          { p: 'AGENDA', b: true, al: 'c' }, ...numbered(business(m).filter(b => b.ag).map(b => b.ag)),
          { p: 'Directors desirous of participating through video conferencing or other audio-visual means, as permitted under Section 173(2) of the Companies Act, 2013, are requested to inform the Company in advance. The notes on agenda and draft resolutions are enclosed.', al: 'j' },
          ...sigCompany(x, m.notice, 'By Order of the Board\nFor ' + c.name));
      });
      return out;
    } });

    D.push({ id: 'yminutes', title: 'Minutes of Board Meetings — ' + FYL, sub: 'Sec 118 & SS-1 — for the Minutes Book, one meeting per page', lh: LH_PLAIN, build: () => {
      const out = [];
      M.forEach((m, k) => {
        if (k) out.push({ pb: true });
        out.push({ p: c.name.toUpperCase(), b: true, al: 'c', after: 0 }, { p: 'CIN: ' + v(c.cin), al: 'c', after: 0, sz: 20 }, { p: 'Regd. Office: ' + oneLine(c.addr), al: 'c', sz: 20 },
          { p: 'MINUTES OF THE ' + title(m) + ' OF ' + String(c.name).toUpperCase() + ' HELD ON ' + dayName(m.date).toUpperCase() + ', ' + ld(m.date).toUpperCase() + ' AT ' + tm(time) + ' AT ' + oneLine(venue).toUpperCase(), b: true, al: 'j' },
          { p: 'Meeting No. ' + (m.i + 1) + ' of the financial year ' + fyLabel(fyE), al: 'r', sz: 20 },
          { p: 'PRESENT:', b: true, after: 0 },
          { tbl: [['S. No.', 'Name', 'DIN', 'Designation', 'Mode'], ...dirs.map((d, i) => [String(i + 1), d.name + (d === chair ? ' (Chairperson)' : ''), d.din || '—', d.desig || 'Director', 'In person'])], cols: [8, 38, 16, 22, 16], head: true },
          { p: 'IN ATTENDANCE: None', after: 120 });
        business(m).filter(b => b.t !== 'Any other business').forEach((b, i) => {
          out.push({ p: (i + 1) + '. ' + b.t.toUpperCase(), b: true, keep: true });
          if (b.res) { out.push({ p: 'The Board discussed the matter and passed the following resolution unanimously:', al: 'j' }); String(b.res).split('\n').forEach(t => out.push({ p: t, al: 'j' })); }
          else out.push({ p: b.min, al: 'j' });
        });
        out.push({ p: 'There being no other business to transact, the meeting concluded with a vote of thanks to the Chair.', al: 'j' },
          { gap: 2 }, { p: '____________________', after: 0, keep: true }, { p: v(chair.name), b: true, after: 0, keep: true }, { p: 'Chairperson', after: 0, keep: true },
          { p: 'Date of signing: ____________', after: 0, keep: true }, { p: 'Place: ' + v(f.place), after: 0 },
          { p: 'Minutes to be entered in the Minutes Book within 30 days of the meeting and signed by the Chairperson of this meeting or of the next meeting (SS-1).', sz: 18, al: 'j' });
      });
      return out;
    } });

    D.push({ id: 'yattend', title: 'Attendance Register of Board Meetings — ' + FYL, sub: 'SS-1 — signed by Directors at each meeting', lh: LH_PLAIN, build: () => {
      const out = [{ p: 'ATTENDANCE REGISTER OF MEETINGS OF THE BOARD OF DIRECTORS', b: true, al: 'c' }, { p: c.name + ' (CIN: ' + v(c.cin) + ') — ' + FYL, al: 'c' }];
      M.forEach(m => out.push({ p: ord(m.no) + ' Board meeting — ' + dayName(m.date) + ', ' + ld(m.date) + ' at ' + tm(time) + ' — ' + oneLine(venue), b: true, keep: true },
        { tbl: [['S. No.', 'Name of the Director', 'DIN', 'Mode of attendance', 'Signature'], ...dirs.map((d, i) => [String(i + 1), d.name, d.din || '—', 'In person', ''])], cols: [8, 36, 16, 18, 22], head: true }));
      out.push({ gap: 1 }, { p: 'Signature of the Chairperson: ____________________', al: 'r' });
      return out;
    } });

    if (hasAgm) D.push({ id: 'yagmmin', title: 'Minutes of the ' + ord(agmNo) + ' Annual General Meeting', sub: 'Sec 118 & SS-2 — AGM held on ' + sd(f.agmDate) + ' for FY ' + fyLabel(prevEnd), lh: LH_PLAIN, build: () => {
      const sh = (c.shareholders || []).filter(h => h.name), ap = 'the ' + (isFirstFY(c, prevEnd) ? 'period' : 'financial year') + ' ended ' + ld(prevEnd);
      const out = [{ p: c.name.toUpperCase(), b: true, al: 'c', after: 0 }, { p: 'CIN: ' + v(c.cin), al: 'c', after: 0, sz: 20 }, { p: 'Regd. Office: ' + oneLine(c.addr), al: 'c', sz: 20 },
        { p: 'MINUTES OF THE ' + ord(agmNo).toUpperCase() + ' ANNUAL GENERAL MEETING OF THE MEMBERS OF ' + String(c.name).toUpperCase() + ' HELD ON ' + dayName(f.agmDate).toUpperCase() + ', ' + ld(f.agmDate).toUpperCase() + ' AT ' + tm(agmTime) + ' AT ' + oneLine(agmVenue).toUpperCase(), b: true, al: 'j' },
        { p: 'DIRECTORS PRESENT:', b: true, after: 0 }, ...dirs.map(d => ({ p: d.name + ' — ' + (d === chair ? 'Chairperson' : (d.desig || 'Director')), after: 0 })), { gap: 1 },
        { p: 'MEMBERS PRESENT:', b: true, after: 0 },
        sh.length ? { tbl: [['S. No.', 'Name of the member', 'Folio No.', 'No. of shares', 'Present in person / by proxy'], ...sh.map((h, i) => [String(i + 1), h.name, h.folio || '—', String(h.shares || '—'), 'In person'])], cols: [8, 40, 14, 16, 22], head: true }
          : { p: 'As per the attendance register of members.' },
        { p: 'IN ATTENDANCE: Representative of the Statutory Auditors, ' + x.firmDesc + '.', al: 'j' }];
      const items = [
        ['Chairperson', v(chair.name) + ', ' + (chair.desig || 'Director') + ', took the Chair in accordance with the Articles of Association of the Company and welcomed the members.'],
        ['Quorum', 'The requisite quorum being present in terms of Section 103 of the Companies Act, 2013, the Chairperson called the meeting to order.'],
        ['Notice and Auditors’ Report', 'With the consent of the members present, the Notice convening the meeting, which had been sent to all the members, Directors and Auditors, was taken as read. The Auditors’ Report on the financial statements for ' + ap + ' did not contain any qualification, reservation or adverse remark and was taken as read (Section 145).'],
        ['Registers', 'The Register of Directors and Key Managerial Personnel and their shareholding was kept open for inspection at the meeting (Section 170).']];
      items.forEach((it, i) => out.push({ p: (i + 1) + '. ' + it[0].toUpperCase(), b: true, keep: true }, { p: it[1], al: 'j' }));
      let n = items.length;
      out.push({ p: (++n) + '. ADOPTION OF THE AUDITED FINANCIAL STATEMENTS (ORDINARY RESOLUTION)', b: true, keep: true },
        { p: 'The following resolution, proposed by a member and seconded by another member, was passed unanimously as an **Ordinary Resolution** by show of hands:', al: 'j' },
        { p: '“**RESOLVED THAT** the audited financial statements of the Company for ' + ap + ', together with the Reports of the Board of Directors and the Auditors thereon, be and are hereby received, considered and adopted.”', al: 'j' });
      if (audAtAgm) out.push({ p: (++n) + '. APPOINTMENT OF STATUTORY AUDITORS (ORDINARY RESOLUTION)', b: true, keep: true },
        { p: 'The following resolution was passed unanimously as an **Ordinary Resolution** by show of hands:', al: 'j' },
        { p: '“**RESOLVED THAT** pursuant to Section 139 and other applicable provisions of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014, ' + x.firmDesc + ', be and are hereby appointed as the Statutory Auditors of the Company for a term of five consecutive years, to hold office from the conclusion of this ' + ord(agmNo) + ' Annual General Meeting till the conclusion of the ' + ord(agmNo + 5) + ' Annual General Meeting to be held in the year ' + (yr(f.agmDate) ? yr(f.agmDate) + 5 : BL) + ', ' + x.remun + '.”', al: 'j' });
      out.push({ p: (++n) + '. VOTE OF THANKS', b: true, keep: true }, { p: 'There being no other business to transact, the meeting concluded with a vote of thanks to the Chair.', al: 'j' },
        { gap: 2 }, { p: '____________________', after: 0, keep: true }, { p: v(chair.name), b: true, after: 0, keep: true }, { p: 'Chairperson', after: 0, keep: true },
        { p: 'Date of signing: ____________', after: 0, keep: true }, { p: 'Place: ' + v(f.place), after: 0 });
      return out;
    } });

    const discDate = M[0] ? M[0].date : from;
    D.push({ id: 'ymbp1', title: 'Form MBP-1 — Disclosure of Interest (each Director)', sub: 'Sec 184(1) — at the first Board meeting of ' + FYL, lh: LH_PLAIN, build: () => {
      const out = [];
      dirs.forEach((d, i) => {
        if (i) out.push({ pb: true });
        out.push(...formHead('FORM MBP-1', 'Notice of interest by Director', 'Pursuant to Section 184(1) and Rule 9(1) of the Companies (Meetings of Board and its Powers) Rules, 2014'), ...toBoard(x), { p: 'Dear Sir(s),' },
          { p: 'I, ' + d.name + ', son / daughter of ____________, resident of ____________, being a Director in the Company, hereby give notice of my interest or concern in the following company or companies, bodies corporate, firms or other association of individuals, for the financial year ' + fyLabel(fyE) + ':', al: 'j' },
          { tbl: [['S. No.', 'Names of the companies / bodies corporate / firms / association of individuals', 'Nature of interest or concern / change in interest or concern', 'Shareholding', 'Date on which interest or concern arose / changed'], ['1', 'NIL', '—', '—', '—']], cols: [7, 33, 26, 14, 20], head: true },
          ...sigPerson({ name: d.name, din: d.din, sign: d.sign }, discDate, f.place));
      });
      return out;
    } });
    D.push({ id: 'ydir8', title: 'Form DIR-8 — Intimation by Director (each Director)', sub: 'Sec 164(2) — non-disqualification for ' + FYL, lh: LH_PLAIN, build: () => {
      const out = [];
      dirs.forEach((d, i) => {
        if (i) out.push({ pb: true });
        out.push(...formHead('FORM DIR-8', 'Intimation by Director', 'Pursuant to Section 164(2) and Rule 14(1) of the Companies (Appointment and Qualification of Directors) Rules, 2014'), ...toBoard(x),
          { p: 'I, ' + d.name + ' (DIN: ' + v(d.din) + '), son / daughter of ____________, resident of ____________, Director in ' + c.name + ', hereby give notice that I am / was a director in the following companies during the last three years:', al: 'j' },
          { tbl: [['S. No.', 'Name of the Company', 'Date of appointment', 'Date of cessation'], ['1', c.name, '', '—']], cols: [8, 46, 23, 23], head: true },
          { p: 'I further confirm that I have not incurred disqualification under Section 164(2) of the Companies Act, 2013 in any of the above companies in the previous financial year, and that I, at present, stand free from any disqualification from being a director.', al: 'j' },
          ...sigPerson({ name: d.name, din: d.din, sign: d.sign }, discDate, f.place));
      });
      return out;
    } });

    const rx = Object.assign({}, x, { f: Object.assign({}, f, { asOn: f.regAsOn || fyE }) });
    registerDocs(rx).forEach(d => D.push(Object.assign({}, d, { title: d.title.replace(/ — Form MGT-1$/, ' — Form MGT-1') + ' (as on ' + sd(rx.f.asOn) + ')' })));
    const nilReg = (id, form, title, rule, headRow, cols) => D.push({ id, title: 'Register ' + title + ' — Form ' + form, sub: rule + ' — ' + FYL, lh: LH_NONE, landscape: true, build: () => [
      ...formHead('Form No. ' + form, 'Register ' + title, rule), { p: c.name + ' (CIN: ' + v(c.cin) + ') — ' + FYL, al: 'c', b: true },
      { tbl: [headRow, ['', 'NIL — no entries during the year', ...headRow.slice(2).map(() => '')]], cols, head: true },
      stmtNote('Make entries in this register within seven days of the transaction / Board approval. If there were transactions during the year, enter them in place of NIL.')] });
    nilReg('ymbp4', 'MBP-4', 'of Contracts or Arrangements in which Directors are interested', 'Pursuant to Section 189(1) and Rule 16(1) of the Companies (Meetings of Board and its Powers) Rules, 2014',
      ['S. No.', 'Date of contract / arrangement', 'Name of the party', 'Nature of interest of Director', 'Principal terms', 'Date of Board approval', 'Date of members’ approval (if any)', 'Signature of the Company Secretary / Director'], [6, 12, 16, 14, 18, 11, 11, 12]);
    nilReg('ymbp2', 'MBP-2', 'of Loans, Guarantees, Security and Acquisition', 'Pursuant to Section 186(9) and Rule 12(1) of the Companies (Meetings of Board and its Powers) Rules, 2014',
      ['S. No.', 'Nature of transaction (loan / guarantee / security / acquisition)', 'Date', 'Name and address of the person / body corporate', 'Amount (Rs.)', 'Time period / purpose', 'Rate of interest', 'Date of Board / special resolution'], [6, 18, 9, 20, 11, 14, 9, 13]);
    return D;
  }

  /* =====================================================================
     SMART DEFAULTS — dates and AGM number (applied only to empty / auto-filled fields)
     ===================================================================== */
  function lastFYEnd(today) { const t = today || new Date().toISOString().slice(0, 10); const s = fyStart(t); return s + '-03-31'; }

  /* ---------- financial years (FY 2021-22 … 2030-31) ---------- */
  const FY_FIRST = 2021, FY_LAST = 2030;
  const FY_CASES = ['agm', 'annual', 'dpt3', 'msme1', 'llp', 'registers', 'yearly'];
  const fyEndOf = fy => { const m = /^(\d{4})-\d{2}$/.exec(String(fy || '')); return m ? (+m[1] + 1) + '-03-31' : ''; };
  const fyOf = s => { const y = fyStart(s); return y == null ? '' : y + '-' + String(y + 1).slice(2); };
  const HOLIDAYS = ['01-26', '08-15', '10-02']; // national holidays — no meetings
  // move a date back to the nearest day that is not a Sunday / national holiday
  const workday = s => { let d = s; for (let i = 0; i < 7 && pd(d); i++) { if (pd(d).getUTCDay() !== 0 && !HOLIDAYS.includes(d.slice(5))) return d; d = addDays(d, -1); } return d; };
  const isFirstFY = (c, fyEnd) => !!(c && c.incDate && fyEnd && firstFYEnd(c.incDate) === fyEnd);
  const fyFromOf = (c, fyEnd) => !fyEnd ? '' : isFirstFY(c, fyEnd) ? c.incDate : addDays(addMonths(fyEnd, -12), 1);
  function fyList(c) {
    const first = c && c.incDate ? firstFYEnd(c.incDate) : '', out = [];
    for (let y = FY_FIRST; y <= FY_LAST; y++) {
      const end = (y + 1) + '-03-31';
      out.push({ fy: y + '-' + String(y + 1).slice(2), end, ok: !first || end >= first, first: !!first && end === first, from: first && end === first ? c.incDate : y + '-04-01' });
    }
    return out;
  }
  // AGM for the FY ending fyEnd: within 9 months for the first FY, otherwise 6 months (Sec 96(1))
  const agmDueOf = (c, fyEnd) => fyEnd ? addMonths(fyEnd, isFirstFY(c, fyEnd) ? 9 : 6) : '';
  const defAgmDate = (c, fyEnd) => workday(agmDueOf(c, fyEnd));
  const defAgmNotice = agm => agm ? workday(addDays(agm, -24)) : '';          // 21 clear days + 48 hours for service
  const defAccountsBM = agm => agm ? workday(addDays(defAgmNotice(agm), -1)) : '';
  const defBmNotice = bm => bm ? workday(addDays(bm, -8)) : '';               // 7 days' notice (Sec 173(3))
  // AGM number assuming every AGM was held on time since incorporation
  function agmNumber(c, fyEnd) {
    const fy = yr(fyEnd); if (!fy) return '';
    if (c.incDate) { const n = fy - yr(firstFYEnd(c.incDate)) + 1; return n > 0 ? String(n) : ''; }
    if (c.lastAgmNo && c.lastAgmDate) { const n = parseInt(c.lastAgmNo, 10) + (fy - (fyStart(c.lastAgmDate))); return n > 0 ? String(n) : ''; }
    return '';
  }
  // default Board meeting dates for the FY ending fyEnd → [{date, kind}]
  // kinds: first (first meeting after incorporation), accounts (approves previous FY accounts & convenes AGM), q1, h1, yearend, extra
  function fyMeetings(c, fyEnd, opt) {
    opt = opt || {}; if (!fyEnd || !pd(fyEnd)) return [];
    const first = isFirstFY(c, fyEnd), from = fyFromOf(c, fyEnd), two = String(opt.count) === '2';
    const qtr = d => yr(d) * 4 + Math.floor(pd(d).getUTCMonth() / 3);
    let fixed = [], list = [];
    for (let y = yr(from); y <= yr(fyEnd); y++) ['-03-15', '-06-20', '-09-15', '-12-15'].forEach(t => list.push(y + t));
    list = list.filter(d => d >= from && d <= fyEnd);
    if (first) { const m1 = workday(addDays(from, 15)); fixed.push({ date: m1, kind: 'first' }); list = list.filter(d => d > addDays(m1, 30)); }
    else {
      const acc = opt.accounts || defAccountsBM(opt.prevAgm || defAgmDate(c, addMonths(fyEnd, -12)));
      if (acc && acc >= from && acc <= fyEnd) { fixed.push({ date: acc, kind: 'accounts' }); list = list.filter(d => qtr(d) !== qtr(acc)); }
    }
    const kindOf = d => { const m = pd(d).getUTCMonth() + 1; return m >= 4 && m <= 7 ? 'q1' : m >= 10 && m <= 12 ? 'h1' : m <= 3 ? 'yearend' : 'extra'; };
    let out = fixed.slice();
    if (two) { // small company / OPC: one meeting in each half, at least 90 days apart (Sec 173(5))
      list.forEach(d => { if (out.length < 2 && out.every(o => Math.abs(pd(d) - pd(o.date)) / 864e5 >= 150)) out.push({ date: workday(d), kind: kindOf(d) }); });
    } else {
      list.forEach(d => out.push({ date: workday(d), kind: kindOf(d) }));
      out.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < out.length; i++) if ((pd(out[i].date) - pd(out[i - 1].date)) / 864e5 > 120) out.splice(i, 0, { date: workday(addDays(out[i - 1].date, 75)), kind: 'extra' });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out.filter((o, i) => !i || o.date !== out[i - 1].date);
  }
  const dmyList = list => list.map(o => sd(o.date || o)).join('\n');

  function defaults(ctx, auto) {
    const x = prep(ctx), c = x.c, f = Object.assign({}, x.f), out = {}; auto = auto || {};
    const link = ctx.link || {}, pa = link.prevAnnual || {}, yl = link.yearly || {};
    const forced = {};
    const set = (k, val) => { if (!val || forced[k]) return; if (!f[k] || f[k] === auto[k]) { f[k] = val; out[k] = val; } };
    const force = (k, val) => { if (!val) return; forced[k] = true; if (f[k] !== val) { f[k] = val; out[k] = val; } };
    const fyEnd = ctx.fy ? fyEndOf(ctx.fy) : '';
    if (fyEnd && FY_CASES.includes(x.kase)) force('fyEnd', fyEnd);
    const agmBlock = () => {
      set('fyEnd', lastFYEnd());
      set('agmNo', agmNumber(c, f.fyEnd));
      set('agmDate', defAgmDate(c, f.fyEnd));
      set('agmNotice', defAgmNotice(f.agmDate));
      set('bmDate', workday(addDays(f.agmNotice, -1)));
      set('bmNotice', defBmNotice(f.bmDate));
    };
    const egm = (base) => { set('egmNotice', addDays(base, 1)); set('egmDate', addDays(f.egmNotice, 22)); };
    switch (x.kase) {
      case 'first': set('bmDate', addDays(f.incDate || c.incDate, 25)); set('bmNotice', addDays(f.bmDate, -8)); set('consentDate', addDays(f.bmDate, -3)); break;
      case 'agm': agmBlock(); set('consentDate', addDays(f.bmDate, -3)); break;
      case 'casual': set('bmDate', addDays(f.vacDate, 20)); set('bmNotice', addDays(f.bmDate, -8)); set('consentDate', addDays(f.bmDate, -3)); if (f.reason !== 'other') egm(f.bmDate); break;
      case 'annual': agmBlock(); set('coSize', c.size === 'other' ? 'other' : 'small');
        set('bmList', yl.bmList || dmyList(fyMeetings(c, f.fyEnd, { count: yl.bmCount, accounts: pa.bmDate, prevAgm: pa.agmDate }))); break;
      case 'dirapp': set('bmNotice', addDays(f.bmDate, -8)); set('consentDate', addDays(f.bmDate, -1)); egm(f.bmDate); break;
      case 'dirres': set('resReceipt', f.resLetter); set('bmDate', addDays(f.resReceipt, 8)); set('bmNotice', f.resReceipt); break;
      case 'allot': set('bmNotice', addDays(f.bmDate, -8)); set('offerDate', addDays(f.bmDate, 1)); set('offerDays', '15'); set('lastDate', addDays(f.offerDate, num(f.offerDays) || 15)); set('alDate', addDays(f.lastDate, 2)); set('alTime', '11:00'); set('alNotice', addDays(f.alDate, -8)); break;
      case 'authcap': set('oldCap', c.authCap); set('bmNotice', addDays(f.bmDate, -8)); egm(f.bmDate); break;
      case 'transfer': set('bmDate', addDays(f.execDate, 7)); set('bmNotice', addDays(f.bmDate, -8)); break;
      case 'regoffice': set('bmNotice', addDays(f.bmDate, -8)); if (f.scope === 'roc') { egm(f.bmDate); set('effDate', addDays(f.egmDate, 1)); } else set('effDate', f.bmDate); break;
      case 'inc20a': set('bmDate', addDays(c.incDate, 150)); set('bmNotice', addDays(f.bmDate, -8)); break;
      case 'dpt3': set('fyEnd', lastFYEnd()); set('declDate', yr(f.fyEnd) ? yr(f.fyEnd) + '-06-15' : ''); break;
      case 'msme1': {
        if (fyEnd) force('msmeYear', String(yr(fyEnd)));
        const t = new Date().toISOString().slice(0, 10), m = +t.slice(5, 7); set('half', m >= 10 || m <= 3 ? 'h1' : 'h2'); set('msmeYear', String(m >= 4 ? +t.slice(0, 4) + (m >= 10 ? 1 : 0) : +t.slice(0, 4))); break; }
      case 'stk2': set('bmNotice', addDays(f.bmDate, -8)); set('accDate', f.bmDate); egm(f.bmDate); set('bondDate', f.egmDate); break;
      case 'llp': set('fyEnd', lastFYEnd()); set('approveDate', yr(f.fyEnd) ? yr(f.fyEnd) + '-05-15' : ''); break;
      case 'registers': set('asOn', f.fyEnd || fyEnd); break;
      case 'yearly': {
        set('fyEnd', lastFYEnd());
        const first = isFirstFY(c, f.fyEnd), prevEnd = addMonths(f.fyEnd, -12);
        set('bmCount', c.type === 'opc' ? '2' : '4'); set('coSize', c.size === 'other' ? 'other' : 'small');
        if (!first && f.fyEnd) {
          set('prevAgmNo', pa.agmNo || agmNumber(c, prevEnd));
          set('agmDate', pa.agmDate || defAgmDate(c, prevEnd));
          set('accBm', pa.bmDate || defAccountsBM(f.agmDate));
        }
        set('bmList', dmyList(fyMeetings(c, f.fyEnd, { count: f.bmCount, accounts: f.accBm })));
        set('regAsOn', f.fyEnd);
        break;
      }
    }
    return out;
  }

  /* =====================================================================
     DISPATCH
     ===================================================================== */
  // templates: { docId: text } for this case & variant (optional)
  function docDefs(ctx, templates) {
    const x = prep(ctx), K = x.kase;
    const MAP = { dirapp: dirAppDocs, dirres: dirResDocs, annual: annualDocs, allot: allotDocs, authcap: authCapDocs, transfer: transferDocs, regoffice: regOfficeDocs, inc20a: inc20aDocs, dpt3: dpt3Docs, msme1: msmeDocs, stk2: stk2Docs, llp: llpDocs, registers: registerDocs, yearly: yearlyDocs };
    const D = MAP[K] ? MAP[K](x) : ['first', 'agm', 'casual'].includes(K) ? auditorDocs(x) : [];
    return D.map((d, i) => {
      const def = Object.assign({}, d, { no: i + 1, fixed: isFixed(d.id) });
      if (templates && templates[d.id] && !def.fixed && !x.T) { const orig = d.build; def.custom = true; def.build = () => renderTemplate(x, orig(), templates[d.id]); }
      return def;
    });
  }

  function missing(ctx) {
    const x = prep(ctx), f = x.f, m = [], need = (k, l) => { if (!f[k]) m.push(l); };
    const K = x.kase;
    if (['first', 'agm', 'casual', 'annual'].includes(K) || (K === 'dpt3' && f.audCert === 'yes') || K === 'stk2') if (!ctx.a || !ctx.a.firm) m.push(K === 'annual' ? 'Statutory auditor (CA firm)' : 'CA firm');
    if (!x.d || !x.d.name) m.push('Signing director');
    if (K !== 'registers') need('place', 'Place');
    if (K === 'first') { need('incDate', 'Date of incorporation'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time'); }
    if (K === 'agm') { need('agmNo', 'AGM number'); need('agmDate', 'AGM date'); need('agmTime', 'AGM time'); need('bmDate', 'Board meeting date'); }
    if (K === 'casual') { need('prevFirm', 'Outgoing auditor firm'); need('vacDate', 'Date of vacancy'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time');
      if (f.reason === 'other') need('reasonText', 'Reason for vacancy'); else { need('egmDate', 'EGM date'); need('egmTime', 'EGM time'); } }
    if (K === 'dirapp') { need('appName', 'New director name'); need('appDin', 'New director DIN'); need('appFather', 'Father’s name'); need('appAddr', 'Address'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time');
      if (x.egmApp || x.regularise) { need('egmDate', 'EGM date'); need('egmTime', 'EGM time'); } }
    if (K === 'dirres') { if (!x.res.name) m.push('Resigning director'); need('resLetter', 'Date of resignation letter'); need('resReceipt', 'Date of receipt'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time'); }
    if (K === 'allot') { need('offerShares', 'Number of shares offered'); need('bmDate', 'Board meeting date (offer)'); need('offerDate', 'Date of offer'); need('lastDate', 'Last date of acceptance'); need('alDate', 'Allotment meeting date'); if (!cells(f.allottees, 6).length) m.push('Allottees list'); }
    if (K === 'authcap') { need('newCap', 'New authorised capital'); need('bmDate', 'Board meeting date'); need('egmDate', 'EGM date'); need('egmTime', 'EGM time'); }
    if (K === 'transfer') { if (!(x.c.shareholders || [])[parseInt(f.fromIndex, 10)]) m.push('Transferor'); need('toName', 'Transferee name'); need('trShares', 'Number of shares'); need('execDate', 'Date of execution'); need('bmDate', 'Board meeting date'); }
    if (K === 'regoffice') { need('newAddr', 'New address'); need('bmDate', 'Board meeting date'); need('effDate', 'Effective date'); need('ownerName', 'Owner of premises'); if (f.scope === 'roc') { need('egmDate', 'EGM date'); need('egmTime', 'EGM time'); } }
    if (K === 'inc20a') { if (!x.c.incDate) m.push('Date of incorporation (client master)'); need('bmDate', 'Board meeting date'); }
    if (K === 'dpt3') { need('fyEnd', 'Financial year end'); }
    if (K === 'msme1') { if (!cells(f.msmeRows, 6).length) m.push('Supplier dues'); }
    if (K === 'stk2') { need('bmDate', 'Board meeting date'); need('egmDate', 'EGM date'); need('accDate', 'Statement of accounts date'); }
    if (K === 'llp') { need('fyEnd', 'Financial year end'); need('approveDate', 'Date of approval by partners'); }
    if (K === 'yearly') { need('fyEnd', 'Financial year'); if (!x.bms.length) m.push('Dates of Board meetings'); if (!(x.c.directors || []).length) m.push('Directors (client master)'); }
    if (K === 'annual') { need('fyEnd', 'Financial year end'); need('agmNo', 'AGM number'); need('agmDate', 'AGM date'); need('agmTime', 'AGM time'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time');
      if (!x.isOPC && !x.d2.name) m.push('Second signing director (tick two signing directors)'); }
    return m;
  }

  /* ---------- compliance timeline ---------- */
  // returns [{label, rule, due, actual, actualLabel, key, status}] — key marks filing rows for dashboards
  function timeline(ctx) {
    const x = prep(ctx), f = x.f, R = [], row = (label, due, actual, actualLabel, rule, key) => R.push({ label, due, actual: actual || '', actualLabel: actualLabel || '', rule: rule || '', key: key || '' });
    const K = x.kase;
    if (K === 'first') {
      row('Board meeting to appoint first auditor', addDays(f.incDate, 30), f.bmDate, 'Meeting', 'within 30 days of incorporation, Sec 139(6)', 'board');
      row('Notice of Board meeting', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'at least 7 days, Sec 173(3)');
      row('File e-Form ADT-1', addDays(f.bmDate, 15), f.adt1Date, 'Filed', 'within 15 days of meeting, Rule 4(2)', 'adt1');
      const fy = firstFYEnd(f.incDate); row('First AGM (first auditor holds office till then)', fy ? addMonths(fy, 9) : '', '', '', 'within 9 months of first FY end, Sec 96');
    } else if (K === 'agm') {
      if (f.fyEnd) row('AGM for FY ended ' + sd(f.fyEnd), addMonths(f.fyEnd, 6), f.agmDate, 'AGM', 'within 6 months of FY end, Sec 96', 'agm');
      row('Notice of Board meeting', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'at least 7 days, Sec 173(3)');
      row('Dispatch AGM notice (21 clear days)', addDays(f.agmDate, -22), f.agmNotice, 'Notice', 'Sec 101');
      row('Board meeting approving notice — before notice date', f.agmNotice || addDays(f.agmDate, -22), f.bmDate, 'Meeting', '');
      row('File e-Form ADT-1', addDays(f.agmDate, 15), f.adt1Date, 'Filed', 'within 15 days of AGM, Rule 4(2)', 'adt1');
    } else if (K === 'casual') {
      row('Board to fill casual vacancy', addDays(f.vacDate, 30), f.bmDate, 'Meeting', 'within 30 days, Sec 139(8)', 'board');
      if (x.resign) {
        row('Outgoing auditor to file ADT-3', addDays(f.vacDate, 30), '', '', 'within 30 days of resignation, Sec 140(2)');
        row('Members to approve at general meeting', addMonths(f.bmDate, 3), f.egmDate, 'EGM', 'within 3 months of Board recommendation, Sec 139(8)(i)', 'egm');
        row('Dispatch EGM notice (21 clear days)', addDays(f.egmDate, -22), f.egmNotice, 'Notice', 'Sec 101');
      }
      row('File e-Form ADT-1', addDays(meetingDate(x), 15), f.adt1Date, 'Filed', 'within 15 days of ' + (x.resign ? 'EGM' : 'Board meeting') + ', Rule 4(2)', 'adt1');
    } else if (K === 'dirapp') {
      row('Consent (DIR-2) before appointment', x.appDate, f.consentDate, 'DIR-2', 'Sec 152(5)');
      row('Notice of Board meeting', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'at least 7 days, Sec 173(3)');
      if (x.egmApp || x.regularise) row('Dispatch EGM notice (21 clear days)', addDays(f.egmDate, -22), f.egmNotice, 'Notice', 'Sec 101');
      row('File e-Form DIR-12', addDays(x.appDate, 30), f.dir12Date, 'Filed', 'within 30 days of appointment, Sec 170(2) & Rule 18', 'dir12');
      if (x.regularise) row('File DIR-12 for change in designation after EGM', addDays(f.egmDate, 30), f.dir12bDate, 'Filed', 'within 30 days of EGM', 'dir12');
    } else if (K === 'dirres') {
      row('Notice of Board meeting', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'at least 7 days, Sec 173(3)');
      row('File e-Form DIR-12 (cessation)', addDays(x.resEff, 30), f.dir12Date, 'Filed', 'within 30 days of resignation, Sec 168(1) & Rule 15', 'dir12');
    } else if (K === 'annual') {
      const agmDue = x.fyEnd ? addMonths(x.fyEnd, x.firstFY ? 9 : 6) : '';
      row('Hold ' + ord(f.agmNo) + ' AGM', agmDue, f.agmDate, 'AGM', (x.firstFY ? 'within 9 months of first FY end' : 'within 6 months of FY end') + ', Sec 96', 'agm');
      row('Notice of Board meeting (accounts)', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'at least 7 days, Sec 173(3)');
      if (f.shortNotice !== 'yes') row('Dispatch AGM notice (21 clear days)', addDays(f.agmDate, -22), f.agmNotice, 'Notice', 'Sec 101');
      row('Board meeting approving accounts — before AGM notice', f.agmNotice || addDays(f.agmDate, -22), f.bmDate, 'Meeting', 'Sec 134(1)');
      row('File e-Form AOC-4', addDays(f.agmDate, 30), f.aoc4Date, 'Filed', 'within 30 days of AGM, Sec 137', 'aoc4');
      row('File e-Form ' + x.retForm, addDays(f.agmDate, 60), f.mgt7Date, 'Filed', 'within 60 days of AGM, Sec 92(4)', 'mgt7');
    } else if (K === 'allot') {
      row('Notice of Board meeting (offer)', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'Sec 173(3)');
      row('Rights offer open for at least 15 days', addDays(f.offerDate, 15), f.lastDate, 'Closes', 'Sec 62(1)(a)(i) — shorter only with 90% consent');
      row('File e-Form PAS-3', addDays(f.alDate, 30), f.pas3Date, 'Filed', 'within 30 days of allotment, Sec 39(4)', 'pas3');
      row('Issue share certificates', addMonths(f.alDate, 2), f.certDate, 'Issued', 'within 2 months, Sec 56(4)(a)');
    } else if (K === 'authcap') {
      row('Notice of Board meeting', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'Sec 173(3)');
      row('Dispatch EGM notice (21 clear days)', addDays(f.egmDate, -22), f.egmNotice, 'Notice', 'Sec 101');
      row('File e-Form SH-7', addDays(f.egmDate, 30), f.sh7Date, 'Filed', 'within 30 days of resolution, Sec 64', 'sh7');
    } else if (K === 'transfer') {
      row('Lodge SH-4 with the company', addDays(f.execDate, 60), f.lodgeDate, 'Lodged', 'within 60 days of execution, Rule 11');
      row('Register transfer & deliver certificate', addMonths(f.lodgeDate || f.bmDate, 1), f.certDate, 'Delivered', 'within one month, Sec 56(4)(c)');
    } else if (K === 'regoffice') {
      if (f.scope === 'roc') row('Dispatch EGM notice (21 clear days)', addDays(f.egmDate, -22), f.egmNotice, 'Notice', 'Sec 101');
      row('File e-Form INC-22', addDays(f.scope === 'roc' ? f.egmDate : f.effDate, 30), f.inc22Date, 'Filed', 'within 30 days of change, Sec 12(4)', 'inc22');
      if (f.scope === 'roc') row('File e-Form MGT-14', addDays(f.egmDate, 30), f.mgt14Date, 'Filed', 'within 30 days, Sec 117', 'mgt14');
    } else if (K === 'inc20a') {
      row('File e-Form INC-20A', addDays(x.c.incDate, 180), f.inc20aDate, 'Filed', 'within 180 days of incorporation, Sec 10A', 'inc20a');
    } else if (K === 'dpt3') {
      row('File e-Form DPT-3 for FY ' + fyLabel(f.fyEnd), yr(f.fyEnd) ? yr(f.fyEnd) + '-06-30' : '', f.dpt3Date, 'Filed', 'by 30 June, Rule 16 / 16A', 'dpt3');
    } else if (K === 'msme1') {
      const y = num(f.msmeYear), h1 = f.half !== 'h2';
      row('File e-Form MSME-1 (' + (h1 ? 'April–September' : 'October–March') + ')', y ? (h1 ? (y - 1) + '-10-31' : y + '-04-30') : '', f.msmeDate, 'Filed', 'half-yearly return', 'msme1');
    } else if (K === 'stk2') {
      row('Dispatch EGM notice (21 clear days)', addDays(f.egmDate, -22), f.egmNotice, 'Notice', 'Sec 101');
      row('File e-Form MGT-14 (special resolution)', addDays(f.egmDate, 30), f.mgt14Date, 'Filed', 'within 30 days, Sec 117', 'mgt14');
      row('File e-Form STK-2 (statement of accounts ≤ 30 days old)', addDays(f.accDate, 30), f.stk2Date, 'Filed', 'Rule 4(3)', 'stk2');
    } else if (K === 'yearly') {
      const c = x.c, first = isFirstFY(c, x.fyEnd), from = fyFromOf(c, x.fyEnd), prevEnd = addMonths(x.fyEnd, -12);
      x.bms.forEach((d, i) => {
        const prev = i ? x.bms[i - 1] : '';
        row('Board meeting ' + (i + 1) + ' of ' + x.bms.length, i === 0 ? (first ? addDays(c.incDate, 30) : '') : addDays(prev, 120), d, 'Meeting', i === 0 ? (first ? 'within 30 days of incorporation, Sec 173(1)' : 'first meeting of the FY — MBP-1 & DIR-8') : 'within 120 days of the previous meeting, Sec 173(1)');
      });
      if (!first && x.fyEnd) row('AGM for FY ' + fyLabel(prevEnd), agmDueOf(c, prevEnd), f.agmDate, 'AGM', 'Sec 96', 'agm');
      if (yr(from)) {
        row('DIR-3 KYC of all Directors', yr(from) + '-09-30', '', '', 'every year by 30 September');
        if (!first) row('DPT-3 for FY ' + fyLabel(prevEnd), yr(from) + '-06-30', '', '', 'Rule 16 / 16A');
      }
    } else if (K === 'llp') {
      const y = yr(f.fyEnd);
      row('File LLP Form 11 (Annual Return)', y ? y + '-05-30' : '', f.form11Date, 'Filed', 'within 60 days of FY end, Rule 25', 'form11');
      row('File LLP Form 8 (Statement of Account & Solvency)', y ? y + '-10-30' : '', f.form8Date, 'Filed', 'by 30 October, Rule 24', 'form8');
    }
    return R.map(r => Object.assign(r, { status: r.due && r.actual ? (r.actual <= r.due ? 'ok' : 'late') : '' }));
  }

  function warnings(ctx) {
    const x = prep(ctx), f = x.f, c = x.c, W = [];
    if (ctx.fy && !FY_CASES.includes(x.kase)) {
      const fe = fyEndOf(ctx.fy), fs = fyFromOf(c, fe), md = f.bmDate || f.egmDate;
      if (md && fe && (md < fs || md > fe)) W.push('The meeting date (' + sd(md) + ') is outside the selected financial year ' + ctx.fy + ' (' + sd(fs) + ' to ' + sd(fe) + '). Check the financial year at the top or the date.');
    }
    if (ctx.fy && c.incDate && fyEndOf(ctx.fy) < firstFYEnd(c.incDate)) W.push('The company was incorporated on ' + sd(c.incDate) + '; its first financial year ends on ' + sd(firstFYEnd(c.incDate)) + '. Choose FY ' + fyOf(firstFYEnd(c.incDate)) + ' or later.');
    if (['yearly', 'annual'].includes(x.kase) && x.bms.length) {
      for (let i = 1; i < x.bms.length; i++) { const g = (pd(x.bms[i]) - pd(x.bms[i - 1])) / 864e5; if (g > 120 && !x.small) W.push('Gap of ' + Math.round(g) + ' days between Board meetings on ' + sd(x.bms[i - 1]) + ' and ' + sd(x.bms[i]) + ' — more than 120 days (Sec 173(1)).'); }
      if (!x.isOPC && x.bms.length < (x.small ? 2 : 4)) W.push('Only ' + x.bms.length + ' Board meeting(s) in the year — at least ' + (x.small ? '2 (Sec 173(5))' : '4 (Sec 173(1))') + ' required.');
      const off = x.bms.filter(d => pd(d) && (pd(d).getUTCDay() === 0 || HOLIDAYS.includes(d.slice(5))));
      if (off.length) W.push('Board meeting on a Sunday / national holiday: ' + off.map(sd).join(', ') + '.');
    }
    if (x.kase === 'first' && f.incDate && f.bmDate && f.bmDate > addDays(f.incDate, 30)) W.push('Board meeting is beyond 30 days of incorporation. Under Sec 139(6), if the Board fails to appoint, the members must appoint the first auditor at an EGM within 90 days.');
    if (x.kase === 'dirapp') {
      if (f.appDin && (c.directors || []).some(d => d.din && d.din === f.appDin)) W.push('This DIN is already in the client’s director list.');
      if (f.appDin && !/^\d{8}$/.test(f.appDin)) W.push('DIN should be 8 digits.');
      if (c.type === 'public' && !x.egmApp && !x.regularise) W.push('Public company: regularise the Additional Director at the next AGM (Sec 152), with a notice from a member under Sec 160.');
    }
    if (x.kase === 'dirres' && x.res.name) {
      const min = c.type === 'public' ? 3 : c.type === 'opc' ? 1 : 2, left = (c.directors || []).length - 1;
      if (left < min) W.push('Only ' + left + ' director(s) will remain — the minimum for this company is ' + min + ' (Sec 149(1)). Appoint a new director first.');
      if (x.ds.some(d => d === x.res || (d.din && d.din === x.res.din))) W.push('A signing director is the person resigning — untick that director for the company documents.');
    }
    if (x.kase === 'allot') {
      const fv = num(c.faceValue) || 10, after = num(c.paidCap) + cells(f.allottees, 6).reduce((s, r) => s + num(r[2]), 0) * fv;
      if (num(c.authCap) && after > num(c.authCap)) W.push('Paid-up capital after allotment (Rs. ' + inr(after) + ') will exceed the authorised capital (Rs. ' + inr(num(c.authCap)) + '). Increase the authorised capital first (SH-7).');
      if (!(c.shareholders || []).length) W.push('Add the existing shareholders in the client master so that each one gets a Letter of Offer with the correct entitlement.');
      if (dematNote(x)) W.push(dematNote(x));
    }
    if (x.kase === 'authcap' && num(f.newCap) && num(f.newCap) <= num(f.oldCap || c.authCap)) W.push('The new authorised capital must be more than the existing authorised capital.');
    if (x.kase === 'transfer') { const h = (c.shareholders || [])[parseInt(f.fromIndex, 10)]; if (h && num(f.trShares) > num(h.shares)) W.push('The transferor holds only ' + inr(num(h.shares)) + ' shares.'); if (dematNote(x)) W.push(dematNote(x)); }
    if (x.kase === 'inc20a' && c.incDate && c.incDate < '2018-11-02') W.push('INC-20A applies only to companies incorporated on or after 2 November 2018.');
    if (x.kase === 'llp' && c.type !== 'llp') W.push('This client is not marked as an LLP in the client master.');
    if (c.type === 'llp' && x.kase !== 'llp' && x.kase !== 'registers') W.push('This client is an LLP — company documents do not apply. Use the LLP case.');
    if (x.kase === 'annual') {
      if (!x.isOPC && x.d2.name && x.d.name === x.d2.name) W.push('Choose two different directors to sign the Board’s Report and financial statements (Sec 134).');
      if (!x.small && x.bms.length && (x.bms.length < 4 || !bmGapOK(x))) W.push('Sec 173(1): at least 4 Board meetings a year with a gap of not more than 120 days. Please check the dates entered.');
      if (x.small && x.bms.length && x.bms.length < 2 && !x.firstFY) W.push('Small company / OPC: at least one Board meeting in each half of the calendar year (Sec 173(5)).');
    }
    return W;
  }


  /* =====================================================================
     EDITABLE TEMPLATES
     A template is plain text. Each line is one paragraph.
       [c] centre  [r] right  [l] left  (default: justified)   [b] bold  [u] underline
       [h] hanging list (1. / (a) …)   [i] indent   [t] no space after   [big] / [small]
       **bold words**   <br> = line break   blank line = empty line   --- = new page
       {{placeholder}} = value from the client / case (e.g. {{companyName}}, {{bmDate}}, {{bmDate:day}})
       [[signature]] [[table]] [[address]] … = blocks taken as they are from the standard document
     ===================================================================== */
  const VARIANTS = {
    agm: [['apptType', 'Type', [['new', 'New auditor'], ['re', 'Re-appointment']]]],
    casual: [['reason', 'Reason', [['resign', 'Resignation'], ['other', 'Other']]]],
    dirapp: [['apptMode', 'Mode', [['additional', 'Additional Director (Board)'], ['egm', 'At EGM']]], ['regularise', 'Regularise at EGM', [['no', 'No'], ['yes', 'Yes']]]],
    annual: [['coSize', 'Company', [['small', 'Small company / OPC'], ['other', 'Other company']]], ['rpt', 'Related party contracts', [['no', 'No'], ['yes', 'Yes']]]],
    regoffice: [['scope', 'Change', [['local', 'Within city'], ['roc', 'Outside city, same ROC']]]],
    authcap: [['resType', 'Resolution', [['ordinary', 'Ordinary'], ['special', 'Special']]]],
    dpt3: [['audCert', 'Auditor certificate', [['no', 'No'], ['yes', 'Yes']]]],
    stk2: [['ground', 'Ground', [['nobiz', 'No business for 2 years'], ['nocomm', 'Not commenced business']]]],
    llp: [['solvent', 'Solvency', [['yes', 'Able to pay debts'], ['no', 'Not able to pay debts']]]],
  };
  const variantKey = (kase, f) => (VARIANTS[kase] || []).map(([k, , opts]) => k + '=' + ((f && f[k]) || opts[0][0])).join('&');
  // documents that repeat per person / are internal working papers keep their fixed format
  const FIXED = new Set(['offerletter', 'sh1', 'shortnotice', 'stk3', 'stk4', 'adt1', 'dir12', 'annualsheet', 'pas3', 'sh7', 'trsheet', 'inc22', 'inc20a', 'dpt3', 'msme1', 'stk2', 'llpsheet', 'mgt1', 'regdir', 'shlist', 'ycal', 'ynotices', 'yminutes', 'yattend', 'yagmmin', 'ymbp1', 'ydir8', 'ymbp4', 'ymbp2']);
  const isFixed = id => FIXED.has(id) || /^decl\d+$/.test(id);
  const SELECT_KEYS = new Set(['apptType', 'reason', 'apptMode', 'regularise', 'appCat', 'retire', 'appTitle', 'coSize', 'rpt', 'shortNotice', 'amtUnit', 'lh', 'addToMaster', 'updateMaster', 'issueType', 'resType', 'scope', 'premises', 'audCert', 'half', 'ground', 'solvent', 'fromIndex', 'resIndex', 'dir2Index', 'offerDays', 'term', 'autoJson']);
  const PROSE_KEYS = new Set(['remun', 'appRemun', 'appProf', 'appRel', 'appShares', 'appExp', 'appQual', 'ratio', 'bank', 'dividend', 'reserves', 'material', 'natureChange', 'deposits', 'loans186', 'affairs', 'dirChanges', 'audQual', 'audTerm', 'csr', 'subs', 'energy', 'tech', 'fxEarn', 'fxOut', 'resReason', 'rptNotArm', 'partnerChanges', 'ownerRel', 'udin', 'prevEmail', 'prevAddr', 'reasonText', 'resEffDate', 'leaseDate', 'appOther', 'appInterest', 'allottees', 'subscribers', 'dptRows', 'msmeRows', 'stkItems', 'partners', 'rptList', 'bmList', 'premium', 'certFrom', 'toFolio']);
  function tokenCtx(kase, variant) {
    const c = { name: '{{companyName}}', cin: '{{cin}}', addr: '{{regdOffice}}', email: '{{companyEmail}}', web: '', type: 'private', size: 'small', incDate: '{{incDate}}', authCap: '{{authCap}}', paidCap: '{{paidCap}}', faceValue: '10',
      directors: [{ name: '{{director1}}', din: '{{director1Din}}', desig: 'Director' }, { name: '{{director2}}', din: '{{director2Din}}', desig: 'Director' }], shareholders: [] };
    const a = { firm: '{{caFirm}}', frn: '{{frn}}', partner: '{{caPartner}}', mno: '{{caMno}}', desig: 'Partner', addr: '{{caAddress}}', email: '{{caEmail}}', pan: '{{caPan}}', const: '{{caConstitution}}' };
    const base = Object.assign({}, variant || {});
    const f = typeof Proxy === 'function' ? new Proxy(base, { get: (t, k) => typeof k !== 'string' ? undefined : (k in t) ? t[k] : (SELECT_KEYS.has(k) || PROSE_KEYS.has(k)) ? '' : '{{' + k + '}}', has: () => true }) : base;
    return { kase, c, a, d: c.directors[0], ds: [c.directors[0]], f, T: true };
  }
  const attrsOf = b => { const a = []; if (b.al === 'c') a.push('c'); else if (b.al === 'r') a.push('r'); else if (b.al !== 'j') a.push('l'); if (b.b) a.push('b'); if (b.u) a.push('u'); if (b.hang) a.push('h'); if (b.ind && !b.hang) a.push('i'); if (b.after === 0) a.push('t'); if (b.sz && b.sz >= 26) a.push('big'); if (b.sz && b.sz <= 21) a.push('small'); return a; };
  function serialize(blocks) {
    const out = [], count = {}; let lastGid = null;
    blocks.forEach(b => {
      const g = b.grp || (b.tbl ? 'table' : null);
      if (g) { const gid = b.gid || ('t' + out.length + Math.random()); if (gid !== lastGid || b.tbl) { count[g] = (count[g] || 0) + 1; out.push('[[' + g + (count[g] > 1 ? '#' + count[g] : '') + ']]'); } lastGid = gid; return; }
      lastGid = null;
      if (b.gap) { for (let i = 0; i < b.gap; i++) out.push(''); return; }
      if (b.pb) { out.push('---'); return; }
      if (b.p === undefined) return;
      const a = attrsOf(b); out.push((a.length ? '[' + a.join(' ') + '] ' : '') + String(b.p).replace(/\t/g, ' ').replace(/\n/g, '<br>'));
    });
    return out.join('\n');
  }
  function groupsOf(blocks) {
    const map = {}, count = {}; let lastGid = null, cur = null;
    blocks.forEach(b => {
      const g = b.grp || (b.tbl ? 'table' : null);
      if (!g) { lastGid = null; return; }
      const gid = b.gid || Math.random();
      if (gid !== lastGid || b.tbl) { count[g] = (count[g] || 0) + 1; cur = map[g + (count[g] > 1 ? '#' + count[g] : '')] = []; }
      lastGid = gid; cur.push(b);
    });
    return map;
  }
  function tokenValue(x, key) {
    const [k0, sfx] = key.split(':'), k = k0.trim(), low = k.toLowerCase(), up = /[a-z]/i.test(k) && k === k.toUpperCase() && k !== k.toLowerCase();
    const c = x.c, a = x.a, d = x.d || {}, d2 = x.d2 || {}, r = x.res || {};
    const base = { companyname: c.name, cin: c.cin, regdoffice: oneLine(c.addr), companyemail: c.email, incdate: c.incDate, authcap: c.authCap, paidcap: c.paidCap,
      cafirm: a.firm, frn: a.frn, capartner: a.partner, camno: a.mno, caaddress: oneLine(a.addr), caemail: a.email, capan: a.pan, caconstitution: a.const,
      director1: d.name, director1din: d.din, director2: d2.name, director2din: d2.din, resigningdirector: r.name, resigningdirectordin: r.din, previousauditor: prevDesc(x.f) };
    const tr = (c.shareholders || [])[parseInt(x.f.fromIndex, 10)]; if (tr) { base.transferor = tr.name; base.transferorfolio = tr.folio; }
    let val;
    const vals = Object.keys(x.vals || {}).find(n => n.toLowerCase() === low);
    if (vals) val = x.vals[vals];
    else if (low in base) val = base[low];
    else { const fk = Object.keys(x.f).find(n => n.toLowerCase() === low); val = fk ? x.f[fk] : undefined; if (val === undefined && /venue$/.test(low)) val = oneLine(c.addr); if ((val === '' || val == null) && /venue$/.test(low)) val = oneLine(c.addr); }
    if (vals && val === '') return '';
    if (val === undefined || val === null || val === '') val = BL;
    else if (typeof val !== 'string') val = String(val);
    const s2 = (sfx || '').toLowerCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) val = s2 === 'short' ? sd(val) : s2 === 'day' ? dayName(val) : ld(val);
    else if (/^\d{1,2}:\d{2}$/.test(val)) val = tm(val);
    else if (s2 === 'ord') val = ord(val);
    return up ? val.toUpperCase() : val;
  }
  function renderTemplate(x, realBlocks, text) {
    const groups = groupsOf(realBlocks), out = [];
    const sub = t => t.replace(/\{\{([^{}]+)\}\}/g, (_, k) => tokenValue(x, k));
    String(text || '').replace(/\r/g, '').split('\n').forEach(line => {
      const ln = line.replace(/\s+$/, '');
      if (!ln.trim()) { out.push({ gap: 1 }); return; }
      if (/^-{3,}$/.test(ln.trim())) { out.push({ pb: true }); return; }
      const gm = /^\[\[([a-z0-9#-]+)\]\]$/i.exec(ln.trim());
      if (gm) { (groups[gm[1].toLowerCase()] || []).forEach(b => out.push(b)); return; }
      // attributes: [c b u] or [c][b][u] (commas also allowed)
      const AT = /^\s*\[((?:c|r|l|j|b|u|h|i|t|big|small)(?:[\s,]+(?:c|r|l|j|b|u|h|i|t|big|small))*)\]\s?/i;
      let at = [], body = ln, m;
      while ((m = AT.exec(body))) { at = at.concat(m[1].toLowerCase().split(/[\s,]+/)); body = body.slice(m[0].length); }
      const blk = { p: sub(body).replace(/<br\s*\/?>/gi, '\n'), al: at.includes('c') ? 'c' : at.includes('r') ? 'r' : at.includes('l') ? 'l' : 'j' };
      if (at.includes('b')) blk.b = true; if (at.includes('u')) blk.u = true; if (at.includes('t')) blk.after = 0;
      if (at.includes('big')) blk.sz = 28; if (at.includes('small')) blk.sz = 20; if (at.includes('i')) blk.ind = 567;
      if (at.includes('h')) { blk.hang = true; blk.p = blk.p.replace(/^(\(?[0-9a-zivx]{1,4}[.)])\s+/i, '$1\t'); }
      out.push(blk);
    });
    return out;
  }
  // standard template text of one document (what the editor starts from)
  function templateText(kase, variant, docId) {
    const d = docDefs(tokenCtx(kase, variant)).find(z => z.id === docId);
    return d ? serialize(d.build()) : '';
  }
  function templateDocs(kase, variant) {
    return docDefs(tokenCtx(kase, variant)).map(d => ({ id: d.id, no: d.no, title: d.title, sub: d.sub, fixed: isFixed(d.id) }));
  }
  function placeholders(text) { const set = new Set(); String(text || '').replace(/\{\{([^{}:]+)(?::[^{}]*)?\}\}/g, (_, k) => set.add(k)); return [...set]; }

  function fileName(d, companyName) {
    const safe = s => String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    return String(d.no).padStart(2, '0') + '_' + safe(d.title).slice(0, 60) + '_' + safe(companyName).slice(0, 40) + '.docx';
  }

  return { CASES, CASE_TITLE, CASE_SHORT, LH_CO, LH_CA, LH_NONE, LH_PLAIN, BL, docDefs, missing, timeline, warnings, fileName, defaults, agmNumber,
    VARIANTS, variantKey, templateText, templateDocs, placeholders, isFixed,
    FY_CASES, fyList, fyEndOf, fyOf, fyMeetings, isFirstFY, agmDueOf,
    helpers: { ld, sd, tm, ord, addDays, addMonths, oneLine, fyStart, firstFYEnd, pd, parseDMY } };
});
