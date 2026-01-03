# SPEC: RLM Framework (Recursive Language Models)

## 1. PURPOSE

Implement a working, well-documented, extensible RLM framework for personal research use. The goal is to understand how RLMs manage long contexts by treating prompts as external environment variables that an LLM can programmatically examine, decompose, and recursively process via sub-LM calls. Success means transparency into execution and code that teaches through reading.

Reference: [Recursive Language Models (arXiv:2512.24601v1)](docs/references/rlm.pdf)

## 2. SCOPE

**IN:**

- Working RLM prototype with visible execution traces
- Provider-agnostic LLM interface (multi-provider support)
- Multi-model orchestration (different models for root vs sub-calls)
- Real Python REPL subprocess for code execution
- Full execution trace + structured summary views
- CLI/library interface

**OUT:**

- Production hardening (rate limiting, error recovery, cost tracking)
- Benchmark suite (automated testing against OOLONG, BrowseComp, etc.)
- Web UI/visualization (separate spec)

## 3. DEFINITIONS

| Term | Definition |
|------|------------|
| **RLM** | Recursive Language Model - wraps an LLM with a REPL environment containing the context as a variable |
| **Root LM** | The primary LLM that orchestrates the task |
| **Sub-LM** | Secondary LLM invoked via `llm_query()` for processing chunks (plain LM, not RLM) |
| **REPL** | Python subprocess where context is loaded as a variable and LLM-generated code executes |
| **Iteration** | One root-level LLM call (may contain multiple code executions and sub-LM calls) |

## 4. DOMAIN TYPES

```typescript
import { z } from 'zod';

// =============================================================================
// Branded Primitives (compile-time safety)
// =============================================================================

type PositiveInt = number & { readonly __brand: 'PositiveInt' };
type NonEmptyString = string & { readonly __brand: 'NonEmptyString' };
type Timestamp = number & { readonly __brand: 'Timestamp' };

// =============================================================================
// Model Configuration
// =============================================================================

const ModelConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'ollama', 'custom']),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  maxTokens: z.number().int().positive().optional(),
});

type ModelConfig = z.infer<typeof ModelConfigSchema>;

// =============================================================================
// RLM Configuration
// =============================================================================

const RLMConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(50),
  maxRetries: z.number().int().nonnegative().default(3),
  maxSubLMCalls: z.number().int().positive().default(100),
  rootModel: ModelConfigSchema,
  subModel: ModelConfigSchema,
});

type RLMConfig = z.infer<typeof RLMConfigSchema>;

// =============================================================================
// Execution Steps (discriminated union)
// =============================================================================

const LLMCallStepSchema = z.object({
  type: z.literal('llm_call'),
  model: z.string(),
  prompt: z.string(),
  response: z.string(),
  tokensUsed: z.number().int().nonnegative(),
  timestamp: z.number(),
});

const CodeExecutionStepSchema = z.object({
  type: z.literal('code_execution'),
  code: z.string(),
  output: z.string(),
  error: z.string().nullable(),
  variablesAfter: z.record(z.string(), z.unknown()),
  executionTimeMs: z.number().nonnegative(),
  timestamp: z.number(),
});

const SubLMCallStepSchema = z.object({
  type: z.literal('sub_lm_call'),
  query: z.string(),
  response: z.string(),
  tokensUsed: z.number().int().nonnegative(),
  timestamp: z.number(),
});

const ExecutionStepSchema = z.discriminatedUnion('type', [
  LLMCallStepSchema,
  CodeExecutionStepSchema,
  SubLMCallStepSchema,
]);

type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

// =============================================================================
// Execution Trace
// =============================================================================

const ExecutionTraceSchema = z.object({
  steps: z.array(ExecutionStepSchema),
  totalTokens: z.number().int().nonnegative(),
  totalSubLMCalls: z.number().int().nonnegative(),
  totalIterations: z.number().int().nonnegative(),
  startTime: z.number(),
  endTime: z.number(),
});

type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

// =============================================================================
// RLM Result (discriminated union)
// =============================================================================

const SuccessResultSchema = z.object({
  status: z.literal('success'),
  answer: z.string(),
  answerSource: z.enum(['FINAL', 'FINAL_VAR']),
  trace: ExecutionTraceSchema,
});

const MaxIterationsResultSchema = z.object({
  status: z.literal('max_iterations'),
  partialState: z.record(z.string(), z.unknown()),
  trace: ExecutionTraceSchema,
});

const MaxSubLMCallsResultSchema = z.object({
  status: z.literal('max_sub_lm_calls'),
  partialState: z.record(z.string(), z.unknown()),
  trace: ExecutionTraceSchema,
});

const ErrorResultSchema = z.object({
  status: z.literal('error'),
  error: z.string(),
  errorType: z.enum(['code_execution', 'llm_call', 'validation', 'timeout']),
  trace: ExecutionTraceSchema,
});

const RLMResultSchema = z.discriminatedUnion('status', [
  SuccessResultSchema,
  MaxIterationsResultSchema,
  MaxSubLMCallsResultSchema,
  ErrorResultSchema,
]);

type RLMResult = z.infer<typeof RLMResultSchema>;

// =============================================================================
// RLM Input
// =============================================================================

const RLMInputSchema = z.object({
  context: z.string().min(1),
  query: z.string().min(1),
  config: RLMConfigSchema,
});

type RLMInput = z.infer<typeof RLMInputSchema>;
```

