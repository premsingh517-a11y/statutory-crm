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

/* ---------------- API ---------------- */
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
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
function parseHash() { const [p, q] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?'); return { page: p || 'dashboard', params: new URLSearchParams(q || '') }; }
window.addEventListener('hashchange', () => { if (S.me) route(); });
const PAGES = {};
function route() {
  const { page, params } = parseHash();
  const fn = PAGES[page] && (!['users', 'activity'].includes(page) || isAdmin()) ? PAGES[page] : PAGES.dashboard;
  $$('.side a').forEach(a => a.classList.toggle('active', a.dataset.route === page));
  $('side').classList.remove('open'); closeModal();
  window.scrollTo(0, 0);
  fn(params);
}

/* =====================================================================
   DASHBOARD
   ===================================================================== */
PAGES.dashboard = async () => {
  const v = $('view');
  v.innerHTML = '<div class="pagehead"><div><h1>Namaste, ' + esc(S.me.name.split(' ')[0]) + '</h1><p class="sub">Upcoming statutory deadlines across all clients.</p></div><a class="btn" href="#/generate">+ Generate Documents</a></div><div id="dashBody"><div class="card">Loading…</div></div>';
  try { S.filings = await api('GET', '/api/filings'); } catch (e) { return fail(e); }
  const today = todayISO(), soon = H.addDays(today, 7), rows = [];
  S.filings.forEach(fl => {
    DC.timeline({ kase: fl.kase, f: fl.data }).forEach(t => {
      if (!t.due || t.actual) return;
      rows.push({ fl, t, status: t.due < today ? 'overdue' : t.due <= soon ? 'soon' : 'upcoming' });
    });
  });
  rows.sort((a, b) => a.t.due.localeCompare(b.t.due));
  const overdue = rows.filter(r => r.status === 'overdue').length;
  const adtPending = S.filings.filter(fl => DC.timeline({ kase: fl.kase, f: fl.data }).some(t => t.key === 'adt1' && t.due && !t.actual)).length;
  const pill = s => s === 'overdue' ? '<span class="pill red">Overdue</span>' : s === 'soon' ? '<span class="pill gold">Due in 7 days</span>' : '<span class="pill grey">Upcoming</span>';
  let html = '<div class="stats"><div class="stat"><b>' + S.clients.length + '</b><span>Clients</span></div><div class="stat"><b>' + S.cas.length + '</b><span>CA firms</span></div><div class="stat gold"><b>' + adtPending + '</b><span>ADT-1 pending</span></div><div class="stat red"><b>' + overdue + '</b><span>Overdue items</span></div></div>';
  html += '<div class="card"><h2>Deadlines</h2>' + (rows.length ? '<table class="tbl"><tr><th>Client</th><th>Case</th><th>Task</th><th>Due by</th><th>Status</th><th></th></tr>' + rows.slice(0, 60).map(r =>
    '<tr><td><b>' + esc(r.fl.clientName) + '</b></td><td class="hide-m">' + esc(DC.CASE_SHORT[r.fl.kase]) + '</td><td>' + esc(r.t.label) + (r.t.rule ? '<br><small class="hint">' + esc(r.t.rule) + '</small>' : '') + '</td><td><b>' + H.sd(r.t.due) + '</b></td><td>' + pill(r.status) + '</td><td class="actions"><a class="btn sm" style="padding:6px 11px;font-size:12.5px" href="#/generate?client=' + r.fl.clientId + '&case=' + r.fl.kase + '">Open</a></td></tr>').join('') + '</table>'
    : '<div class="empty">No pending deadlines. Start by generating documents for a client — dates you enter will be tracked here.</div>') + '</div>';
  html += '<div class="card"><h2>Recently worked on</h2>' + (S.filings.length ? '<table class="tbl"><tr><th>Client</th><th>Case</th><th>Last updated</th><th></th></tr>' + S.filings.slice(0, 8).map(fl => '<tr><td>' + esc(fl.clientName) + '</td><td>' + esc(DC.CASE_SHORT[fl.kase]) + '</td><td>' + new Date(fl.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + (fl.updatedBy ? ' · ' + esc(fl.updatedBy) : '') + (fl.data.adt1Srn ? ' · <span class="pill green">ADT-1 filed</span>' : '') + '</td><td class="actions"><a class="btn sm" style="padding:6px 11px;font-size:12.5px;background:#fff;color:var(--brand);border:1px solid #e5cfcd" href="#/generate?client=' + fl.clientId + '&case=' + fl.kase + '">Open</a></td></tr>').join('') + '</table>' : '<div class="empty">Nothing yet.</div>') + '</div>';
  if ($('dashBody')) $('dashBody').innerHTML = html;
};

/* =====================================================================
   GENERATE
   ===================================================================== */
const G = { clientId: '', caId: '', dirIndex: 0, kase: '', form: {} };
let saveTimer = null, docKey = '';
const docSel = {};
const FIELDS = {
  first: `<div class="grid">
    <div><label>Date of Incorporation <span class="req">*</span></label><input type="date" data-f="incDate"><div class="hint">From client master; you can change it here.</div></div>
    <div><label>Board Meeting Date <span class="req">*</span></label><input type="date" data-f="bmDate"></div>
    <div><label>Board Meeting Time <span class="req">*</span></label><input type="time" data-f="bmTime" data-def="11:00"></div>
    <div class="span2"><label>Board Meeting Venue</label><input data-f="bmVenue" placeholder="Leave blank to use the Registered Office"></div>
    <div><label>Date of Notice of Board Meeting</label><input type="date" data-f="bmNotice"><div class="hint">At least 7 days before the meeting (Sec 173(3))</div></div></div>`,
  agm: `<div class="grid">
    <div><label>Type of Appointment <span class="req">*</span></label><select data-f="apptType"><option value="new">New auditor (change of auditor)</option><option value="re">Re-appointment of existing auditor</option></select></div>
    <div><label>AGM Number <span class="req">*</span></label><input type="number" min="1" data-f="agmNo" placeholder="e.g. 5 for 5th AGM"></div>
    <div><label>Term (years) <span class="req">*</span></label><input type="number" min="1" max="5" data-f="term" data-def="5"><div class="hint">One term of 5 consecutive years (Sec 139(1))</div></div>
    <div><label>AGM Date <span class="req">*</span></label><input type="date" data-f="agmDate"></div>
    <div><label>AGM Time <span class="req">*</span></label><input type="time" data-f="agmTime" data-def="11:00"></div>
    <div><label>Financial Year ended (accounts adopted)</label><input type="date" data-f="fyEnd"><div class="hint">Auto: 31 March before the AGM</div></div>
    <div class="span3"><label>AGM Venue</label><input data-f="agmVenue" placeholder="Leave blank to use the Registered Office"></div>
    <div><label>Board Meeting Date (approving AGM notice) <span class="req">*</span></label><input type="date" data-f="bmDate"></div>
    <div><label>Board Meeting Time</label><input type="time" data-f="bmTime" data-def="11:00"></div>
    <div><label>Date of AGM Notice</label><input type="date" data-f="agmNotice"><div class="hint">At least 21 clear days before AGM (Sec 101)</div></div>
    <div><label>Date of Notice of Board Meeting</label><input type="date" data-f="bmNotice"></div>
    <div class="span2"><label>Board Meeting Venue</label><input data-f="bmVenue" placeholder="Leave blank to use the Registered Office"></div></div>
    <div data-show="prev-agm"><h3>Previous / Retiring Auditor (for ICAI communication letter)</h3><div class="grid">
    <div><label>Firm Name</label><input data-f="prevFirm"></div><div><label>FRN</label><input data-f="prevFrn"></div><div><label>Email</label><input data-f="prevEmail"></div>
    <div class="span3"><label>Address</label><input data-f="prevAddr"></div></div></div>`,
  casual: `<div class="grid">
    <div><label>Reason for Vacancy <span class="req">*</span></label><select data-f="reason"><option value="resign">Resignation of auditor</option><option value="other">Other (death / disqualification etc.)</option></select></div>
    <div class="span2" data-show="reason-other"><label>Describe the reason <span class="req">*</span></label><input data-f="reasonText" placeholder="e.g. death of the sole proprietor"></div></div>
    <h3>Outgoing Auditor</h3><div class="grid">
    <div><label>Firm Name <span class="req">*</span></label><input data-f="prevFirm"></div><div><label>FRN</label><input data-f="prevFrn"></div><div><label>Email</label><input data-f="prevEmail"></div>
    <div class="span2"><label>Address</label><input data-f="prevAddr"></div>
    <div data-show="reason-resign"><label>Date of Resignation Letter</label><input type="date" data-f="resignLetter"></div>
    <div><label>Date of Vacancy (effective) <span class="req">*</span></label><input type="date" data-f="vacDate"></div></div>
    <h3>Board Meeting</h3><div class="grid">
    <div><label>Board Meeting Date <span class="req">*</span></label><input type="date" data-f="bmDate"></div>
    <div><label>Board Meeting Time <span class="req">*</span></label><input type="time" data-f="bmTime" data-def="11:00"></div>
    <div><label>Date of Notice of Board Meeting</label><input type="date" data-f="bmNotice"></div>
    <div class="span3"><label>Board Meeting Venue</label><input data-f="bmVenue" placeholder="Leave blank to use the Registered Office"></div></div>
    <div data-show="reason-resign"><h3>Extraordinary General Meeting (members' approval within 3 months)</h3><div class="grid">
    <div><label>EGM Date <span class="req">*</span></label><input type="date" data-f="egmDate"></div>
    <div><label>EGM Time <span class="req">*</span></label><input type="time" data-f="egmTime" data-def="11:00"></div>
    <div><label>Date of EGM Notice</label><input type="date" data-f="egmNotice"><div class="hint">At least 21 clear days before EGM, unless shorter-notice consent</div></div>
    <div class="span3"><label>EGM Venue</label><input data-f="egmVenue" placeholder="Leave blank to use the Registered Office"></div></div></div>`,
};
const COMMON = `<h3>Common Details</h3><div class="grid">
  <div><label>Place (for signatures) <span class="req">*</span></label><input data-f="place" placeholder="e.g. New Delhi"></div>
  <div><label>Date of Auditor's Consent Letter</label><input type="date" data-f="consentDate"><div class="hint">Should be before the Board meeting</div></div>
  <div><label>UDIN (eligibility certificate)</label><input data-f="udin" placeholder="Optional"></div>
  <div><label>Remuneration</label><input data-f="remun" placeholder="Blank = as mutually agreed"></div>
  <div><label>Letterhead</label><select data-f="lh"><option value="print">Print letterhead in Word file</option><option value="blank">Leave space for pre-printed letterhead</option></select></div></div>
  <h3>After Filing</h3><div class="grid">
  <div><label>e-Form ADT-1 SRN</label><input data-f="adt1Srn" placeholder="Enter after filing on MCA"></div>
  <div><label>Date ADT-1 Filed</label><input type="date" data-f="adt1Date"><div class="hint">Marks the ADT-1 deadline as done on the dashboard</div></div></div>`;

PAGES.generate = async params => {
  if (params.get('client')) { G.clientId = params.get('client'); G.kase = params.get('case') || G.kase; }
  if (!S.clients.some(c => String(c.id) === String(G.clientId))) G.clientId = '';
  const v = $('view');
  v.innerHTML = `<div class="pagehead"><div><h1>Generate Auditor Appointment Documents</h1><p class="sub">Select a client and case, fill the meeting details, and download Word files on letterhead.</p></div><span class="saved" id="savedNote"></span></div>
  <div class="card"><h2><span class="step">1</span>Client &amp; Auditor</h2><div class="grid">
   <div><label>Client (Company) <span class="req">*</span></label><select id="g-client"></select></div>
   <div><label>Auditor being appointed (CA Firm) <span class="req">*</span></label><select id="g-ca"></select></div>
   <div><label>Signing Director <span class="req">*</span></label><select id="g-dir"></select></div></div>
   <div id="g-info" class="hint" style="margin-top:8px"></div></div>
  <div class="card"><h2><span class="step">2</span>Choose Case</h2><div class="cases">
   <div class="case" data-case="first"><b>First Auditor</b><span>Board appoints within 30 days of incorporation — Sec 139(6)</span></div>
   <div class="case" data-case="agm"><b>Appointment at AGM</b><span>Members appoint at AGM for 5 years — Sec 139(1)</span></div>
   <div class="case" data-case="casual"><b>Casual Vacancy</b><span>Resignation / other vacancy filled by Board — Sec 139(8)</span></div></div></div>
  <div class="card hidden" id="g-form"><h2><span class="step">3</span><span id="g-title"></span></h2><div id="g-fields"></div>${COMMON}<h3>Compliance Timeline</h3><div class="timeline" id="g-timeline"></div></div>
  <div class="card hidden" id="g-docs"><div class="row between"><h2 style="margin:0"><span class="step">4</span>Documents</h2>
   <div class="row"><button class="ghost sm" id="g-selall">Select / unselect all</button><button id="g-zip">⬇ Download selected (ZIP)</button></div></div>
   <p class="hint" style="margin:6px 0 14px">Each document downloads as a Word (.docx) file. Preview to check the wording first.</p><div class="docs" id="g-doclist"></div></div>`;

  $('g-client').innerHTML = '<option value="">— Select client —</option>' + S.clients.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
  $('g-ca').innerHTML = '<option value="">— Select CA firm —</option>' + S.cas.map(a => '<option value="' + a.id + '">' + esc(a.firm) + ' (' + esc(a.frn) + ')</option>').join('');
  $('g-client').value = G.clientId;
  $('g-client').onchange = async () => { G.clientId = $('g-client').value; G.dirIndex = 0; await loadFiling(); if ($('g-dir')) paint(); };
  $('g-ca').onchange = () => { G.caId = $('g-ca').value; queueSave(); paint(); };
  $('g-dir').onchange = () => { G.dirIndex = parseInt($('g-dir').value, 10) || 0; queueSave(); paint(); };
  $$('.case').forEach(el => el.onclick = async () => {
    if (!G.clientId) return toast('Please select a client first.', true);
    G.kase = el.dataset.case; await loadFiling(); if (!$('g-dir')) return; paint(); $('g-form').scrollIntoView({ behavior: 'smooth' });
  });
  $('g-form').addEventListener('input', e => { if (e.target.dataset.f) { G.form[e.target.dataset.f] = e.target.value; queueSave(); paintTimeline(); } });
  $('g-form').addEventListener('change', e => { if (e.target.dataset.f) { G.form[e.target.dataset.f] = e.target.value; autoFill(); queueSave(); paint(); } });
  $('g-selall').onclick = () => { const all = $$('[data-sel]'), on = !all.every(c => c.checked); all.forEach(c => { c.checked = on; docSel[c.dataset.sel] = on; }); };
  $('g-zip').onclick = () => download($$('[data-sel]').filter(c => c.checked).map(c => c.dataset.sel), true);
  if (G.clientId && G.kase) await loadFiling();
  if (!$('g-dir')) return;
  docKey = '';
  paint();
};
const client = () => S.clients.find(c => String(c.id) === String(G.clientId));
const caFirm = () => S.cas.find(a => String(a.id) === String(G.caId));
const ctx = () => { const c = client() || {}; return { kase: G.kase, c, a: caFirm() || {}, d: (c.directors || [])[G.dirIndex] || {}, f: G.form }; };

async function loadFiling() {
  const c = client(); G.form = {};
  if (!c || !G.kase) return;
  let saved = null;
  try { saved = await api('GET', '/api/filings/' + c.id + '/' + G.kase); } catch (e) { fail(e); }
  saved = saved || {};
  G.form = Object.assign({}, saved); delete G.form.caId; delete G.form.dirIndex;
  if (saved.caId && S.cas.some(a => a.id === saved.caId)) G.caId = String(saved.caId);
  G.dirIndex = saved.dirIndex && c.directors && c.directors[saved.dirIndex] ? saved.dirIndex : 0;
  if (!G.form.incDate && c.incDate) G.form.incDate = c.incDate;
  docKey = '';
}
function autoFill() { if (G.kase === 'agm' && G.form.agmDate && !G.form.fyEnd) { G.form.fyEnd = H.fyStart(G.form.agmDate) + '-03-31'; const el = $$('[data-f="fyEnd"]')[0]; if (el) el.value = G.form.fyEnd; } }
function queueSave() {
  if (!G.clientId || !G.kase) return;
  clearTimeout(saveTimer); $('savedNote') && ($('savedNote').textContent = 'Saving…');
  saveTimer = setTimeout(async () => {
    try { await api('PUT', '/api/filings/' + G.clientId + '/' + G.kase, { form: G.form, caId: G.caId, dirIndex: G.dirIndex }); if ($('savedNote')) $('savedNote').textContent = '✓ Saved for the team'; }
    catch (e) { if ($('savedNote')) $('savedNote').textContent = ''; fail(e); }
  }, 700);
}
function paint() {
  const c = client();
  $('g-dir').innerHTML = c && c.directors && c.directors.length ? c.directors.map((d, i) => '<option value="' + i + '">' + esc(d.name) + (d.din ? ' (DIN ' + esc(d.din) + ')' : '') + '</option>').join('') : '<option value="">— no directors —</option>';
  $('g-dir').value = String(G.dirIndex); $('g-ca').value = G.caId || '';
  if (!S.clients.length) $('g-info').innerHTML = 'No clients yet — <a href="#/clients">add a client</a> first.';
  else if (!S.cas.length) $('g-info').innerHTML = 'No CA firm yet — <a href="#/cas">add a CA firm</a> first.';
  else $('g-info').textContent = c ? 'CIN: ' + (c.cin || '—') + ' · Regd. Office: ' + H.oneLine(c.addr) + (c.incDate ? ' · Incorporated: ' + H.sd(c.incDate) : '') : '';
  $$('.case').forEach(el => el.classList.toggle('sel', el.dataset.case === G.kase));
  const show = !!(c && G.kase);
  $('g-form').classList.toggle('hidden', !show); $('g-docs').classList.toggle('hidden', !show);
  if (!show) return;
  $('g-title').textContent = DC.CASE_TITLE[G.kase];
  if ($('g-fields').dataset.kase !== G.kase) { $('g-fields').innerHTML = FIELDS[G.kase]; $('g-fields').dataset.kase = G.kase; }
  $$('#g-form [data-f]').forEach(el => {
    const k = el.dataset.f;
    if (!(k in G.form) || G.form[k] === undefined) G.form[k] = el.dataset.def || (el.tagName === 'SELECT' ? el.options[0].value : '');
    if (document.activeElement !== el && el.value !== G.form[k]) el.value = G.form[k];
  });
  $$('[data-show="reason-other"]').forEach(el => el.classList.toggle('hidden', G.form.reason !== 'other'));
  $$('[data-show="reason-resign"]').forEach(el => el.classList.toggle('hidden', G.form.reason === 'other'));
  $$('[data-show="prev-agm"]').forEach(el => el.classList.toggle('hidden', G.form.apptType === 're'));
  paintTimeline(); paintDocs();
}
function paintTimeline() {
  if (!G.kase || !$('g-timeline')) return;
  const rows = DC.timeline(ctx());
  let h = rows.map(r => '<div class="tl ' + (r.status || '') + '"><span>' + esc(r.label) + (r.rule ? ' <small class="hint">(' + esc(r.rule) + ')</small>' : '') + '</span><span>Due by: <em>' + H.sd(r.due) + '</em>' + (r.actual ? ' · ' + r.actualLabel + ': <em>' + H.sd(r.actual) + '</em> ' + (r.status === 'ok' ? '✔ within time' : r.status === 'late' ? '✖ beyond due date' : '') : '') + '</span></div>').join('');
  const f = G.form;
  if (G.kase === 'first' && f.incDate && f.bmDate && f.bmDate > H.addDays(f.incDate, 30)) h += '<div class="note red">Board meeting is beyond 30 days of incorporation. Under Sec 139(6), if the Board fails to appoint, the members must appoint the first auditor at an EGM within 90 days. Review before using these drafts.</div>';
  $('g-timeline').innerHTML = h;
}
function paintDocs() {
  const defs = DC.docDefs(ctx()), key = G.kase + '|' + defs.map(d => d.id + d.title + d.sub).join('|');
  if (key === docKey && $('g-doclist').children.length) return; // unchanged — keep buttons so clicks are not lost
  docKey = key;
  const tag = d => d.lh === DC.LH_CO ? '<span class="tag co">COMPANY LETTERHEAD</span>' : d.lh === DC.LH_CA ? '<span class="tag ca">CA LETTERHEAD</span>' : '<span class="tag in">INTERNAL</span>';
  $('g-doclist').innerHTML = defs.map(d => '<div class="doc"><input type="checkbox" data-sel="' + d.id + '" ' + (docSel[d.id] === false ? '' : 'checked') + '><div class="t"><b>' + d.no + '. ' + esc(d.title) + '</b>' + tag(d) + '<small>' + esc(d.sub) + '</small></div><button class="ghost sm" data-prev="' + d.id + '">Preview</button><button class="sm" data-dl="' + d.id + '">⬇ Word</button></div>').join('');
  $$('[data-sel]').forEach(cb => cb.onchange = () => { docSel[cb.dataset.sel] = cb.checked; });
  $$('[data-prev]').forEach(b => b.onclick = () => preview(b.dataset.prev));
  $$('[data-dl]').forEach(b => b.onclick = () => download([b.dataset.dl], false));
}
async function download(ids, zip) {
  if (!ids.length) return toast('Select at least one document.', true);
  const m = DC.missing(ctx());
  if (m.length && !confirm('These details are not filled and will appear as blanks (____):\n\n• ' + m.join('\n• ') + '\n\nContinue anyway?')) return;
  const btn = zip ? $('g-zip') : null; if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
  try {
    clearTimeout(saveTimer);
    const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ clientId: G.clientId, caId: G.caId, dirIndex: G.dirIndex, kase: G.kase, form: G.form, docIds: ids, zip }) });
    if (r.status === 401) { showAuth(); throw new Error('Please log in again.'); }
    if (!r.ok) { let msg = 'Could not create the documents.'; try { msg = (await r.json()).error || msg; } catch (e) {} throw new Error(msg); }
    const blob = await r.blob(), cd = r.headers.get('content-disposition') || '', name = (/filename="([^"]+)"/.exec(cd) || [])[1] || 'documents';
    const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    if ($('savedNote')) $('savedNote').textContent = '✓ Saved for the team';
    toast(zip ? 'ZIP downloaded' : 'Word file downloaded');
  } catch (e) { fail(e); }
  if (btn) { btn.disabled = false; btn.textContent = '⬇ Download selected (ZIP)'; }
}

