import 'server-only';

import { extractText as extractPdfText } from 'unpdf';
import mammoth from 'mammoth';

/**
 * The file types the resume import flow accepts in v1.
 *
 * - `pdf` — the dominant resume format. Extracted with `unpdf`
 *   (serverless-safe, zero native deps, works on Vercel).
 * - `docx` — Word's modern format. Extracted with `mammoth`.
 * - `txt` — the paste fallback. Used when the user pastes plain text
 *   rather than uploading a file.
 *
 * Legacy `.doc` (the binary Word format) is intentionally NOT
 * supported in v1: it requires a heavyweight extractor and is
 * vanishingly rare in 2026.
 */
export type SupportedFileType = 'pdf' | 'docx' | 'txt';

export type ExtractFileTextResult =
  | { ok: true; text: string; pageCount?: number }
  | { ok: false; code: ExtractErrorCode; error: string };

export type ExtractErrorCode =
  | 'unsupported_type'
  | 'empty_file'
  | 'pdf_parse_failed'
  | 'docx_parse_failed'
  | 'text_too_short';

const MIN_TEXT_LENGTH = 100;

/**
 * Max upload size — 10 MB. Resumes rarely exceed 2-3 MB even with
 * embedded images; 10 MB is a generous cap that protects the route
 * from accidental uploads of large files. The Server Action validates
 * this BEFORE calling this function.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Extract plain text from a resume file.
 *
 * The function takes the file bytes (Buffer) plus the declared file
 * type. We accept the type separately rather than inferring from the
 * extension because the caller (the Server Action) is the trust
 * boundary — it has already validated the file header / size.
 *
 * Returns a discriminated union so the caller can handle each error
 * case structurally. The text is trimmed; trailing whitespace from
 * PDF / DOCX extraction is normal.
 */
export async function extractFileText(
  bytes: Buffer,
  fileType: SupportedFileType
): Promise<ExtractFileTextResult> {
  if (bytes.length === 0) {
    return {
      ok: false,
      code: 'empty_file',
      error: 'File is empty.'
    };
  }

  if (bytes.length > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: 'empty_file', // re-using the closest code; surfaced in UI as size
      error: `File is too large (${(bytes.length / 1024 / 1024).toFixed(1)} MB; max ${MAX_FILE_BYTES / 1024 / 1024} MB).`
    };
  }

  let rawText: string;
  let pageCount: number | undefined;

  try {
    switch (fileType) {
      case 'pdf': {
        const result = await extractPdfText(new Uint8Array(bytes), {
          mergePages: true
        });
        // unpdf returns either a string (mergePages: true) or string[]
        // (mergePages: false). We always pass mergePages: true so we
        // get a single string back.
        rawText = Array.isArray(result.text)
          ? result.text.join('\n')
          : result.text;
        pageCount = result.totalPages;
        break;
      }
      case 'docx': {
        // mammoth.extractRawText returns { value, messages }.
        const result = await mammoth.extractRawText({ buffer: bytes });
        rawText = result.value;
        break;
      }
      case 'txt': {
        // For txt, the bytes ARE the text. Decode as UTF-8; strip BOM
        // if present (some Windows-saved text files prepend it).
        rawText = bytes.toString('utf-8').replace(/^\uFEFF/, '');
        break;
      }
      default: {
        // Exhaustiveness check — TS will error here if a new file
        // type is added to SupportedFileType without handling.
        const _exhaustive: never = fileType;
        return {
          ok: false,
          code: 'unsupported_type',
          error: `Unsupported file type: ${String(_exhaustive)}`
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: fileType === 'pdf' ? 'pdf_parse_failed' : 'docx_parse_failed',
      error: message
    };
  }

  const trimmed = rawText.trim();
  if (trimmed.length < MIN_TEXT_LENGTH) {
    return {
      ok: false,
      code: 'text_too_short',
      error: `Extracted text is too short (${trimmed.length} chars; need at least ${MIN_TEXT_LENGTH}). The file may be a scanned image (needs OCR) or password-protected.`
    };
  }

  return { ok: true, text: trimmed, pageCount };
}