## 5. INPUTS

| Field | Type | Description |
|-------|------|-------------|
| `context` | `NonEmptyString` | Plain text loaded into REPL as `context` variable |
| `query` | `NonEmptyString` | What to answer/produce |
| `config` | `RLMConfig` | Models, limits, retry settings |

**Invalid input handling:** Zod validation fails → immediate error with validation message.

## 6. OUTPUTS

| Field | Type | Description |
|-------|------|-------------|
| `result` | `RLMResult` | Discriminated union: `success` \| `max_iterations` \| `max_sub_lm_calls` \| `error` |
| `trace` | `ExecutionTrace` | Complete audit trail of all steps |
| Summary | Derived | Iteration count, sub-call count, total tokens (computed from trace) |

## 7. INVARIANTS

These are properties that must always hold. They are targets for property-based tests.

| Invariant | Statement | Verification |
|-----------|-----------|--------------|
| **Termination** | Execution terminates in ≤ `maxIterations` OR via FINAL/error | Property test: all executions terminate |
| **Context Integrity** | `sha256(REPL.context) === sha256(input.context)` at all times | Assertion on REPL init + after each step |
| **Answer Traceability** | `result.status === 'success'` → ∃ step in trace where answer originated | Property test: can locate answer origin |
| **Trace Completeness** | Every state change appears in trace | Property test: replay trace reproduces final state |
| **Sub-call Isolation** | Sub-LM calls cannot mutate root REPL variables directly | Type-enforced: sub-calls return strings only |

## 8. CONSTRAINTS

### Priority Order

1. **Transparency/observability** — must understand what happened
2. **Code clarity/documentation** — must learn from reading
3. **Type safety** — maximize compile-time guarantees
4. **Extensibility** — must be able to experiment

### MUST (Hard Requirements)

| ID | Requirement | Rationale | Verification |
|----|-------------|-----------|--------------|
| P1 | Provide full execution trace | Core learning requirement | Type guarantees trace array populated |
| P2 | Use Zod schemas + branded types | Maximize type safety | No `any` types, all inputs validated |
| P3 | Support different models for root vs sub-calls | Essential per paper | Config accepts distinct models |
| P4 | Implement retry with configurable limit (default 3) | Graceful error handling | Unit test retry behavior |
| P5 | Terminate by maxIterations (default 50) | Termination guarantee | Property test termination |
| P6 | Use system prompt from paper (Appendix D) | Faithful reproduction | Hardcoded, matches paper |

### MUST NOT (Prohibitions)

