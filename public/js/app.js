/* NeuSource Statutory CRM — frontend */
(function () {
'use strict';
const DC = window.DocsContent, H = DC.helpers;
const $ = id => document.getElementById(id);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const todayISO = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const isAdmin = () => S.me && S.me.role === 'admin';

const S = { me: null, clients: [], cas: [], filings: [] };
const OFFLINE = 'Portal ka server band hai. START.bat wali kaali window khuli rakhiye (band ho gayi ho to START.bat dobara chalaiye), phir page refresh karein.';

/* ---------------- API ---------------- */
async function api(method, url, body) {
  let r;
  try { r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch (e) { throw new Error(OFFLINE); }
  if (r.status === 401 && !url.includes('/api/login')) { S.me = null; showAuth(); throw new Error('Please log in again.'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : null;
  if (!r.ok) throw new Error((data && data.error) || 'Request failed (' + r.status + ')');
  return data;
}
function toast(msg, err) {
  let box = $('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), err ? 4500 : 2600);
}
const fail = e => toast(e.message || String(e), true);

/* ---------------- logo ---------------- */
// Uses /img/logo.png if you add one; otherwise the logo from neusourcestartup.com; otherwise a text wordmark.
const SITE_LOGO = 'https://www.neusourcestartup.com/content/v2/img/Neusource-India.png';
function renderLogos() {
  $$('[data-logo]').forEach(el => {
    el.innerHTML = '';
    const img = new Image(); img.alt = 'NeuSource'; img.src = '/img/logo.png';
    img.onerror = () => {
      if (img.src.indexOf('/img/logo.png') !== -1) { img.src = SITE_LOGO; return; }
      el.innerHTML = '<span class="wordmark">Neu<span>Source</span></span>';
    };
    el.appendChild(img);
  });
}

/* ---------------- auth ---------------- */
async function boot() {
  renderLogos();
  try {
    const { user } = await api('GET', '/api/me');
    if (user) { S.me = user; return startApp(); }
  } catch (e) { /* fall through */ }
  showAuth();
}
async function showAuth() {
  $('appShell').classList.add('hidden'); $('auth').classList.remove('hidden');
  let needsSetup = false;
  try { needsSetup = (await api('GET', '/api/setup-status')).needsSetup; } catch (e) {}
  $('setupForm').classList.toggle('hidden', !needsSetup); $('loginForm').classList.toggle('hidden', needsSetup);
}
$('loginForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target, btn = f.querySelector('button'); $('loginErr').classList.add('hidden'); btn.disabled = true;
  try { const { user } = await api('POST', '/api/login', { email: f.email.value, password: f.password.value }); S.me = user; f.reset(); startApp(); }
  catch (err) { $('loginErr').textContent = err.message; $('loginErr').classList.remove('hidden'); }
  btn.disabled = false;
};
$('setupForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target; $('setupErr').classList.add('hidden');
  try { const { user } = await api('POST', '/api/setup', { name: f.name.value, email: f.email.value, password: f.password.value }); S.me = user; startApp(); }
  catch (err) { $('setupErr').textContent = err.message; $('setupErr').classList.remove('hidden'); }
};
$('logoutBtn').onclick = async () => { if ($('toasts')) $('toasts').innerHTML = ''; try { await api('POST', '/api/logout'); } catch (e) {} S.me = null; location.hash = ''; showAuth(); };
$('menuToggle').onclick = () => $('side').classList.toggle('open');

async function startApp() {
  $('auth').classList.add('hidden'); $('appShell').classList.remove('hidden');
  $('meName').textContent = S.me.name; $('meRole').textContent = S.me.role;
  $('meAvatar').textContent = S.me.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $$('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  await loadMasters();
  route();
}
async function loadMasters() {
  try { [S.clients, S.cas] = await Promise.all([api('GET', '/api/clients'), api('GET', '/api/cas')]); } catch (e) { fail(e); }
  S.clients.sort((a, b) => a.name.localeCompare(b.name)); S.cas.sort((a, b) => a.firm.localeCompare(b.firm));
}

/* ---------------- router ---------------- */
function parseHash() { const [p, q] = (location.hash.replace(/^#\/?/, '') || 'clients').split('?'); return { page: p || 'clients', params: new URLSearchParams(q || '') }; }
window.addEventListener('hashchange', () => { if (S.me) route(); });
const PAGES = {};
function route() {
  const { page, params } = parseHash();
  const fn = PAGES[page] && (!['users', 'activity'].includes(page) || isAdmin()) ? PAGES[page] : PAGES.clients;
  const nav = page === 'generate' ? 'clients' : page;
  $$('.side a').forEach(a => a.classList.toggle('active', a.dataset.route === nav));
  $('side').classList.remove('open');
  window.scrollTo(0, 0);
  fn(params);
}

/* =====================================================================
   GENERATE
   ===================================================================== */
const G = { clientId: '', caId: '', dirIndex: 0, dirIdx: [0], kase: '', form: {}, fy: '', link: {} };
// default financial year: the last completed FY (e.g. in Oct 2026 → 2025-26)
const lastFY = () => { const t = new Date().toISOString().slice(0, 10), y = +t.slice(5, 7) >= 4 ? +t.slice(0, 4) : +t.slice(0, 4) - 1; return (y - 1) + '-' + String(y).slice(2); };
const prevFY = fy => { const y = parseInt(fy, 10); return y ? (y - 1) + '-' + String(y).slice(2) : ''; };
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let saveTimer = null, docKey = '';
const docSel = {};
const DIRSEL = 'data-dirs';
const BM = (req) => `<h3>Board Meeting</h3><div class="grid">
  <div><label>Board Meeting Date${req ? ' <span class="req">*</span>' : ''}</label><input type="date" data-f="bmDate"></div>
  <div><label>Board Meeting Time${req ? ' <span class="req">*</span>' : ''}</label><input type="time" data-f="bmTime" data-def="11:00"></div>
  <div><label>Date of Notice of Board Meeting</label><input type="date" data-f="bmNotice"><div class="hint">At least 7 days before the meeting (Sec 173(3))</div></div>
  <div class="span3"><label>Board Meeting Venue</label><input data-f="bmVenue" placeholder="Leave blank to use the Registered Office"></div></div>`;
const EGM = (title) => `<h3>${title}</h3><div class="grid">
  <div><label>EGM Date <span class="req">*</span></label><input type="date" data-f="egmDate"></div>
  <div><label>EGM Time <span class="req">*</span></label><input type="time" data-f="egmTime" data-def="11:00"></div>
  <div><label>Date of EGM Notice</label><input type="date" data-f="egmNotice"><div class="hint">At least 21 clear days before the EGM, unless shorter-notice consent</div></div>
  <div class="span3"><label>EGM Venue</label><input data-f="egmVenue" placeholder="Leave blank to use the Registered Office"></div></div>`;
const AUD_EXTRA = `<h3>Auditor Letters</h3><div class="grid">
  <div><label>Date of Auditor's Consent Letter</label><input type="date" data-f="consentDate"><div class="hint">Should be before the Board meeting</div></div>
  <div><label>UDIN (eligibility certificate)</label><input data-f="udin" placeholder="Optional"></div>
  <div><label>Remuneration</label><input data-f="remun" placeholder="Blank = as mutually agreed"></div></div>`;
const AFTER = (rows) => `<h3>After Filing on MCA</h3><div class="grid">${rows.map(([srn, date, form]) =>
  `<div><label>${form} SRN</label><input data-f="${srn}" placeholder="Enter after filing"></div><div><label>Date ${form} Filed</label><input type="date" data-f="${date}"><div class="hint">Marks this step as done in the compliance timeline</div></div>`).join('')}</div>`;

const FIELDS = {
  first: `<div class="grid">
    <div><label>Date of Incorporation <span class="req">*</span></label><input type="date" data-f="incDate"><div class="hint">From client master; you can change it here.</div></div></div>
    ${BM(true)}${AUD_EXTRA}${AFTER([['adt1Srn', 'adt1Date', 'ADT-1']])}`,
  agm: `<div class="grid">
    <div><label>Type of Appointment <span class="req">*</span></label><select data-f="apptType"><option value="new">New auditor (change of auditor)</option><option value="re">Re-appointment of existing auditor</option></select></div>
    <div><label>AGM Number <span class="req">*</span></label><input type="number" min="1" data-f="agmNo" placeholder="e.g. 5 for 5th AGM"></div>
    <div><label>Term (years) <span class="req">*</span></label><input type="number" min="1" max="5" data-f="term" data-def="5"><div class="hint">One term of 5 consecutive years (Sec 139(1))</div></div>
    <div><label>AGM Date <span class="req">*</span></label><input type="date" data-f="agmDate"></div>
    <div><label>AGM Time <span class="req">*</span></label><input type="time" data-f="agmTime" data-def="11:00"></div>
    <div><label>Financial Year ended (accounts adopted)</label><input type="date" data-f="fyEnd"><div class="hint">Auto: 31 March before the AGM</div></div>
    <div><label>Date of AGM Notice</label><input type="date" data-f="agmNotice"><div class="hint">At least 21 clear days before AGM (Sec 101)</div></div>
    <div class="span2"><label>AGM Venue</label><input data-f="agmVenue" placeholder="Leave blank to use the Registered Office"></div></div>
    ${BM(true)}
    <div data-show="prev-agm"><h3>Previous / Retiring Auditor (for ICAI communication letter)</h3><div class="grid">
    <div><label>Firm Name</label><input data-f="prevFirm"></div><div><label>FRN</label><input data-f="prevFrn"></div><div><label>Email</label><input data-f="prevEmail"></div>
    <div class="span3"><label>Address</label><input data-f="prevAddr"></div></div></div>
    ${AUD_EXTRA}${AFTER([['adt1Srn', 'adt1Date', 'ADT-1']])}`,
  casual: `<div class="grid">
    <div><label>Reason for Vacancy <span class="req">*</span></label><select data-f="reason"><option value="resign">Resignation of auditor</option><option value="other">Other (death / disqualification etc.)</option></select></div>
    <div class="span2" data-show="reason-other"><label>Describe the reason <span class="req">*</span></label><input data-f="reasonText" placeholder="e.g. death of the sole proprietor"></div></div>
    <h3>Outgoing Auditor</h3><div class="grid">
    <div><label>Firm Name <span class="req">*</span></label><input data-f="prevFirm"></div><div><label>FRN</label><input data-f="prevFrn"></div><div><label>Email</label><input data-f="prevEmail"></div>
    <div class="span2"><label>Address</label><input data-f="prevAddr"></div>
    <div data-show="reason-resign"><label>Date of Resignation Letter</label><input type="date" data-f="resignLetter"></div>
    <div><label>Date of Vacancy (effective) <span class="req">*</span></label><input type="date" data-f="vacDate"></div></div>
    ${BM(true)}<div data-show="reason-resign">${EGM("Extraordinary General Meeting (members' approval within 3 months)")}</div>
    ${AUD_EXTRA}${AFTER([['adt1Srn', 'adt1Date', 'ADT-1']])}`,
  dirapp: `<div class="grid">
    <div><label>Mode of Appointment <span class="req">*</span></label><select data-f="apptMode"><option value="additional">Additional Director by the Board — Sec 161(1)</option><option value="egm">Director appointed by members at EGM — Sec 152</option></select></div>
    <div data-show="regularise"><label>Regularise at an EGM now?</label><select data-f="regularise"><option value="no">No — regularise at the next AGM</option><option value="yes">Yes — also make EGM documents</option></select></div>
    <div><label>Category</label><select data-f="appCat"><option value="nonexec">Non-Executive Director</option><option value="exec">Executive Director</option></select><div class="hint">MD / Whole-time Director need Sec 196 approvals — not covered here</div></div>
    <div><label>Liable to retire by rotation?</label><select data-f="retire"><option value="no">No (usual for private companies)</option><option value="yes">Yes (public companies — Sec 152(6))</option></select></div></div>
    <h3>New Director's Details</h3><div class="grid">
    <div><label>Title</label><select data-f="appTitle"><option>Mr.</option><option>Ms.</option><option>Mrs.</option><option>Dr.</option></select></div>
    <div><label>Full Name <span class="req">*</span></label><input data-f="appName"></div>
    <div><label>DIN <span class="req">*</span></label><input data-f="appDin" maxlength="8" placeholder="8 digits"></div>
    <div><label>Father's Name <span class="req">*</span></label><input data-f="appFather"></div>
    <div><label>Date of Birth</label><input type="date" data-f="appDob"></div>
    <div><label>Income-tax PAN</label><input data-f="appPan" maxlength="10" style="text-transform:uppercase"></div>
    <div class="span3"><label>Residential Address <span class="req">*</span></label><textarea data-f="appAddr"></textarea></div>
    <div><label>Email</label><input type="email" data-f="appEmail"></div><div><label>Mobile</label><input data-f="appMobile"></div>
    <div><label>Occupation</label><input data-f="appOcc" placeholder="e.g. Business"></div>
    <div><label>Nationality</label><input data-f="appNat" data-def="Indian"></div>
    <div><label>Qualification</label><input data-f="appQual" placeholder="e.g. B.Com, MBA"></div>
    <div><label>Shareholding in this company</label><input data-f="appShares" placeholder="Nil"></div>
    <div class="span3"><label>Brief profile / experience (for EGM notice)</label><input data-f="appExp"></div>
    <div class="span2"><label>Membership / CoP No. if a professional (DIR-2 item 12)</label><input data-f="appProf" placeholder="Not applicable"></div>
    <div><label>Relationship with other directors</label><input data-f="appRel" placeholder="None"></div>
    <div class="span3"><label>Remuneration / terms (optional)</label><input data-f="appRemun" placeholder="Blank = no remuneration other than sitting fees"></div>
    <div class="span3"><label>Directorships in other companies — last 3 years (DIR-8)</label><textarea data-f="appOther" placeholder="One per line:  Company name | Date of appointment | Date of cessation (blank if continuing)"></textarea></div>
    <div class="span3"><label>Interest in other entities (MBP-1)</label><textarea data-f="appInterest" placeholder="One per line:  Entity name | Nature of interest | Shareholding | Date interest arose"></textarea></div>
    <div><label>Date of DIR-2 / DIR-8 / MBP-1</label><input type="date" data-f="consentDate"><div class="hint">On or before the appointment date</div></div>
    <div class="span2"><label>Signature of new director (image)</label><div class="sigbox"><input type="file" accept="image/png,image/jpeg" id="appSign-file"><img id="appSign-prev" class="sig-prev hidden" alt=""><button type="button" class="danger sm hidden" id="appSign-del">Remove</button></div><div class="hint">Printed on DIR-2, DIR-8, MBP-1 and the acceptance</div></div>
    <div class="span3"><label>After generating</label><select data-f="addToMaster"><option value="yes">Add this person to the client's director list</option><option value="no">Do not change the director list</option></select></div></div>
    ${BM(true)}<div data-show="egm">${EGM('Extraordinary General Meeting')}</div>
    ${AFTER([['dir12Srn', 'dir12Date', 'DIR-12']])}`,
  dirres: `<div class="grid">
    <div><label>Resigning Director <span class="req">*</span></label><select data-f="resIndex" ${DIRSEL}></select><div class="hint">Signature from the client master is printed on the resignation letter</div></div>
    <div><label>Date of Resignation Letter <span class="req">*</span></label><input type="date" data-f="resLetter"></div>
    <div><label>Date Received by Company <span class="req">*</span></label><input type="date" data-f="resReceipt"></div>
    <div><label>Later effective date (if stated in letter)</label><input type="date" data-f="resEffDate"><div class="hint">Effective = receipt date, or this date if later (Sec 168(2))</div></div>
    <div class="span2"><label>Reason (optional)</label><input data-f="resReason" placeholder="Blank = personal reasons and pre-occupation"></div></div>
    ${BM(true)}${AFTER([['dir12Srn', 'dir12Date', 'DIR-12']])}`,
  annual: `<div class="grid">
    <div><label>Financial Year Ended <span class="req">*</span></label><input type="date" data-f="fyEnd"><div class="hint">Usually 31 March</div></div>
    <div><label>Company Size <span class="req">*</span></label><select data-f="coSize"><option value="small">Small company / OPC — MGT-7A, abridged Board's Report (Rule 8A)</option><option value="other">Other — MGT-7, full Board's Report (Rule 8)</option></select></div>
    </div>
    <h3>Annual General Meeting</h3><div class="grid">
    <div><label>AGM Number <span class="req">*</span></label><input type="number" min="1" data-f="agmNo" placeholder="1 for first AGM"></div>
    <div><label>AGM Date <span class="req">*</span></label><input type="date" data-f="agmDate"></div>
    <div><label>AGM Time <span class="req">*</span></label><input type="time" data-f="agmTime" data-def="11:00"></div>
    <div><label>Date of AGM Notice</label><input type="date" data-f="agmNotice"></div>
    <div><label>Shorter notice?</label><select data-f="shortNotice"><option value="no">No — 21 clear days' notice</option><option value="yes">Yes — with consent of 95% members</option></select></div>
    <div class="span3"><label>AGM Venue</label><input data-f="agmVenue" placeholder="Leave blank to use the Registered Office"></div></div>
    ${BM(true)}
    <div class="grid" style="margin-top:12px"><div class="span3"><label>Dates of all Board meetings held during the year</label><textarea data-f="bmList" placeholder="One date per line, e.g. 15/05/2025"></textarea><div class="hint">Filled automatically for the chosen FY (same dates as Yearly Records) — printed in the Board's Report and MGT-7.</div></div></div>
    <h3>Financial Highlights (for Board's Report)</h3><div class="grid">
    <div><label>Amounts shown in</label><select data-f="amtUnit"><option>Amount in Rs.</option><option>Rs. in Lakhs</option><option>Rs. in Thousands</option></select></div><div></div><div></div>
    <div><label>Total revenue — this year</label><input data-f="revCur"></div><div><label>Total revenue — previous year</label><input data-f="revPrev"></div><div></div>
    <div><label>Profit/(Loss) before tax — this year</label><input data-f="pbtCur"></div><div><label>Profit/(Loss) before tax — previous</label><input data-f="pbtPrev"></div><div></div>
    <div><label>Tax expense — this year</label><input data-f="taxCur"></div><div><label>Tax expense — previous</label><input data-f="taxPrev"></div><div></div>
    <div><label>Profit/(Loss) after tax — this year</label><input data-f="patCur"></div><div><label>Profit/(Loss) after tax — previous</label><input data-f="patPrev"></div><div></div>
    <div><label>Turnover (for MGT-7)</label><input data-f="turnover"></div><div><label>Net worth (for MGT-7)</label><input data-f="netWorth"></div></div>
    <h3>Board's Report Disclosures <small class="hint">(leave blank for the standard "Nil / not applicable" wording)</small></h3><div class="grid">
    <div class="span3"><label>Dividend</label><input data-f="dividend"></div>
    <div class="span3"><label>Transfer to reserves</label><input data-f="reserves"></div>
    <div class="span3"><label>Change in directors during the year</label><input data-f="dirChanges"></div>
    <div class="span3"><label>Material changes after year end</label><input data-f="material"></div>
    <div class="span3"><label>Auditors' report remarks</label><input data-f="audQual" placeholder="Blank = no qualification, reservation or adverse remark"></div>
    <div><label>Related party contracts (Sec 188)?</label><select data-f="rpt"><option value="no">No — AOC-2 not applicable</option><option value="yes">Yes — attach Form AOC-2</option></select></div>
    <div class="span2" data-show="rpt"><label>AOC-2 entries</label><textarea data-f="rptList" placeholder="One per line:  Party & relationship | Nature | Duration | Terms & value | Board approval date | Advance"></textarea></div>
    <div><label>Employees — Female</label><input data-f="empF" placeholder="0"></div><div><label>Employees — Male</label><input data-f="empM" placeholder="0"></div><div><label>Employees — Transgender</label><input data-f="empT" placeholder="0"></div>
    <div><label>POSH complaints received</label><input data-f="poshRecd" placeholder="0"></div><div><label>POSH complaints disposed</label><input data-f="poshDisp" placeholder="0"></div><div><label>Pending &gt; 90 days</label><input data-f="poshPend" placeholder="0"></div>
    <div data-show="full" class="span3"><label>Foreign exchange earnings / outgo</label><div class="grid" style="grid-template-columns:1fr 1fr"><input data-f="fxEarn" placeholder="Earnings: Nil"><input data-f="fxOut" placeholder="Outgo: Nil"></div></div></div>
    ${AFTER([['aoc4Srn', 'aoc4Date', 'AOC-4'], ['mgt7Srn', 'mgt7Date', 'MGT-7/7A']])}`,
  allot: `<div class="grid">
    <div><label>Type of issue</label><select data-f="issueType"><option value="rights">Rights issue to existing shareholders — Sec 62(1)(a)</option></select><div class="hint">Private placement (Sec 42, PAS-4) is not covered</div></div>
    <div><label>Number of shares offered <span class="req">*</span></label><input data-f="offerShares" placeholder="e.g. 10000"></div>
    <div><label>Premium per share (Rs.)</label><input data-f="premium" placeholder="0 = at par"></div>
    <div class="span2"><label>Ratio / basis</label><input data-f="ratio" placeholder="Blank = in proportion to their existing shareholding"></div>
    <div><label>Date of Letter of Offer <span class="req">*</span></label><input type="date" data-f="offerDate"></div>
    <div><label>Offer open for (days)</label><input type="number" min="1" data-f="offerDays" data-def="15"><div class="hint">Minimum 15 days (shorter only with 90% members' consent)</div></div>
    <div><label>Last date of acceptance <span class="req">*</span></label><input type="date" data-f="lastDate"></div>
    <div class="span3"><label>Company bank account (for payment)</label><input data-f="bank" placeholder="e.g. HDFC Bank, A/c No. ____, IFSC ____"></div></div>
    ${BM(true)}
    <h3>Allotment Board Meeting</h3><div class="grid">
    <div><label>Allotment Meeting Date <span class="req">*</span></label><input type="date" data-f="alDate"></div>
    <div><label>Time</label><input type="time" data-f="alTime" data-def="11:00"></div>
    <div><label>Date of Notice</label><input type="date" data-f="alNotice"></div>
    <div class="span3"><label>Venue</label><input data-f="alVenue" placeholder="Leave blank to use the Registered Office"></div>
    <div class="span3"><label>Allottees <span class="req">*</span></label><textarea data-f="allottees" placeholder="One per line:  Name | Folio No. | No. of shares | Amount received (blank = shares × price) | Date of receipt | Mode"></textarea></div>
    <div><label>First share certificate no.</label><input data-f="certFrom" placeholder="e.g. 3"></div>
    <div><label>Distinctive no. starts from</label><input data-f="distFrom" placeholder="Blank = after existing shares"></div>
    <div><label>After generating</label><select data-f="updateMaster"><option value="yes">Update shareholders & paid-up capital in client master</option><option value="no">Do not change the client master</option><option value="done">Already updated ✓</option></select></div></div>
    ${AFTER([['pas3Srn', 'pas3Date', 'PAS-3']])}`,
  authcap: `<div class="grid">
    <div><label>Existing authorised capital (Rs.)</label><input data-f="oldCap"><div class="hint">From client master</div></div>
    <div><label>New authorised capital (Rs.) <span class="req">*</span></label><input data-f="newCap" placeholder="e.g. 25,00,000"></div>
    <div><label>Resolution required by Articles</label><select data-f="resType"><option value="ordinary">Ordinary resolution (Sec 61)</option><option value="special">Special resolution (if AoA requires) + MGT-14</option></select></div>
    <div><label>After generating</label><select data-f="updateMaster"><option value="yes">Update authorised capital in client master</option><option value="no">Do not change the client master</option><option value="done">Already updated ✓</option></select></div></div>
    ${BM(true)}${EGM('Extraordinary General Meeting')}${AFTER([['sh7Srn', 'sh7Date', 'SH-7']])}`,
  transfer: `<div class="grid">
    <div><label>Transferor (from shareholders) <span class="req">*</span></label><select data-f="fromIndex" data-holders></select></div>
    <div><label>No. of shares <span class="req">*</span></label><input data-f="trShares"></div>
    <div><label>Consideration (Rs.)</label><input data-f="consideration"><div class="hint">Stamp duty 0.015% is worked out</div></div>
    <div><label>Share certificate no.</label><input data-f="certNo"></div>
    <div><label>Distinctive no. from</label><input data-f="distFrom"></div><div><label>Distinctive no. to</label><input data-f="distTo"></div>
    <div><label>Date of execution of SH-4 <span class="req">*</span></label><input type="date" data-f="execDate"></div>
    <div><label>Date lodged with company</label><input type="date" data-f="lodgeDate"></div><div></div></div>
    <h3>Transferee</h3><div class="grid">
    <div><label>Name <span class="req">*</span></label><input data-f="toName"></div><div><label>Father's / spouse's name</label><input data-f="toFather"></div><div><label>PAN</label><input data-f="toPan" style="text-transform:uppercase"></div>
    <div class="span2"><label>Address</label><input data-f="toAddr"></div><div><label>Email</label><input data-f="toEmail"></div>
    <div><label>Occupation</label><input data-f="toOcc"></div><div><label>Folio no. (if existing member)</label><input data-f="toFolio"></div>
    <div><label>After generating</label><select data-f="updateMaster"><option value="yes">Move the shares in the client master</option><option value="no">Do not change the client master</option><option value="done">Already updated ✓</option></select></div></div>
    ${BM(true)}`,
  regoffice: `<div class="grid">
    <div><label>Type of change <span class="req">*</span></label><select data-f="scope"><option value="local">Within the same city / town / village — Board resolution</option><option value="roc">Outside local limits, same ROC — special resolution</option></select></div>
    <div><label>Effective date <span class="req">*</span></label><input type="date" data-f="effDate"></div>
    <div><label>Premises</label><select data-f="premises"><option value="rented">Rented / leased</option><option value="director">Owned by a director / relative</option><option value="owned">Owned by the company</option></select></div>
    <div class="span3"><label>New registered office address <span class="req">*</span></label><textarea data-f="newAddr"></textarea></div>
    <div><label>Owner of premises (for NOC) <span class="req">*</span></label><input data-f="ownerName"></div><div><label>Owner's relation (optional)</label><input data-f="ownerRel" placeholder="e.g. Director of the company"></div><div><label>Rent agreement date</label><input type="date" data-f="leaseDate"></div>
    <div class="span2"><label>Owner's address</label><input data-f="ownerAddr"></div>
    <div><label>After generating</label><select data-f="updateMaster"><option value="yes">Update address in client master</option><option value="no">Do not change the client master</option><option value="done">Already updated ✓</option></select></div></div>
    ${BM(true)}<div data-show="roc">${EGM('Extraordinary General Meeting (special resolution)')}</div>${AFTER([['inc22Srn', 'inc22Date', 'INC-22']])}`,
  inc20a: `<div class="grid">
    <div class="span3"><label>Subscribers & payment</label><textarea data-f="subscribers" placeholder="Blank = taken from shareholders in client master. Or one per line:  Name | No. of shares | Amount paid | Date of payment | Mode / bank reference"></textarea></div>
    <div class="span2"><label>Company bank account</label><input data-f="bank" placeholder="e.g. HDFC Bank, Palam branch"></div>
    <div><label>Date of declaration</label><input type="date" data-f="declDate"></div></div>
    ${BM(true)}${AFTER([['inc20aSrn', 'inc20aDate', 'INC-20A']])}`,
  dpt3: `<div class="grid">
    <div><label>Financial Year Ended <span class="req">*</span></label><input type="date" data-f="fyEnd"></div>
    <div><label>Net worth as on FY end (Rs.)</label><input data-f="netWorth"></div>
    <div><label>Auditor's certificate</label><select data-f="audCert"><option value="no">Not required</option><option value="yes">Make auditor's certificate (CA letterhead)</option></select></div>
    <div class="span3"><label>Outstanding receipts not treated as deposits</label><textarea data-f="dptRows" placeholder="One per line:  Category | Name of party | Received during the year | Outstanding at year end&#10;e.g.  Loan from director | Krishan Pal Singh Rana | 2,00,000 | 5,00,000"></textarea><div class="hint">Lines with "director" or "relative" in the category also get a not-borrowed-funds declaration</div></div>
    <div><label>Date of statement / declarations</label><input type="date" data-f="declDate"></div></div>
    ${AFTER([['dpt3Srn', 'dpt3Date', 'DPT-3']])}`,
  msme1: `<div class="grid">
    <div><label>Half year <span class="req">*</span></label><select data-f="half"><option value="h1">April – September (due 31 October)</option><option value="h2">October – March (due 30 April)</option></select></div>
    <div><label>Financial year ending (year)</label><input data-f="msmeYear" placeholder="e.g. 2027 for FY 2026-27"></div>
    <div><label>Date of statement</label><input type="date" data-f="declDate"></div>
    <div class="span3"><label>Dues to micro / small suppliers over 45 days <span class="req">*</span></label><textarea data-f="msmeRows" placeholder="One per line:  Supplier | PAN | Udyam No. | Amount due | Due since (DD/MM/YYYY) | Reason for delay"></textarea></div></div>
    ${AFTER([['msmeSrn', 'msmeDate', 'MSME-1']])}`,
  stk2: `<div class="grid">
    <div class="span2"><label>Ground <span class="req">*</span></label><select data-f="ground"><option value="nobiz">No business / operation for the two immediately preceding financial years</option><option value="nocomm">Has not commenced business since incorporation</option></select></div>
    <div><label>Statement of accounts as on <span class="req">*</span></label><input type="date" data-f="accDate"><div class="hint">Not older than 30 days when filing</div></div>
    <div class="span3"><label>Statement of accounts items (optional)</label><textarea data-f="stkItems" placeholder="One per line:  Particulars | Amount   (blank = Assets Nil, Liabilities Nil)"></textarea></div>
    <div><label>Date of STK-3 / STK-4</label><input type="date" data-f="bondDate"></div><div><label>Bank account closed on</label><input type="date" data-f="bankClosed"></div></div>
    ${BM(true)}${EGM('Extraordinary General Meeting (special resolution)')}${AFTER([['stk2Srn', 'stk2Date', 'STK-2'], ['mgt14Srn', 'mgt14Date', 'MGT-14']])}`,
  llp: `<div class="grid">
    <div><label>Financial Year Ended <span class="req">*</span></label><input type="date" data-f="fyEnd"></div>
    <div><label>Partners approved accounts on <span class="req">*</span></label><input type="date" data-f="approveDate"></div>
    <div class="span3"><label>Partners & contribution</label><textarea data-f="partners" placeholder="Blank = taken from the client's directors. Or one per line:  Name | DPIN / PAN | Designated? (Yes/No) | Contribution (Rs.)"></textarea></div>
    <div><label>Turnover for the year (Rs.)</label><input data-f="turnover"></div>
    <div><label>Solvency</label><select data-f="solvent"><option value="yes">Able to pay debts in full</option><option value="no">Not able to pay debts in full</option></select></div>
    <div><label>Changes in partners during the year</label><input data-f="partnerChanges" placeholder="None"></div></div>
    ${AFTER([['form11Srn', 'form11Date', 'Form 11'], ['form8Srn', 'form8Date', 'Form 8']])}`,
  yearly: `<div class="grid">
    <div><label>Company Size</label><select data-f="coSize"><option value="small">Small company / OPC</option><option value="other">Other company</option></select></div>
    <div><label>Board meetings in the year</label><select data-f="bmCount"><option value="4">4 — quarterly (Sec 173(1), gap ≤ 120 days)</option><option value="2">2 — small company / OPC (Sec 173(5))</option></select></div>
    <div><label>Chairperson of meetings</label><select data-f="chair" data-dirs></select></div></div>
    <h3>Board Meetings</h3><div class="grid">
    <div class="span2"><label>Dates of Board meetings in this FY <span class="req">*</span></label><textarea data-f="bmList" rows="5" placeholder="One date per line, e.g. 20/06/2025"></textarea><div class="hint">Filled automatically for the chosen FY (no Sundays / national holidays). Change any date; the notices, minutes and Board's Report follow.</div></div>
    <div><label>Time of meetings</label><input type="time" data-f="bmTime" data-def="11:00"><label style="margin-top:10px">Venue</label><input data-f="bmVenue" placeholder="Blank = Registered Office"></div>
    <div data-show="notfirst"><label>Meeting approving last year's accounts</label><input type="date" data-f="accBm"><div class="hint">Its minutes carry the accounts, Board's Report and AGM items</div></div></div>
    <div data-show="notfirst"><h3>AGM held during this FY (for the previous FY)</h3><div class="grid">
    <div><label>AGM Number</label><input type="number" min="1" data-f="prevAgmNo"></div>
    <div><label>AGM Date</label><input type="date" data-f="agmDate"></div>
    <div><label>AGM Time</label><input type="time" data-f="agmTime" data-def="11:00"></div>
    <div class="span3"><label>AGM Venue</label><input data-f="agmVenue" placeholder="Blank = Registered Office"></div></div></div>
    <h3>Registers</h3><div class="grid"><div><label>Registers as on</label><input type="date" data-f="regAsOn"></div></div>
    <p class="hint">Dates are worked out from the financial year and the date of incorporation, assuming every AGM was held on time. Minutes of the first meeting after incorporation, the accounts meeting (with auditor appointment at the 1st, 6th, 11th … AGM) and the quarterly reviews are written automatically.</p>`,
  registers: `<div class="grid"><div><label>Registers as on</label><input type="date" data-f="asOn"></div></div>
    <p class="hint">The Register of Members and the Register of Directors are pre-filled from the client master (shareholders and directors). Columns the portal does not hold are left blank to complete by hand.</p>`,
};
const COMMON = `<h3>Common Details</h3><div class="grid">
  <div><label>Place (for signatures) <span class="req">*</span></label><input data-f="place" placeholder="e.g. New Delhi"></div>
  <div class="span2"><label>Letterhead</label><select data-f="lh"><option value="print">Use the uploaded Word letterhead (or the printed letterhead if none uploaded)</option><option value="blank">Leave blank space for pre-printed letterhead paper</option></select></div></div>`;
const CASE_GROUPS = [
  ['Auditor Appointment · e-Form ADT-1', [['first', 'First Auditor', 'Board appoints within 30 days of incorporation — Sec 139(6)'], ['agm', 'Appointment at AGM', 'Members appoint at AGM for 5 years — Sec 139(1)'], ['casual', 'Casual Vacancy', 'Resignation / other vacancy filled by Board — Sec 139(8)']]],
  ['Director Change · e-Form DIR-12', [['dirapp', 'Director Appointment', 'DIR-2, DIR-8, MBP-1, resolution, appointment letter — Sec 152 / 161'], ['dirres', 'Director Resignation', 'Resignation letter, resolution, acknowledgement — Sec 168']]],
  ['Annual Filing · AOC-4 & MGT-7 / 7A', [['annual', 'AOC-4 & MGT-7 / 7A', 'Board’s Report, AGM notice, MGT-11, resolutions, shareholder list (no balance sheet / audit report)']]],
  ['Yearly Records (FY-wise)', [['yearly', 'Board Meetings, Minutes & Registers', 'All Board meeting notices & minutes, attendance, AGM minutes, MBP-1, DIR-8, MGT-1, Register of Directors, MBP-2, MBP-4 for the chosen FY']]],
  ['Share Capital', [['allot', 'Rights Issue & Allotment', 'Offer letters, allotment resolution, SH-1 certificates, PAS-3 — Sec 62(1)(a)'], ['authcap', 'Increase Authorised Capital', 'Board & EGM resolutions, altered Clause V, SH-7 — Sec 61 / 64'], ['transfer', 'Share Transfer', 'Form SH-4, Board approval, letter to transferee — Sec 56']]],
  ['ROC Compliance', [['regoffice', 'Shift Registered Office', 'Board / special resolution, owner NOC, INC-22 — Sec 12'], ['inc20a', 'Commencement of Business', 'Board resolution, director declaration, INC-20A — Sec 10A'], ['dpt3', 'DPT-3 (Deposits Return)', 'Statement of exempt receipts, director declarations, auditor certificate'], ['msme1', 'MSME-1 (Half-yearly)', 'Statement of dues to micro & small suppliers over 45 days']]],
  ['Closure, LLP & Registers', [['stk2', 'Strike Off (STK-2)', 'Resolutions, STK-3 bonds, STK-4 affidavits, statement of accounts — Sec 248(2)'], ['llp', 'LLP Form 11 & Form 8', 'Partners’ resolution, statement of solvency, data sheet'], ['registers', 'Statutory Registers', 'Register of Members (MGT-1) and Register of Directors & KMP']]],
];

PAGES.generate = async params => {
  if (params.get('client')) { if (String(params.get('client')) !== String(G.clientId)) { G.kase = ''; G.dirIdx = [0]; G.dirIndex = 0; G.fy = ''; } G.clientId = params.get('client'); G.kase = params.get('case') || G.kase; }
  if (params.get('fy')) G.fy = params.get('fy');
  if (!S.clients.some(c => String(c.id) === String(G.clientId))) G.clientId = '';
  if (G.kase && !DC.CASES.includes(G.kase)) G.kase = '';
  const wc = client();
  if (!wc) { location.hash = '#/clients'; return; }
  const fys = DC.fyList(wc), okFY = fy => fys.some(z => z.fy === fy && z.ok);
  if (!okFY(G.fy)) G.fy = okFY(lsGet('nscrm.fy.' + wc.id)) ? lsGet('nscrm.fy.' + wc.id) : okFY(lastFY()) ? lastFY() : ((fys.find(z => z.ok) || {}).fy || lastFY());
  $('view').innerHTML = `<div class="pagehead"><div><a class="backlink" href="#/clients">← All clients</a><h1>${esc(wc.name)}</h1><p class="sub">${wc.type === 'llp' ? 'LLPIN' : 'CIN'}: ${esc(wc.cin || '—')} · Choose a case, fill the details and download Word files on letterhead.</p></div><div class="row"><span class="saved" id="savedNote"></span><a class="btn ghostlink sm" href="#/clients?edit=${wc.id}">Edit client</a></div></div>
  <div class="card fycard"><h2><span class="step">1</span>Financial Year</h2><div class="row" style="align-items:flex-end;gap:16px;flex-wrap:wrap">
   <div style="min-width:260px"><label>Documents are for the financial year <span class="req">*</span></label><select id="g-fy">${fys.map(z => '<option value="' + z.fy + '"' + (z.ok ? '' : ' disabled') + '>FY ' + z.fy + (z.first ? ' — first FY (from ' + H.sd(z.from) + ')' : '') + (z.ok ? '' : ' — before incorporation') + '</option>').join('')}</select></div>
   <div class="hint" id="g-fyinfo" style="flex:1;min-width:260px"></div></div></div>
  <div class="card"><h2><span class="step">2</span>Signatories</h2><div class="grid">
   <div id="g-cawrap"><label id="g-calabel">Auditor (CA Firm) <span class="req">*</span></label><select id="g-ca"></select></div>
   <div><label>Signing Director(s) — company documents <span class="req">*</span></label><div id="g-dir" class="dirpick"></div><div class="hint">Tick one or more. Two are needed for the Board's Report, financial statements and share certificates.</div></div></div>
   <div id="g-info" class="hint" style="margin-top:8px"></div></div>
  <div class="card"><h2><span class="step">3</span>Choose Case</h2>${CASE_GROUPS.map(([t, list]) => '<div class="cg-title">' + t + '</div><div class="cases">' + list.map(([k, n, s]) => '<div class="case" data-case="' + k + '"><b>' + n + '</b><span>' + s + '</span></div>').join('') + '</div>').join('')}</div>
  <div class="card hidden" id="g-form"><h2><span class="step">4</span><span id="g-title"></span></h2><div id="g-fields"></div>${COMMON}<h3>Compliance Timeline</h3><div class="timeline" id="g-timeline"></div></div>
  <div class="card hidden" id="g-docs"><div class="row between"><h2 style="margin:0"><span class="step">5</span>Documents</h2>
   <div class="row"><button class="ghost sm" id="g-selall">Select / unselect all</button><button id="g-zip">⬇ Generate &amp; Download</button></div></div>
   <p class="hint" style="margin:6px 0 14px">Tick the documents you need and click <b>Generate &amp; Download</b> (one Word file, or a ZIP when several are ticked) — or use <b>Generate Word</b> on a single document.</p><div class="docs" id="g-doclist"></div></div>`;

  $('g-ca').innerHTML = '<option value="">— Select CA firm —</option>' + S.cas.map(a => '<option value="' + a.id + '">' + esc(a.firm) + ' (' + esc(a.frn) + ')</option>').join('');
  $('g-ca').onchange = () => { G.caId = $('g-ca').value; queueSave(); paint(); };
  $('g-fy').value = G.fy;
  const fyInfo = () => { const z = fys.find(q => q.fy === G.fy) || {}, agmNo = DC.agmNumber(wc, z.end);
    $('g-fyinfo').innerHTML = z.end ? 'Period: <b>' + H.sd(z.from) + ' to ' + H.sd(z.end) + '</b>' + (z.first ? ' (first financial year, Sec 2(41))' : '') + ' · AGM for this FY: <b>' + (agmNo ? H.ord(agmNo) + ' AGM' : '—') + '</b>, due by <b>' + H.sd(DC.agmDueOf(wc, z.end)) + '</b>' + (wc.incDate ? '' : ' · <span class="req">Add the date of incorporation in the client master for automatic AGM numbers.</span>') : ''; };
  fyInfo();
  $('g-fy').onchange = async () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); await flushSave(); G.fy = $('g-fy').value; lsSet('nscrm.fy.' + wc.id, G.fy); fyInfo(); if (G.kase) { await loadFiling(); if (!$('g-dir')) return; } docKey = ''; paint(); };
  $('g-dir').onchange = e => {
    const i = parseInt(e.target.value, 10); if (isNaN(i)) return;
    G.dirIdx = e.target.checked ? [...G.dirIdx.filter(n => n !== i), i] : G.dirIdx.filter(n => n !== i);
    G.dirIndex = G.dirIdx[0] || 0; docKey = ''; queueSave(); paint();
  };
  $$('.case').forEach(el => el.onclick = async () => {
    await flushSave(); G.kase = el.dataset.case;
    const firstFy = (fys.find(z => z.first) || {}).fy; // incorporation-related cases belong to the first FY
    if (['first', 'inc20a'].includes(G.kase) && firstFy && G.fy !== firstFy) { G.fy = firstFy; $('g-fy').value = firstFy; fyInfo(); toast('Financial year set to FY ' + firstFy + ' (year of incorporation)'); }
    await loadFiling(); if (!$('g-dir')) return; paint(); $('g-form').scrollIntoView({ behavior: 'smooth' });
  });
  $('g-form').addEventListener('input', e => { if (e.target.dataset.f) { G.form[e.target.dataset.f] = e.target.value; queueSave(); paintTimeline(); } });
  $('g-form').addEventListener('change', e => { if (e.target.dataset.f) { G.form[e.target.dataset.f] = e.target.value; autoFill(); queueSave(); paint(); } });
  $('g-selall').onclick = () => { const all = $$('[data-sel]'), on = !all.every(c => c.checked); all.forEach(c => { c.checked = on; docSel[c.dataset.sel] = on; }); };
  $('g-zip').onclick = () => { const ids = $$('[data-sel]').filter(c => c.checked).map(c => c.dataset.sel); download(ids, ids.length > 1); };
  if (G.clientId && G.kase) await loadFiling();
  if (!$('g-dir')) return;
  docKey = '';
  paint();
};
const client = () => S.clients.find(c => String(c.id) === String(G.clientId));
const caFirm = () => S.cas.find(a => String(a.id) === String(G.caId));
const needsCA = k => ['first', 'agm', 'casual', 'annual', 'dpt3', 'stk2', 'yearly'].includes(k);
const ctx = () => { const c = client() || {}, ds = G.dirIdx.map(i => (c.directors || [])[i]).filter(Boolean); return { kase: G.kase, c, a: caFirm() || {}, d: ds[0] || {}, ds, f: G.form, fy: G.fy, link: G.link || {} }; };

async function loadFiling() {
  const c = client(); G.form = {};
  if (!c || !G.kase) return;
  let saved = null;
  const q = '?fy=' + encodeURIComponent(G.fy || ''), want = G.kase + '|' + G.fy;
  try { saved = await api('GET', '/api/filings/' + c.id + '/' + G.kase + q); } catch (e) { fail(e); }
  saved = saved || {};
  // linked records keep the year consistent: last year's AGM / accounts meeting, this year's Board meeting dates
  G.link = {};
  try {
    if (G.kase === 'yearly' || G.kase === 'annual') G.link.prevAnnual = (await api('GET', '/api/filings/' + c.id + '/annual?fy=' + encodeURIComponent(prevFY(G.fy)))) || {};
    if (G.kase === 'annual') G.link.yearly = (await api('GET', '/api/filings/' + c.id + '/yearly' + q)) || {};
  } catch (e) { G.link = {}; }
  if (want !== G.kase + '|' + G.fy) return;
  G.form = Object.assign({}, saved); delete G.form.caId; delete G.form.dirIndex; delete G.form.dirIdx;
  if (saved.caId && S.cas.some(a => a.id === saved.caId)) G.caId = String(saved.caId);
  const nd = (c.directors || []).length;
  G.dirIdx = (Array.isArray(saved.dirIdx) && saved.dirIdx.length ? saved.dirIdx : [saved.dirIndex || 0]).filter(i => i < nd);
  if (!G.dirIdx.length && nd) G.dirIdx = [0];
  if (['annual', 'allot', 'llp'].includes(G.kase) && G.dirIdx.length < 2 && nd > 1) G.dirIdx = [G.dirIdx[0] || 0, (G.dirIdx[0] || 0) === 0 ? 1 : 0];
  G.dirIndex = G.dirIdx[0] || 0;
  if (!G.form.incDate && c.incDate) G.form.incDate = c.incDate;
  try { G.auto = JSON.parse(G.form.autoJson || '{}') || {}; } catch (e) { G.auto = {}; }
  docKey = '';
}
function autoFill() { if (G.kase === 'agm' && G.form.agmDate && !G.form.fyEnd) { G.form.fyEnd = H.fyStart(G.form.agmDate) + '-03-31'; const el = $$('[data-f="fyEnd"]')[0]; if (el) el.value = G.form.fyEnd; } }
function saveNow() {
  if (!G.clientId || !G.kase) return Promise.resolve();
  const body = { form: Object.assign({}, G.form), caId: G.caId, dirIndex: G.dirIndex, dirIdx: G.dirIdx.slice(), fy: G.fy }, url = '/api/filings/' + G.clientId + '/' + G.kase;
  return api('PUT', url, body).then(() => { if ($('savedNote')) $('savedNote').textContent = '✓ Saved for the team'; }).catch(e => { if ($('savedNote')) $('savedNote').textContent = ''; fail(e); });
}
function queueSave() {
  if (!G.clientId || !G.kase) return;
  clearTimeout(saveTimer); if ($('savedNote')) $('savedNote').textContent = 'Saving…';
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 700);
}
// save any pending change before switching case / financial year
async function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await saveNow(); } }
function dirOptions(c, blank) { return (blank ? '<option value="">— Select —</option>' : '') + (c && c.directors || []).map((d, i) => '<option value="' + i + '">' + esc(d.name) + (d.din ? ' (DIN ' + esc(d.din) + ')' : '') + '</option>').join(''); }
function paint() {
  const c = client();
  $('g-dir').innerHTML = c && c.directors && c.directors.length ? c.directors.map((d, i) => { const pos = G.dirIdx.indexOf(i); return '<label class="dirchip' + (pos >= 0 ? ' on' : '') + '"><input type="checkbox" value="' + i + '"' + (pos >= 0 ? ' checked' : '') + '>' + (pos >= 0 ? '<b class="ord">' + (pos + 1) + '</b>' : '') + esc(d.name) + (d.din ? ' <small>(' + esc(d.din) + ')</small>' : '') + '</label>'; }).join('') : '<span class="hint">— no directors in client master —</span>';
  $('g-ca').value = G.caId || '';
  $('g-cawrap').classList.toggle('hidden', !!G.kase && !needsCA(G.kase));
  $('g-calabel').innerHTML = (G.kase === 'annual' || G.kase === 'dpt3' || G.kase === 'yearly' ? 'Statutory Auditor (CA Firm)' : G.kase === 'stk2' ? 'CA Firm (certifies statement of accounts)' : 'Auditor being appointed (CA Firm)') + ' <span class="req">*</span>';
  if (!S.clients.length) $('g-info').innerHTML = 'No clients yet — <a href="#/clients">add a client</a> first.';
  else if (!S.cas.length && needsCA(G.kase)) $('g-info').innerHTML = 'No CA firm yet — <a href="#/cas">add a CA firm</a> first.';
  else $('g-info').textContent = c ? (c.type === 'llp' ? 'LLPIN: ' : 'CIN: ') + (c.cin || '—') + ' · Regd. Office: ' + H.oneLine(c.addr) + (c.incDate ? ' · Incorporated: ' + H.sd(c.incDate) : '') : '';
  $$('.case').forEach(el => el.classList.toggle('sel', el.dataset.case === G.kase));
  const show = !!(c && G.kase);
  $('g-form').classList.toggle('hidden', !show); $('g-docs').classList.toggle('hidden', !show);
  if (!show) return;
  $('g-title').textContent = DC.CASE_TITLE[G.kase];
  if ($('g-fields').dataset.kase !== G.kase) {
    $('g-fields').innerHTML = FIELDS[G.kase]; $('g-fields').dataset.kase = G.kase; bindAppSign();
    $$('#g-fields [data-f="fyEnd"], #g-fields [data-f="msmeYear"]').forEach(el => { el.readOnly = true; el.classList.add('locked'); el.title = 'Set by the financial year chosen at the top'; const h = el.parentElement.querySelector('.hint'); if (h) h.textContent = 'From the financial year chosen at the top'; else el.insertAdjacentHTML('afterend', '<div class="hint">From the financial year chosen at the top</div>'); });
  }
  $$('#g-form [' + DIRSEL + ']').forEach(sel => { const cur = G.form[sel.dataset.f]; sel.innerHTML = dirOptions(c, true); if (cur !== undefined) sel.value = cur; });
  $$('#g-form [data-holders]').forEach(sel => { const cur = G.form[sel.dataset.f]; sel.innerHTML = '<option value="">— Select —</option>' + (c.shareholders || []).map((h, i) => '<option value="' + i + '">' + esc(h.name) + ' (' + esc(h.shares || 0) + ' shares)</option>').join(''); if (cur !== undefined) sel.value = cur; });
  // smart defaults: fill empty / still-auto fields (dates, AGM number) — the user can always change them
  G.auto = G.auto || {};
  const dd = DC.defaults(ctx(), G.auto), changed = Object.keys(dd).length;
  Object.entries(dd).forEach(([k, val]) => { G.form[k] = val; G.auto[k] = val; });
  if (changed) { G.form.autoJson = JSON.stringify(G.auto); queueSave(); }
  $$('#g-form [data-f]').forEach(el => {
    const k = el.dataset.f;
    if (!(k in G.form) || G.form[k] === undefined) G.form[k] = el.dataset.def || (el.tagName === 'SELECT' && !el.hasAttribute(DIRSEL) && !el.hasAttribute('data-holders') ? el.options[0].value : '');
    if (document.activeElement !== el && el.value !== G.form[k]) el.value = G.form[k];
    const isAuto = !!G.auto[k] && G.form[k] === G.auto[k] && el.tagName !== 'SELECT';
    el.classList.toggle('autofill', isAuto); el.title = isAuto ? 'Filled automatically — change if needed' : '';
  });
  const f = G.form, vis = (sel, on) => $$('[data-show="' + sel + '"]').forEach(el => el.classList.toggle('hidden', !on));
  vis('reason-other', f.reason === 'other'); vis('reason-resign', f.reason !== 'other'); vis('prev-agm', f.apptType !== 're');
  vis('regularise', f.apptMode !== 'egm'); vis('egm', f.apptMode === 'egm' || f.regularise === 'yes');
  vis('rpt', f.rpt === 'yes'); vis('full', f.coSize === 'other'); vis('roc', f.scope === 'roc');
  vis('notfirst', !DC.isFirstFY(c, DC.fyEndOf(G.fy)));
  paintTimeline(); paintDocs();
}
function bindAppSign() {
  if (!$('appSign-file')) return;
  const show = () => { const s = G.form.apptSign; $('appSign-prev').classList.toggle('hidden', !s); $('appSign-del').classList.toggle('hidden', !s); if (s) $('appSign-prev').src = s.data; };
  $('appSign-file').onchange = e => readImage(e.target, 500, img => { G.form.apptSign = img; show(); queueSave(); });
  $('appSign-del').onclick = () => { G.form.apptSign = null; show(); queueSave(); };
  show();
}
function paintTimeline() {
  if (!G.kase || !$('g-timeline')) return;
  const rows = DC.timeline(ctx());
  let h = rows.map(r => '<div class="tl ' + (r.status || '') + '"><span>' + esc(r.label) + (r.rule ? ' <small class="hint">(' + esc(r.rule) + ')</small>' : '') + '</span><span>Due by: <em>' + H.sd(r.due) + '</em>' + (r.actual ? ' · ' + r.actualLabel + ': <em>' + H.sd(r.actual) + '</em> ' + (r.status === 'ok' ? '✔ within time' : r.status === 'late' ? '✖ beyond due date' : '') : '') + '</span></div>').join('');
  h += DC.warnings(ctx()).map(w => '<div class="note red">' + esc(w) + '</div>').join('');
  $('g-timeline').innerHTML = h;
}
function paintDocs() {
  const defs = DC.docDefs(ctx()), key = G.kase + '|' + defs.map(d => d.id + d.title + d.sub).join('|');
  if (key === docKey && $('g-doclist').children.length) return; // unchanged — keep buttons so clicks are not lost
  docKey = key;
  const c = client() || {}, a = caFirm() || {};
  const tag = d => d.lh === DC.LH_CO ? '<span class="tag co">COMPANY LETTERHEAD' + (c.lhName ? ' · WORD' : '') + '</span>' : d.lh === DC.LH_CA ? '<span class="tag ca">CA LETTERHEAD' + (a.lhName ? ' · WORD' : '') + '</span>' : d.lh === DC.LH_PLAIN ? '<span class="tag in">PLAIN PAPER</span>' : '<span class="tag in">INTERNAL</span>';
  $('g-doclist').innerHTML = defs.map(d => '<div class="doc"><input type="checkbox" data-sel="' + d.id + '" ' + (docSel[d.id] === false ? '' : 'checked') + '><div class="t"><b>' + d.no + '. ' + esc(d.title) + '</b>' + tag(d) + '<small>' + esc(d.sub) + '</small></div><button class="sm" data-dl="' + d.id + '">⬇ Generate Word</button></div>').join('');
  $$('[data-sel]').forEach(cb => cb.onchange = () => { docSel[cb.dataset.sel] = cb.checked; });
  $$('[data-dl]').forEach(b => b.onclick = () => download([b.dataset.dl], false));
}
async function download(ids, zip) {
  if (!ids.length) return toast('Select at least one document.', true);
  const m = DC.missing(ctx());
  if (m.length && !confirm('These details are not filled and will appear as blanks (____):\n\n• ' + m.join('\n• ') + '\n\nContinue anyway?')) return;
  const btn = $('g-zip'); btn.disabled = true; btn.textContent = 'Generating…';
  try {
    clearTimeout(saveTimer);
    const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ clientId: G.clientId, caId: G.caId, dirIndex: G.dirIndex, dirIdx: G.dirIdx, kase: G.kase, form: G.form, docIds: ids, zip, fy: G.fy }) });
    if (r.status === 401) { showAuth(); throw new Error('Please log in again.'); }
    if (!r.ok) { let msg = 'Could not create the documents.'; try { msg = (await r.json()).error || msg; } catch (e) {} throw new Error(msg); }
    const blob = await r.blob(), cd = r.headers.get('content-disposition') || '', name = (/filename="([^"]+)"/.exec(cd) || [])[1] || 'documents';
    const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    if ($('savedNote')) $('savedNote').textContent = '✓ Saved for the team';
    toast(zip ? 'ZIP downloaded' : 'Word file downloaded');
    if (r.headers.get('x-masters-changed')) {
      await loadMasters(); toast('Client master updated');
      if (G.form.updateMaster === 'yes') { G.form.updateMaster = 'done'; queueSave(); }
      if ($('g-dir')) { docKey = ''; paint(); }
    }
  } catch (e) { fail(e instanceof TypeError ? new Error(OFFLINE) : e); }
  btn.disabled = false; btn.innerHTML = '⬇ Generate &amp; Download';
}

