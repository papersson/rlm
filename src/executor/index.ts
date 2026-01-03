/**
 * RLM Execution module.
 * Contains the main execution engine, trace recorder, and response parser.
 * @module executor
 */

// Parser
export {
  parseResponse,
  hasCodeBlocks,
  hasTerminationSignal,
  extractCodeBlocks,
  extractFinalAnswer,
  type CodeBlock,
  type FinalAnswer,
  type ParsedResponse,
} from './parser.js';

// Trace recorder
export {
  TraceRecorder,
  type LLMCallInput,
  type CodeExecutionInput,
  type SubLMCallInput,
} from './trace.js';

// Engine
export { RLMEngine, type RLMEngineConfig } from './engine.js';
