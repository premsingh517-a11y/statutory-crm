// Turns content blocks (public/js/docs-content.js) into a real .docx file
const X = require('docx');
const DC = require('../public/js/docs-content.js');

const FONT = 'Times New Roman';
const NAVY = '14294A';
const MAROON = '8A1412';
const oneLine = DC.helpers.oneLine;

function runs(text, o) {
  const out = [];
  String(text).split(/(\*\*.+?\*\*)/).forEach(part => {
    if (!part) return;
    const bold = /^\*\*.+\*\*$/.test(part), t = bold ? part.slice(2, -2) : part;
    t.split('\n').forEach((line, i) => line.split('\t').forEach((seg, j) => {
      if (j > 0) out.push(new X.TextRun({ children: [new X.Tab()], font: FONT }));
      if (seg || (i > 0 && j === 0)) out.push(new X.TextRun({
        text: seg, bold: bold || !!o.b, underline: o.u ? {} : undefined, size: o.sz || 24, font: FONT,
        break: (i > 0 && j === 0) ? 1 : undefined,
      }));
    }));
  });
  return out;
}

const AL = { c: X.AlignmentType.CENTER, r: X.AlignmentType.RIGHT, j: X.AlignmentType.JUSTIFIED, l: X.AlignmentType.LEFT };
function para(b) {
  return new X.Paragraph({
    children: runs(b.p, b), alignment: AL[b.al] || X.AlignmentType.LEFT, keepNext: !!b.keep, keepLines: true,
    indent: b.hang ? { left: (b.ind || 0) + 567, hanging: 567 } : (b.ind ? { left: b.ind } : undefined),
    tabStops: b.hang ? [{ type: X.TabStopType.LEFT, position: (b.ind || 0) + 567 }] : undefined,
    spacing: { after: b.after === 0 ? 0 : 110, line: 270 },
  });
}

function table(rows) {
  const bd = { style: X.BorderStyle.SINGLE, size: 4, color: '808080' };
  return new X.Table({
    width: { size: 9638, type: X.WidthType.DXA }, columnWidths: [3600, 6038],
    borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd },
    rows: rows.map(r => new X.TableRow({
      cantSplit: true,
      children: r.map((cell, i) => new X.TableCell({
        width: { size: i ? 6038 : 3600, type: X.WidthType.DXA }, margins: { top: 20, bottom: 20, left: 100, right: 100 },
        children: [new X.Paragraph({ children: runs(cell, { sz: 20 }), spacing: { after: 0 } })],
      })),
    })),
  });
}

function logoBytes(logo) {
  if (!logo || !logo.data) return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(logo.data);
  if (!m) return null;
  return { type: m[1] === 'png' ? 'png' : 'jpg', data: Buffer.from(m[2], 'base64') };
}

function letterhead(kind, x) {
  const kids = [];
  const L = kind === DC.LH_CO
    ? { logo: x.c.logo, name: x.c.name || '', lines: ['CIN: ' + (x.c.cin || ''), 'Regd. Office: ' + oneLine(x.c.addr), [x.c.email && 'Email: ' + x.c.email, x.c.phone && 'Ph: ' + x.c.phone, x.c.web].filter(Boolean).join('  |  ')] }
    : { logo: x.a.logo, name: x.a.firm || '', tag: 'CHARTERED ACCOUNTANTS', lines: [oneLine(x.a.addr), [x.a.phone && 'Ph: ' + x.a.phone, x.a.email && 'Email: ' + x.a.email].filter(Boolean).join('  |  ')] };
  const img = logoBytes(L.logo);
  if (img && L.logo.w && L.logo.h) {
    const h = 55, w = Math.min(260, Math.round(L.logo.w * h / L.logo.h));
    kids.push(new X.Paragraph({ alignment: X.AlignmentType.CENTER, spacing: { after: 40 }, children: [new X.ImageRun({ type: img.type, data: img.data, transformation: { width: w, height: Math.round(w * L.logo.h / L.logo.w) } })] }));
  }
  kids.push(new X.Paragraph({ alignment: X.AlignmentType.CENTER, spacing: { after: 0 }, children: [new X.TextRun({ text: L.name.toUpperCase(), bold: true, size: 32, font: FONT, color: NAVY })] }));
  if (L.tag) kids.push(new X.Paragraph({ alignment: X.AlignmentType.CENTER, spacing: { after: 0 }, children: [new X.TextRun({ text: L.tag, bold: true, size: 20, font: FONT, color: MAROON, characterSpacing: 40 })] }));
  const lines = L.lines.filter(Boolean);
  lines.forEach((t, i) => kids.push(new X.Paragraph({
    alignment: X.AlignmentType.CENTER, spacing: { after: i === lines.length - 1 ? 120 : 0 },
    border: i === lines.length - 1 ? { bottom: { style: X.BorderStyle.SINGLE, size: 12, color: NAVY, space: 6 } } : undefined,
    children: [new X.TextRun({ text: t, size: 17, font: FONT, color: '333333' })],
  })));
  return new X.Header({ children: kids });
}

const small = t => new X.TextRun({ text: t, size: 16, font: FONT, color: '888888' });
const smallField = f => new X.TextRun({ children: [f], size: 16, font: FONT, color: '888888' });

async function buildDocx(def, ctx) {
  const x = Object.assign({ c: {}, a: {}, d: {}, f: {} }, ctx);
  const children = [];
  for (const b of def.build()) {
    if (b.gap) { for (let i = 0; i < b.gap; i++) children.push(new X.Paragraph({ spacing: { after: 0 }, keepNext: true, children: [] })); continue; }
    if (b.pb) { children.push(new X.Paragraph({ children: [new X.PageBreak()] })); continue; }
    if (b.tbl) { children.push(table(b.tbl), new X.Paragraph({ spacing: { after: 60 }, children: [] })); continue; }
    children.push(para(b));
  }
  const hasLH = def.lh !== DC.LH_NONE;
  const useLH = hasLH && x.f.lh !== 'blank', blankLH = hasLH && x.f.lh === 'blank';
  const doc = new X.Document({
    creator: 'NeuSource Statutory CRM', title: def.title,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: blankLH ? 3000 : 1134, bottom: 1134, left: 1134, right: 1134, header: 500, footer: 500 } } },
      headers: useLH ? { default: letterhead(def.lh, x) } : undefined,
      footers: { default: new X.Footer({ children: [new X.Paragraph({ alignment: X.AlignmentType.CENTER, children: [small('Page '), smallField(X.PageNumber.CURRENT), small(' of '), smallField(X.PageNumber.TOTAL_PAGES)] })] }) },
      children,
    }],
  });
  return X.Packer.toBuffer(doc);
}

module.exports = { buildDocx };
