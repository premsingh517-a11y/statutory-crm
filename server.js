// NeuSource Statutory CRM — Express server
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const JSZip = require('jszip');

const db = require('./lib/db');
const { buildDocx } = require('./lib/docx-builder');
const DC = require('./public/js/docs-content.js');
const LH = require('./lib/letterhead');
const XL = require('./lib/import');

const PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
if (PROD && db.pool && !process.env.SESSION_SECRET) { console.error('SESSION_SECRET must be set in production'); process.exit(1); }

const app = express();
app.set('trust proxy', 1); // Render runs behind a proxy (needed for secure cookies)
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'same-origin');
  next();
});
app.use(session({
  // cloud Postgres: sessions kept in the database; built-in local database: kept in memory (log in again after a restart)
  store: db.pool ? new PgSession({ pool: db.pool, tableName: 'sessions', createTableIfMissing: true }) : undefined,
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  name: 'nscrm.sid',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 10 }, // 10 hours of inactivity
}));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: PROD ? '1h' : 0 }));

/* ---------------- helpers ---------------- */
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function cleanLogo(l) {
  if (!l || typeof l !== 'object' || typeof l.data !== 'string') return null;
  if (!/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(l.data)) return null;
  if (l.data.length > 600000) return null; // ~450 KB image
  const w = parseInt(l.w, 10), h = parseInt(l.h, 10);
  if (!(w > 0 && h > 0)) return null;
  return { data: l.data, w, h };
}
const CLIENT_FIELDS = ['name', 'cin', 'incDate', 'type', 'pan', 'addr', 'email', 'phone', 'web', 'csName', 'csMno', 'authCap', 'paidCap', 'faceValue', 'size', 'lastAgmNo', 'lastAgmDate'];
function cleanClient(b) {
  const c = {};
  CLIENT_FIELDS.forEach(k => { c[k] = str(b[k], k === 'addr' ? 600 : 200); });
  c.cin = c.cin.toUpperCase(); c.pan = c.pan.toUpperCase();
  c.directors = (Array.isArray(b.directors) ? b.directors : []).slice(0, 15)
    .map(d => ({ name: str(d && d.name, 120), din: str(d && d.din, 8), desig: str(d && d.desig, 60) || 'Director', sign: cleanLogo(d && d.sign) }))
    .filter(d => d.name);
  c.shareholders = (Array.isArray(b.shareholders) ? b.shareholders : []).slice(0, 200)
    .map(h => ({ name: str(h && h.name, 160), folio: str(h && h.folio, 30), shares: str(h && h.shares, 20), cat: str(h && h.cat, 40) }))
    .filter(h => h.name);
  c.logo = cleanLogo(b.logo);
  return c;
}
const CA_FIELDS = ['firm', 'frn', 'const', 'pan', 'peer', 'partner', 'mno', 'desig', 'addr', 'email', 'phone'];
function cleanCA(b) {
  const a = {};
  CA_FIELDS.forEach(k => { a[k] = str(b[k], k === 'addr' ? 600 : 200); });
  a.frn = a.frn.toUpperCase(); a.pan = a.pan.toUpperCase();
  a.logo = cleanLogo(b.logo);
  a.sign = cleanLogo(b.sign); // signing partner's signature
  return a;
}
// meeting / case details: any simple field name; values are text, fields ending in "Sign" are signature images
function cleanForm(b) {
  const f = {};
  if (!b || typeof b !== 'object') return f;
  Object.keys(b).slice(0, 200).forEach(k => {
    if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(k)) return;
    if (/Sign$/.test(k)) { const img = cleanLogo(b[k]); if (img) f[k] = img; return; }
    if (typeof b[k] === 'string' || typeof b[k] === 'number') f[k] = String(b[k]).slice(0, 6000);
  });
  return f;
}
const CASES = DC.CASES;

/* ---------------- auth ---------------- */
function requireLogin(req, res, next) { if (req.session.user) return next(); bad(res, 'Please log in again.', 401); }
function requireAdmin(req, res, next) { if (req.session.user && req.session.user.role === 'admin') return next(); bad(res, 'Only an admin can do this.', 403); }
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, created_at: u.created_at });

