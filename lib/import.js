// Excel import of clients: template + parser
const ExcelJS = require('exceljs');

const MAX_DIRS = 5;
const COLS = [
  ['name', 'Company Name *', 34], ['cin', 'CIN / LLPIN *', 24], ['incDate', 'Date of Incorporation (DD/MM/YYYY)', 18],
  ['type', 'Type (Private / Public / OPC / LLP / Section 8)', 16], ['size', 'Small Company? (Yes / No)', 14], ['pan', 'PAN', 13],
  ['addr', 'Registered Office Address *', 44], ['email', 'Email', 26], ['phone', 'Phone', 14], ['web', 'Website', 22],
  ['authCap', 'Authorised Capital (Rs.)', 16], ['paidCap', 'Paid-up Capital (Rs.)', 16], ['faceValue', 'Face Value per Share (Rs.)', 12],
  ['lastAgmNo', 'Last AGM Number', 10], ['lastAgmDate', 'Last AGM Date (DD/MM/YYYY)', 16],
];
for (let i = 1; i <= MAX_DIRS; i++) COLS.push(['d' + i + 'name', 'Director ' + i + ' Name' + (i === 1 ? ' *' : ''), 26], ['d' + i + 'din', 'Director ' + i + ' DIN', 12], ['d' + i + 'desig', 'Director ' + i + ' Designation', 16]);

async function template() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clients');
  ws.columns = COLS.map(([key, header, width]) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A1412' } };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  ws.getRow(1).height = 32;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.addRow({ name: 'Example Private Limited', cin: 'U12345DL2024PTC123456', incDate: '15/04/2024', type: 'Private', size: 'Yes', pan: 'AAACE1234F', addr: 'A-12, Example Road, New Delhi - 110001', email: 'info@example.com',
    authCap: 1000000, paidCap: 100000, faceValue: 10, lastAgmNo: 1, lastAgmDate: '30/09/2025', d1name: 'First Director', d1din: '01234567', d1desig: 'Director', d2name: 'Second Director', d2din: '07654321', d2desig: 'Director' });
  ws.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
  const help = wb.addWorksheet('How to fill');
  help.columns = [{ width: 110 }];
  ['Fill one company per row on the "Clients" sheet. Delete the grey example row before importing.', 'Columns marked * are required: Company Name, CIN / LLPIN, Registered Office Address and Director 1 Name.',
    'Dates: DD/MM/YYYY (or an Excel date). Type: Private, Public, OPC or LLP. Small Company: Yes or No.', 'For an LLP, enter designated partners in the Director columns and their DPIN in the DIN column.',
    'If a CIN already exists in the portal, that client is updated (only when you choose "Update existing").'].forEach(t => help.addRow([t]));
  return wb.xlsx.writeBuffer();
}

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') { if (v.text) return String(v.text); if (v.result != null) return cellText(v.result); if (v.richText) return v.richText.map(r => r.text).join(''); if (v.hyperlink) return String(v.text || v.hyperlink); return ''; }
  return String(v).trim();
}
function toISO(s) {
  s = String(s || '').trim(); if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  return '';
}
const TYPES = { private: 'private', pvt: 'private', public: 'public', opc: 'opc', 'one person company': 'opc', llp: 'llp', 'section 8': 'private', 'sec 8': 'private', 'section 8 public': 'public' };

async function parse(buf) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch (e) { throw new Error('This is not a valid Excel (.xlsx) file. Please use the template.'); }
  const ws = wb.getWorksheet('Clients') || wb.worksheets[0];
  if (!ws) throw new Error('The Excel file has no sheet.');
  // map headers → keys (match by start of header text so small edits still work)
  const headers = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellText(cell.value).toLowerCase().replace(/\s*\*$/, '');
    const hit = COLS.find(([, header]) => header.toLowerCase().replace(/\s*\*$/, '').split(' (')[0] === h.split(' (')[0]);
    if (hit) headers[col] = hit[0];
  });
  if (!Object.values(headers).includes('name') || !Object.values(headers).includes('cin')) throw new Error('Could not find the "Company Name" and "CIN" columns. Please use the template.');
  const rows = [], errors = [];
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    const r = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => { if (headers[col]) r[headers[col]] = cellText(cell.value); });
    if (!Object.values(r).some(Boolean)) return;
    if (/^example private limited$/i.test(r.name || '')) return;
    const c = { name: r.name || '', cin: (r.cin || '').toUpperCase(), incDate: toISO(r.incDate), type: TYPES[(r.type || 'private').toLowerCase()] || 'private', sec8: /sec(tion)?\s*8/i.test(r.type || '') || /NPL\d{6}$/.test((r.cin || '').toUpperCase()) ? 'yes' : 'no',
      size: /^n/i.test(r.size || '') ? 'other' : 'small', pan: (r.pan || '').toUpperCase(), addr: r.addr || '', email: r.email || '', phone: r.phone || '', web: r.web || '',
      authCap: r.authCap || '', paidCap: r.paidCap || '', faceValue: r.faceValue || '', lastAgmNo: r.lastAgmNo || '', lastAgmDate: toISO(r.lastAgmDate), directors: [] };
    for (let i = 1; i <= MAX_DIRS; i++) if (r['d' + i + 'name']) c.directors.push({ name: r['d' + i + 'name'], din: (r['d' + i + 'din'] || '').replace(/\D/g, '').slice(0, 8), desig: r['d' + i + 'desig'] || (c.type === 'llp' ? 'Designated Partner' : 'Director') });
    const miss = []; if (!c.name) miss.push('Company Name'); if (!c.cin) miss.push('CIN'); if (!c.addr) miss.push('Registered Office'); if (!c.directors.length) miss.push('Director 1 Name');
    if (miss.length) errors.push('Row ' + rn + (c.name ? ' (' + c.name + ')' : '') + ': missing ' + miss.join(', '));
    else rows.push(Object.assign(c, { _row: rn }));
  });
  return { rows, errors };
}

module.exports = { template, parse };