/* =====================================================================
   IMAGES & FILES
   ===================================================================== */
function readImage(input, maxW, cb) {
  const f = input.files[0]; input.value = ''; if (!f) return;
  if (!/image\/(png|jpeg)/.test(f.type)) return toast('Please upload a PNG or JPG image.', true);
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => {
    const sc = Math.min(1, maxW / img.width), cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    cb({ data: cv.toDataURL('image/png'), w: cv.width, h: cv.height });
  }; img.src = r.result; };
  r.readAsDataURL(f);
}
function logoField(id) { return '<div><label>Logo (optional)</label><input type="file" accept="image/png,image/jpeg" id="' + id + '-file"><img id="' + id + '-prev" class="logo-prev hidden" alt=""><button type="button" class="danger sm hidden" id="' + id + '-del" style="margin-top:6px">Remove logo</button></div>'; }
function bindLogo(id, get, set) {
  const show = () => { const l = get(); $(id + '-prev').classList.toggle('hidden', !l); $(id + '-del').classList.toggle('hidden', !l); if (l) $(id + '-prev').src = l.data; };
  $(id + '-file').onchange = e => readImage(e.target, 600, l => { set(l); show(); });
  $(id + '-del').onclick = () => { set(null); show(); };
  show();
}
// Word letterhead upload box. state: { current: name|null, pending: {name,data}|null, remove: bool }
function lhField(id, who) {
  return '<div class="span3 lhbox"><label>Word Letterhead (.docx) — ' + who + '</label><div class="row"><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" id="' + id + '-file" style="max-width:340px"><span id="' + id + '-name" class="hint"></span><a id="' + id + '-get" class="hidden" href="#">Download</a><button type="button" class="danger sm hidden" id="' + id + '-del">Remove</button></div><div class="hint">Upload your letterhead made in Word (logo, address, footer). Documents will be generated inside it with its exact design and margins. Leave the body of the letterhead empty.</div></div>';
}
function bindLH(id, st, ownerPath) {
  const show = () => {
    const name = st.pending ? st.pending.name + ' (will be saved)' : st.remove ? '' : st.current;
    $(id + '-name').textContent = name ? '✓ ' + name : 'No Word letterhead — the printed letterhead will be used';
    $(id + '-del').classList.toggle('hidden', !name);
    const canGet = !!(st.current && !st.pending && !st.remove && ownerPath);
    $(id + '-get').classList.toggle('hidden', !canGet); if (canGet) $(id + '-get').href = ownerPath;
    $(id + '-get').setAttribute('download', '');
  };
  $(id + '-file').onchange = e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    if (!/\.docx$/i.test(file.name)) return toast('Please choose a Word .docx file (in Word: Save As → Word Document).', true);
    if (file.size > 5 * 1024 * 1024) return toast('The letterhead file is larger than 5 MB.', true);
    const r = new FileReader(); r.onload = () => { st.pending = { name: file.name, data: String(r.result).split(',')[1] }; st.remove = false; show(); }; r.readAsDataURL(file);
  };
  $(id + '-del').onclick = () => { st.pending = null; st.remove = !!st.current; if (!st.current) st.remove = false; show(); };
  show();
}
async function saveLH(owner, id, st) {
  if (st.pending) await api('PUT', '/api/' + owner + '/' + id + '/letterhead', st.pending);
  else if (st.remove) await api('DELETE', '/api/' + owner + '/' + id + '/letterhead');
}

