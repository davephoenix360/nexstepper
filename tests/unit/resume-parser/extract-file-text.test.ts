import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the file-extraction deps so we can pin their behavior. The
// actual extraction logic is exercised end-to-end in dev / smoke
// tests; here we test the orchestration (which file type calls which
// extractor, how errors are mapped, the size/text guards).
vi.mock('unpdf', () => ({
  extractText: vi.fn()
}));
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn()
  }
}));

import { extractText as extractPdfText } from 'unpdf';
import mammoth from 'mammoth';

import { extractFileText, MAX_FILE_BYTES } from '@/lib/resume-parser/extract-file-text';

const mockedExtractPdf = vi.mocked(extractPdfText);
const mockedMammoth = vi.mocked(mammoth.extractRawText);

const longText = 'A'.repeat(500);

describe('extractFileText', () => {
  beforeEach(() => {
    mockedExtractPdf.mockReset();
    mockedMammoth.mockReset();
  });

  describe('guards', () => {
    it('rejects an empty buffer with empty_file', async () => {
      const result = await extractFileText(Buffer.alloc(0), 'txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('empty_file');
      }
    });

    it('rejects a buffer larger than MAX_FILE_BYTES', async () => {
      const huge = Buffer.alloc(MAX_FILE_BYTES + 1, 'a');
      const result = await extractFileText(huge, 'pdf');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('empty_file');
        expect(result.error).toContain('too large');
      }
    });

    it('rejects an unsupported file type', async () => {
      // Cast to bypass the type system — we want to verify the runtime
      // exhaustiveness check.
      const result = await extractFileText(Buffer.from('hi'), 'doc' as never);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('unsupported_type');
      }
    });

    it('rejects extracted text that is too short (likely a scanned image / password-protected PDF)', async () => {
      mockedExtractPdf.mockResolvedValue({
        text: 'short',
        totalPages: 1
      } as never);
      const result = await extractFileText(Buffer.from('fake'), 'pdf');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('text_too_short');
      }
    });
  });

  describe('PDF', () => {
    it('returns the extracted text and page count on success', async () => {
      mockedExtractPdf.mockResolvedValue({
        text: longText,
        totalPages: 2
      } as never);

      const result = await extractFileText(Buffer.from('fake pdf'), 'pdf');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.text).toBe(longText);
        expect(result.pageCount).toBe(2);
      }
    });

    it('joins per-page text when unpdf returns an array (mergePages: false fallback)', async () => {
      // Each page needs enough text to clear the 100-char min-length guard.
      const pageOne = 'A'.repeat(120);
      const pageTwo = 'B'.repeat(120);
      mockedExtractPdf.mockResolvedValue({
        text: [pageOne, pageTwo],
        totalPages: 2
      } as never);

      const result = await extractFileText(Buffer.from('fake pdf'), 'pdf');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.text).toBe(`${pageOne}\n${pageTwo}`);
      }
    });

    it('maps PDF parse errors to pdf_parse_failed', async () => {
      mockedExtractPdf.mockRejectedValue(new Error('corrupt PDF'));
      const result = await extractFileText(Buffer.from('fake'), 'pdf');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('pdf_parse_failed');
        expect(result.error).toContain('corrupt PDF');
      }
    });
  });

  describe('DOCX', () => {
    it('returns the extracted text on success', async () => {
      mockedMammoth.mockResolvedValue({
        value: longText,
        messages: []
      } as never);

      const result = await extractFileText(Buffer.from('fake docx'), 'docx');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.text).toBe(longText);
      }
    });

    it('maps DOCX parse errors to docx_parse_failed', async () => {
      mockedMammoth.mockRejectedValue(new Error('not a real docx'));
      const result = await extractFileText(Buffer.from('fake'), 'docx');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('docx_parse_failed');
      }
    });
  });

  describe('TXT', () => {
    it('returns the buffer decoded as UTF-8', async () => {
      const buf = Buffer.from(longText, 'utf-8');
      const result = await extractFileText(buf, 'txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.text).toBe(longText);
      }
    });

    it('strips a leading UTF-8 BOM if present', async () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const body = Buffer.from(longText, 'utf-8');
      const result = await extractFileText(Buffer.concat([bom, body]), 'txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.text).toBe(longText);
      }
    });

    it('trims surrounding whitespace from the decoded text', async () => {
      const buf = Buffer.from(`\n\n  ${longText}  \n\n`, 'utf-8');
      const result = await extractFileText(buf, 'txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.text).toBe(longText);
      }
    });
  });
});
