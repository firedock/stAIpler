export class StaiplerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaiplerError';
  }
}

export class ParseError extends StaiplerError {
  constructor(message: string, public filePath: string) {
    super(`${message} (${filePath})`);
    this.name = 'ParseError';
  }
}

export class ResolveError extends StaiplerError {
  constructor(message: string, public reference: string) {
    super(`${message}: ${reference}`);
    this.name = 'ResolveError';
  }
}

export class ValidationError extends StaiplerError {
  constructor(message: string, public issues: string[]) {
    super(`${message}: ${issues.join(', ')}`);
    this.name = 'ValidationError';
  }
}

export class CompileError extends StaiplerError {
  constructor(message: string, public code: string) {
    super(`${code}: ${message}`);
    this.name = 'CompileError';
  }
}
