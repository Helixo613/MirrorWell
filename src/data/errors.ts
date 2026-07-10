export type MirrorWellErrorCode =
  | 'DB_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'QUALITY_TOO_LOW'
  | 'MODEL_LOAD_FAILED'
  | 'NOT_INITIALIZED'
  | 'INFERENCE_FAILED'
  | 'NO_BASELINE'
  | 'POSE_OUT_OF_RANGE'
  | 'NOT_ATTESTED'
  | 'CAMERA_DENIED'
  | 'CAMERA_UNAVAILABLE';

export class MirrorWellError extends Error {
  readonly name = 'MirrorWellError';

  constructor(
    readonly code: MirrorWellErrorCode,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
  }
}

export function isMirrorWellError(error: unknown): error is MirrorWellError {
  return error instanceof MirrorWellError;
}