// simple login throttle: 8 failed tries per email+IP per 15 minutes
const tries = new Map();
function throttled(key) { const t = tries.get(key); return t && t.n >= 8 && Date.now() - t.at < 15 * 60 * 1000; }
function failed(key) { const t = tries.get(key); if (!t || Date.now() - t.at > 15 * 60 * 1000) tries.set(key, { n: 1, at: Date.now() }); else t.n++; }

app.get('/api/setup-status', async (req, res) => {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
  res.json({ needsSetup: rows[0].n === 0 });
});
app.post('/api/setup', async (req, res) => {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return bad(res, 'Setup is already done. Please log in.', 409);
  const name = str(req.body.name, 100), email = str(req.body.email, 200).toLowerCase(), password = String(req.body.password || '');
  if (!name || !isEmail(email)) return bad(res, 'Enter a valid name and email.');
  if (password.length < 8) return bad(res, 'Password must be at least 8 characters.');
  const hash = await bcrypt.hash(password, 10);
  const r = await db.query("INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin') RETURNING *", [name, email, hash]);
  req.session.regenerate(err => {
    if (err) return bad(res, 'Session error', 500);
    req.session.user = publicUser(r.rows[0]);
    db.log(r.rows[0].id, 'setup', 'Created first admin account');
    res.json({ user: req.session.user });
  });
});
app.post('/api/login', async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase(), password = String(req.body.password || '');
  const key = email + '|' + req.ip;
  if (throttled(key)) return bad(res, 'Too many attempts. Please wait 15 minutes and try again.', 429);
  const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) { failed(key); return bad(res, 'Wrong email or password.', 401); }
  if (!u.active) return bad(res, 'Your account is deactivated. Please contact the admin.', 403);
  tries.delete(key);
  req.session.regenerate(err => {
    if (err) return bad(res, 'Session error', 500);
    req.session.user = publicUser(u);
    db.log(u.id, 'login', null);
    res.json({ user: req.session.user });
  });
});
app.post('/api/logout', (req, res) => { req.session.destroy(() => { res.clearCookie('nscrm.sid'); res.json({ ok: true }); }); });
app.get('/api/me', async (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.session.user.id]);
  if (!rows[0] || !rows[0].active) { req.session.destroy(() => {}); return res.json({ user: null }); }
  req.session.user = publicUser(rows[0]);
  res.json({ user: req.session.user });
});
app.post('/api/me/password', requireLogin, async (req, res) => {
  const cur = String(req.body.current || ''), next = String(req.body.password || '');
  const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.session.user.id]);
  if (!rows[0] || !(await bcrypt.compare(cur, rows[0].password_hash))) return bad(res, 'Current password is wrong.');
  if (next.length < 8) return bad(res, 'New password must be at least 8 characters.');
  await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(next, 10), rows[0].id]);
  db.log(rows[0].id, 'password', 'Changed own password');
  res.json({ ok: true });
});

/* ---------------- users (admin) ---------------- */
app.get('/api/users', requireAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users ORDER BY name');
  res.json(rows.map(publicUser));
});
app.post('/api/users', requireAdmin, async (req, res) => {
  const name = str(req.body.name, 100), email = str(req.body.email, 200).toLowerCase(), password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'executive';
  if (!name || !isEmail(email)) return bad(res, 'Enter a valid name and email.');
  if (password.length < 8) return bad(res, 'Password must be at least 8 characters.');
  const ex = await db.query('SELECT 1 FROM users WHERE email=$1', [email]);
  if (ex.rows.length) return bad(res, 'A user with this email already exists.', 409);
  const r = await db.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *', [name, email, await bcrypt.hash(password, 10), role]);
  db.log(req.session.user.id, 'user.create', name + ' <' + email + '> as ' + role);
  res.json(publicUser(r.rows[0]));
});
app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [id]);
  const u = rows[0]; if (!u) return bad(res, 'User not found.', 404);
  const self = id === req.session.user.id;
  const role = req.body.role === 'admin' ? 'admin' : req.body.role === 'executive' ? 'executive' : u.role;
  const active = typeof req.body.active === 'boolean' ? req.body.active : u.active;
  if (self && (role !== 'admin' || !active)) return bad(res, 'You cannot remove your own admin access.');
  const name = str(req.body.name, 100) || u.name;
  await db.query('UPDATE users SET name=$1, role=$2, active=$3 WHERE id=$4', [name, role, active, id]);
  if (req.body.password) {
    if (String(req.body.password).length < 8) return bad(res, 'Password must be at least 8 characters.');
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(req.body.password), 10), id]);
  }
  if (!active) await db.query("DELETE FROM sessions WHERE sess->'user'->>'id' = $1", [String(id)]).catch(() => {});
  db.log(req.session.user.id, 'user.update', u.email + ': role=' + role + ', active=' + active + (req.body.password ? ', password reset' : ''));
  res.json({ ok: true });
});

