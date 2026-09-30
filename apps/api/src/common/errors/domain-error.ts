export class DomainError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class FieldValidationError extends DomainError {
  constructor(errors: Array<{ path: string; message: string }>) {
    super('field_validation_error', 'Invalid record data', 400, { errors });
  }
}
