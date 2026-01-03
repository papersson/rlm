/**
 * Python REPL module.
 * Provides a managed Python subprocess for executing LLM-generated code.
 * @module repl
 */

// Protocol types
export type {
  InitRequest,
  ExecuteRequest,
  GetVariablesRequest,
  GetContextHashRequest,
  LLMResponseRequest,
  ShutdownRequest,
  REPLRequest,
  InitResponse,
  ExecutionResultResponse,
  VariablesResponse,
  ContextHashResponse,
  LLMQueryRequest,
  ShutdownResponse,
  ErrorResponse,
  REPLResponse,
} from './protocol.js';

export {
  isLLMQueryRequest,
  isErrorResponse,
  isExecutionResult,
} from './protocol.js';

// Manager
export {
  REPLManager,
  computeSha256,
  type ExecutionResult,
  type SubLMQueryCallback,
  type REPLManagerConfig,
} from './manager.js';

// Bridge script (for testing/debugging)
export { PYTHON_BRIDGE_SCRIPT } from './bridge.js';