/* ---------------- clients & CA firms ---------------- */
const withMeta = r => Object.assign({}, r.data, { id: r.id, updatedAt: r.updated_at, updatedBy: r.updated_by_name || null, lhName: r.lh_name || null });
async function listOf(table) {
  const { rows } = await db.query(`SELECT t.*, u.name AS updated_by_name, fl.name AS lh_name FROM ${table} t LEFT JOIN users u ON u.id=t.updated_by
    LEFT JOIN files fl ON fl.owner_type='${table}' AND fl.owner_id=t.id ORDER BY t.id`);
  return rows.map(withMeta);
}
app.get('/api/clients', requireLogin, async (req, res) => res.json(await listOf('clients')));
app.get('/api/cas', requireLogin, async (req, res) => res.json(await listOf('cas')));

app.post('/api/clients', requireLogin, async (req, res) => saveClient(req, res, null));
app.put('/api/clients/:id', requireLogin, async (req, res) => saveClient(req, res, parseInt(req.params.id, 10)));
async function saveClient(req, res, id) {
  const c = cleanClient(req.body || {});
  if (!c.name || !c.cin || !c.addr || !c.directors.length) return bad(res, 'Company name, CIN, registered office and at least one director are required.');
  const dup = await db.query("SELECT id, data->>'name' AS name FROM clients WHERE upper(data->>'cin')=$1 AND id<>$2", [c.cin, id || 0]);
  if (dup.rows.length) return bad(res, 'This CIN already exists for "' + dup.rows[0].name + '".', 409);
  const uid = req.session.user.id;
  let r;
  if (id) {
    r = await db.query('UPDATE clients SET data=$1, updated_by=$2, updated_at=now() WHERE id=$3 RETURNING *', [c, uid, id]);
    if (!r.rows.length) return bad(res, 'Client not found.', 404);
  } else r = await db.query('INSERT INTO clients (data, created_by, updated_by) VALUES ($1,$2,$2) RETURNING *', [c, uid]);
  db.log(uid, id ? 'client.update' : 'client.create', c.name + ' (' + c.cin + ')');
  res.json(withMeta(r.rows[0]));
}
app.delete('/api/clients/:id', requireAdmin, async (req, res) => {
  const r = await db.query('DELETE FROM clients WHERE id=$1 RETURNING data', [parseInt(req.params.id, 10)]);
  if (!r.rows.length) return bad(res, 'Client not found.', 404);
  await db.query("DELETE FROM files WHERE owner_type='clients' AND owner_id=$1", [parseInt(req.params.id, 10)]);
  db.log(req.session.user.id, 'client.delete', r.rows[0].data.name);
  res.json({ ok: true });
});