/* =====================================================================
   CLIENTS
   ===================================================================== */
let editClient = null, clientLH = null;
PAGES.clients = params => {
  $('view').innerHTML = `<div class="pagehead"><div><h1>Clients</h1><p class="sub">Company master — shared by the whole team. Used on the company letterhead, resolutions and annual filing.</p></div><div class="row"><a class="btn ghostlink" href="/api/import/template">⬇ Excel template</a><button class="gold" id="c-import">⬆ Import from Excel</button><input type="file" id="c-importfile" accept=".xlsx" class="hidden"><button id="c-add">+ Add Client</button></div></div>
  <div class="card hidden" id="c-importbox"><h2>Import clients from Excel</h2><p class="hint">Download the template, fill one company per row, then upload it here. Existing clients are matched by CIN.</p>
   <div class="row"><select id="c-importmode" style="max-width:340px"><option value="skip">Skip clients whose CIN already exists</option><option value="update">Update existing clients with the Excel data</option></select><button id="c-importgo">Choose file &amp; import</button><button class="ghost" id="c-importclose">Close</button></div><div id="c-importres" style="margin-top:12px"></div></div>
  <div class="card hidden" id="c-editor"><h2 id="c-title">Add Client</h2><div class="grid">
   <div class="span2"><label>Company Name <span class="req">*</span></label><input data-c="name" placeholder="As per Certificate of Incorporation"></div>
   <div><label>CIN <span class="req">*</span></label><input data-c="cin" maxlength="21" style="text-transform:uppercase"></div>
   <div><label>Date of Incorporation</label><input type="date" data-c="incDate"></div>
   <div><label>Company Type</label><select data-c="type"><option value="private">Private Limited</option><option value="public">Public Limited (unlisted)</option><option value="opc">One Person Company</option><option value="llp">LLP (Limited Liability Partnership)</option></select></div>
   <div><label>Small company?</label><select data-c="size"><option value="small">Yes — small company / OPC</option><option value="other">No</option></select><div class="hint">Paid-up ≤ Rs. 4 crore and turnover ≤ Rs. 40 crore — verify current limits</div></div>
   <div><label>PAN</label><input data-c="pan" maxlength="10" style="text-transform:uppercase"></div>
   <div><label>Last AGM number</label><input type="number" min="1" data-c="lastAgmNo" placeholder="For AGM numbering"></div><div><label>Last AGM date</label><input type="date" data-c="lastAgmDate"></div>
   <div class="span3"><label>Registered Office Address <span class="req">*</span></label><textarea data-c="addr"></textarea></div>
   <div><label>Email</label><input type="email" data-c="email"></div><div><label>Phone</label><input data-c="phone"></div><div><label>Website</label><input data-c="web" placeholder="Used for the annual return web link"></div>
   ${logoField('c-logo')}${lhField('c-lh', 'company letterhead')}</div>
   <h3>Directors</h3><div class="dirrow hint" style="font-weight:600"><span>Name</span><span>DIN</span><span>Designation</span><span>Signature image</span><span></span></div><div id="c-dirs"></div>
   <button class="ghost sm" id="c-adddir">+ Add Director</button>
   <h3>Share Capital &amp; Shareholders <small class="hint">(for MGT-7 / 7A)</small></h3><div class="grid">
   <div><label>Authorised capital (Rs.)</label><input data-c="authCap"></div><div><label>Paid-up capital (Rs.)</label><input data-c="paidCap"></div><div><label>Face value per share (Rs.)</label><input data-c="faceValue" placeholder="10"></div></div>
   <div class="shrow hint" style="font-weight:600;margin-top:12px"><span>Shareholder name</span><span>Folio No.</span><span>No. of shares</span><span>Category</span><span></span></div><div id="c-shs"></div>
   <button class="ghost sm" id="c-addsh">+ Add Shareholder</button>
   <h3>Company Secretary (optional)</h3><div class="grid"><div><label>Name</label><input data-c="csName"></div><div><label>Membership No. (ACS/FCS)</label><input data-c="csMno"></div></div>
   <div class="row" style="margin-top:18px"><button id="c-save">Save Client</button><button class="ghost" id="c-cancel">Cancel</button></div></div>
  <div class="card"><div class="row between" style="margin-bottom:10px"><b id="c-count"></b><input class="search" id="c-search" placeholder="Search name or CIN…"></div><div id="c-list"></div></div>`;
  $('c-add').onclick = () => openClient(null);
  $('c-import').onclick = () => { $('c-importbox').classList.remove('hidden'); $('c-importres').innerHTML = ''; };
  $('c-importclose').onclick = () => $('c-importbox').classList.add('hidden');
  $('c-importgo').onclick = () => $('c-importfile').click();
  $('c-importfile').onchange = e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) return toast('Please choose an Excel .xlsx file (use the template).', true);
    const r = new FileReader();
    r.onload = async () => {
      $('c-importres').innerHTML = '<div class="note">Importing…</div>';
      try {
        const out = await api('POST', '/api/import', { data: String(r.result).split(',')[1], mode: $('c-importmode').value });
        await loadMasters(); listClients();
        $('c-importres').innerHTML = '<div class="note" style="background:var(--green-l);border-color:#c5e8cf;color:var(--green-d)">✓ ' + out.created + ' added · ' + out.updated + ' updated · ' + out.skipped + ' skipped</div>' + (out.errors.length ? '<div class="note red"><b>Rows not imported:</b><br>' + out.errors.map(esc).join('<br>') + '</div>' : '');
      } catch (err) { $('c-importres').innerHTML = '<div class="note red">' + esc(err.message) + '</div>'; }
    };
    r.readAsDataURL(file);
  };
  $('c-cancel').onclick = () => $('c-editor').classList.add('hidden');
  $('c-adddir').onclick = () => addDirRow({});
  $('c-addsh').onclick = () => addShRow({});
  $('c-search').oninput = listClients;
  $('c-save').onclick = saveClient;
  listClients();
  const ed = params && params.get('edit') && S.clients.find(c => String(c.id) === params.get('edit'));
  if (ed) openClient(ed);
};
function addDirRow(d) {
  const r = document.createElement('div'); r.className = 'dirrow'; r._sign = d.sign || null;
  r.innerHTML = '<input placeholder="Director name" data-d="name"><input placeholder="DIN (8 digits)" maxlength="8" data-d="din"><select data-d="desig"><option>Director</option><option>Additional Director</option><option>Managing Director</option><option>Whole-time Director</option><option>Nominee Director</option></select>'
    + '<div class="sigbox"><label class="btn ghost sm filebtn">Upload sign<input type="file" accept="image/png,image/jpeg" hidden></label><img class="sig-prev hidden" alt="signature"><button type="button" class="danger sm hidden" title="Remove signature">✕ sign</button></div>'
    + '<button type="button" class="danger sm" title="Remove director">✕</button>';
  r.querySelector('[data-d=name]').value = d.name || ''; r.querySelector('[data-d=din]').value = d.din || ''; r.querySelector('[data-d=desig]').value = d.desig || 'Director';
  const img = r.querySelector('.sig-prev'), del = r.querySelector('.sigbox button');
  const show = () => { img.classList.toggle('hidden', !r._sign); del.classList.toggle('hidden', !r._sign); if (r._sign) img.src = r._sign.data; };
  r.querySelector('.sigbox input').onchange = e => readImage(e.target, 500, s => { r._sign = s; show(); });
  del.onclick = () => { r._sign = null; show(); };
  r.lastElementChild.onclick = () => r.remove();
  show(); $('c-dirs').appendChild(r);
}
function addShRow(h) {
  const r = document.createElement('div'); r.className = 'shrow';
  r.innerHTML = '<input placeholder="Name" data-s="name"><input placeholder="Folio" data-s="folio"><input placeholder="Shares" data-s="shares"><select data-s="cat"><option>Promoter</option><option>Individual</option><option>Body Corporate</option><option>Other</option></select><button type="button" class="danger sm" title="Remove">✕</button>';
  ['name', 'folio', 'shares'].forEach(k => { r.querySelector('[data-s=' + k + ']').value = h[k] || ''; }); r.querySelector('[data-s=cat]').value = h.cat || 'Promoter';
  r.lastElementChild.onclick = () => r.remove(); $('c-shs').appendChild(r);
}
function openClient(c) {
  editClient = c ? Object.assign({}, c) : { logo: null };
  clientLH = { current: c ? c.lhName : null, pending: null, remove: false };
  $('c-title').textContent = c ? 'Edit Client' : 'Add Client';
  $$('[data-c]').forEach(el => { el.value = c ? (c[el.dataset.c] ?? '') : (el.tagName === 'SELECT' ? el.options[0].value : ''); });
  $('c-dirs').innerHTML = ''; ((c && c.directors && c.directors.length) ? c.directors : [{}, {}]).forEach(addDirRow);
  $('c-shs').innerHTML = ''; (c && c.shareholders || []).forEach(addShRow);
  bindLogo('c-logo', () => editClient.logo, l => { editClient.logo = l; });
  bindLH('c-lh', clientLH, c ? '/api/clients/' + c.id + '/letterhead' : null);
  $('c-editor').classList.remove('hidden'); $('c-editor').scrollIntoView({ behavior: 'smooth' });
}
async function saveClient() {
  const c = { logo: editClient.logo };
  $$('[data-c]').forEach(el => { c[el.dataset.c] = el.value.trim(); });
  c.cin = c.cin.toUpperCase(); c.pan = c.pan.toUpperCase();
  c.directors = $$('#c-dirs .dirrow').map(r => ({ name: r.querySelector('[data-d=name]').value.trim(), din: r.querySelector('[data-d=din]').value.trim(), desig: r.querySelector('[data-d=desig]').value, sign: r._sign || null })).filter(d => d.name);
  c.shareholders = $$('#c-shs .shrow').map(r => ({ name: r.querySelector('[data-s=name]').value.trim(), folio: r.querySelector('[data-s=folio]').value.trim(), shares: r.querySelector('[data-s=shares]').value.trim(), cat: r.querySelector('[data-s=cat]').value })).filter(h => h.name);
  const miss = []; if (!c.name) miss.push('Company Name'); if (!c.cin) miss.push('CIN'); if (!c.addr) miss.push('Registered Office'); if (!c.directors.length) miss.push('at least one Director');
  if (miss.length) return toast('Please fill: ' + miss.join(', '), true);
  if (c.cin.length !== 21 && !confirm('CIN should be 21 characters (you entered ' + c.cin.length + '). Save anyway?')) return;
  const badDin = c.directors.filter(d => d.din && !/^\d{8}$/.test(d.din)); if (badDin.length && !confirm('DIN should be 8 digits. Please check: ' + badDin.map(d => d.name).join(', ') + '. Save anyway?')) return;
  $('c-save').disabled = true;
  try {
    const saved = await api(editClient.id ? 'PUT' : 'POST', '/api/clients' + (editClient.id ? '/' + editClient.id : ''), c);
    await saveLH('clients', saved.id, clientLH);
    await loadMasters(); $('c-editor').classList.add('hidden'); listClients(); toast('Client saved');
  } catch (e) { fail(e); }
  $('c-save').disabled = false;
}
function listClients() {
  const q = $('c-search').value.trim().toLowerCase();
  const list = S.clients.filter(c => !q || c.name.toLowerCase().includes(q) || (c.cin || '').toLowerCase().includes(q));
  $('c-count').textContent = S.clients.length + ' client' + (S.clients.length === 1 ? '' : 's');
  $('c-list').innerHTML = list.length ? '<table class="tbl"><tr><th>Company</th><th>CIN</th><th class="hide-m">Directors</th><th class="hide-m">Last updated</th><th></th></tr>' + list.map(c =>
    '<tr><td><a class="clink" href="#/generate?client=' + c.id + '"><b>' + esc(c.name) + '</b></a>' + (c.lhName ? ' <span class="pill green">Word letterhead</span>' : '') + '<br><small class="hint">' + esc(H.oneLine(c.addr)) + '</small></td><td>' + esc(c.cin) + (c.incDate ? '<br><small class="hint">Inc. ' + H.sd(c.incDate) + '</small>' : '') + '</td><td class="hide-m">' + (c.directors || []).map(d => esc(d.name) + (d.din ? ' <small class="hint">(' + esc(d.din) + ')</small>' : '') + (d.sign ? ' <small class="hint">✍</small>' : '')).join('<br>') + '</td><td class="hide-m"><small class="hint">' + (c.updatedBy ? esc(c.updatedBy) + '<br>' : '') + new Date(c.updatedAt).toLocaleDateString('en-IN') + '</small></td><td class="actions"><button class="sm" data-gen="' + c.id + '">Open &amp; prepare docs</button> <button class="ghost sm" data-edit="' + c.id + '">Edit</button>' + (isAdmin() ? ' <button class="danger sm" data-del="' + c.id + '">Delete</button>' : '') + '</td></tr>').join('') + '</table>'
    : '<div class="empty">' + (q ? 'No client matches your search.' : 'No clients yet. Click “+ Add Client”.') + '</div>';
  $$('#c-list [data-edit]').forEach(b => b.onclick = () => openClient(S.clients.find(c => String(c.id) === b.dataset.edit)));
  $$('#c-list [data-gen]').forEach(b => b.onclick = () => { location.hash = '#/generate?client=' + b.dataset.gen; });
  $$('#c-list [data-del]').forEach(b => b.onclick = async () => {
    const c = S.clients.find(x => String(x.id) === b.dataset.del);
    if (!confirm('Delete client "' + c.name + '" and all its saved details? This cannot be undone.')) return;
    try { await api('DELETE', '/api/clients/' + c.id); await loadMasters(); listClients(); toast('Client deleted'); } catch (e) { fail(e); }
  });
}

