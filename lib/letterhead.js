// Puts generated document content inside an uploaded Word (.docx) letterhead.
// The letterhead keeps its own header, footer, page size, margins and any content already in its body
// (some letterheads put the logo in the body instead of the header) — our content is added after it.
const JSZip = require('jszip');

const IMG_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

async function inspect(buf) {
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch (e) { throw new Error('This is not a valid Word (.docx) file.'); }
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('This is not a valid Word (.docx) file.');
  const xml = await f.async('string');
  const sect = lastSectPr(xml);
  const num = (re, d) => { const m = re.exec(sect || ''); return m ? parseInt(m[1], 10) : d; };
  const pageW = num(/<w:pgSz\b[^>]*\bw:w="(\d+)"/, 11906);
  const left = num(/<w:pgMar\b[^>]*\bw:left="(\d+)"/, 1440), right = num(/<w:pgMar\b[^>]*\bw:right="(\d+)"/, 1440);
  return { textWidth: Math.max(4000, pageW - left - right) };
}

function lastSectPr(xml) {
  const i = xml.lastIndexOf('<w:sectPr');
  if (i < 0) return '';
  const j = xml.indexOf('</w:sectPr>', i);
  return j < 0 ? xml.slice(i) : xml.slice(i, j + 11);
}

function rootAttrs(xml) {
  const m = /<w:document\b([^>]*)>/.exec(xml);
  const out = {};
  if (m) m[1].replace(/xmlns:([\w-]+)="([^"]*)"/g, (_, p, u) => { out[p] = u; });
  return out;
}

// removes empty paragraphs at the end of the letterhead body (paragraphs with only formatting, no text/images)
function trimTrailingEmpty(frag) {
  for (;;) {
    const t = frag.replace(/\s+$/, '');
    const self = /<w:p\b[^>]*\/>$/.exec(t);
    if (self) { frag = t.slice(0, self.index); continue; }
    if (!t.endsWith('</w:p>')) return t;
    const start = Math.max(t.lastIndexOf('<w:p>'), t.lastIndexOf('<w:p '));
    if (start < 0) return t;
    const p = t.slice(start);
    if (!/^<w:p\b[^>]*>(?:<w:pPr\b(?:(?!<w:p[\s>]|<w:sectPr)[\s\S])*?<\/w:pPr>)?<\/w:p>$/.test(p)) return t;
    frag = t.slice(0, start);
  }
}

async function merge(letterheadBuf, contentBuf) {
  const lh = await JSZip.loadAsync(letterheadBuf);
  const ct = await JSZip.loadAsync(contentBuf);
  let lhXml = await lh.file('word/document.xml').async('string');
  const ctXml = await ct.file('word/document.xml').async('string');

  // 1. our body content (without our own section settings)
  const bStart = ctXml.indexOf('<w:body>') + 8;
  let body = ctXml.slice(bStart, ctXml.lastIndexOf('<w:sectPr'));

  // 2. copy images used by our content and give them new relationship ids
  const ctRels = await ct.file('word/_rels/document.xml.rels').async('string');
  const relPath = 'word/_rels/document.xml.rels';
  let lhRels = lh.file(relPath) ? await lh.file(relPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const used = new Set(); body.replace(/r:(?:embed|id|link)="([^"]+)"/g, (_, id) => used.add(id));
  const exts = new Set();
  let n = 0;
  for (const id of used) {
    const rm = new RegExp('<Relationship\\b[^>]*\\bId="' + id + '"[^>]*/>').exec(ctRels);
    if (!rm || rm[0].indexOf(IMG_REL) < 0) continue;
    const target = /Target="([^"]+)"/.exec(rm[0])[1];
    const file = ct.file('word/' + target.replace(/^\//, '').replace(/^word\//, ''));
    if (!file) continue;
    const ext = (target.split('.').pop() || 'png').toLowerCase();
    const newName = 'media/nscrm_' + Date.now().toString(36) + '_' + (n++) + '.' + ext;
    lh.file('word/' + newName, await file.async('nodebuffer'));
    const newId = 'rIdNs' + n + Math.random().toString(36).slice(2, 6);
    lhRels = lhRels.replace('</Relationships>', '<Relationship Id="' + newId + '" Type="' + IMG_REL + '" Target="' + newName + '"/></Relationships>');
    body = body.split('"' + id + '"').join('"' + newId + '"');
    exts.add(ext);
  }
  lh.file(relPath, lhRels);

  // 3. make sure image types are declared
  let types = await lh.file('[Content_Types].xml').async('string');
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };
  for (const e of exts) {
    if (!new RegExp('Extension="' + e + '"', 'i').test(types)) types = types.replace('</Types>', '<Default Extension="' + e + '" ContentType="' + (mime[e] || 'image/png') + '"/></Types>');
  }
  lh.file('[Content_Types].xml', types);

  // 4. unique drawing ids (avoid clashing with images in the letterhead)
  let pid = 7000;
  body = body.replace(/(<wp:docPr\b[^>]*\bid=")(\d+)"/g, (_, a) => a + (pid++) + '"').replace(/(<pic:cNvPr\b[^>]*\bid=")(\d+)"/g, (_, a) => a + (pid++) + '"');

  // 5. namespaces our content uses that the letterhead root does not declare
  const have = rootAttrs(lhXml), ours = rootAttrs(ctXml);
  const add = Object.keys(ours).filter(p => !have[p] && new RegExp('<' + p + ':|\\s' + p + ':').test(body)).map(p => ' xmlns:' + p + '="' + ours[p] + '"').join('');
  if (add) lhXml = lhXml.replace(/<w:document\b/, '<w:document' + add);

  // 6. insert: [letterhead body content] + [our content] + [letterhead section settings]
  const lbStart = lhXml.indexOf('<w:body>') + 8, lbEnd = lhXml.lastIndexOf('</w:body>');
  const lbody = lhXml.slice(lbStart, lbEnd);
  const sIdx = lbody.lastIndexOf('<w:sectPr');
  const keep = trimTrailingEmpty(sIdx >= 0 ? lbody.slice(0, sIdx) : lbody);
  const sect = sIdx >= 0 ? lbody.slice(sIdx) : '';
  lhXml = lhXml.slice(0, lbStart) + keep + body + sect + lhXml.slice(lbEnd);
  lh.file('word/document.xml', lhXml);

  return lh.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { inspect, merge };