app.post('/api/cas', requireLogin, async (req, res) => saveCA(req, res, null));
app.put('/api/cas/:id', requireLogin, async (req, res) => saveCA(req, res, parseInt(req.params.id, 10)));
async function saveCA(req, res, id) {
  const a = cleanCA(req.body || {});
  if (!a.firm || !a.frn || !a.partner || !a.mno || !a.addr) return bad(res, 'Firm name, FRN, signing partner, membership no. and address are required.');
  const dup = await db.query("SELECT id FROM cas WHERE upper(data->>'frn')=$1 AND id<>$2", [a.frn, id || 0]);
  if (dup.rows.length) return bad(res, 'A CA firm with this FRN already exists.', 409);
  const uid = req.session.user.id;
  let r;
  if (id) {
    r = await db.query('UPDATE cas SET data=$1, updated_by=$2, updated_at=now() WHERE id=$3 RETURNING *', [a, uid, id]);
    if (!r.rows.length) return bad(res, 'CA firm not found.', 404);
  } else r = await db.query('INSERT INTO cas (data, created_by, updated_by) VALUES ($1,$2,$2) RETURNING *', [a, uid]);
  db.log(uid, id ? 'ca.update' : 'ca.create', a.firm + ' (' + a.frn + ')');
  res.json(withMeta(r.rows[0]));
}
app.delete('/api/cas/:id', requireAdmin, async (req, res) => {
  const r = await db.query('DELETE FROM cas WHERE id=$1 RETURNING data', [parseInt(req.params.id, 10)]);
  if (!r.rows.length) return bad(res, 'CA firm not found.', 404);
  await db.query("DELETE FROM files WHERE owner_type='cas' AND owner_id=$1", [parseInt(req.params.id, 10)]);
  db.log(req.session.user.id, 'ca.delete', r.rows[0].data.firm);
  res.json({ ok: true });
});

/* ---------------- editable document templates ---------------- */
app.get('/api/templates', requireLogin, async (req, res) => {
  const { rows } = await db.query('SELECT t.case_type, t.variant, t.doc_id, t.updated_at, u.name AS updated_by FROM templates t LEFT JOIN users u ON u.id=t.updated_by ORDER BY t.updated_at DESC');
  res.json(rows.map(r => ({ kase: r.case_type, variant: r.variant, docId: r.doc_id, updatedAt: r.updated_at, updatedBy: r.updated_by })));
});
app.get('/api/templates/:kase/:docId', requireLogin, async (req, res) => {
  const { rows } = await db.query('SELECT body, updated_at FROM templates WHERE case_type=$1 AND variant=$2 AND doc_id=$3', [req.params.kase, String(req.query.variant || ''), req.params.docId]);
  res.json(rows[0] ? { body: rows[0].body, updatedAt: rows[0].updated_at } : null);
});
app.put('/api/templates/:kase/:docId', requireAdmin, async (req, res) => {
  const kase = req.params.kase, docId = String(req.params.docId).slice(0, 40), variant = String((req.body && req.body.variant) || '').slice(0, 200), body = String((req.body && req.body.body) || '');
  if (!CASES.includes(kase)) return bad(res, 'Unknown case.');
  if (DC.isFixed(docId)) return bad(res, 'This document has a fixed format and cannot be edited.');
  if (!body.trim()) return bad(res, 'The template is empty.');
  if (body.length > 60000) return bad(res, 'The template is too long.');
  await db.query(`INSERT INTO templates (case_type, variant, doc_id, body, updated_by) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (case_type, variant, doc_id) DO UPDATE SET body=EXCLUDED.body, updated_by=EXCLUDED.updated_by, updated_at=now()`, [kase, variant, docId, body, req.session.user.id]);
  db.log(req.session.user.id, 'template.save', DC.CASE_SHORT[kase] + ' — ' + docId + (variant ? ' (' + variant + ')' : ''));
  res.json({ ok: true });
});
app.delete('/api/templates/:kase/:docId', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM templates WHERE case_type=$1 AND variant=$2 AND doc_id=$3', [req.params.kase, String(req.query.variant || ''), req.params.docId]);
  db.log(req.session.user.id, 'template.reset', DC.CASE_SHORT[req.params.kase] + ' — ' + req.params.docId);
  res.json({ ok: true });
});