/* =====================================================================
   CA FIRMS
   ===================================================================== */
let editCA = null, caLH = null;
PAGES.cas = () => {
  $('view').innerHTML = `<div class="pagehead"><div><h1>CA Firms (Auditors)</h1><p class="sub">Used on the CA letterhead, consent and eligibility certificate (ICAI format).</p></div><button id="a-add">+ Add CA Firm</button></div>
  <div class="card hidden" id="a-editor"><h2 id="a-title">Add CA Firm</h2><div class="grid">
   <div class="span2"><label>Firm Name <span class="req">*</span></label><input data-a="firm"></div>
   <div><label>FRN <span class="req">*</span></label><input data-a="frn" style="text-transform:uppercase"></div>
   <div><label>Constitution</label><select data-a="const"><option value="Partnership Firm">Partnership Firm</option><option value="Proprietorship">Proprietorship</option><option value="LLP">LLP</option></select></div>
   <div><label>Firm PAN</label><input data-a="pan" maxlength="10" style="text-transform:uppercase"></div>
   <div><label>Peer Review Certificate No.</label><input data-a="peer" placeholder="Optional"></div>
   <div><label>Signing Partner / Proprietor <span class="req">*</span></label><input data-a="partner"></div>
   <div><label>Membership No. <span class="req">*</span></label><input data-a="mno"></div>
   <div><label>Designation</label><select data-a="desig"><option>Partner</option><option>Proprietor</option><option>Designated Partner</option></select></div>
   <div class="span3"><label>Office Address <span class="req">*</span></label><textarea data-a="addr"></textarea></div>
   <div><label>Email</label><input type="email" data-a="email"></div><div><label>Phone</label><input data-a="phone"></div>${logoField('a-logo')}
   <div><label>Signature of signing partner (image)</label><div class="sigbox"><input type="file" accept="image/png,image/jpeg" id="a-sign-file"><img id="a-sign-prev" class="sig-prev hidden" alt=""><button type="button" class="danger sm hidden" id="a-sign-del">Remove</button></div><div class="hint">Printed above the partner's name on consent letters, certificates and the auditor's acceptance</div></div>
   ${lhField('a-lh', 'CA firm letterhead')}</div>
   <div class="row" style="margin-top:18px"><button id="a-save">Save CA Firm</button><button class="ghost" id="a-cancel">Cancel</button></div></div>
  <div class="card"><div id="a-list"></div></div>`;
  $('a-add').onclick = () => openCA(null);
  $('a-cancel').onclick = () => $('a-editor').classList.add('hidden');
  $('a-save').onclick = saveCA;
  listCAs();
};
function openCA(a) {
  editCA = a ? Object.assign({}, a) : { logo: null, sign: null };
  caLH = { current: a ? a.lhName : null, pending: null, remove: false };
  $('a-title').textContent = a ? 'Edit CA Firm' : 'Add CA Firm';
  $$('[data-a]').forEach(el => { el.value = a ? (a[el.dataset.a] ?? '') : (el.tagName === 'SELECT' ? el.options[0].value : ''); });
  bindLogo('a-logo', () => editCA.logo, l => { editCA.logo = l; });
  bindLogo('a-sign', () => editCA.sign, l => { editCA.sign = l; });
  bindLH('a-lh', caLH, a ? '/api/cas/' + a.id + '/letterhead' : null);
  $('a-editor').classList.remove('hidden'); $('a-editor').scrollIntoView({ behavior: 'smooth' });
}
async function saveCA() {
  const a = { logo: editCA.logo, sign: editCA.sign || null };
  $$('[data-a]').forEach(el => { a[el.dataset.a] = el.value.trim(); });
  const miss = []; if (!a.firm) miss.push('Firm Name'); if (!a.frn) miss.push('FRN'); if (!a.partner) miss.push('Signing Partner'); if (!a.mno) miss.push('Membership No.'); if (!a.addr) miss.push('Office Address');
  if (miss.length) return toast('Please fill: ' + miss.join(', '), true);
  $('a-save').disabled = true;
  try {
    const saved = await api(editCA.id ? 'PUT' : 'POST', '/api/cas' + (editCA.id ? '/' + editCA.id : ''), a);
    await saveLH('cas', saved.id, caLH);
    await loadMasters(); $('a-editor').classList.add('hidden'); listCAs(); toast('CA firm saved');
  } catch (e) { fail(e); }
  $('a-save').disabled = false;
}
function listCAs() {
  $('a-list').innerHTML = S.cas.length ? '<table class="tbl"><tr><th>Firm</th><th>FRN</th><th class="hide-m">Signing Partner</th><th></th></tr>' + S.cas.map(a =>
    '<tr><td><b>' + esc(a.firm) + '</b>' + (a.lhName ? ' <span class="pill green">Word letterhead</span>' : '') + (a.sign ? ' <span class="pill gold">Signature</span>' : '') + '<br><small class="hint">' + esc(H.oneLine(a.addr)) + '</small></td><td>' + esc(a.frn) + '</td><td class="hide-m">' + esc(a.partner) + '<br><small class="hint">' + esc(a.desig) + ' · M.No. ' + esc(a.mno) + '</small></td><td class="actions"><button class="ghost sm" data-edit="' + a.id + '">Edit</button>' + (isAdmin() ? ' <button class="danger sm" data-del="' + a.id + '">Delete</button>' : '') + '</td></tr>').join('') + '</table>'
    : '<div class="empty">No CA firms yet. Click “+ Add CA Firm”.</div>';
  $$('#a-list [data-edit]').forEach(b => b.onclick = () => openCA(S.cas.find(a => String(a.id) === b.dataset.edit)));
  $$('#a-list [data-del]').forEach(b => b.onclick = async () => {
    const a = S.cas.find(x => String(x.id) === b.dataset.del);
    if (!confirm('Delete "' + a.firm + '"?')) return;
    try { await api('DELETE', '/api/cas/' + a.id); await loadMasters(); listCAs(); toast('CA firm deleted'); } catch (e) { fail(e); }
  });
}

