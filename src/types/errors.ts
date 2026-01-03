/**
 * Custom error types for the RLM framework.
 * All errors extend RLMError for consistent error handling.
 * @module types/errors
 */

/**
 * Base error class for all RLM-specific errors.
 */
export class RLMError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'RLMError';
    this.code = code;
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Input validation failed.
 */
export class ValidationError extends RLMError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * LLM API call failed.
 */
export class LLMCallError extends RLMError {
  /** The provider that failed */
  readonly provider: string | undefined;
  /** HTTP status code if applicable */
  readonly statusCode: number | undefined;

  constructor(message: string, provider?: string, statusCode?: number) {
    super(message, 'LLM_CALL_ERROR');
    this.name = 'LLMCallError';
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

/**
 * Python code execution failed.
 */
export class CodeExecutionError extends RLMError {
  /** The code that failed */
  readonly sourceCode: string;
  /** Python error output */
  readonly pythonError: string;

  constructor(message: string, sourceCode: string, pythonError: string) {
    super(message, 'CODE_EXECUTION_ERROR');
    this.name = 'CodeExecutionError';
    this.sourceCode = sourceCode;
    this.pythonError = pythonError;
  }
}

/**
 * Operation timed out.
 */
export class TimeoutError extends RLMError {
  /** Timeout duration in milliseconds */
  readonly timeoutMs: number;
  /** What operation timed out */
  readonly operation: string;

  constructor(message: string, timeoutMs: number, operation: string) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.operation = operation;
  }
}

/**
 * Maximum iterations limit reached.
 */
export class MaxIterationsError extends RLMError {
  /** The limit that was reached */
  readonly limit: number;

  constructor(limit: number) {
    super(`Maximum iterations limit (${limit}) reached`, 'MAX_ITERATIONS');
    this.name = 'MaxIterationsError';
    this.limit = limit;
  }
}

/**
 * Maximum sub-LM calls limit reached.
 */
export class MaxSubLMCallsError extends RLMError {
  /** The limit that was reached */
  readonly limit: number;

  constructor(limit: number) {
    super(`Maximum sub-LM calls limit (${limit}) reached`, 'MAX_SUB_LM_CALLS');
    this.name = 'MaxSubLMCallsError';
    this.limit = limit;
  }
}

/**
 * Context integrity check failed.
 */
export class ContextIntegrityError extends RLMError {
  /** Expected hash */
  readonly expectedHash: string;
  /** Actual hash */
  readonly actualHash: string;

  constructor(expectedHash: string, actualHash: string) {
    super(
      `Context integrity violation: expected ${expectedHash}, got ${actualHash}`,
      'CONTEXT_INTEGRITY_ERROR'
    );
    this.name = 'ContextIntegrityError';
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

/**
 * REPL process error (crash, communication failure, etc).
 */
export class REPLError extends RLMError {
  constructor(message: string) {
    super(message, 'REPL_ERROR');
    this.name = 'REPLError';
  }
}

/**
 * Type guard to check if an error is an RLMError.
 */
export function isRLMError(error: unknown): error is RLMError {
  return error instanceof RLMError;
}
