/**
 * Zod schemas for all RLM domain types.
 * These schemas provide runtime validation and type inference.
 * Based on SPEC.md Section 4: Domain Types.
 * @module types/schemas
 */

import { z } from 'zod';

// =============================================================================
// Model Configuration
// =============================================================================

/**
 * Supported LLM providers.
 */
export const ProviderSchema = z.enum(['anthropic', 'openai', 'ollama', 'custom']);
export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Configuration for a single LLM model.
 */
export const ModelConfigSchema = z.object({
  /** LLM provider to use */
  provider: ProviderSchema,
  /** Model name/identifier */
  model: z.string().min(1),
  /** API key (optional, can use environment variable) */
  apiKey: z.string().optional(),
  /** Base URL for API (required for custom, optional for others) */
  baseUrl: z.string().url().optional(),
  /** Maximum tokens to generate */
  maxTokens: z.number().int().positive().optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// =============================================================================
// RLM Configuration
// =============================================================================

/**
 * Configuration for the RLM execution.
 */
export const RLMConfigSchema = z.object({
  /** Maximum number of root-level LLM iterations (default: 50) */
  maxIterations: z.number().int().positive().default(50),
  /** Maximum retries on code execution error (default: 3) */
  maxRetries: z.number().int().nonnegative().default(3),
  /** Maximum sub-LM invocations (default: 100) */
  maxSubLMCalls: z.number().int().positive().default(100),
  /** Model configuration for root LLM */
  rootModel: ModelConfigSchema,
  /** Model configuration for sub-LM calls */
  subModel: ModelConfigSchema,
});

export type RLMConfig = z.infer<typeof RLMConfigSchema>;

// =============================================================================
// Execution Steps (discriminated union)
// =============================================================================

/**
 * A root-level LLM call step.
 */
export const LLMCallStepSchema = z.object({
  type: z.literal('llm_call'),
  /** Model identifier used */
  model: z.string(),
  /** Full prompt sent to LLM */
  prompt: z.string(),
  /** LLM response text */
  response: z.string(),
  /** Number of tokens used (input + output) */
  tokensUsed: z.number().int().nonnegative(),
  /** Unix timestamp in milliseconds */
  timestamp: z.number(),
});

export type LLMCallStep = z.infer<typeof LLMCallStepSchema>;

/**
 * A code execution step in the Python REPL.
 */
export const CodeExecutionStepSchema = z.object({
  type: z.literal('code_execution'),
  /** Python code that was executed */
  code: z.string(),
  /** Captured stdout output */
  output: z.string(),
  /** Error message if execution failed, null otherwise */
  error: z.string().nullable(),
  /** Snapshot of REPL variables after execution */
  variablesAfter: z.record(z.string(), z.unknown()),
  /** Execution time in milliseconds */
  executionTimeMs: z.number().nonnegative(),
  /** Unix timestamp in milliseconds */
  timestamp: z.number(),
});

export type CodeExecutionStep = z.infer<typeof CodeExecutionStepSchema>;

/**
 * A sub-LM call step (via llm_query() in REPL).
 */
export const SubLMCallStepSchema = z.object({
  type: z.literal('sub_lm_call'),
  /** Query sent to sub-LM */
  query: z.string(),
  /** Sub-LM response */
  response: z.string(),
  /** Number of tokens used */
  tokensUsed: z.number().int().nonnegative(),
  /** Unix timestamp in milliseconds */
  timestamp: z.number(),
});

export type SubLMCallStep = z.infer<typeof SubLMCallStepSchema>;

/**
 * Any execution step (discriminated union).
 */
export const ExecutionStepSchema = z.discriminatedUnion('type', [
  LLMCallStepSchema,
  CodeExecutionStepSchema,
  SubLMCallStepSchema,
]);

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

// =============================================================================
// Execution Trace
// =============================================================================

/**
 * Complete execution trace capturing all steps.
 */
export const ExecutionTraceSchema = z.object({
  /** Ordered list of all execution steps */
  steps: z.array(ExecutionStepSchema),
  /** Total tokens used across all LLM calls */
  totalTokens: z.number().int().nonnegative(),
  /** Total number of sub-LM calls */
  totalSubLMCalls: z.number().int().nonnegative(),
  /** Total number of root-level iterations */
  totalIterations: z.number().int().nonnegative(),
  /** Start time (Unix timestamp ms) */
  startTime: z.number(),
  /** End time (Unix timestamp ms) */
  endTime: z.number(),
});

export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

// =============================================================================
// RLM Result (discriminated union)
// =============================================================================

/**
 * How the answer was provided.
 */
export const AnswerSourceSchema = z.enum(['FINAL', 'FINAL_VAR']);
export type AnswerSource = z.infer<typeof AnswerSourceSchema>;

/**
 * Successful execution result.
 */
export const SuccessResultSchema = z.object({
  status: z.literal('success'),
  /** The final answer */
  answer: z.string(),
  /** How the answer was provided (FINAL or FINAL_VAR) */
  answerSource: AnswerSourceSchema,
  /** Complete execution trace */
  trace: ExecutionTraceSchema,
});

export type SuccessResult = z.infer<typeof SuccessResultSchema>;

/**
 * Execution stopped due to max iterations limit.
 */
export const MaxIterationsResultSchema = z.object({
  status: z.literal('max_iterations'),
  /** REPL state at time of stopping */
  partialState: z.record(z.string(), z.unknown()),
  /** Complete execution trace */
  trace: ExecutionTraceSchema,
});

export type MaxIterationsResult = z.infer<typeof MaxIterationsResultSchema>;

/**
 * Execution stopped due to max sub-LM calls limit.
 */
export const MaxSubLMCallsResultSchema = z.object({
  status: z.literal('max_sub_lm_calls'),
  /** REPL state at time of stopping */
  partialState: z.record(z.string(), z.unknown()),
  /** Complete execution trace */
  trace: ExecutionTraceSchema,
});

export type MaxSubLMCallsResult = z.infer<typeof MaxSubLMCallsResultSchema>;

/**
 * Error type categories.
 */
export const ErrorTypeSchema = z.enum([
  'code_execution',
  'llm_call',
  'validation',
  'timeout',
]);
export type ErrorType = z.infer<typeof ErrorTypeSchema>;

/**
 * Execution failed with an error.
 */
export const ErrorResultSchema = z.object({
  status: z.literal('error'),
  /** Error message */
  error: z.string(),
  /** Category of error */
  errorType: ErrorTypeSchema,
  /** Partial execution trace up to the error */
  trace: ExecutionTraceSchema,
});

export type ErrorResult = z.infer<typeof ErrorResultSchema>;

/**
 * Any RLM execution result (discriminated union).
 */
export const RLMResultSchema = z.discriminatedUnion('status', [
  SuccessResultSchema,
  MaxIterationsResultSchema,
  MaxSubLMCallsResultSchema,
  ErrorResultSchema,
]);

export type RLMResult = z.infer<typeof RLMResultSchema>;

// =============================================================================
// RLM Input
// =============================================================================

/**
 * Input to the RLM engine.
 */
export const RLMInputSchema = z.object({
  /** Context string to be loaded into the REPL */
  context: z.string().min(1),
  /** Query to answer */
  query: z.string().min(1),
  /** Execution configuration */
  config: RLMConfigSchema,
});

export type RLMInput = z.infer<typeof RLMInputSchema>;

// =============================================================================
// Conversation Types (internal use)
// =============================================================================

/**
 * Role in a conversation.
 */
export const RoleSchema = z.enum(['system', 'user', 'assistant']);
export type Role = z.infer<typeof RoleSchema>;

/**
 * A message in the conversation history.
 */
export const MessageSchema = z.object({
  role: RoleSchema,
  content: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;

/**
 * Conversation history for LLM context.
 */
export const ConversationSchema = z.array(MessageSchema);
export type Conversation = z.infer<typeof ConversationSchema>;
