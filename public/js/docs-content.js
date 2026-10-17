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
  const ord = n => { n = parseInt(n, 10); if (!n) return BL; const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const pd = s => { if (!s) return null; const [y, m, d] = String(s).split('-').map(Number); if (!y || !m || !d) return null; return new Date(Date.UTC(y, m - 1, d)); };
  const iso = dt => dt.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = pd(s); if (!d) return ''; d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const addMonths = (s, n) => { const d = pd(s); if (!d) return ''; const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return iso(d); };
  const ld = s => { const d = pd(s); if (!d) return BL; return ord(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + ', ' + d.getUTCFullYear(); };
  const sd = s => { const d = pd(s); if (!d) return '—'; return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  const dayName = s => { const d = pd(s); return d ? DAYS[d.getUTCDay()] : BL; };
  const yr = s => { const d = pd(s); return d ? d.getUTCFullYear() : null; };
  const tm = t => { if (!t) return BL; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'P.M.' : 'A.M.'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; };
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

  const CASES = ['first', 'agm', 'casual', 'dirapp', 'dirres', 'annual'];
  const CASE_TITLE = {
    first: 'First Auditor — Board Appointment u/s 139(6)',
    agm: 'Auditor Appointment at Annual General Meeting u/s 139(1)',
    casual: 'Auditor Casual Vacancy u/s 139(8)',
    dirapp: 'Appointment of Director — Sec 152 / 161(1)',
    dirres: 'Resignation of Director — Sec 168',
    annual: 'Annual Filing — AOC-4 and MGT-7 / MGT-7A',
  };
  const CASE_SHORT = { first: 'First Auditor', agm: 'Auditor at AGM', casual: 'Auditor Casual Vacancy', dirapp: 'Director Appointment', dirres: 'Director Resignation', annual: 'AOC-4 & MGT-7' };
  const LH_CO = 'company', LH_CA = 'ca', LH_NONE = 'none', LH_PLAIN = 'plain';

  /* ---------- context ---------- */
  function prep(ctx) {
    const x = Object.assign({ c: {}, a: {}, d: {}, f: {} }, ctx);
    x.c = x.c || {}; x.a = x.a || {}; x.d = x.d || {}; x.f = x.f || {};
    const f = x.f, dirs = x.c.directors || [];
    x.K = x.kase;
    x.venue = s => s || oneLine(x.c.addr);
    x.firmDesc = (x.a.firm ? x.a.firm : BL) + ', Chartered Accountants (Firm Registration No. ' + v(x.a.frn) + ')';
    x.remun = f.remun
      ? 'at a remuneration of ' + f.remun + ' plus applicable taxes and reimbursement of out-of-pocket expenses'
      : 'at such remuneration as may be mutually agreed upon between the Board of Directors and the Auditors';
    x.isRe = x.kase === 'agm' && f.apptType === 're';
    x.resign = x.kase === 'casual' && f.reason !== 'other';
    // second signing director (annual filing) and resigning director (from client master)
    x.d2 = f.dir2Index !== undefined && f.dir2Index !== '' ? (dirs[parseInt(f.dir2Index, 10)] || {}) : {};
    x.res = f.resIndex !== undefined && f.resIndex !== '' ? (dirs[parseInt(f.resIndex, 10)] || {}) : {};
    // new director (appointment)
    const t = f.appTitle || 'Mr.';
    x.app = { title: t, name: f.appName || '', din: f.appDin || '', father: f.appFather || '', dob: f.appDob || '', addr: f.appAddr || '', email: f.appEmail || '',
      mobile: f.appMobile || '', pan: f.appPan || '', occ: f.appOcc || '', nat: f.appNat || 'Indian', qual: f.appQual || '', exp: f.appExp || '', sign: f.apptSign || null };
    x.app.full = (t ? t + ' ' : '') + v(x.app.name);
    x.app.his = t === 'Mr.' ? 'his' : (t === 'Ms.' || t === 'Mrs.') ? 'her' : 'his/her';
    x.app.he = t === 'Mr.' ? 'he' : (t === 'Ms.' || t === 'Mrs.') ? 'she' : 'he/she';
    x.app.sonOf = t === 'Mr.' ? 'son of' : (t === 'Ms.' || t === 'Mrs.') ? 'daughter of' : 'son/daughter of';
    x.app.cat = f.appCat === 'exec' ? 'Executive' : 'Non-Executive';
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
  const prevDesc = f => v(f.prevFirm) + ', Chartered Accountants' + (f.prevFrn ? ' (Firm Registration No. ' + f.prevFrn + ')' : '');
  const vacancyText = x => x.f.reason === 'other' ? (v(x.f.reasonText) + ' of ' + prevDesc(x.f)) : ('the resignation of ' + prevDesc(x.f));
  function meetingDate(x) { const f = x.f; return x.kase === 'first' ? f.bmDate : x.kase === 'agm' ? f.agmDate : (x.resign ? f.egmDate : f.bmDate); }
  function termText(x, mode) {
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
  const addrLines = s => String(s || BL).split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ p: l, after: 0 }));
  const subj = t => ({ p: '**Subject: ' + t + '**', al: 'j' });
  const numbered = (items, start) => items.map((t, i) => ({ p: (i + (start || 1)) + '.\t' + t, hang: true, al: 'j' }));
  const lettered = items => items.map((t, i) => ({ p: '(' + 'abcdefghij'[i] + ')\t' + t, hang: true, al: 'j' }));
  const head = t => ({ p: t, b: true, keep: true });
  const signoff = () => [{ p: 'Thanking you,', after: 0, keep: true }, { p: 'Yours faithfully,', keep: true }];
  function sigCompany(x, date, lead, who) {
    const { c, f } = x, d = who || x.d;
    return [{ gap: 1 }, { p: lead || ('For ' + c.name), b: true, keep: true }, { sign: d.sign || null },
      { p: v(d.name), b: true, after: 0, keep: true }, { p: v(d.desig || 'Director'), after: 0, keep: true },
      { p: 'DIN: ' + v(d.din), after: 0, keep: true }, { p: 'Place: ' + v(f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }];
  }
  function sigTwo(x, date) { // Board's report / financial statements: two directors (one for OPC)
    const one = d => [{ sign: d.sign || null }, { p: v(d.name), b: true, after: 0, keep: true }, { p: v(d.desig || 'Director'), after: 0, keep: true }, { p: 'DIN: ' + v(d.din), after: 0, keep: true }];
    return [{ gap: 1 }, { p: 'For and on behalf of the Board of Directors\nFor ' + x.c.name, b: true, keep: true }, ...one(x.d),
      ...(x.isOPC ? [] : [{ gap: 1 }, ...one(x.d2)]), { gap: 1 }, { p: 'Place: ' + v(x.f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }];
  }
  function sigPerson(p, date, place, extra) {
    return [{ gap: 1 }, { sign: p.sign || null }, { p: 'Signature: ____________________', after: 0, keep: true }, { p: 'Name: ' + v(p.full || p.name), after: 0, keep: true },
      ...(p.din !== undefined ? [{ p: 'DIN: ' + v(p.din), after: 0, keep: true }] : []), ...(extra || []).map(t => ({ p: t, after: 0, keep: true })),
      { p: 'Place: ' + v(place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }];
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
  function bmNoticeDoc(x, agenda) {
    const { c, f } = x;
    return { id: 'bmnotice', title: 'Notice of Board Meeting', sub: 'Sec 173(3) & Secretarial Standard-1 (ICSI)', lh: LH_CO, build: () => [
      { p: 'Date: ' + ld(f.bmNotice), al: 'r' }, { p: 'To,', after: 0 }, { p: 'All the Directors of ' + c.name, after: 0 },
      ...(c.directors || []).map(d => ({ p: d.name + (d.din ? ' (DIN: ' + d.din + ')' : ''), after: 0 })), { gap: 1 },
      { p: 'NOTICE OF MEETING OF THE BOARD OF DIRECTORS', b: true, al: 'c', u: true },
      { p: 'Notice is hereby given that a Meeting of the Board of Directors of ' + c.name + ' will be held on ' + dayName(f.bmDate) + ', ' + ld(f.bmDate) + ' at ' + tm(f.bmTime) + ' at ' + oneLine(x.venue(f.bmVenue)) + ', to transact the following business:', al: 'j' },
      { p: 'AGENDA', b: true, al: 'c' }, ...numbered(agenda),
      { p: 'Directors desirous of participating in the meeting through video conferencing or other audio-visual means, as permitted under Section 173(2) of the Companies Act, 2013, are requested to inform the Company in advance. The draft resolutions and the papers relating to the agenda items are available at the Registered Office for inspection.', al: 'j' },
      { p: 'You are requested to make it convenient to attend the meeting.' },
      ...sigCompany(x, f.bmNotice, 'By Order of the Board\nFor ' + c.name)] };
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
      { p: '**RESOLVED FURTHER THAT** ' + v(x.d.name) + ', ' + v(x.d.desig || 'Director') + ' (DIN: ' + v(x.d.din) + '), be and is hereby authorised to sign and issue the Notice of the Annual General Meeting to the members, directors and auditors of the Company and to do all such acts, deeds and things as may be necessary in this regard.”' }];
  }
  function resBoardCasual(x) {
    const f = x.f, res = x.resign, out = [];
    if (res) out.push({ p: '**1. TAKING NOTE OF RESIGNATION OF STATUTORY AUDITORS**', u: true },
      { p: '“**RESOLVED THAT** the resignation of ' + prevDesc(f) + ' from the office of Statutory Auditors of the Company with effect from ' + ld(f.vacDate) + ', tendered vide their letter dated ' + ld(f.resignLetter || f.vacDate) + ', be and is hereby taken note of.”' });
    out.push({ p: '**' + (res ? '2. ' : '') + 'APPOINTMENT OF STATUTORY AUDITORS TO FILL THE CASUAL VACANCY**', u: true },
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 139(8) and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Audit and Auditors) Rules, 2014 ' + STAT + ', and on the basis of the written consent and certificate of eligibility received under Sections 139(1) and 141 of the Act, ' + x.firmDesc + ', be and are hereby appointed as the Statutory Auditors of the Company ' + termText(x) + ', ' + x.remun + (res ? ', subject to the approval of the members of the Company at a general meeting to be held within three months of the recommendation of the Board' : '') + '.' });
    if (res) out.push({ p: '**RESOLVED FURTHER THAT** an Extraordinary General Meeting of the members of the Company be held on ' + dayName(f.egmDate) + ', ' + ld(f.egmDate) + ' at ' + tm(f.egmTime) + ' at ' + oneLine(x.venue(f.egmVenue)) + ' to seek the approval of the members for the above appointment, and the draft Notice convening the said meeting, along with the Explanatory Statement under Section 102 of the Act, as placed before the Board, be and is hereby approved.' });
    out.push({ p: '**RESOLVED FURTHER THAT** ' + v(x.d.name) + ', ' + v(x.d.desig || 'Director') + ' (DIN: ' + v(x.d.din) + '), be and is hereby authorised to ' + (res ? 'sign and issue the Notice of the Extraordinary General Meeting, to ' : '') + 'intimate the said appointment to the Auditors, to sign and file e-Form ADT-1 with the Registrar of Companies, and to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution.”' });
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
    const apptName = (x.isRe ? 're-appointment' : 'appointment') + ' as ' + (K === 'first' ? 'First ' : '') + 'Statutory Auditors';

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
      { p: 'Date: ' + ld(f.consentDate), al: 'r' }, { p: '**By Registered Post A.D. / Email**' }, ...toAuditor(f.prevFirm, (f.prevAddr || '') + (f.prevEmail ? '\nEmail: ' + f.prevEmail : '')),
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
        { p: prevDesc(f) + ', the Statutory Auditors of the Company, have resigned from the said office with effect from ' + ld(f.vacDate) + ' vide their letter dated ' + ld(f.resignLetter || f.vacDate) + ', resulting in a casual vacancy in the office of the Statutory Auditors of the Company.', al: 'j' },
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
    return [{ gap: 1 }, { p: 'For ' + v(a.firm), b: true, after: 0, keep: true }, { p: 'Chartered Accountants', after: 0, keep: true },
      { p: 'FRN: ' + v(a.frn), after: 0, keep: true }, { gap: 2 }, { p: '(' + v(a.partner) + ')', b: true, after: 0, keep: true },
      { p: v(a.desig || 'Partner'), after: 0, keep: true }, { p: 'Membership No.: ' + v(a.mno), after: 0, keep: true },
      ...(f.udin ? [{ p: 'UDIN: ' + f.udin, after: 0, keep: true }] : []),
      { p: 'Place: ' + v(f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }];
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
        { p: '**RESOLVED FURTHER THAT** ' + v(x.d.name) + ', ' + v(x.d.desig || 'Director') + ' (DIN: ' + v(x.d.din) + '), be and is hereby authorised to sign and issue the Notice of the Extraordinary General Meeting to the members, directors and auditors of the Company.”', al: 'j' });
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
      { p: 'Dear ' + (p.title || 'Sir / Madam') + ' ' + v(p.name).split(' ').slice(-1)[0] + ',' },
      { p: 'We are pleased to inform you that ' + (x.egmApp ? 'the members of the Company at the Extraordinary General Meeting held on ' + ld(f.egmDate) + ' have appointed you as a Director of the Company with effect from ' + ld(f.egmDate) + ', ' + (f.retire === 'yes' ? 'liable' : 'not liable') + ' to retire by rotation.' : 'the Board of Directors of the Company at its meeting held on ' + ld(f.bmDate) + ' has appointed you as an Additional Director (' + p.cat + ') of the Company with effect from ' + ld(f.bmDate) + ' under Section 161(1) of the Companies Act, 2013. You will hold office up to the date of the next Annual General Meeting of the Company, or the last date on which it should have been held, whichever is earlier, unless appointed as a Director by the members.'), al: 'j' },
      { p: 'The terms of your appointment are as follows:', b: true },
      ...numbered([
        'Your appointment is subject to the provisions of the Companies Act, 2013 (“the Act”), the rules made thereunder and the Articles of Association of the Company.',
        'Remuneration: ' + (f.appRemun || 'You will not be entitled to any remuneration other than sitting fees for attending meetings of the Board, if any, as may be decided by the Board, and reimbursement of expenses incurred for attending such meetings.'),
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
    const { c, f } = x, r = x.res, eff = x.resEff, D = [];
    const effText = f.resEffDate && f.resReceipt && f.resEffDate > f.resReceipt ? 'with effect from ' + ld(f.resEffDate) : 'with effect from the date of receipt of this letter by the Company';
    const reason = f.resReason || 'personal reasons and pre-occupation';

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
      { p: '“**RESOLVED THAT** pursuant to the provisions of Section 168 and other applicable provisions, if any, of the Companies Act, 2013 read with Rule 15 of the Companies (Appointment and Qualification of Directors) Rules, 2014 ' + STAT + ', the resignation tendered by ' + v(r.name) + ' (DIN: ' + v(r.din) + ') from the office of Director of the Company vide letter dated ' + ld(f.resLetter) + ', received by the Company on ' + ld(f.resReceipt) + ', be and is hereby taken note of, and the cessation of ' + v(r.name) + ' as a Director be effective from ' + ld(eff) + '.', al: 'j' },
      { p: '**RESOLVED FURTHER THAT** the Board places on record its sincere appreciation for the valuable contribution made by ' + v(r.name) + ' during the tenure as a Director of the Company.', al: 'j' },
      { p: '**RESOLVED FURTHER THAT** any Director of the Company be and is hereby severally authorised to sign and file e-Form DIR-12 with the Registrar of Companies within thirty days of the resignation, to make the necessary entries in the Register of Directors and Key Managerial Personnel maintained under Section 170 of the Act, and to do all such acts, deeds, matters and things as may be necessary to give effect to this resolution.”', al: 'j' },
      { p: 'Certified True Copy', b: true }, ...sigCompany(x, f.bmDate)] });

    D.push({ id: 'ackletter', title: 'Acknowledgement of Resignation', sub: 'From the company to the resigning director', lh: LH_CO, build: () => [
      { p: 'Date: ' + ld(f.resReceipt), al: 'r' }, { p: 'To,', after: 0 }, { p: v(r.name), b: true, after: 0 }, { p: 'DIN: ' + v(r.din), after: 0 }, { gap: 1 },
      subj('Acknowledgement of your resignation from the office of Director'),
      { p: 'Dear Sir / Madam,' },
      { p: 'We acknowledge receipt on ' + ld(f.resReceipt) + ' of your letter dated ' + ld(f.resLetter) + ' tendering your resignation from the office of Director of ' + c.name + '. In terms of Section 168(2) of the Companies Act, 2013, your resignation is effective from ' + ld(eff) + '.', al: 'j' },
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
    return 'the Balance Sheet as at ' + ld(x.fyEnd) + ', the Statement of Profit and Loss' + (x.small ? '' : ', the Cash Flow Statement') + ' for the ' + (x.firstFY ? 'period from ' + ld(x.fyFrom) + ' to ' + ld(x.fyEnd) : 'financial year ended on that date') + ' and the notes thereto';
  }
  function bmGapOK(x) { for (let i = 1; i < x.bms.length; i++) { if ((pd(x.bms[i]) - pd(x.bms[i - 1])) / 864e5 > 120) return false; } return true; }
  function resAdoption(x) {
    return [{ p: '“**RESOLVED THAT** the Audited Financial Statements of the Company for the ' + (x.firstFY ? 'period' : 'financial year') + ' ended ' + ld(x.fyEnd) + ', comprising ' + fsWords(x) + ', together with the Reports of the Board of Directors and the Auditors thereon, be and are hereby received, considered and adopted.”' }];
  }
  function boardsReport(x) {
    const { c, a, f } = x, out = [], full = !x.small;
    const unit = f.amtUnit || 'Amount in Rs.';
    let n = 0; const sec = (t, ...paras) => { out.push({ p: (++n) + '. ' + t.toUpperCase(), b: true, keep: true }, ...paras.map(p => typeof p === 'string' ? { p, al: 'j' } : p)); };
    out.push({ p: 'BOARD’S REPORT', b: true, al: 'c', sz: 28 }, { p: 'To,', after: 0 }, { p: 'The Members,', after: 0 }, { p: c.name, b: true },
      { p: 'Your Directors have pleasure in presenting their Report on the business and operations of the Company together with the Audited Financial Statements for the ' + (x.firstFY ? 'period from ' + ld(x.fyFrom) + ' to ' + ld(x.fyEnd) : 'financial year ended ' + ld(x.fyEnd)) + '.' + (x.small ? ' This Report is prepared in accordance with Section 134 of the Companies Act, 2013 read with Rule 8A of the Companies (Accounts) Rules, 2014, applicable to ' + (x.isOPC ? 'One Person Companies' : 'small companies') + '.' : ''), al: 'j' });
    sec('Financial summary / highlights', { p: '(' + unit + ')', al: 'r', after: 0 },
      { tbl: [['Particulars', 'FY ' + fyLabel(x.fyEnd), x.firstFY ? 'Previous year' : 'FY ' + fyLabel(x.prevFyEnd)],
        ['Total revenue (including other income)', amt(f.revCur), x.firstFY ? '–' : amt(f.revPrev)], ['Profit / (Loss) before tax', amt(f.pbtCur), x.firstFY ? '–' : amt(f.pbtPrev)],
        ['Less: Tax expense', amt(f.taxCur), x.firstFY ? '–' : amt(f.taxPrev)], ['Profit / (Loss) after tax', amt(f.patCur), x.firstFY ? '–' : amt(f.patPrev)]], cols: [50, 25, 25], head: true });
    sec('State of company’s affairs', f.affairs || ('During the year under review, the Company recorded total revenue of ' + (f.revCur ? 'Rs. ' + f.revCur : BL) + ' and a profit / (loss) after tax of ' + (f.patCur ? 'Rs. ' + f.patCur : BL) + '. The Directors are continuously looking for avenues for the future growth of the Company.'));
    sec('Change in the nature of business', f.natureChange || 'There was no change in the nature of business of the Company during the year under review.');
    sec('Dividend', f.dividend || 'The Board of Directors does not recommend any dividend for the year under review.');
    sec('Transfer to reserves', f.reserves || 'The Company has not transferred any amount to the reserves during the year under review.');
    sec('Material changes and commitments', f.material || 'There are no material changes and commitments affecting the financial position of the Company which have occurred between the end of the financial year of the Company to which the financial statements relate and the date of this Report.');
    const bmText = x.bms.length ? 'During the year under review, the Board of Directors met ' + x.bms.length + ' (' + (NUMW[x.bms.length] || x.bms.length) + ') time' + (x.bms.length > 1 ? 's' : '') + ', on ' + x.bms.map(ld).join('; ') + '.' + (!x.small && bmGapOK(x) && x.bms.length > 1 ? ' The intervening gap between two consecutive meetings did not exceed one hundred and twenty days, as prescribed under Section 173(1) of the Companies Act, 2013.' : x.small ? ' The meetings were held in compliance with Section 173 of the Companies Act, 2013.' : '') : 'During the year under review, the Board of Directors met ' + BL + ' times.';
    sec('Number of meetings of the Board', bmText);
    sec('Directors and Key Managerial Personnel', 'As on the date of this Report, the Board of Directors of the Company comprises:',
      { tbl: [['S. No.', 'Name', 'DIN', 'Designation'], ...(c.directors || []).map((d, i) => [String(i + 1), d.name, d.din || '—', d.desig || 'Director'])], cols: [8, 46, 20, 26], head: true },
      f.dirChanges || 'There was no change in the composition of the Board of Directors during the year under review.');
    if (full) sec('Deposits', f.deposits || 'The Company has not accepted any deposits within the meaning of Sections 73 and 76 of the Companies Act, 2013 read with the Companies (Acceptance of Deposits) Rules, 2014 during the year under review.');
    if (full) sec('Particulars of loans, guarantees or investments', f.loans186 || 'The Company has not given any loans or guarantees, or provided any security, or made any investments covered under the provisions of Section 186 of the Companies Act, 2013 during the year under review.');
    sec('Particulars of contracts or arrangements with related parties', f.rpt === 'yes'
      ? 'All contracts or arrangements entered into by the Company with related parties referred to in Section 188(1) of the Companies Act, 2013 during the year under review were in the ordinary course of business and on an arm’s length basis. The particulars of such contracts or arrangements are given in Form AOC-2, annexed to this Report as **Annexure-I**.'
      : 'There were no contracts or arrangements entered into by the Company with related parties referred to in Section 188(1) of the Companies Act, 2013 during the year under review. Hence, the disclosure in Form AOC-2 is not applicable.');
    sec('Annual return', c.web ? 'Pursuant to Section 92(3) read with Section 134(3)(a) of the Companies Act, 2013, the Annual Return of the Company for the financial year ' + fyLabel(x.fyEnd) + ' is available on the website of the Company at ' + c.web + '.'
      : 'The Company does not have a website. Accordingly, the requirement of placing the Annual Return on the website under Section 134(3)(a) of the Companies Act, 2013 is not applicable.');
    sec('Statutory auditors and auditors’ report', (a.firm ? x.firmDesc + ', are the Statutory Auditors of the Company' + (f.audTerm ? ', ' + f.audTerm : '') + '. ' : '') + (f.audQual || 'The Auditors’ Report on the financial statements for the year under review does not contain any qualification, reservation, adverse remark or disclaimer.'));
    sec('Details of fraud reported by the auditors', 'During the year under review, the Statutory Auditors have not reported to the Board any instance of fraud committed against the Company by its officers or employees under Section 143(12) of the Companies Act, 2013.');
    if (full) {
      sec('Conservation of energy, technology absorption and foreign exchange', '(A) Conservation of energy: ' + (f.energy || 'The operations of the Company are not energy-intensive; however, adequate measures have been taken to conserve energy wherever possible.'),
        '(B) Technology absorption: ' + (f.tech || 'The Company has not imported any technology during the year under review.'),
        '(C) Foreign exchange earnings and outgo: Earnings — ' + (f.fxEarn || 'Nil') + '; Outgo — ' + (f.fxOut || 'Nil') + '.');
      sec('Risk management', 'The Company has identified the elements of risk relevant to its business. In the opinion of the Board, there are no elements of risk which may threaten the existence of the Company.');
      sec('Corporate social responsibility', f.csr || 'The provisions of Section 135 of the Companies Act, 2013 relating to Corporate Social Responsibility are not applicable to the Company.');
      sec('Internal financial controls', 'The Company has in place adequate internal financial controls with reference to the financial statements, commensurate with the size and nature of its business.');
      sec('Subsidiaries, joint ventures and associate companies', f.subs || 'The Company does not have any subsidiary, joint venture or associate company.');
      sec('Maintenance of cost records', 'Maintenance of cost records as specified by the Central Government under Section 148(1) of the Companies Act, 2013 is not required for the business carried on by the Company.');
      sec('Proceedings under the Insolvency and Bankruptcy Code, 2016', 'No application has been made and no proceeding is pending against the Company under the Insolvency and Bankruptcy Code, 2016 during the year under review. Disclosure of the difference in valuation on a one-time settlement with banks or financial institutions is not applicable.');
    }
    sec('Significant and material orders', 'No significant or material orders were passed by the regulators or courts or tribunals impacting the going concern status and the Company’s operations in future.');
    sec('Prevention of sexual harassment at the workplace', 'The Company is committed to providing a safe workplace and complies, to the extent applicable, with the provisions relating to the constitution of an Internal Committee under the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013. Details for the year under review: (a) number of complaints of sexual harassment received: ' + (f.poshRecd || '0') + '; (b) number of complaints disposed of: ' + (f.poshDisp || '0') + '; (c) number of cases pending for more than ninety days: ' + (f.poshPend || '0') + '.');
    sec('Compliance with the Maternity Benefit Act, 1961', 'The Company has complied with the provisions of the Maternity Benefit Act, 1961, to the extent applicable.');
    sec('Employees', 'As on ' + ld(x.fyEnd) + ', the number of employees of the Company was: Female — ' + (f.empF || '0') + '; Male — ' + (f.empM || '0') + '; Transgender — ' + (f.empT || '0') + '.');
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
        { p: '1. Details of contracts or arrangements or transactions not at arm’s length basis:', b: true }, { p: f.rptNotArm || 'There were no contracts or arrangements or transactions entered into during the year that were not at arm’s length basis.', al: 'j' },
        { p: '2. Details of material contracts or arrangements or transactions at arm’s length basis:', b: true },
        { tbl: [['Name of the related party and nature of relationship', 'Nature of contracts / arrangements / transactions', 'Duration', 'Salient terms, including value, if any', 'Date(s) of approval by the Board, if any', 'Amount paid as advances, if any'],
          ...(rows.length ? rows : [['NIL', '', '', '', '', '']])], cols: [22, 18, 12, 20, 14, 14], head: true },
        ...sigTwo(x, f.bmDate));
    }
    return out;
  }

  function annualDocs(x) {
    const { c, a, f } = x, D = [], FYW = x.firstFY ? 'period' : 'financial year';
    const shareholders = (c.shareholders || []).filter(s => s.name);
    D.push(bmNoticeDoc(x, ['To grant leave of absence, if any.', 'To confirm the minutes of the previous meeting of the Board.',
      'To consider and approve the Audited Financial Statements of the Company for the ' + FYW + ' ended ' + ld(x.fyEnd) + ', together with the Auditors’ Report thereon.',
      'To consider and approve the Board’s Report' + (f.rpt === 'yes' ? ' along with the annexure (Form AOC-2)' : '') + ' for the ' + FYW + ' ended ' + ld(x.fyEnd) + '.',
      'To fix the date, time and venue of the ' + ord(f.agmNo) + ' Annual General Meeting and to approve the Notice thereof.',
      'To authorise Directors to sign the financial statements and the Board’s Report, and to file e-Form AOC-4 and e-Form ' + x.retForm + ' with the Registrar of Companies.',
      'Any other business with the permission of the Chairperson.']));

    D.push({ id: 'boardctc', title: 'Certified True Copy of Board Resolutions', sub: 'Approval of accounts, Board’s Report & AGM notice — Sec 134', lh: LH_CO, build: () => {
      const two = x.isOPC ? v(x.d.name) + ' (DIN: ' + v(x.d.din) + '), Director' : v(x.d.name) + ' (DIN: ' + v(x.d.din) + ') and ' + v(x.d2.name) + ' (DIN: ' + v(x.d2.din) + '), Directors';
      return [ctcHead(x, 'RESOLUTIONS PASSED AT THE MEETING OF THE BOARD OF DIRECTORS', f.bmDate, f.bmTime, x.venue(f.bmVenue)), { gap: 1 },
        { p: '**1. APPROVAL OF AUDITED FINANCIAL STATEMENTS FOR THE ' + FYW.toUpperCase() + ' ENDED ' + ld(x.fyEnd).toUpperCase() + '**', u: true },
        { p: '“**RESOLVED THAT** pursuant to the provisions of Section 134 and other applicable provisions, if any, of the Companies Act, 2013 read with the Companies (Accounts) Rules, 2014 ' + STAT + ', the Audited Financial Statements of the Company for the ' + FYW + ' ended ' + ld(x.fyEnd) + ', comprising ' + fsWords(x) + ', as placed before the Board, be and are hereby approved.', al: 'j' },
        { p: '**RESOLVED FURTHER THAT** ' + two + ' of the Company, be and ' + (x.isOPC ? 'is' : 'are') + ' hereby authorised to sign the said Financial Statements on behalf of the Board in terms of Section 134(1) of the Act and to submit the same to the Statutory Auditors for their report thereon.”', al: 'j' },
        { p: '**2. APPROVAL OF BOARD’S REPORT**', u: true },
        { p: '“**RESOLVED THAT** the Board’s Report for the ' + FYW + ' ended ' + ld(x.fyEnd) + (f.rpt === 'yes' ? ', together with the annexure in Form AOC-2,' : '') + ' prepared in accordance with Section 134(3) of the Companies Act, 2013' + (x.small ? ' read with Rule 8A of the Companies (Accounts) Rules, 2014' : ' read with Rule 8 of the Companies (Accounts) Rules, 2014') + ', as placed before the Board, be and is hereby approved, and that ' + two + ', be and ' + (x.isOPC ? 'is' : 'are') + ' hereby authorised to sign the same in terms of Section 134(6) of the Act.”', al: 'j' },
        { p: '**3. CONVENING OF THE ' + ord(f.agmNo).toUpperCase() + ' ANNUAL GENERAL MEETING**', u: true },
        { p: '“**RESOLVED THAT** the ' + ord(f.agmNo) + ' Annual General Meeting of the members of the Company be held on ' + dayName(f.agmDate) + ', ' + ld(f.agmDate) + ' at ' + tm(f.agmTime) + ' at ' + oneLine(x.venue(f.agmVenue)) + ', and the draft Notice convening the said meeting, as placed before the Board, be and is hereby approved.' + (f.shortNotice === 'yes' ? ' The meeting may be held at a shorter notice subject to the consent of not less than ninety-five per cent of the members entitled to vote thereat, in terms of the proviso to Section 101(1) of the Act.' : ''), al: 'j' },
        { p: '**RESOLVED FURTHER THAT** ' + v(x.d.name) + ', ' + v(x.d.desig || 'Director') + ' (DIN: ' + v(x.d.din) + '), be and is hereby authorised to sign and issue the Notice of the Annual General Meeting to the members, directors and auditors of the Company.”', al: 'j' },
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
     DISPATCH
     ===================================================================== */
  function docDefs(ctx) {
    const x = prep(ctx), K = x.kase;
    const D = K === 'dirapp' ? dirAppDocs(x) : K === 'dirres' ? dirResDocs(x) : K === 'annual' ? annualDocs(x) : ['first', 'agm', 'casual'].includes(K) ? auditorDocs(x) : [];
    return D.map((d, i) => Object.assign({}, d, { no: i + 1 }));
  }

  function missing(ctx) {
    const x = prep(ctx), f = x.f, m = [], need = (k, l) => { if (!f[k]) m.push(l); };
    const K = x.kase;
    if (['first', 'agm', 'casual', 'annual'].includes(K) && (!ctx.a || !ctx.a.firm)) m.push(K === 'annual' ? 'Statutory auditor (CA firm)' : 'CA firm');
    if (!ctx.d || !ctx.d.name) m.push('Signing director');
    need('place', 'Place');
    if (K === 'first') { need('incDate', 'Date of incorporation'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time'); }
    if (K === 'agm') { need('agmNo', 'AGM number'); need('agmDate', 'AGM date'); need('agmTime', 'AGM time'); need('bmDate', 'Board meeting date'); }
    if (K === 'casual') { need('prevFirm', 'Outgoing auditor firm'); need('vacDate', 'Date of vacancy'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time');
      if (f.reason === 'other') need('reasonText', 'Reason for vacancy'); else { need('egmDate', 'EGM date'); need('egmTime', 'EGM time'); } }
    if (K === 'dirapp') { need('appName', 'New director name'); need('appDin', 'New director DIN'); need('appFather', 'Father’s name'); need('appAddr', 'Address'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time');
      if (x.egmApp || x.regularise) { need('egmDate', 'EGM date'); need('egmTime', 'EGM time'); } }
    if (K === 'dirres') { if (!x.res.name) m.push('Resigning director'); need('resLetter', 'Date of resignation letter'); need('resReceipt', 'Date of receipt'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time'); }
    if (K === 'annual') { need('fyEnd', 'Financial year end'); need('agmNo', 'AGM number'); need('agmDate', 'AGM date'); need('agmTime', 'AGM time'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time');
      if (!x.isOPC && !x.d2.name) m.push('Second signing director'); }
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
    }
    return R.map(r => Object.assign(r, { status: r.due && r.actual ? (r.actual <= r.due ? 'ok' : 'late') : '' }));
  }

  function warnings(ctx) {
    const x = prep(ctx), f = x.f, c = x.c, W = [];
    if (x.kase === 'first' && f.incDate && f.bmDate && f.bmDate > addDays(f.incDate, 30)) W.push('Board meeting is beyond 30 days of incorporation. Under Sec 139(6), if the Board fails to appoint, the members must appoint the first auditor at an EGM within 90 days.');
    if (x.kase === 'dirapp') {
      if (f.appDin && (c.directors || []).some(d => d.din && d.din === f.appDin)) W.push('This DIN is already in the client’s director list.');
      if (f.appDin && !/^\d{8}$/.test(f.appDin)) W.push('DIN should be 8 digits.');
      if (c.type === 'public' && !x.egmApp && !x.regularise) W.push('Public company: regularise the Additional Director at the next AGM (Sec 152), with a notice from a member under Sec 160.');
    }
    if (x.kase === 'dirres' && x.res.name) {
      const min = c.type === 'public' ? 3 : c.type === 'opc' ? 1 : 2, left = (c.directors || []).length - 1;
      if (left < min) W.push('Only ' + left + ' director(s) will remain — the minimum for this company is ' + min + ' (Sec 149(1)). Appoint a new director first.');
      if (x.d === x.res || (x.d.din && x.d.din === x.res.din)) W.push('The signing director is the person resigning — choose another director to sign the company documents.');
    }
    if (x.kase === 'annual') {
      if (!x.isOPC && x.d2.name && x.d.name === x.d2.name) W.push('Choose two different directors to sign the Board’s Report and financial statements (Sec 134).');
      if (!x.small && x.bms.length && (x.bms.length < 4 || !bmGapOK(x))) W.push('Sec 173(1): at least 4 Board meetings a year with a gap of not more than 120 days. Please check the dates entered.');
      if (x.small && x.bms.length && x.bms.length < 2 && !x.firstFY) W.push('Small company / OPC: at least one Board meeting in each half of the calendar year (Sec 173(5)).');
    }
    return W;
  }

  function fileName(d, companyName) {
    const safe = s => String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    return String(d.no).padStart(2, '0') + '_' + safe(d.title).slice(0, 60) + '_' + safe(companyName).slice(0, 40) + '.docx';
  }

  return { CASES, CASE_TITLE, CASE_SHORT, LH_CO, LH_CA, LH_NONE, LH_PLAIN, BL, docDefs, missing, timeline, warnings, fileName,
    helpers: { ld, sd, tm, ord, addDays, addMonths, oneLine, fyStart, firstFYEnd, pd, parseDMY } };
});
