// docs/API.md §1 error model. Canonical codes: docs/API.md §16 / docs/ARCHITECTURE.md §12.
export type ErrorCode =
  | 'DB_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'QUALITY_TOO_LOW'
  | 'MODEL_LOAD_FAILED'
  | 'NOT_INITIALIZED'
  | 'INFERENCE_FAILED'
  | 'NO_BASELINE'
  | 'RECALIBRATION_REQUIRED'
  | 'POSE_OUT_OF_RANGE'
  | 'NOT_ATTESTED'
  | 'CAMERA_DENIED'
  | 'CAMERA_UNAVAILABLE';

// docs/API.md §1: "only MODEL_LOAD_FAILED and DB_UNAVAILABLE are ever false" — fixed by
// code, not a per-throw-site choice, so callers cannot accidentally mis-flag one.
const NON_RECOVERABLE: ReadonlySet<ErrorCode> = new Set(['MODEL_LOAD_FAILED', 'DB_UNAVAILABLE']);

export class MirrorWellError extends Error {
  readonly name = 'MirrorWellError' as const;
  readonly code: ErrorCode;
  readonly recoverable: boolean;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.recoverable = !NON_RECOVERABLE.has(code);
  }
}