/* ---------------- Excel import of clients ---------------- */
app.get('/api/import/template', requireLogin, async (req, res) => {
  const buf = await XL.template();
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', 'attachment; filename="NeuSource_CRM_Client_Import_Template.xlsx"');
  res.send(Buffer.from(buf));
});
app.post('/api/import', requireLogin, async (req, res) => {
  const data = String((req.body && req.body.data) || '').replace(/^data:[^,]*,/, ''), update = req.body && req.body.mode === 'update';
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) return bad(res, 'The file is empty.');
  if (buf.length > 8 * 1024 * 1024) return bad(res, 'The Excel file is larger than 8 MB.');
  let parsed; try { parsed = await XL.parse(buf); } catch (e) { return bad(res, e.message); }
  const uid = req.session.user.id, out = { created: 0, updated: 0, skipped: 0, errors: parsed.errors.slice() };
  const { rows: existing } = await db.query("SELECT id, data FROM clients");
  const byCin = new Map(existing.map(r => [String(r.data.cin || '').toUpperCase(), r]));
  for (const row of parsed.rows.slice(0, 2000)) {
    const c = cleanClient(row), ex = byCin.get(c.cin);
    try {
      if (ex) {
        if (!update) { out.skipped++; continue; }
        const old = ex.data;
        c.directors = c.directors.map(d => { const o = (old.directors || []).find(od => (d.din && od.din === d.din) || od.name.toLowerCase() === d.name.toLowerCase()); return Object.assign({}, d, { sign: o && o.sign || null }); });
        const merged = Object.assign({}, old, Object.fromEntries(Object.entries(c).filter(([k, v]) => k === 'directors' ? v.length : (v !== '' && v != null && !(Array.isArray(v) && !v.length)))));
        await db.query('UPDATE clients SET data=$1, updated_by=$2, updated_at=now() WHERE id=$3', [merged, uid, ex.id]); out.updated++;
      } else {
        const r = await db.query('INSERT INTO clients (data, created_by, updated_by) VALUES ($1,$2,$2) RETURNING id', [c, uid]);
        byCin.set(c.cin, { id: r.rows[0].id, data: c }); out.created++;
      }
    } catch (e) { out.errors.push('Row ' + row._row + ' (' + c.name + '): ' + e.message); }
  }
  db.log(uid, 'client.import', out.created + ' added, ' + out.updated + ' updated, ' + out.skipped + ' skipped');
  res.json(out);
});

/* ---------------- Word letterheads (company / CA firm) ---------------- */
const OWNERS = { clients: 'clients', cas: 'cas' };
app.put('/api/:owner/:id/letterhead', requireLogin, async (req, res) => {
  const owner = OWNERS[req.params.owner], id = parseInt(req.params.id, 10);
  if (!owner) return bad(res, 'Not found', 404);
  const ex = await db.query(`SELECT 1 FROM ${owner} WHERE id=$1`, [id]);
  if (!ex.rows.length) return bad(res, 'Record not found.', 404);
  const name = str(req.body && req.body.name, 150) || 'letterhead.docx', data = String((req.body && req.body.data) || '').replace(/^data:[^,]*,/, '');
  if (!/\.docx$/i.test(name)) return bad(res, 'Please upload a Word .docx file. (Open a .doc file in Word and use Save As → Word Document.)');
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) return bad(res, 'The file is empty.');
  if (buf.length > 5 * 1024 * 1024) return bad(res, 'The letterhead file is larger than 5 MB. Please compress the images inside it.');
  try { await LH.inspect(buf); } catch (e) { return bad(res, e.message); }
  await db.query('DELETE FROM files WHERE owner_type=$1 AND owner_id=$2', [owner, id]);
  await db.query('INSERT INTO files (owner_type, owner_id, name, data) VALUES ($1,$2,$3,$4)', [owner, id, name, buf.toString('base64')]);
  db.log(req.session.user.id, owner === 'cas' ? 'ca.update' : 'client.update', 'Uploaded Word letterhead: ' + name);
  res.json({ ok: true, name });
});
app.delete('/api/:owner/:id/letterhead', requireLogin, async (req, res) => {
  const owner = OWNERS[req.params.owner]; if (!owner) return bad(res, 'Not found', 404);
  await db.query('DELETE FROM files WHERE owner_type=$1 AND owner_id=$2', [owner, parseInt(req.params.id, 10)]);
  res.json({ ok: true });
});
app.get('/api/:owner/:id/letterhead', requireLogin, async (req, res) => {
  const owner = OWNERS[req.params.owner]; if (!owner) return bad(res, 'Not found', 404);
  const { rows } = await db.query('SELECT name, data FROM files WHERE owner_type=$1 AND owner_id=$2', [owner, parseInt(req.params.id, 10)]);
  if (!rows.length) return bad(res, 'No letterhead uploaded.', 404);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.set('Content-Disposition', 'attachment; filename="' + rows[0].name.replace(/[^\w.\- ]+/g, '_') + '"');
  res.send(Buffer.from(rows[0].data, 'base64'));
});
async function letterheadFile(owner, id) {
  if (!id) return null;
  const { rows } = await db.query('SELECT data FROM files WHERE owner_type=$1 AND owner_id=$2', [owner, id]);
  return rows.length ? Buffer.from(rows[0].data, 'base64') : null;
}

