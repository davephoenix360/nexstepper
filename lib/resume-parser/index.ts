/**
 * Resume parser — turns an uploaded resume (PDF / DOCX / plain text)
 * into the structured `ResumeSections` shape used throughout the app.
 *
 * The flow:
 *   1. `extractFileText(bytes, fileType)` — PDF/DOCX/TXT → plain text
 *   2. `parseResumeText(text)` — plain text → ResumeSections (AI call)
 *
 * Both steps return a discriminated union so callers (Server Actions)
 * can handle errors structurally. Same pattern as `lib/jd-parser/`.
 *
 * Privacy: the extracted text is sent to Anthropic Claude for
 * structured extraction. The original file bytes are never persisted
 * to disk or sent to any third party beyond Anthropic — they're held
 * in memory for the duration of the Server Action only.
 */

export { parseResumeText } from './parse-resume';
export type { ParseResumeResult, ParseResumeErrorCode } from './parse-resume';

export { extractFileText, MAX_FILE_BYTES } from './extract-file-text';
export type {
  SupportedFileType,
  ExtractFileTextResult,
  ExtractErrorCode
} from './extract-file-text';
