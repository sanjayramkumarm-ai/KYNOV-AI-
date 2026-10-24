import { logger } from '../utils/logger';

export interface ExtractionResult {
  text: string;
  pages: string[];
  pageCount?: number;
  supported: boolean;
  note?: string;
}

const TEXT_EXT = new Set(['txt', 'md', 'json', 'csv', 'rtf', 'svg']);

/** Strip RTF control words into readable text (best effort). */
function rtfToText(raw: string): string {
  return raw
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\{\\\*[^{}]*\}/g, ' ')
    .replace(/\\[a-z]+-?\d* ?/gi, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** PowerPoint: pull <a:t> runs out of each slide XML. */
async function extractPptx(buffer: Buffer): Promise<ExtractionResult> {
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(buffer);
  const slides = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const n = (s: string) => Number(s.match(/slide(\d+)/)?.[1] ?? 0);
      return n(a.entryName) - n(b.entryName);
    });
  const pages = slides.map((s) => {
    const xml = s.getData().toString('utf8');
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim(),
    );
    return runs.filter(Boolean).join('\n');
  });
  return { text: pages.join('\n\n'), pages, pageCount: pages.length, supported: true };
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return { text: value, pages: [], supported: true };
}

async function extractSpreadsheet(buffer: Buffer, ext: string): Promise<ExtractionResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pages: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    pages.push(`# Sheet: ${sheetName}\n${csv}`);
  }
  return { text: pages.join('\n\n'), pages, pageCount: pages.length, supported: true, note: ext === 'csv' ? undefined : undefined };
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  // Import the library entry directly to avoid pdf-parse's debug harness.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as typeof import('pdf-parse');
  const pages: string[] = [];
  // pdf.js v1.10 mis-detects a Node Buffer on the first parse; a plain
  // Uint8Array view is detected correctly, so always hand it one.
  const result = await pdfParse(new Uint8Array(buffer) as unknown as Buffer, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      let lastY: number | undefined;
      let text = '';
      for (const item of textContent.items as Array<{ str: string; transform: number[] }>) {
        const y = item.transform?.[5];
        if (lastY === undefined || Math.abs(lastY - y) > 2) text += '\n';
        else if (text && !text.endsWith(' ')) text += ' ';
        text += item.str;
        lastY = y;
      }
      pages.push(text);
      return text;
    },
  });
  return {
    text: pages.length ? pages.join('\n\n') : result.text,
    pages,
    pageCount: result.numpages,
    supported: true,
  };
}

/**
 * Extract plain text for retrieval / summaries. Documents are treated as
 * untrusted DATA: nothing extracted here is ever executed or treated as an
 * instruction (see services/rag.ts prompt hardening).
 */
export async function extractText(buffer: Buffer, extRaw: string, mimeType = ''): Promise<ExtractionResult> {
  const ext = extRaw.toLowerCase().replace('.', '');
  try {
    if (ext === 'pdf' || mimeType === 'application/pdf') return await extractPdf(buffer);
    if (ext === 'docx') return await extractDocx(buffer);
    if (ext === 'doc') {
      return {
        text: '',
        pages: [],
        supported: false,
        note: 'Legacy .doc files cannot be read reliably. Re-save as .docx to enable AI search.',
      };
    }
    if (['xlsx', 'xls', 'csv'].includes(ext)) return await extractSpreadsheet(buffer, ext);
    if (ext === 'pptx') return await extractPptx(buffer);
    if (ext === 'ppt') {
      return { text: '', pages: [], supported: false, note: 'Legacy .ppt cannot be read. Re-save as .pptx to enable AI search.' };
    }
    if (TEXT_EXT.has(ext)) {
      const raw = buffer.toString('utf8');
      const text = ext === 'rtf' ? rtfToText(raw) : raw;
      return { text, pages: [text], supported: true };
    }
    if (mimeType.startsWith('image/')) {
      return {
        text: '',
        pages: [],
        supported: false,
        note: 'Images can be previewed and stored, but OCR is not enabled. Filename and tags are still searchable.',
      };
    }
    return { text: '', pages: [], supported: false, note: 'Text extraction is not available for this file type.' };
  } catch (err: any) {
    logger.warn(`Text extraction failed for .${ext}: ${err?.message}`);
    return { text: '', pages: [], supported: false, note: `Could not read this file: ${err?.message ?? 'unknown error'}` };
  }
}