/* ---------------- filings (saved meeting details) — one record per client, case and financial year ---------------- */
const validFY = fy => /^20\d{2}-\d{2}$/.test(String(fy || '')) ? String(fy) : '';
const fkey = (kase, fy) => validFY(fy) ? kase + '@' + validFY(fy) : kase;
const fyOfDate = s => { const m = /^(\d{4})-(\d{2})/.exec(String(s || '')); if (!m) return ''; const y = +m[2] >= 4 ? +m[1] : +m[1] - 1; return y + '-' + String(y + 1).slice(2); };
app.get('/api/filings', requireLogin, async (req, res) => {
  const { rows } = await db.query(`SELECT f.client_id, f.case_type, f.data, f.updated_at, u.name AS updated_by, c.data->>'name' AS client_name
    FROM filings f JOIN clients c ON c.id=f.client_id LEFT JOIN users u ON u.id=f.updated_by ORDER BY f.updated_at DESC`);
  res.json(rows.map(r => { const [kase, fy] = r.case_type.split('@'); return { clientId: r.client_id, kase, fy: fy || '', clientName: r.client_name, data: r.data, updatedAt: r.updated_at, updatedBy: r.updated_by }; }));
});
app.get('/api/filings/:clientId/:kase', requireLogin, async (req, res) => {
  const cid = parseInt(req.params.clientId, 10), kase = req.params.kase, fy = validFY(req.query.fy);
  let { rows } = await db.query('SELECT data FROM filings WHERE client_id=$1 AND case_type=$2', [cid, fkey(kase, fy)]);
  if (!rows[0] && fy) { // older records were saved without a financial year: show them in the FY they belong to
    const old = await db.query('SELECT data FROM filings WHERE client_id=$1 AND case_type=$2', [cid, kase]);
    const d = old.rows[0] && old.rows[0].data;
    if (d && fyOfDate(d.fyEnd ? d.fyEnd.replace(/-03-31$/, '-03-30') : (d.bmDate || d.agmDate || d.egmDate || d.alDate || '')) === fy) rows = old.rows;
  }
  res.json(rows[0] ? rows[0].data : null);
});
async function saveFiling(clientId, kase, body, uid) {
  const dirIdx = (Array.isArray(body.dirIdx) ? body.dirIdx : []).map(n => parseInt(n, 10)).filter(n => n >= 0 && n < 50).slice(0, 15);
  const data = Object.assign(cleanForm(body.form), { caId: parseInt(body.caId, 10) || null, dirIndex: parseInt(body.dirIndex, 10) || 0, dirIdx, fy: validFY(body.fy) });
  await db.query(`INSERT INTO filings (client_id, case_type, data, updated_by) VALUES ($1,$2,$3,$4)
    ON CONFLICT (client_id, case_type) DO UPDATE SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_at=now()`, [clientId, fkey(kase, body.fy), data, uid]);
  return data;
}
app.put('/api/filings/:clientId/:kase', requireLogin, async (req, res) => {
  const clientId = parseInt(req.params.clientId, 10), kase = req.params.kase;
  if (!CASES.includes(kase)) return bad(res, 'Unknown case.');
  const ex = await db.query('SELECT 1 FROM clients WHERE id=$1', [clientId]);
  if (!ex.rows.length) return bad(res, 'Client not found.', 404);
  await saveFiling(clientId, kase, req.body || {}, req.session.user.id);
  res.json({ ok: true });
});