/* =====================================================================
   TEAM & ACCESS (admin)
   ===================================================================== */
PAGES.users = async () => {
  $('view').innerHTML = `<div class="pagehead"><div><h1>Team &amp; Access</h1><p class="sub">Add executives, reset passwords, and switch off access when someone leaves.</p></div><a class="btn" href="/api/backup" style="background:var(--gold);color:#3b2506">⬇ Download data backup</a></div>
  <div class="card"><h2>Add a team member</h2><div class="grid">
   <div><label>Name <span class="req">*</span></label><input id="u-name"></div><div><label>Email <span class="req">*</span></label><input id="u-email" type="email"></div>
   <div><label>Role</label><select id="u-role"><option value="executive">Executive</option><option value="admin">Admin</option></select></div>
   <div><label>Temporary password (min. 8) <span class="req">*</span></label><input id="u-pass" type="text" autocomplete="off"></div></div>
   <p class="hint">Executives can add and edit clients and CA firms and generate documents. Only admins can delete records, manage the team and see the activity log.</p>
   <button id="u-add">Add member</button></div>
  <div class="card"><div id="u-list">Loading…</div></div>`;
  $('u-pass').value = Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 6) + 'A1';
  $('u-add').onclick = async () => {
    try { await api('POST', '/api/users', { name: $('u-name').value, email: $('u-email').value, role: $('u-role').value, password: $('u-pass').value });
      toast('Added. Share the email and temporary password with them.'); PAGES.users(); } catch (e) { fail(e); }
  };
  let users; try { users = await api('GET', '/api/users'); } catch (e) { return fail(e); }
  if (!$('u-list')) return;
  $('u-list').innerHTML = '<table class="tbl"><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr>' + users.map(u =>
    '<tr><td><b>' + esc(u.name) + '</b><br><small class="hint">' + esc(u.email) + '</small></td><td><span class="pill ' + (u.role === 'admin' ? 'brand' : 'grey') + '">' + u.role + '</span></td><td>' + (u.active ? '<span class="pill green">Active</span>' : '<span class="pill red">Disabled</span>') + '</td><td class="actions">' +
    (u.id === S.me.id ? '<small class="hint">This is you</small>' : '<button class="ghost sm" data-role="' + u.id + '" data-to="' + (u.role === 'admin' ? 'executive' : 'admin') + '">Make ' + (u.role === 'admin' ? 'executive' : 'admin') + '</button> <button class="ghost sm" data-reset="' + u.id + '">Reset password</button> <button class="' + (u.active ? 'danger' : 'green') + ' sm" data-active="' + u.id + '" data-to="' + (!u.active) + '">' + (u.active ? 'Disable' : 'Enable') + '</button>') + '</td></tr>').join('') + '</table>';
  $$('[data-role]').forEach(b => b.onclick = async () => { try { await api('PUT', '/api/users/' + b.dataset.role, { role: b.dataset.to }); PAGES.users(); } catch (e) { fail(e); } });
  $$('[data-active]').forEach(b => b.onclick = async () => { try { await api('PUT', '/api/users/' + b.dataset.active, { active: b.dataset.to === 'true' }); PAGES.users(); } catch (e) { fail(e); } });
  $$('[data-reset]').forEach(b => b.onclick = async () => {
    const p = prompt('New temporary password (min. 8 characters):'); if (!p) return;
    try { await api('PUT', '/api/users/' + b.dataset.reset, { password: p }); toast('Password reset. Share it with the user.'); } catch (e) { fail(e); }
  });
};

