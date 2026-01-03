/**
 * Type definitions and schemas for the RLM framework.
 * @module types
 */

// Branded types
export {
  type PositiveInt,
  type NonEmptyString,
  type Timestamp,
  type Sha256Hash,
  positiveInt,
  nonEmptyString,
  timestamp,
  now,
  sha256Hash,
  isPositiveInt,
  isNonEmptyString,
  isTimestamp,
  isSha256Hash,
} from './branded.js';

// Zod schemas and inferred types
export {
  // Provider
  ProviderSchema,
  type Provider,
  // Model config
  ModelConfigSchema,
  type ModelConfig,
  // RLM config
  RLMConfigSchema,
  type RLMConfig,
  // Execution steps
  LLMCallStepSchema,
  type LLMCallStep,
  CodeExecutionStepSchema,
  type CodeExecutionStep,
  SubLMCallStepSchema,
  type SubLMCallStep,
  ExecutionStepSchema,
  type ExecutionStep,
  // Execution trace
  ExecutionTraceSchema,
  type ExecutionTrace,
  // Result types
  AnswerSourceSchema,
  type AnswerSource,
  SuccessResultSchema,
  type SuccessResult,
  MaxIterationsResultSchema,
  type MaxIterationsResult,
  MaxSubLMCallsResultSchema,
  type MaxSubLMCallsResult,
  ErrorTypeSchema,
  type ErrorType,
  ErrorResultSchema,
  type ErrorResult,
  RLMResultSchema,
  type RLMResult,
  // Input
  RLMInputSchema,
  type RLMInput,
  // Conversation
  RoleSchema,
  type Role,
  MessageSchema,
  type Message,
  ConversationSchema,
  type Conversation,
} from './schemas.js';

// Error types
export {
  RLMError,
  ValidationError,
  LLMCallError,
  CodeExecutionError,
  TimeoutError,
  MaxIterationsError,
  MaxSubLMCallsError,
  ContextIntegrityError,
  REPLError,
  isRLMError,
} from './errors.js';