/* ---------------- document generation ---------------- */
app.post('/api/generate', requireLogin, async (req, res) => {
  const b = req.body || {};
  const kase = b.kase, clientId = parseInt(b.clientId, 10), caId = parseInt(b.caId, 10);
  if (!CASES.includes(kase)) return bad(res, 'Choose a case.');
  const cr = await db.query('SELECT data FROM clients WHERE id=$1', [clientId]);
  if (!cr.rows.length) return bad(res, 'Client not found.', 404);
  const ar = caId ? await db.query('SELECT data FROM cas WHERE id=$1', [caId]) : { rows: [] };
  const c = cr.rows[0].data, a = ar.rows[0] ? ar.rows[0].data : {};
  const idx = (Array.isArray(b.dirIdx) && b.dirIdx.length ? b.dirIdx : [b.dirIndex || 0]).map(n => parseInt(n, 10));
  const ds = idx.map(i => (c.directors || [])[i]).filter(Boolean), d = ds[0] || {};
  const f = cleanForm(b.form);
  const fy = validFY(b.fy);
  const ctx = { kase, c, a, d, ds, f, fy };
  await saveFiling(clientId, kase, b, req.session.user.id);
  const lhFiles = { company: await letterheadFile('clients', clientId), ca: await letterheadFile('cas', caId) };

  // Update the client master after allotment / transfer / change of registered office (when chosen)
  if (f.updateMaster === 'yes' && ['allot', 'transfer', 'regoffice', 'authcap'].includes(kase)) {
    const num = s => parseFloat(String(s == null ? '' : s).replace(/[,\s]/g, '')) || 0, fv = num(c.faceValue) || 10;
    const upd = JSON.parse(JSON.stringify(c)); upd.shareholders = upd.shareholders || [];
    let note = '';
    if (kase === 'allot') {
      let added = 0;
      String(f.allottees || '').split('\n').map(l => l.split('|').map(t => t.trim())).filter(p => p[0]).forEach(p => {
        const n = num(p[2]); added += n;
        const h = upd.shareholders.find(s => (p[1] && s.folio === p[1]) || s.name.toLowerCase() === p[0].toLowerCase());
        if (h) h.shares = String(num(h.shares) + n); else upd.shareholders.push({ name: p[0], folio: p[1] || '', shares: String(n), cat: 'Individual' });
      });
      upd.paidCap = String(num(upd.paidCap) + added * fv); note = 'allotment of ' + added + ' shares';
    } else if (kase === 'transfer') {
      const from = upd.shareholders[parseInt(f.fromIndex, 10)], n = num(f.trShares);
      if (from && n) {
        from.shares = String(Math.max(0, num(from.shares) - n));
        const to = upd.shareholders.find(s => s.name.toLowerCase() === String(f.toName || '').toLowerCase());
        if (to) to.shares = String(num(to.shares) + n); else upd.shareholders.push({ name: f.toName, folio: f.toFolio || '', shares: String(n), cat: 'Individual' });
        upd.shareholders = upd.shareholders.filter(s => num(s.shares) > 0); note = 'transfer of ' + n + ' shares';
      }
    } else if (kase === 'regoffice' && f.newAddr) { upd.addr = f.newAddr; note = 'registered office changed'; }
    else if (kase === 'authcap' && f.newCap) { upd.authCap = f.newCap; note = 'authorised capital ' + f.newCap; }
    if (note) {
      await db.query('UPDATE clients SET data=$1, updated_by=$2, updated_at=now() WHERE id=$3', [upd, req.session.user.id, clientId]);
      await db.query("UPDATE filings SET data = data || $1 WHERE client_id=$2 AND case_type=$3", [{ updateMaster: 'done' }, clientId, fkey(kase, fy)]);
      db.log(req.session.user.id, 'client.update', c.name + ': ' + note);
      res.set('X-Masters-Changed', '1');
    }
  }
  // Director appointment: optionally add the new director to the client's director list
  if (kase === 'dirapp' && f.addToMaster === 'yes' && f.appName) {
    const exists = (c.directors || []).some(x => (f.appDin && x.din === f.appDin) || x.name.toLowerCase() === f.appName.toLowerCase());
    if (!exists) {
      const nd = { name: f.appName.slice(0, 120), din: (f.appDin || '').slice(0, 8), desig: f.apptMode === 'egm' ? 'Director' : 'Additional Director', sign: f.apptSign || null };
      const updated = Object.assign({}, c, { directors: [...(c.directors || []), nd] });
      await db.query('UPDATE clients SET data=$1, updated_by=$2, updated_at=now() WHERE id=$3', [updated, req.session.user.id, clientId]);
      db.log(req.session.user.id, 'client.update', c.name + ': added director ' + nd.name);
      res.set('X-Masters-Changed', '1');
    }
  }

  const tq = await db.query('SELECT doc_id, body FROM templates WHERE case_type=$1 AND variant=$2', [kase, DC.variantKey(kase, f)]);
  const templates = Object.fromEntries(tq.rows.map(r => [r.doc_id, r.body]));
  const all = DC.docDefs(ctx, templates);
  const wanted = Array.isArray(b.docIds) && b.docIds.length ? all.filter(x => b.docIds.includes(x.id)) : all;
  if (!wanted.length) return bad(res, 'Select at least one document.');

  const safe = s => String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  if (wanted.length === 1 && !b.zip) {
    const buf = await buildDocx(wanted[0], ctx, lhFiles);
    const name = DC.fileName(wanted[0], c.name);
    db.log(req.session.user.id, 'generate', c.name + ' — ' + DC.CASE_SHORT[kase] + ': ' + wanted[0].title);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', 'attachment; filename="' + name + '"');
    return res.send(buf);
  }
  const zip = new JSZip();
  for (const def of wanted) zip.file(DC.fileName(def, c.name), await buildDocx(def, ctx, lhFiles));
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const name = safe(c.name) + '_' + safe(DC.CASE_SHORT[kase]) + '.zip';
  db.log(req.session.user.id, 'generate', c.name + ' — ' + DC.CASE_SHORT[kase] + ': ' + wanted.length + ' documents (ZIP)');
  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', 'attachment; filename="' + name + '"');
  res.send(out);
});

