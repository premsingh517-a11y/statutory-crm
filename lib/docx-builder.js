// Turns content blocks (public/js/docs-content.js) into a real .docx file
const X = require('docx');
const DC = require('../public/js/docs-content.js');
const LH = require('./letterhead');

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

// {tbl: rows, cols: [relative widths], head: true}
function table(b, textWidth) {
  const rows = b.tbl, ncol = Math.max(...rows.map(r => r.length));
  const ratios = b.cols && b.cols.length === ncol ? b.cols : (ncol === 2 ? [37, 63] : Array(ncol).fill(1));
  const tot = ratios.reduce((a, c) => a + c, 0);
  const widths = ratios.map(r => Math.floor(textWidth * r / tot));
  const bd = { style: X.BorderStyle.SINGLE, size: 4, color: '808080' };
  return new X.Table({
    width: { size: widths.reduce((a, c) => a + c, 0), type: X.WidthType.DXA }, columnWidths: widths,
    borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd },
    rows: rows.map((r, ri) => new X.TableRow({
      cantSplit: true, tableHeader: !!(b.head && ri === 0),
      children: widths.map((w, i) => new X.TableCell({
        width: { size: w, type: X.WidthType.DXA }, margins: { top: 20, bottom: 20, left: 90, right: 90 },
        shading: b.head && ri === 0 ? { fill: 'F2F2F2', type: X.ShadingType.CLEAR, color: 'auto' } : undefined,
        children: [new X.Paragraph({ children: runs(r[i] == null ? '' : r[i], { sz: 20, b: b.head && ri === 0 }), spacing: { after: 0 } })],
      })),
    })),
  });
}

function imgBytes(img) {
  if (!img || !img.data) return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(img.data);
  if (!m || !img.w || !img.h) return null;
  return { type: m[1] === 'png' ? 'png' : 'jpg', data: Buffer.from(m[2], 'base64'), w: img.w, h: img.h };
}
function imageRun(img, maxW, maxH) {
  const b = imgBytes(img); if (!b) return null;
  let w = maxW, h = Math.round(w * b.h / b.w);
  if (h > maxH) { h = maxH; w = Math.round(h * b.w / b.h); }
  return new X.ImageRun({ type: b.type, data: b.data, transformation: { width: w, height: h } });
}

function letterhead(kind, x) {
  const kids = [];
  const L = kind === DC.LH_CO
    ? { logo: x.c.logo, name: x.c.name || '', lines: ['CIN: ' + (x.c.cin || ''), 'Regd. Office: ' + oneLine(x.c.addr), [x.c.email && 'Email: ' + x.c.email, x.c.phone && 'Ph: ' + x.c.phone, x.c.web].filter(Boolean).join('  |  ')] }
    : { logo: x.a.logo, name: x.a.firm || '', tag: 'CHARTERED ACCOUNTANTS', lines: [oneLine(x.a.addr), [x.a.phone && 'Ph: ' + x.a.phone, x.a.email && 'Email: ' + x.a.email].filter(Boolean).join('  |  ')] };
  const logo = imageRun(L.logo, 260, 55);
  if (logo) kids.push(new X.Paragraph({ alignment: X.AlignmentType.CENTER, spacing: { after: 40 }, children: [logo] }));
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

function bodyChildren(def, textWidth) {
  const children = [];
  for (const b of def.build()) {
    if (b.gap) { for (let i = 0; i < b.gap; i++) children.push(new X.Paragraph({ spacing: { after: 0 }, keepNext: true, children: [] })); continue; }
    if (b.pb) { children.push(new X.Paragraph({ children: [new X.PageBreak()] })); continue; }
    if (b.tbl) { children.push(table(b, textWidth), new X.Paragraph({ spacing: { after: 60 }, children: [] })); continue; }
    if ('sign' in b) { // signature image, or blank space for a wet signature
      const r = imageRun(b.sign, 150, 50);
      children.push(r ? new X.Paragraph({ keepNext: true, spacing: { after: 0 }, alignment: AL[b.al] || X.AlignmentType.LEFT, children: [r] })
        : new X.Paragraph({ keepNext: true, spacing: { after: 0 }, children: [] }), ...(r ? [] : [new X.Paragraph({ keepNext: true, spacing: { after: 0 }, children: [] })]));
      continue;
    }
    children.push(para(b));
  }
  return children;
}

// lhFiles: { company: Buffer|null, ca: Buffer|null } — uploaded Word letterheads
async function buildDocx(def, ctx, lhFiles) {
  const x = Object.assign({ c: {}, a: {}, d: {}, f: {} }, ctx);
  const hasLH = def.lh === DC.LH_CO || def.lh === DC.LH_CA, blankLH = hasLH && x.f.lh === 'blank';
  const uploaded = hasLH && !blankLH && lhFiles ? lhFiles[def.lh] : null;

  let textWidth = 11906 - 2 * 1134;
  if (uploaded) { try { textWidth = (await LH.inspect(uploaded)).textWidth; } catch (e) { /* fall back to built-in letterhead */ } }

  const doc = new X.Document({
    creator: 'NeuSource Statutory CRM', title: def.title,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: blankLH ? 3000 : 1134, bottom: 1134, left: 1134, right: 1134, header: 500, footer: 500 } } },
      headers: hasLH && !blankLH && !uploaded ? { default: letterhead(def.lh, x) } : undefined,
      footers: { default: new X.Footer({ children: [new X.Paragraph({ alignment: X.AlignmentType.CENTER, children: [small('Page '), smallField(X.PageNumber.CURRENT), small(' of '), smallField(X.PageNumber.TOTAL_PAGES)] })] }) },
      children: bodyChildren(def, textWidth),
    }],
  });
  const buf = await X.Packer.toBuffer(doc);
  if (!uploaded) return buf;
  try { return await LH.merge(uploaded, buf); }
  catch (e) { console.error('Letterhead merge failed, using built-in letterhead:', e.message); return buildDocx(def, ctx, null); }
}

module.exports = { buildDocx };