/* =====================================================================
   EDIT TEMPLATES
   ===================================================================== */
const TOK_STD = { companyName: 'Company name', cin: 'CIN / LLPIN', regdOffice: 'Registered office', companyEmail: 'Company email', incDate: 'Date of incorporation', authCap: 'Authorised capital', paidCap: 'Paid-up capital',
  director1: 'First signing director', director1Din: 'First director DIN', director2: 'Second signing director', director2Din: 'Second director DIN', caFirm: 'CA firm name', frn: 'Firm Reg. No.', caPartner: 'CA partner', caMno: 'Membership No.', caAddress: 'CA firm address', caEmail: 'CA firm email', caPan: 'CA firm PAN' };
const TP = { kase: '', variant: {}, docId: '', saved: [] };
function caseFieldLabels(kase) {
  const out = {}, box = document.createElement('div');
  box.innerHTML = (FIELDS[kase] || '') + COMMON;
  box.querySelectorAll('[data-f]').forEach(el => { if (el.tagName === 'SELECT' || el.dataset.f === 'lh') return; const lb = el.parentElement && el.parentElement.querySelector('label'); if (lb) out[el.dataset.f] = lb.textContent.replace(/\*/g, '').trim(); });
  return out;
}
PAGES.templates = async () => {
  const admin = isAdmin();
  $('view').innerHTML = `<div class="pagehead"><div><h1>Edit Templates</h1><p class="sub">Change the wording of any document. Your template is used for every client from the next download.${admin ? '' : ' <b>View only</b> — ask an admin to change templates.'}</p></div></div>
  <div class="card"><h2><span class="step">1</span>Case</h2><div class="grid"><div class="span2"><label>Case</label><select id="t-case"><option value="">— Select case —</option>${CASE_GROUPS.map(([t, list]) => '<optgroup label="' + esc(t) + '">' + list.map(([k, n]) => '<option value="' + k + '">' + esc(n) + '</option>').join('') + '</optgroup>').join('')}</select></div><div id="t-vars" class="span3 grid" style="padding:0"></div></div></div>
  <div class="card hidden" id="t-docsbox"><h2><span class="step">2</span>Document</h2><div class="docs" id="t-docs"></div></div>
  <div class="card hidden" id="t-edbox"><div class="row between"><h2 style="margin:0"><span class="step">3</span><span id="t-doctitle"></span></h2><span id="t-badge"></span></div>
   <div class="tplwrap"><div><textarea id="t-body" class="tplbody" spellcheck="false"${admin ? '' : ' readonly'}></textarea>
    <div class="row" style="margin-top:10px">${admin ? '<button id="t-save">Save template</button><button class="ghost" id="t-reset">Reset to standard</button>' : ''}<button class="ghost" id="t-std">Show standard wording</button></div></div>
    <div class="tplside"><h3 style="margin-top:0">Placeholders</h3><p class="hint">Click to insert at the cursor. Filled in from the client, CA firm and case details.</p><div id="t-chips" class="chips"></div>
     <h3>How to write</h3><div class="hint tplhelp">
      <div>Line style at the start of a line, e.g. <code>[c b u]</code> = centred, bold, underlined</div><div><code>c</code> centre · <code>r</code> right · <code>l</code> left (default: justified)</div>
      <div><code>b</code> bold · <code>u</code> underline · <code>h</code> numbered point (hanging) · <code>i</code> indent</div>
      <div><code>big</code> / <code>small</code> text size · <code>t</code> no space after the line</div>
      <div><code>**words**</code> bold words · <code>&lt;br&gt;</code> line break</div>
      <div>Blank line = gap · <code>---</code> = new page</div>
      <div><code>{{companyName}}</code> value · <code>{{COMPANYNAME}}</code> in CAPITALS</div>
      <div><code>{{bmDate:short}}</code> 01.04.2026 · <code>:day</code> weekday · <code>:ord</code> 1st, 2nd</div>
      <div><code>[[signature]]</code>, <code>[[table#1]]</code> … keep these lines: they bring in signatures, addresses and tables.</div></div></div></div></div>`;
  try { TP.saved = await api('GET', '/api/templates'); } catch (e) { TP.saved = []; }
  const vkey = () => DC.variantKey(TP.kase, TP.variant);
  const isSaved = id => TP.saved.some(t => t.kase === TP.kase && t.variant === vkey() && t.docId === id);
  const paintDocs = () => {
    const docs = DC.templateDocs(TP.kase, TP.variant);
    $('t-docsbox').classList.toggle('hidden', !TP.kase); $('t-edbox').classList.add('hidden');
    $('t-docs').innerHTML = docs.map(d => '<div class="doc' + (d.fixed ? ' off' : '') + '" ' + (d.fixed ? '' : 'data-tdoc="' + d.id + '"') + '><div class="t"><b>' + d.no + '. ' + esc(d.title) + '</b><small>' + esc(d.sub || '') + '</small></div>' +
      (d.fixed ? '<span class="pill grey">Fixed format</span>' : isSaved(d.id) ? '<span class="pill green">Customised</span>' : '<span class="pill gold">Built-in</span>') + '</div>').join('');
    $$('[data-tdoc]').forEach(el => el.onclick = () => openDoc(el.dataset.tdoc));
  };
  const insert = t => { const ta = $('t-body'); if (ta.readOnly) return; const a = ta.selectionStart, b = ta.selectionEnd; ta.value = ta.value.slice(0, a) + t + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + t.length; };
  const openDoc = async id => {
    TP.docId = id;
    const d = DC.templateDocs(TP.kase, TP.variant).find(z => z.id === id), std = DC.templateText(TP.kase, TP.variant, id);
    let saved = null; try { saved = await api('GET', '/api/templates/' + TP.kase + '/' + id + '?variant=' + encodeURIComponent(vkey())); } catch (e) { fail(e); }
    $('t-edbox').classList.remove('hidden');
    $('t-doctitle').textContent = d.no + '. ' + d.title;
    $('t-badge').innerHTML = saved ? '<span class="pill green">Customised</span>' : '<span class="pill gold">Built-in wording</span>';
    $('t-body').value = saved ? saved.body : std;
    const labels = Object.assign({}, TOK_STD, caseFieldLabels(TP.kase));
    const keys = [...new Set([...DC.placeholders(std), ...Object.keys(caseFieldLabels(TP.kase))])];
    $('t-chips').innerHTML = keys.map(k => '<button class="chip" data-tok="' + esc(k) + '" title="' + esc(labels[k] || k) + '">' + esc(labels[k] || k) + '<small>{{' + esc(k) + '}}</small></button>').join('');
    $$('[data-tok]').forEach(b => b.onclick = () => insert('{{' + b.dataset.tok + '}}'));
    $$('[data-tdoc]').forEach(el => el.classList.toggle('sel', el.dataset.tdoc === id));
    $('t-std').onclick = () => { if (admin && !confirm('Replace the editor text with the standard wording? (Nothing is saved until you click Save.)')) return; $('t-body').value = std; };
    if (admin) {
      $('t-save').onclick = async () => {
        try { await api('PUT', '/api/templates/' + TP.kase + '/' + id, { variant: vkey(), body: $('t-body').value }); TP.saved = await api('GET', '/api/templates'); $('t-badge').innerHTML = '<span class="pill green">Customised</span>'; paintDocsKeep(); toast('Template saved — used from the next download'); } catch (e) { fail(e); }
      };
      $('t-reset').onclick = async () => {
        if (!confirm('Go back to the standard wording for this document?')) return;
        try { await api('DELETE', '/api/templates/' + TP.kase + '/' + id + '?variant=' + encodeURIComponent(vkey())); TP.saved = await api('GET', '/api/templates'); $('t-body').value = std; $('t-badge').innerHTML = '<span class="pill gold">Built-in wording</span>'; paintDocsKeep(); toast('Standard wording restored'); } catch (e) { fail(e); }
      };
    }
    $('t-edbox').scrollIntoView({ behavior: 'smooth' });
  };
  const paintDocsKeep = () => { const id = TP.docId, open = !$('t-edbox').classList.contains('hidden'); paintDocs(); if (open) { $('t-edbox').classList.remove('hidden'); $$('[data-tdoc]').forEach(el => el.classList.toggle('sel', el.dataset.tdoc === id)); } };
  const paintVars = () => {
    const vs = DC.VARIANTS[TP.kase] || [];
    $('t-vars').innerHTML = vs.map(([k, lab, opts]) => '<div><label>' + esc(lab) + '</label><select data-tv="' + k + '">' + opts.map(([v, n]) => '<option value="' + v + '"' + (TP.variant[k] === v ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>').join('') +
      (vs.length ? '<div class="span3 hint">Each combination has its own template.</div>' : '');
    $$('[data-tv]').forEach(sel => sel.onchange = () => { TP.variant[sel.dataset.tv] = sel.value; paintDocs(); });
  };
  $('t-case').onchange = () => { TP.kase = $('t-case').value; TP.variant = {}; (DC.VARIANTS[TP.kase] || []).forEach(([k, , o]) => TP.variant[k] = o[0][0]); paintVars(); paintDocs(); };
  if (TP.kase) { $('t-case').value = TP.kase; paintVars(); paintDocs(); }
};

/* =====================================================================
   ACTIVITY LOG (admin)
   ===================================================================== */
const ACT = { 'template.save': 'Edited template', 'template.reset': 'Reset template', login: 'Logged in', setup: 'Setup', password: 'Password', 'user.create': 'Added user', 'user.update': 'Updated user', 'client.create': 'Added client', 'client.update': 'Edited client', 'client.delete': 'Deleted client', 'ca.create': 'Added CA firm', 'ca.update': 'Edited CA firm', 'ca.delete': 'Deleted CA firm', generate: 'Generated', backup: 'Backup' };
PAGES.activity = async () => {
  $('view').innerHTML = '<div class="pagehead"><div><h1>Activity Log</h1><p class="sub">Last 300 actions by the team.</p></div></div><div class="card"><div id="act">Loading…</div></div>';
  let rows; try { rows = await api('GET', '/api/activity'); } catch (e) { return fail(e); }
  if (!$('act')) return;
  $('act').innerHTML = rows.length ? '<table class="tbl"><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>' + rows.map(r => '<tr><td style="white-space:nowrap">' + new Date(r.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + '</td><td>' + esc(r.user_name || '—') + '</td><td><span class="pill ' + (r.action === 'generate' ? 'green' : /delete/.test(r.action) ? 'red' : 'grey') + '">' + esc(ACT[r.action] || r.action) + '</span></td><td>' + esc(r.detail || '') + '</td></tr>').join('') + '</table>' : '<div class="empty">No activity yet.</div>';
};

/* =====================================================================
   MY ACCOUNT
   ===================================================================== */
PAGES.account = () => {
  $('view').innerHTML = `<div class="pagehead"><div><h1>My Account</h1><p class="sub">${esc(S.me.name)} · ${esc(S.me.email)}</p></div></div>
  <div class="card" style="max-width:520px"><h2>Change password</h2><div style="display:grid;gap:12px">
   <div><label>Current password</label><input type="password" id="p-cur" autocomplete="current-password"></div>
   <div><label>New password (min. 8 characters)</label><input type="password" id="p-new" autocomplete="new-password"></div>
   <div><button id="p-save">Update password</button></div></div></div>`;
  $('p-save').onclick = async () => { try { await api('POST', '/api/me/password', { current: $('p-cur').value, password: $('p-new').value }); toast('Password updated'); $('p-cur').value = $('p-new').value = ''; } catch (e) { fail(e); } };
};

boot();
})();
