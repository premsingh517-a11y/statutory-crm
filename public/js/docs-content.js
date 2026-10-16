/* =====================================================================
   Auditor appointment document content — shared by the browser
   (preview, timeline, dashboard) and the server (Word generation).

   ctx = { kase:'first'|'agm'|'casual', c:client, a:caFirm, d:director, f:formFields }
   A document's build() returns "blocks":
     {p, al:'l|c|r|j', b, u, ind, hang, after, sz, keep} | {gap:n} | {tbl:[[k,v]]} | {pb:true}
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
  const NUMW = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
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
  const firstFYEnd = inc => { const y = yr(inc); return y ? (y + 1) + '-03-31' : ''; };

  const CASE_TITLE = {
    first: 'First Auditor — Board Appointment u/s 139(6)',
    agm: 'Appointment at Annual General Meeting u/s 139(1)',
    casual: 'Casual Vacancy u/s 139(8)',
  };
  const CASE_SHORT = { first: 'First Auditor', agm: 'AGM Appointment', casual: 'Casual Vacancy' };
  const LH_CO = 'company', LH_CA = 'ca', LH_NONE = 'none';

  /* ---------- context-derived helpers ---------- */
  function prep(ctx) {
    const x = Object.assign({ c: {}, a: {}, d: {}, f: {} }, ctx);
    x.c = x.c || {}; x.a = x.a || {}; x.d = x.d || {}; x.f = x.f || {};
    x.venue = s => s || oneLine(x.c.addr);
    x.firmDesc = (x.a.firm ? x.a.firm : BL) + ', Chartered Accountants (Firm Registration No. ' + v(x.a.frn) + ')';
    x.remun = x.f.remun
      ? 'at a remuneration of ' + x.f.remun + ' plus applicable taxes and reimbursement of out-of-pocket expenses'
      : 'at such remuneration as may be mutually agreed upon between the Board of Directors and the Auditors';
    x.isRe = x.kase === 'agm' && x.f.apptType === 're';
    x.resign = x.kase === 'casual' && x.f.reason !== 'other';
    return x;
  }
  const prevDesc = f => v(f.prevFirm) + ', Chartered Accountants' + (f.prevFrn ? ' (Firm Registration No. ' + f.prevFrn + ')' : '');
  const vacancyText = x => x.f.reason === 'other' ? (v(x.f.reasonText) + ' of ' + prevDesc(x.f)) : ('the resignation of ' + prevDesc(x.f));
  function meetingDate(x) { const f = x.f; return x.kase === 'first' ? f.bmDate : x.kase === 'agm' ? f.agmDate : (x.resign ? f.egmDate : f.bmDate); }
  function termText(x, mode) { // mode: consent | board | letter
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
  const signoff = () => [{ p: 'Thanking you,', after: 0, keep: true }, { p: 'Yours faithfully,', keep: true }];
  function sigCompany(x, date, lead) {
    const { c, d, f } = x;
    return [{ gap: 1 }, { p: lead || ('For ' + c.name), b: true, keep: true }, { gap: 2 },
      { p: v(d.name), b: true, after: 0, keep: true }, { p: v(d.desig || 'Director'), after: 0, keep: true },
      { p: 'DIN: ' + v(d.din), after: 0, keep: true }, { p: 'Place: ' + v(f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }];
  }
  function sigCA(x, date) {
    const { a, f } = x;
    return [{ gap: 1 }, { p: 'For ' + v(a.firm), b: true, after: 0, keep: true }, { p: 'Chartered Accountants', after: 0, keep: true },
      { p: 'FRN: ' + v(a.frn), after: 0, keep: true }, { gap: 2 }, { p: '(' + v(a.partner) + ')', b: true, after: 0, keep: true },
      { p: v(a.desig || 'Partner'), after: 0, keep: true }, { p: 'Membership No.: ' + v(a.mno), after: 0, keep: true },
      ...(f.udin ? [{ p: 'UDIN: ' + f.udin, after: 0, keep: true }] : []),
      { p: 'Place: ' + v(f.place), after: 0, keep: true }, { p: 'Date: ' + ld(date), after: 0 }];
  }
  const toBoard = x => [{ p: 'To,', after: 0 }, { p: 'The Board of Directors', after: 0 }, { p: x.c.name, b: true, after: 0 }, ...addrLines(x.c.addr), { gap: 1 }];
  const toAuditor = (firm, addr, attn) => [{ p: 'To,', after: 0 }, { p: v(firm), b: true, after: 0 }, { p: 'Chartered Accountants', after: 0 }, ...addrLines(addr), ...(attn ? [{ p: 'Kind Attn.: ' + attn, after: 0 }] : []), { gap: 1 }];
  const ctcHead = (x, what, date, time, venue) => ({ p: 'CERTIFIED TRUE COPY OF THE ' + what + ' OF ' + String(x.c.name || '').toUpperCase() + ' HELD ON ' + dayName(date).toUpperCase() + ', ' + ld(date).toUpperCase() + ' AT ' + tm(time) + ' AT ' + oneLine(venue).toUpperCase(), b: true, al: 'j' });

  /* ---------- resolutions ---------- */
  const STAT = '(including any statutory modification(s) or re-enactment(s) thereof for the time being in force)';
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
  const GM_NOTES = [
    'A MEMBER ENTITLED TO ATTEND AND VOTE AT THE MEETING IS ENTITLED TO APPOINT A PROXY TO ATTEND AND VOTE INSTEAD OF HIMSELF/HERSELF AND THE PROXY NEED NOT BE A MEMBER OF THE COMPANY. The instrument appointing the proxy, in order to be effective, must be deposited at the Registered Office of the Company not less than 48 hours before the commencement of the meeting. A person can act as proxy on behalf of members not exceeding fifty and holding in the aggregate not more than ten percent of the total share capital of the Company carrying voting rights.',
    'Corporate members intending to send their authorised representatives to attend the meeting are requested to send to the Company a certified copy of the Board Resolution authorising their representative to attend and vote on their behalf at the meeting, pursuant to Section 113 of the Companies Act, 2013.',
    'Members / proxies are requested to bring the attendance slip duly filled in for attending the meeting.',
    'All documents referred to in the Notice are open for inspection by the members at the Registered Office of the Company on all working days during business hours up to the date of the meeting.',
    'The Proxy Form (Form MGT-11), Attendance Slip and Route Map to the venue of the meeting are annexed to this Notice.'];

  /* ---------- documents ---------- */
  function docDefs(ctx) {
    const x = prep(ctx), { c, a, f } = x, K = x.kase, D = [];
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
        ...['we are eligible for appointment and are not disqualified for appointment under the Companies Act, 2013, the Chartered Accountants Act, 1949 and the rules or regulations made thereunder;',
          'the proposed appointment is as per the term provided under the Act;',
          'the proposed appointment is within the limits laid down by or under the authority of the Act;',
          'the list of proceedings against us or any partner of the firm pending with respect to professional matters of conduct, as disclosed in this certificate, is true and correct — there are no such proceedings pending as on the date of this certificate; and',
          'we satisfy the criteria provided in Section 141 of the Act.' + (a.peer ? ' We also hold a valid Peer Review Certificate (No. ' + a.peer + ') issued by the Peer Review Board of the Institute of Chartered Accountants of India.' : '')
        ].map((t, i) => ({ p: '(' + 'abcde'[i] + ')\t' + t, hang: true, al: 'j' })),
        { p: 'Particulars of the firm for the purpose of e-Form ADT-1:', b: true }, { tbl: rows },
        ...signoff(), ...sigCA(x, date)];
    } };

    const prevComm = { id: 'prevcomm', title: 'Communication with Previous Auditor', sub: 'ICAI — Clause (8), Part I, First Schedule, CA Act 1949', lh: LH_CA, build: () => {
      const date = f.consentDate;
      return [{ p: 'Date: ' + ld(date), al: 'r' }, { p: '**By Registered Post A.D. / Email**' }, ...toAuditor(f.prevFirm, (f.prevAddr || '') + (f.prevEmail ? '\nEmail: ' + f.prevEmail : '')),
        subj('Communication under Clause (8) of Part I of the First Schedule to the Chartered Accountants Act, 1949 — ' + c.name + ' (CIN: ' + v(c.cin) + ')'),
        { p: 'Dear Sir / Madam,' },
        { p: 'We have been approached by ' + c.name + ' (“the Company”) to accept appointment as its Statutory Auditors' + (K === 'casual' ? ' to fill the casual vacancy in the office of the Statutory Auditors' : '') + '. We understand that you ' + (K === 'casual' ? 'were' : 'are') + ' the Statutory Auditors of the Company.', al: 'j' },
        { p: 'Before accepting the said appointment, and in compliance with Clause (8) of Part I of the First Schedule to the Chartered Accountants Act, 1949, we request you to kindly let us know whether there are any professional or other reasons which, in your opinion, should be brought to our notice and which may prevent us from accepting the said appointment.', al: 'j' },
        { p: 'We shall be grateful for an early reply. In case we do not hear from you within a reasonable time, we shall presume that you have no objection to our accepting the appointment.', al: 'j' },
        ...signoff(), ...sigCA(x, date)];
    } };

    const bmNotice = agenda => ({ id: 'bmnotice', title: 'Notice of Board Meeting', sub: 'Sec 173(3) & Secretarial Standard-1 (ICSI)', lh: LH_CO, build: () => {
      const date = f.bmNotice;
      return [{ p: 'Date: ' + ld(date), al: 'r' }, { p: 'To,', after: 0 }, { p: 'All the Directors of ' + c.name, after: 0 },
        ...(c.directors || []).map(d => ({ p: d.name + (d.din ? ' (DIN: ' + d.din + ')' : ''), after: 0 })), { gap: 1 },
        { p: 'NOTICE OF MEETING OF THE BOARD OF DIRECTORS', b: true, al: 'c', u: true },
        { p: 'Notice is hereby given that a Meeting of the Board of Directors of ' + c.name + ' will be held on ' + dayName(f.bmDate) + ', ' + ld(f.bmDate) + ' at ' + tm(f.bmTime) + ' at ' + oneLine(x.venue(f.bmVenue)) + ', to transact the following business:', al: 'j' },
        { p: 'AGENDA', b: true, al: 'c' }, ...numbered(agenda),
        { p: 'Directors desirous of participating in the meeting through video conferencing or other audio-visual means, as permitted under Section 173(2) of the Companies Act, 2013, are requested to inform the Company in advance. The draft resolutions and the papers relating to the agenda items are available at the Registered Office for inspection.', al: 'j' },
        { p: 'You are requested to make it convenient to attend the meeting.' },
        ...sigCompany(x, date, 'By Order of the Board\nFor ' + c.name)];
    } });

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
      const indent = b => Object.assign({}, b, { ind: 567, al: 'j' });
      const out = [{ p: 'NOTICE', b: true, al: 'c', sz: 28 },
        { p: '**NOTICE** is hereby given that the ' + (kind === 'agm' ? ord(f.agmNo) + ' Annual General Meeting' : 'Extraordinary General Meeting') + ' of the members of ' + c.name + ' will be held on ' + dayName(md) + ', ' + ld(md) + ' at ' + tm(mt) + ' at ' + oneLine(mv) + ' to transact the following business:', al: 'j' }];
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
        { p: 'A. Company details', b: true }, { tbl: [['CIN', v(c.cin)], ['Name of the company', c.name], ['Registered office', oneLine(c.addr)], ['Email ID of the company', v(c.email)]] },
        { p: 'B. Appointment details', b: true }, { tbl: [['Nature of appointment', nature], ['Whether joint auditors appointed', 'No'], ['Date of ' + (boardOnly ? 'Board meeting' : 'general meeting'), sd(meet)], ['Period of account — from', sd(per.from)], ['Period of account — to', sd(per.to)], ['Number of financial years', per.n],
          ...(K === 'casual' ? [['Previous auditor', prevDesc(f)], ['Date of vacancy', sd(f.vacDate)], ['Reason for vacancy', f.reason === 'other' ? v(f.reasonText) : 'Resignation (obtain SRN of ADT-3 filed by the outgoing auditor)']] : []),
          ...(K === 'agm' && !x.isRe && f.prevFirm ? [['Previous auditor', prevDesc(f)]] : [])] },
        { p: 'C. Auditor details', b: true }, { tbl: [['Category of auditor', 'Auditor’s firm'], ['Name of the firm', v(a.firm)], ['Firm Registration No.', v(a.frn)], ['PAN of the firm', v(a.pan)], ['Address', oneLine(a.addr) || BL], ['Email ID', v(a.email)], ['Signing ' + (a.desig || 'Partner') + ' / Membership No.', v(a.partner) + ' / ' + v(a.mno)]] },
        { p: 'D. Due dates', b: true }, { tbl: [['e-Form ADT-1 to be filed by', '**' + sd(addDays(meet, 15)) + '** (within 15 days of the meeting — Rule 4(2))'],
          ...(K === 'first' ? [['Board meeting deadline', sd(addDays(f.incDate, 30)) + ' (30 days from incorporation — Sec 139(6))']] : []),
          ...(K === 'casual' ? [['Board appointment deadline', sd(addDays(f.vacDate, 30)) + ' (30 days from vacancy — Sec 139(8))']] : []),
          ...(x.resign ? [['Members’ approval deadline', sd(addMonths(f.bmDate, 3)) + ' (3 months from Board recommendation)'], ['ADT-3 by outgoing auditor', sd(addDays(f.vacDate, 30)) + ' (Sec 140(2))']] : [])] },
        { p: 'E. Attachments to ADT-1', b: true }, ...numbered(atts),
        { p: 'F. Before filing', b: true }, ...numbered(['Verify the auditor’s FRN and firm details on the ICAI website.', 'Ensure the consent and eligibility certificate is dated before the meeting.',
          ...(K === 'casual' || (K === 'agm' && !x.isRe) ? ['Ensure the new auditor’s written communication with the previous auditor (ICAI Clause 8) is complete before acceptance.'] : []),
          'The form is to be digitally signed by an authorised Director whose DSC is registered on MCA.', 'Keep the SRN and challan of ADT-1 in the client file.']),
        { p: 'Internal working paper. Verify all particulars against the live MCA V3 form fields at the time of filing.', sz: 18 }];
    } };

    if (K === 'first') {
      D.push(consent, bmNotice(['To elect the Chairperson of the meeting.', 'To grant leave of absence, if any.', 'To appoint the First Statutory Auditors of the Company under Section 139(6) of the Companies Act, 2013.', 'To authorise Director(s) to file e-Form ADT-1 with the Registrar of Companies.', 'Any other business with the permission of the Chairperson.']), boardCTC, apptLetter, accept, checklist);
    } else if (K === 'agm') {
      if (!x.isRe && f.prevFirm) D.push(prevComm);
      D.push(consent, bmNotice(['To grant leave of absence, if any.', 'To consider and recommend to the members the ' + (x.isRe ? 're-' : '') + 'appointment of the Statutory Auditors of the Company.', 'To approve the Notice of the ' + ord(f.agmNo) + ' Annual General Meeting and fix the date, time and venue thereof.', 'To authorise a Director to sign and issue the Notice of the Annual General Meeting.', 'Any other business with the permission of the Chairperson.']), boardCTC, gmNotice('agm'), membersCTC('agm'), apptLetter, accept, checklist);
    } else if (K === 'casual') {
      D.push(prevComm, consent, bmNotice(['To grant leave of absence, if any.', x.resign ? 'To take note of the resignation of ' + v(f.prevFirm) + ', Statutory Auditors of the Company.' : 'To take note of the casual vacancy in the office of the Statutory Auditors.', 'To appoint the Statutory Auditors to fill the casual vacancy under Section 139(8) of the Companies Act, 2013.', ...(x.resign ? ['To approve the Notice of the Extraordinary General Meeting for approval of the members.'] : []), 'To authorise a Director to file e-Form ADT-1 and to do all incidental acts.', 'Any other business with the permission of the Chairperson.']), boardCTC);
      if (x.resign) D.push(gmNotice('egm'), membersCTC('egm'));
      D.push(apptLetter, accept, checklist);
    }
    return D.map((d, i) => Object.assign({}, d, { no: i + 1 }));
  }

  function adtPeriod(x) {
    const f = x.f;
    if (x.kase === 'first') return { from: f.incDate, to: firstFYEnd(f.incDate), n: '1' };
    if (x.kase === 'agm') { const s = fyStart(f.agmDate), t = parseInt(f.term, 10) || 5; return s ? { from: s + '-04-01', to: (s + t) + '-03-31', n: String(t) } : { from: '', to: '', n: String(t) }; }
    const s = fyStart(f.vacDate); return s ? { from: s + '-04-01', to: (s + 1) + '-03-31', n: '1' } : { from: '', to: '', n: '1' };
  }

  /* ---------- required fields ---------- */
  function missing(ctx) {
    const x = prep(ctx), f = x.f, m = [], need = (k, l) => { if (!f[k]) m.push(l); };
    if (!ctx.a || !ctx.a.firm) m.push('CA firm');
    if (!ctx.d || !ctx.d.name) m.push('Signing director');
    need('place', 'Place');
    if (x.kase === 'first') { need('incDate', 'Date of incorporation'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time'); }
    if (x.kase === 'agm') { need('agmNo', 'AGM number'); need('agmDate', 'AGM date'); need('agmTime', 'AGM time'); need('bmDate', 'Board meeting date'); }
    if (x.kase === 'casual') { need('prevFirm', 'Outgoing auditor firm'); need('vacDate', 'Date of vacancy'); need('bmDate', 'Board meeting date'); need('bmTime', 'Board meeting time');
      if (f.reason === 'other') need('reasonText', 'Reason for vacancy'); else { need('egmDate', 'EGM date'); need('egmTime', 'EGM time'); } }
    return m;
  }

  /* ---------- compliance timeline ---------- */
  // returns [{label, rule, due, actual, actualLabel, key}] — key marks the ADT-1 row for dashboards
  function timeline(ctx) {
    const x = prep(ctx), f = x.f, R = [], row = (label, due, actual, actualLabel, rule, key) => R.push({ label, due, actual: actual || '', actualLabel: actualLabel || '', rule: rule || '', key: key || '' });
    if (x.kase === 'first') {
      row('Board meeting to appoint first auditor', addDays(f.incDate, 30), f.bmDate, 'Meeting', 'within 30 days of incorporation, Sec 139(6)', 'board');
      row('Notice of Board meeting', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'at least 7 days, Sec 173(3)');
      row('File e-Form ADT-1', addDays(f.bmDate, 15), f.adt1Date, 'Filed', 'within 15 days of meeting, Rule 4(2)', 'adt1');
      const fy = firstFYEnd(f.incDate); row('First AGM (first auditor holds office till then)', fy ? addMonths(fy, 9) : '', '', '', 'within 9 months of first FY end, Sec 96');
    } else if (x.kase === 'agm') {
      if (f.fyEnd) row('AGM for FY ended ' + sd(f.fyEnd), addMonths(f.fyEnd, 6), f.agmDate, 'AGM', 'within 6 months of FY end, Sec 96', 'agm');
      row('Notice of Board meeting', addDays(f.bmDate, -7), f.bmNotice, 'Notice', 'at least 7 days, Sec 173(3)');
      row('Dispatch AGM notice (21 clear days)', addDays(f.agmDate, -22), f.agmNotice, 'Notice', 'Sec 101');
      row('Board meeting approving notice — before notice date', f.agmNotice || addDays(f.agmDate, -22), f.bmDate, 'Meeting', '');
      row('File e-Form ADT-1', addDays(f.agmDate, 15), f.adt1Date, 'Filed', 'within 15 days of AGM, Rule 4(2)', 'adt1');
    } else {
      row('Board to fill casual vacancy', addDays(f.vacDate, 30), f.bmDate, 'Meeting', 'within 30 days, Sec 139(8)', 'board');
      if (x.resign) {
        row('Outgoing auditor to file ADT-3', addDays(f.vacDate, 30), '', '', 'within 30 days of resignation, Sec 140(2)');
        row('Members to approve at general meeting', addMonths(f.bmDate, 3), f.egmDate, 'EGM', 'within 3 months of Board recommendation, Sec 139(8)(i)', 'egm');
        row('Dispatch EGM notice (21 clear days)', addDays(f.egmDate, -22), f.egmNotice, 'Notice', 'Sec 101');
      }
      row('File e-Form ADT-1', addDays(meetingDate(x), 15), f.adt1Date, 'Filed', 'within 15 days of ' + (x.resign ? 'EGM' : 'Board meeting') + ', Rule 4(2)', 'adt1');
    }
    return R.map(r => Object.assign(r, { status: r.due && r.actual ? (r.actual <= r.due ? 'ok' : 'late') : '' }));
  }

  function fileName(d, companyName) {
    const safe = s => String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    return String(d.no).padStart(2, '0') + '_' + safe(d.title) + '_' + safe(companyName).slice(0, 40) + '.docx';
  }

  return { CASE_TITLE, CASE_SHORT, LH_CO, LH_CA, LH_NONE, BL, docDefs, missing, timeline, fileName,
    helpers: { ld, sd, tm, ord, addDays, addMonths, oneLine, fyStart, firstFYEnd, pd } };
});
