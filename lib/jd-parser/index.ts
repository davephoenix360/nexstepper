/**
 * Public API for the JD parser.
 *
 * Other modules import from here, not from the implementation files
 * directly. Lets us reorganize the internals (split into multiple files,
 * rename a private helper) without breaking callers.
 */

export {
  parsedJdSchema,
  senioritySchema,
  remotePolicySchema,
  employmentTypeSchema,
  sourceBoardSchema,
  applicationStatusSchema,
  createApplicationInputSchema,
  updateApplicationInputSchema,
  SOURCE_BOARDS,
  APPLICATION_STATUSES,
  type ParsedJd,
  type SourceBoard,
  type ApplicationStatus,
  type CreateApplicationInput,
  type UpdateApplicationInput
} from './schema';

export {
  parseJd,
  type ParseJdResult,
  type ParseErrorCode
} from './parse-jd';