| ID | Prohibition | Prevents | Verification |
|----|-------------|----------|--------------|
| N1 | Silently truncate or corrupt context | Data integrity violation | Context integrity invariant |
| N2 | Make hidden LLM calls not in trace | Defeats transparency | Trace completeness invariant |
| N3 | Allow sub-LM calls to exceed limit (default 100) | Runaway costs | Counter + assertion |
| N4 | Have undocumented code sections | Defeats learning purpose | Doc coverage check |

### SHOULD (Soft Preferences)

| ID | Preference | Override When |
|----|------------|---------------|
| S1 | Use idiomatic TypeScript patterns over paper faithfulness | Would change core behavior |
| S2 | Extensive JSDoc on all public APIs | Truly self-documenting |
| S3 | Use established libraries (zod, etc.) | Adds unnecessary complexity |

## 9. VERIFICATION STRATEGY

| Property | Verification Method |
|----------|---------------------|
| Input validity | **Types** (Zod runtime + branded compile-time) |
| Output structure | **Types** (discriminated union exhaustiveness) |
| State transitions | **Types** (discriminated union for ExecutionStep) |
| Termination | **Property test** (all executions terminate) |
| Context integrity | **Assertion** (hash check on REPL operations) |
| Answer traceability | **Property test** (answer origin locatable) |
| Retry behavior | **Unit test** (mock failures, verify retry count) |
| Multi-model routing | **Unit test** (verify correct model called) |

## 10. EDGE CASES

| Case | Condition | Behavior |
|------|-----------|----------|
| Code execution error | Syntax/runtime error in LLM-generated code | Feed error to LLM, retry up to `maxRetries`, then return error result |
| Max iterations reached | `maxIterations` iterations without FINAL | Return `{status: 'max_iterations', partialState, trace}` |
| Max sub-LM calls reached | `maxSubLMCalls` calls reached | Return `{status: 'max_sub_lm_calls', partialState, trace}` |
| Empty LLM response | LLM returns empty string | Treat as error, retry |
| Malformed FINAL | `FINAL(` without closing `)` | Retry, let LLM fix |
| REPL timeout | Code execution exceeds timeout | Kill process, return error with partial trace |
| Invalid Python syntax | LLM generates unparseable code | Feed syntax error to LLM, retry |

## 11. EXAMPLES

### Valid Execution (Success)

```typescript
// Input
const result = await rlm.run({
  context: "Long document about climate change spanning 100,000 tokens...",
  query: "What are the three main causes mentioned?",
  config: {
    rootModel: { provider: 'anthropic', model: 'claude-3-opus-20240229' },
    subModel: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    maxIterations: 50,
    maxRetries: 3,
    maxSubLMCalls: 100,
  }
});

// Output
{
  status: 'success',
  answer: "The three main causes mentioned are: 1) fossil fuel combustion, 2) deforestation, 3) industrial agriculture",
  answerSource: 'FINAL',
  trace: {
    steps: [
      {
        type: 'llm_call',
        model: 'claude-3-opus-20240229',
        prompt: 'You are tasked with answering a query...',
        response: '```repl\nprint(len(context))\nprint(context[:2000])\n```',
        tokensUsed: 1250,
        timestamp: 1704067200000,
      },
      {
        type: 'code_execution',
        code: 'print(len(context))\nprint(context[:2000])',
        output: '100000\nLong document about climate change...',
        error: null,
        variablesAfter: { context: '[100000 chars]' },
        executionTimeMs: 45,
        timestamp: 1704067200100,
      },
      {
        type: 'llm_call',
        model: 'claude-3-opus-20240229',
        prompt: '...',
        response: '```repl\nchunks = [context[i:i+20000] for i in range(0, len(context), 20000)]\nfor i, chunk in enumerate(chunks):\n    result = llm_query(f"What causes of climate change are mentioned in this section? Section {i}: {chunk}")\n    print(f"Chunk {i}: {result}")\n```',
        tokensUsed: 890,
        timestamp: 1704067201000,
      },
      {
        type: 'code_execution',
        code: 'chunks = ...',
        output: 'Chunk 0: Fossil fuels...\nChunk 1: Deforestation...',
        error: null,
        variablesAfter: { context: '[100000 chars]', chunks: '[5 items]' },
        executionTimeMs: 15000,
        timestamp: 1704067202000,
      },
      {
        type: 'sub_lm_call',
        query: 'What causes of climate change are mentioned in this section? Section 0: ...',
        response: 'This section mentions fossil fuel combustion as a primary cause...',
        tokensUsed: 2100,
        timestamp: 1704067203000,
      },
      // ... more sub_lm_calls ...
      {
        type: 'llm_call',
        model: 'claude-3-opus-20240229',
        prompt: '...',
        response: 'FINAL(The three main causes mentioned are: 1) fossil fuel combustion, 2) deforestation, 3) industrial agriculture)',
        tokensUsed: 450,
        timestamp: 1704067220000,
      },
    ],
    totalTokens: 15420,
    totalSubLMCalls: 5,
    totalIterations: 3,
    startTime: 1704067200000,
    endTime: 1704067220000,
  }
}
```