/* ---------------- preview ---------------- */
function inlineHTML(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>').replace(/\t/g, ' '); }
function preview(id) {
  const x = ctx(), d = DC.docDefs(x).find(z => z.id === id);
  let h = '<div class="mbar"><b>' + esc(d.title) + '</b><span class="row"><button class="sm" id="m-dl">⬇ Word</button><button class="ghost sm" id="m-close">Close</button></span></div>';
  if (d.lh !== DC.LH_NONE) {
    if (x.f.lh === 'blank') h += '<div style="height:110px;border:1px dashed #bbb;margin-bottom:20px;display:flex;align-items:center;justify-content:center;color:#999;font:12px Arial">space for pre-printed letterhead</div>';
    else if (d.lh === DC.LH_CO) h += '<div class="lh">' + (x.c.logo ? '<img src="' + x.c.logo.data + '" style="max-height:60px"><br>' : '') + '<b class="n">' + esc(String(x.c.name || '').toUpperCase()) + '</b><div>CIN: ' + esc(x.c.cin) + '</div><div>Regd. Office: ' + esc(H.oneLine(x.c.addr)) + '</div><div>' + esc([x.c.email && 'Email: ' + x.c.email, x.c.phone && 'Ph: ' + x.c.phone, x.c.web].filter(Boolean).join(' | ')) + '</div></div>';
    else h += '<div class="lh">' + (x.a.logo ? '<img src="' + x.a.logo.data + '" style="max-height:60px"><br>' : '') + '<b class="n">' + esc(String(x.a.firm || 'CA FIRM').toUpperCase()) + '</b><div><b style="font-size:13px;color:#8A1412;letter-spacing:2px">CHARTERED ACCOUNTANTS</b></div><div>' + esc(H.oneLine(x.a.addr)) + '</div><div>' + esc([x.a.phone && 'Ph: ' + x.a.phone, x.a.email && 'Email: ' + x.a.email].filter(Boolean).join(' | ')) + '</div></div>';
  }
  for (const b of d.build()) {
    if (b.gap) { h += '<p>&nbsp;</p>'.repeat(b.gap); continue; }
    if (b.pb) { h += '<hr style="border:0;border-top:1px dashed #aaa;margin:24px 0">'; continue; }
    if (b.tbl) { h += '<table>' + b.tbl.map(r => '<tr><td style="width:38%">' + inlineHTML(r[0]) + '</td><td>' + inlineHTML(r[1]) + '</td></tr>').join('') + '</table>'; continue; }
    let t = inlineHTML(b.p); if (b.b) t = '<b>' + t + '</b>'; if (b.u) t = '<u>' + t + '</u>';
    h += '<p style="text-align:' + ({ c: 'center', r: 'right', j: 'justify' }[b.al] || 'left') + ';' + (b.ind ? 'margin-left:40px;' : '') + (b.hang ? 'padding-left:32px;text-indent:-32px;' : '') + (b.after === 0 ? 'margin-bottom:0;' : '') + (b.sz ? 'font-size:' + Math.round(b.sz / 2 * 1.25) + 'px;' : '') + '">' + t + '</p>';
  }
  $('paper').innerHTML = h; $('modal').classList.remove('hidden');
  $('m-close').onclick = closeModal; $('m-dl').onclick = () => download([id], false);
}
function closeModal() { $('modal').classList.add('hidden'); }
$('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* =====================================================================
   LOGO UPLOAD (client / CA)
   ===================================================================== */
function readLogo(input, cb) {
  const f = input.files[0]; input.value = ''; if (!f) return;
  if (!/image\/(png|jpeg)/.test(f.type)) return toast('Please upload a PNG or JPG image.', true);
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => {
    const sc = Math.min(1, 600 / img.width), cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    cb({ data: cv.toDataURL('image/png'), w: cv.width, h: cv.height });
  }; img.src = r.result; };
  r.readAsDataURL(f);
}
function logoField(id) { return '<div><label>Logo (optional)</label><input type="file" accept="image/png,image/jpeg" id="' + id + '-file"><img id="' + id + '-prev" class="logo-prev hidden" alt=""><button type="button" class="danger sm hidden" id="' + id + '-del" style="margin-top:6px">Remove logo</button></div>'; }
function bindLogo(id, get, set) {
  const show = () => { const l = get(); $(id + '-prev').classList.toggle('hidden', !l); $(id + '-del').classList.toggle('hidden', !l); if (l) $(id + '-prev').src = l.data; };
  $(id + '-file').onchange = e => readLogo(e.target, l => { set(l); show(); });
  $(id + '-del').onclick = () => { set(null); show(); };
  show();
}

/* =====================================================================
   CLIENTS
   ===================================================================== */
let editClient = null;
PAGES.clients = () => {
  $('view').innerHTML = `<div class="pagehead"><div><h1>Clients</h1><p class="sub">Company master — shared by the whole team. Used on the company letterhead and resolutions.</p></div><button id="c-add">+ Add Client</button></div>
  <div class="card hidden" id="c-editor"><h2 id="c-title">Add Client</h2><div class="grid">
   <div class="span2"><label>Company Name <span class="req">*</span></label><input data-c="name" placeholder="As per Certificate of Incorporation"></div>
   <div><label>CIN <span class="req">*</span></label><input data-c="cin" maxlength="21" style="text-transform:uppercase"></div>
   <div><label>Date of Incorporation</label><input type="date" data-c="incDate"></div>
   <div><label>Company Type</label><select data-c="type"><option value="private">Private Limited</option><option value="public">Public Limited (unlisted)</option><option value="opc">One Person Company</option></select></div>
   <div><label>PAN</label><input data-c="pan" maxlength="10" style="text-transform:uppercase"></div>
   <div class="span3"><label>Registered Office Address <span class="req">*</span></label><textarea data-c="addr"></textarea></div>
   <div><label>Email</label><input type="email" data-c="email"></div><div><label>Phone</label><input data-c="phone"></div><div><label>Website</label><input data-c="web"></div>
   ${logoField('c-logo')}</div>
   <h3>Directors</h3><div class="dirrow hint" style="font-weight:600"><span>Name</span><span>DIN</span><span>Designation</span><span></span></div><div id="c-dirs"></div>
   <button class="ghost sm" id="c-adddir">+ Add Director</button>
   <h3>Company Secretary (optional)</h3><div class="grid"><div><label>Name</label><input data-c="csName"></div><div><label>Membership No. (ACS/FCS)</label><input data-c="csMno"></div></div>
   <div class="row" style="margin-top:18px"><button id="c-save">Save Client</button><button class="ghost" id="c-cancel">Cancel</button></div></div>
  <div class="card"><div class="row between" style="margin-bottom:10px"><b id="c-count"></b><input class="search" id="c-search" placeholder="Search name or CIN…"></div><div id="c-list"></div></div>`;
  $('c-add').onclick = () => openClient(null);
  $('c-cancel').onclick = () => $('c-editor').classList.add('hidden');
  $('c-adddir').onclick = () => addDirRow({});
  $('c-search').oninput = listClients;
  $('c-save').onclick = saveClient;
  listClients();
};
function addDirRow(d) {
  const r = document.createElement('div'); r.className = 'dirrow';
  r.innerHTML = '<input placeholder="Director name" data-d="name"><input placeholder="DIN (8 digits)" maxlength="8" data-d="din"><select data-d="desig"><option>Director</option><option>Managing Director</option><option>Whole-time Director</option><option>Additional Director</option><option>Nominee Director</option></select><button type="button" class="danger sm" title="Remove">✕</button>';
  r.querySelector('[data-d=name]').value = d.name || ''; r.querySelector('[data-d=din]').value = d.din || ''; r.querySelector('[data-d=desig]').value = d.desig || 'Director';
  r.querySelector('button').onclick = () => r.remove(); $('c-dirs').appendChild(r);
}
function openClient(c) {
  editClient = c ? Object.assign({}, c) : { logo: null };
  $('c-title').textContent = c ? 'Edit Client' : 'Add Client';
  $$('[data-c]').forEach(el => { el.value = c ? (c[el.dataset.c] ?? '') : (el.tagName === 'SELECT' ? el.options[0].value : ''); });
  $('c-dirs').innerHTML = ''; ((c && c.directors && c.directors.length) ? c.directors : [{}, {}]).forEach(addDirRow);
  bindLogo('c-logo', () => editClient.logo, l => { editClient.logo = l; });
  $('c-editor').classList.remove('hidden'); $('c-editor').scrollIntoView({ behavior: 'smooth' });
}
async function saveClient() {
  const c = { logo: editClient.logo };
  $$('[data-c]').forEach(el => { c[el.dataset.c] = el.value.trim(); });
  c.cin = c.cin.toUpperCase(); c.pan = c.pan.toUpperCase();
  c.directors = $$('#c-dirs .dirrow').map(r => ({ name: r.querySelector('[data-d=name]').value.trim(), din: r.querySelector('[data-d=din]').value.trim(), desig: r.querySelector('[data-d=desig]').value })).filter(d => d.name);
  const miss = []; if (!c.name) miss.push('Company Name'); if (!c.cin) miss.push('CIN'); if (!c.addr) miss.push('Registered Office'); if (!c.directors.length) miss.push('at least one Director');
  if (miss.length) return toast('Please fill: ' + miss.join(', '), true);
  if (c.cin.length !== 21 && !confirm('CIN should be 21 characters (you entered ' + c.cin.length + '). Save anyway?')) return;
  const badDin = c.directors.filter(d => d.din && !/^\d{8}$/.test(d.din)); if (badDin.length && !confirm('DIN should be 8 digits. Please check: ' + badDin.map(d => d.name).join(', ') + '. Save anyway?')) return;
  $('c-save').disabled = true;
  try { await api(editClient.id ? 'PUT' : 'POST', '/api/clients' + (editClient.id ? '/' + editClient.id : ''), c); await loadMasters(); $('c-editor').classList.add('hidden'); listClients(); toast('Client saved'); }
  catch (e) { fail(e); }
  $('c-save').disabled = false;
}
function listClients() {
  const q = $('c-search').value.trim().toLowerCase();
  const list = S.clients.filter(c => !q || c.name.toLowerCase().includes(q) || (c.cin || '').toLowerCase().includes(q));
  $('c-count').textContent = S.clients.length + ' client' + (S.clients.length === 1 ? '' : 's');
  $('c-list').innerHTML = list.length ? '<table class="tbl"><tr><th>Company</th><th>CIN</th><th class="hide-m">Directors</th><th class="hide-m">Last updated</th><th></th></tr>' + list.map(c =>
    '<tr><td><b>' + esc(c.name) + '</b><br><small class="hint">' + esc(H.oneLine(c.addr)) + '</small></td><td>' + esc(c.cin) + (c.incDate ? '<br><small class="hint">Inc. ' + H.sd(c.incDate) + '</small>' : '') + '</td><td class="hide-m">' + (c.directors || []).map(d => esc(d.name) + (d.din ? ' <small class="hint">(' + esc(d.din) + ')</small>' : '')).join('<br>') + '</td><td class="hide-m"><small class="hint">' + (c.updatedBy ? esc(c.updatedBy) + '<br>' : '') + new Date(c.updatedAt).toLocaleDateString('en-IN') + '</small></td><td class="actions"><button class="sm" data-gen="' + c.id + '">Generate</button> <button class="ghost sm" data-edit="' + c.id + '">Edit</button>' + (isAdmin() ? ' <button class="danger sm" data-del="' + c.id + '">Delete</button>' : '') + '</td></tr>').join('') + '</table>'
    : '<div class="empty">' + (q ? 'No client matches your search.' : 'No clients yet. Click “+ Add Client”.') + '</div>';
  $$('#c-list [data-edit]').forEach(b => b.onclick = () => openClient(S.clients.find(c => String(c.id) === b.dataset.edit)));
  $$('#c-list [data-gen]').forEach(b => b.onclick = () => { location.hash = '#/generate?client=' + b.dataset.gen; });
  $$('#c-list [data-del]').forEach(b => b.onclick = async () => {
    const c = S.clients.find(x => String(x.id) === b.dataset.del);
    if (!confirm('Delete client "' + c.name + '" and all its saved meeting details? This cannot be undone.')) return;
    try { await api('DELETE', '/api/clients/' + c.id); await loadMasters(); listClients(); toast('Client deleted'); } catch (e) { fail(e); }
  });
}

/* =====================================================================
   CA FIRMS
   ===================================================================== */
let editCA = null;
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
   <div><label>Email</label><input type="email" data-a="email"></div><div><label>Phone</label><input data-a="phone"></div>${logoField('a-logo')}</div>
   <div class="row" style="margin-top:18px"><button id="a-save">Save CA Firm</button><button class="ghost" id="a-cancel">Cancel</button></div></div>
  <div class="card"><div id="a-list"></div></div>`;
  $('a-add').onclick = () => openCA(null);
  $('a-cancel').onclick = () => $('a-editor').classList.add('hidden');
  $('a-save').onclick = saveCA;
  listCAs();
};
function openCA(a) {
  editCA = a ? Object.assign({}, a) : { logo: null };
  $('a-title').textContent = a ? 'Edit CA Firm' : 'Add CA Firm';
  $$('[data-a]').forEach(el => { el.value = a ? (a[el.dataset.a] ?? '') : (el.tagName === 'SELECT' ? el.options[0].value : ''); });
  bindLogo('a-logo', () => editCA.logo, l => { editCA.logo = l; });
  $('a-editor').classList.remove('hidden'); $('a-editor').scrollIntoView({ behavior: 'smooth' });
}
async function saveCA() {
  const a = { logo: editCA.logo };
  $$('[data-a]').forEach(el => { a[el.dataset.a] = el.value.trim(); });
  const miss = []; if (!a.firm) miss.push('Firm Name'); if (!a.frn) miss.push('FRN'); if (!a.partner) miss.push('Signing Partner'); if (!a.mno) miss.push('Membership No.'); if (!a.addr) miss.push('Office Address');
  if (miss.length) return toast('Please fill: ' + miss.join(', '), true);
  $('a-save').disabled = true;
  try { await api(editCA.id ? 'PUT' : 'POST', '/api/cas' + (editCA.id ? '/' + editCA.id : ''), a); await loadMasters(); $('a-editor').classList.add('hidden'); listCAs(); toast('CA firm saved'); }
  catch (e) { fail(e); }
  $('a-save').disabled = false;
}
function listCAs() {
  $('a-list').innerHTML = S.cas.length ? '<table class="tbl"><tr><th>Firm</th><th>FRN</th><th class="hide-m">Signing Partner</th><th></th></tr>' + S.cas.map(a =>
    '<tr><td><b>' + esc(a.firm) + '</b><br><small class="hint">' + esc(H.oneLine(a.addr)) + '</small></td><td>' + esc(a.frn) + '</td><td class="hide-m">' + esc(a.partner) + '<br><small class="hint">' + esc(a.desig) + ' · M.No. ' + esc(a.mno) + '</small></td><td class="actions"><button class="ghost sm" data-edit="' + a.id + '">Edit</button>' + (isAdmin() ? ' <button class="danger sm" data-del="' + a.id + '">Delete</button>' : '') + '</td></tr>').join('') + '</table>'
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
   ACTIVITY LOG (admin)
   ===================================================================== */
const ACT = { login: 'Logged in', setup: 'Setup', password: 'Password', 'user.create': 'Added user', 'user.update': 'Updated user', 'client.create': 'Added client', 'client.update': 'Edited client', 'client.delete': 'Deleted client', 'ca.create': 'Added CA firm', 'ca.update': 'Edited CA firm', 'ca.delete': 'Deleted CA firm', generate: 'Generated', backup: 'Backup' };
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
