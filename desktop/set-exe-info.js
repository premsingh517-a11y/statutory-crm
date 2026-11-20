// Sets the icon and version details of the Windows .exe without Wine (pure JavaScript, uses "resedit").
// Usage: node set-exe-info.js <exe> <icon.ico> <version>
const fs = require('fs');
const ResEdit = require('resedit');
const [exe, ico, version] = process.argv.slice(2);
const data = fs.readFileSync(exe);
const pe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(pe);
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icon.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: 'ROC Docs Prepare', FileDescription: 'ROC Docs Prepare', CompanyName: 'ROC Docs Prepare',
  LegalCopyright: 'ROC Docs Prepare', FileVersion: version, ProductVersion: version, OriginalFilename: 'ROC Docs Prepare.exe', InternalName: 'ROC Docs Prepare' });
vi.outputToResourceEntries(res.entries);
res.outputResource(pe);
fs.writeFileSync(exe, Buffer.from(pe.generate()));
console.log('Set icon and version ' + version + ' on ' + exe);