### Invalid Output (Violates P1 - Missing Trace)

```typescript
// REJECTED - trace is required
{
  status: 'success',
  answer: 'The three main causes are...',
  // Missing: trace field
}
```

### Max Iterations Result

```typescript
{
  status: 'max_iterations',
  partialState: {
    context: '[100000 chars]',
    intermediate_results: ['cause 1', 'cause 2'],
  },
  trace: { /* full trace of all 50 iterations */ }
}
```

## 12. SYSTEM PROMPT

The system prompt is hardcoded from the paper's Appendix D. Key elements:

1. Explains the REPL environment with `context` variable
2. Describes `llm_query()` function for sub-LM calls
3. Provides examples of chunking strategies
4. Specifies `FINAL()` and `FINAL_VAR()` for termination

See `src/prompts/system.ts` for the complete prompt.

## 13. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                        RLM Engine                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Input     │───▶│  Executor   │───▶│   Output    │     │
│  │  Validator  │    │   Loop      │    │  Formatter  │     │
│  │   (Zod)     │    │             │    │             │     │
│  └─────────────┘    └──────┬──────┘    └─────────────┘     │
│                            │                                │
│         ┌──────────────────┼──────────────────┐            │
│         │                  │                  │            │
│         ▼                  ▼                  ▼            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  LLM Client │    │ Python REPL │    │   Trace     │     │
│  │  (Provider  │    │ (subprocess)│    │  Recorder   │     │
│  │  Agnostic)  │    │             │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                                │
│         │                  │                                │
│         ▼                  ▼                                │
│  ┌─────────────┐    ┌─────────────┐                        │
│  │  Anthropic  │    │ llm_query() │                        │
│  │  OpenAI     │    │  (Sub-LM)   │                        │
│  │  Ollama     │    │             │                        │
│  │  Custom     │    └─────────────┘                        │
│  └─────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

## 14. ASSUMPTIONS

- Python 3.x available in environment for REPL subprocess
- User has API keys for desired LLM providers
- User runs in trusted environment (real Python execution, no sandboxing)
- Network available for LLM API calls

## 15. CONFIGURATION DEFAULTS

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxIterations` | 50 | Maximum root-level LLM calls |
| `maxRetries` | 3 | Retries on code execution error |
| `maxSubLMCalls` | 100 | Maximum sub-LM invocations |
| Recursion depth | 1 (fixed) | Sub-calls are plain LMs, not RLMs |

## 16. OPEN QUESTIONS

All resolved:

- [x] Retry limit → Configurable, default 3
- [x] Sub-LM limit → Configurable, default 100
- [x] Web UI → Separate spec
- [x] Type precision → Zod + branded types
- [x] System prompt → Hardcoded from paper

---

*Spec version: 1.0*
*Last updated: 2026-01-03*