/* ---------------- activity & backup (admin) ---------------- */
app.get('/api/activity', requireAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.at DESC LIMIT 300');
  res.json(rows);
});
app.get('/api/backup', requireAdmin, async (req, res) => {
  const [c, a, f] = await Promise.all([db.query('SELECT id, data FROM clients'), db.query('SELECT id, data FROM cas'), db.query('SELECT * FROM filings')]);
  db.log(req.session.user.id, 'backup', 'Downloaded backup');
  res.set('Content-Disposition', 'attachment; filename="neusource-crm-backup-' + new Date().toISOString().slice(0, 10) + '.json"');
  res.json({ exportedAt: new Date().toISOString(), clients: c.rows, cas: a.rows, filings: f.rows });
});

app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.too.large') return bad(res, 'The data is too large (logo too big?).', 413);
  bad(res, 'Something went wrong on the server. Please try again.', 500);
});

// Keep the portal running if a single request hits an unexpected error; write it to a log file.
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'data');
function logCrash(kind, err) {
  const line = new Date().toISOString() + ' ' + kind + ': ' + (err && err.stack || err) + '\n';
  console.error(line);
  try { const fs = require('fs'); fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(path.join(LOG_DIR, 'error.log'), line); } catch (e) {}
}
process.on('unhandledRejection', e => logCrash('unhandledRejection', e));
process.on('uncaughtException', e => logCrash('uncaughtException', e));

// start(port, host) → resolves with the http server; used by `node server.js` and by the desktop app
function start(port, host) {
  return db.init().then(() => new Promise((resolve, reject) => {
    const ready = () => { console.log('NeuSource Statutory CRM running on http://localhost:' + port); resolve(server); };
    const server = host ? app.listen(port, host, ready) : app.listen(port, ready);
    server.on('error', reject);
  }));
}
module.exports = { start, logCrash };

if (require.main === module) {
  start(PORT).catch(e => {
    if (e.code === 'EADDRINUSE') console.error('\nPort ' + PORT + ' is already in use — the portal may already be running in another window. Open http://localhost:' + PORT + '\n');
    else logCrash('Startup failed', e);
    process.exit(1);
  });
}
