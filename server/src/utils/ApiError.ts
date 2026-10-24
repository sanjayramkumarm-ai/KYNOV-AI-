export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'FEATURE_NOT_CONFIGURED'
  | 'INTEGRATION_ERROR'
  | 'INTERNAL';

export class ApiError extends Error {
  statusCode: number;
  code: ErrorCode;
  details?: unknown;

  constructor(statusCode: number, message: string, code?: ErrorCode, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code ?? defaultCode(statusCode);
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(msg = 'Invalid request', details?: unknown) {
    return new ApiError(400, msg, 'BAD_REQUEST', details);
  }
  static unauthorized(msg = 'Authentication required') {
    return new ApiError(401, msg, 'UNAUTHORIZED');
  }
  static forbidden(msg = 'You do not have access to this resource') {
    return new ApiError(403, msg, 'FORBIDDEN');
  }
  static notFound(msg = 'Not found') {
    return new ApiError(404, msg, 'NOT_FOUND');
  }
  static conflict(msg = 'Resource already exists') {
    return new ApiError(409, msg, 'CONFLICT');
  }
  static notConfigured(msg: string, details?: unknown) {
    return new ApiError(503, msg, 'FEATURE_NOT_CONFIGURED', details);
  }
  static integration(msg: string, details?: unknown) {
    return new ApiError(502, msg, 'INTEGRATION_ERROR', details);
  }
}

function defaultCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'FEATURE_NOT_CONFIGURED';
    default:
      return 'INTERNAL';
  }
}
