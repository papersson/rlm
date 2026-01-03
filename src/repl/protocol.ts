/**
 * IPC protocol types for communication between Node.js and Python REPL.
 * Messages are JSON objects sent over stdin/stdout.
 * @module repl/protocol
 */

// =============================================================================
// Request Types (Node.js → Python)
// =============================================================================

/**
 * Initialize the REPL with context.
 */
export interface InitRequest {
  type: 'init';
  /** The context string to load as the `context` variable */
  context: string;
}

/**
 * Execute Python code in the REPL.
 */
export interface ExecuteRequest {
  type: 'execute';
  /** Python code to execute */
  code: string;
}

/**
 * Get current REPL variables.
 */
export interface GetVariablesRequest {
  type: 'get_variables';
}

/**
 * Get SHA-256 hash of the context for integrity verification.
 */
export interface GetContextHashRequest {
  type: 'get_context_hash';
}

/**
 * Response to an llm_query() call from Python.
 */
export interface LLMResponseRequest {
  type: 'llm_response';
  /** Request ID to match with the query */
  id: string;
  /** LLM response text */
  response: string;
}

/**
 * Shutdown the REPL process.
 */
export interface ShutdownRequest {
  type: 'shutdown';
}

/**
 * Any request from Node.js to Python.
 */
export type REPLRequest =
  | InitRequest
  | ExecuteRequest
  | GetVariablesRequest
  | GetContextHashRequest
  | LLMResponseRequest
  | ShutdownRequest;

// =============================================================================
// Response Types (Python → Node.js)
// =============================================================================

/**
 * Initialization complete.
 */
export interface InitResponse {
  type: 'init_complete';
  /** SHA-256 hash of the loaded context */
  contextHash: string;
}

/**
 * Code execution result.
 */
export interface ExecutionResultResponse {
  type: 'result';
  /** Captured stdout output */
  output: string;
  /** Error message if execution failed, null otherwise */
  error: string | null;
  /** Current state of REPL variables (serializable subset) */
  variables: Record<string, unknown>;
  /** Execution time in milliseconds */
  timeMs: number;
}

/**
 * Current REPL variables.
 */
export interface VariablesResponse {
  type: 'variables';
  /** Current state of REPL variables (serializable subset) */
  data: Record<string, unknown>;
}

/**
 * Context hash for integrity verification.
 */
export interface ContextHashResponse {
  type: 'context_hash';
  /** SHA-256 hash of the context */
  hash: string;
}

/**
 * Request from Python to call llm_query().
 * Node.js must respond with LLMResponseRequest.
 */
export interface LLMQueryRequest {
  type: 'llm_query';
  /** Unique request ID */
  id: string;
  /** Query to send to sub-LM */
  query: string;
}

/**
 * Acknowledgment of shutdown.
 */
export interface ShutdownResponse {
  type: 'shutdown_complete';
}

/**
 * Error from Python process.
 */
export interface ErrorResponse {
  type: 'error';
  /** Error message */
  message: string;
  /** Error code if available */
  code?: string;
}

/**
 * Any response from Python to Node.js.
 */
export type REPLResponse =
  | InitResponse
  | ExecutionResultResponse
  | VariablesResponse
  | ContextHashResponse
  | LLMQueryRequest
  | ShutdownResponse
  | ErrorResponse;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a response is an LLM query request.
 */
export function isLLMQueryRequest(
  response: REPLResponse
): response is LLMQueryRequest {
  return response.type === 'llm_query';
}

/**
 * Check if a response is an error.
 */
export function isErrorResponse(
  response: REPLResponse
): response is ErrorResponse {
  return response.type === 'error';
}

/**
 * Check if a response is an execution result.
 */
export function isExecutionResult(
  response: REPLResponse
): response is ExecutionResultResponse {
  return response.type === 'result';
}
