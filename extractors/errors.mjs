// Errors deliberately contain no response bodies, signed URLs or credentials.
export class ExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new ExtractionError(code, message);
}
