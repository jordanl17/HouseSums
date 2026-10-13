/**
 * Just enough of a .xlsx reader for the ONS spreadsheets: unzip (stored or deflated entries, no
 * zip64), shared strings, and the cell values of one named sheet as rows of strings. Formulas,
 * styles and dates are not interpreted: a date cell comes back as its serial number.
 */
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Returns the named entries of a zip archive, decompressed. Unknown names are skipped. */
export function readZipEntries(zip: Buffer, names: readonly string[]): Map<string, Buffer> {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i -= 1) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new Error('zip64 archives are not supported');
  const wanted = new Set(names);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(p) !== CENTRAL) throw new Error('corrupt zip central directory');
    const method = zip.readUInt16LE(p + 10);
    const compressedSize = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    if (!wanted.has(name)) continue;
    if (zip.readUInt32LE(localOffset) !== LOCAL) throw new Error(`corrupt zip entry ${name}`);
    const start =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(start, start + compressedSize);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data));
    else throw new Error(`zip entry ${name} uses unsupported method ${method}`);
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

/** Text of every <t> element inside an <si> or <is>, concatenated (handles rich text runs). */
function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1] ?? '');
  return out;
}

export function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ''));
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Rows of a worksheet's XML as arrays of strings. Missing cells are ''. */
export function parseSheetXml(
  xml: string,
  shared: readonly string[],
  maxColumns = 1000,
): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
      const col = ref?.[1] ? columnIndex(ref[1]) : row.length;
      if (col >= maxColumns) continue;
      const inner = cell[2] ?? '';
      const type = /\bt="([a-zA-Z]+)"/.exec(attrs)?.[1];
      let value = '';
      if (type === 'inlineStr') value = textOf(inner);
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) value = type === 's' ? (shared[Number(v)] ?? '') : decodeXml(v);
      }
      while (row.length < col) row.push('');
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

/** Reads one sheet, by its tab name, from an .xlsx file. */
export function readXlsxSheet(file: Buffer, sheetName: string, maxColumns?: number): string[][] {
  const meta = readZipEntries(file, ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels']);
  const workbook = meta.get('xl/workbook.xml')?.toString('utf8');
  const rels = meta.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (!workbook || !rels) throw new Error('not an xlsx workbook');
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    name: decodeXml(/\bname="([^"]*)"/.exec(m[1] ?? '')?.[1] ?? ''),
    rid: /\br:id="([^"]*)"/.exec(m[1] ?? '')?.[1] ?? '',
  }));
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) {
    throw new Error(
      `sheet "${sheetName}" not found (have: ${sheets.map((s) => s.name).join(', ')})`,
    );
  }
  const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((m) => m[1] ?? '')
    .find((a) => new RegExp(`\\bId="${sheet.rid}"`).test(a));
  const target = rel ? /\bTarget="([^"]*)"/.exec(rel)?.[1] : undefined;
  if (!target) throw new Error(`no relationship for sheet "${sheetName}"`);
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const parts = readZipEntries(file, [path, 'xl/sharedStrings.xml']);
  const sheetXml = parts.get(path)?.toString('utf8');
  if (!sheetXml) throw new Error(`sheet file ${path} missing`);
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml')?.toString('utf8') ?? '');
  return parseSheetXml(sheetXml, shared, maxColumns);
}
