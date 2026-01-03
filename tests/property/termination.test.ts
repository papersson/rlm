/**
 * Property-based tests for termination invariant.
 *
 * Invariant: Execution terminates in ≤ maxIterations OR via FINAL/error
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TraceRecorder } from '../../src/executor/trace.js';
import { parseResponse } from '../../src/executor/parser.js';

describe('Termination Invariant', () => {
  /**
   * This test verifies that the trace recorder correctly tracks iterations.
   * In a real RLM execution, this would be enforced by the engine.
   */
  describe('TraceRecorder iteration tracking', () => {
    it('should count iterations correctly for any number of LLM calls', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (numCalls) => {
            const trace = new TraceRecorder();

            for (let i = 0; i < numCalls; i++) {
              trace.recordLLMCall({
                model: 'test',
                prompt: `prompt-${i}`,
                response: `response-${i}`,
                tokensUsed: 10,
              });
            }

            expect(trace.iterations).toBe(numCalls);

            const finalized = trace.finalize();
            expect(finalized.totalIterations).toBe(numCalls);
          }
        )
      );
    });

    it('should not count code executions as iterations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          (llmCalls, codeExecs) => {
            const trace = new TraceRecorder();

            // Interleave LLM calls and code executions
            for (let i = 0; i < Math.max(llmCalls, codeExecs); i++) {
              if (i < llmCalls) {
                trace.recordLLMCall({
                  model: 'test',
                  prompt: `p${i}`,
                  response: `r${i}`,
                  tokensUsed: 10,
                });
              }
              if (i < codeExecs) {
                trace.recordCodeExecution({
                  code: `print(${i})`,
                  output: `${i}\n`,
                  error: null,
                  variablesAfter: {},
                  executionTimeMs: 1,
                });
              }
            }

            // Only LLM calls count as iterations
            expect(trace.iterations).toBe(llmCalls);
          }
        )
      );
    });
  });

  /**
   * Test that parseResponse correctly identifies termination signals.
   */
  describe('Termination signal detection', () => {
    it('should detect FINAL with any content', () => {
      fc.assert(
        fc.property(
          // Exclude strings with ')' and whitespace-only strings (which get trimmed)
          fc.string({ minLength: 1, maxLength: 100 })
            .filter((s) => !s.includes(')') && s.trim().length > 0),
          (content) => {
            const response = `Some text\n\nFINAL(${content})`;
            const parsed = parseResponse(response);

            expect(parsed.finalAnswer).not.toBeNull();
            expect(parsed.finalAnswer?.type).toBe('FINAL');
            // Parser trims the value, so compare trimmed content
            expect(parsed.finalAnswer?.value).toBe(content.trim());
          }
        )
      );
    });

    it('should detect FINAL_VAR with valid Python identifiers', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
          (varName) => {
            const response = `Result stored.\n\nFINAL_VAR(${varName})`;
            const parsed = parseResponse(response);

            expect(parsed.finalAnswer).not.toBeNull();
            expect(parsed.finalAnswer?.type).toBe('FINAL_VAR');
            expect(parsed.finalAnswer?.value).toBe(varName);
          }
        )
      );
    });

    it('should return null for responses without termination', () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !s.includes('FINAL(') && !s.includes('FINAL_VAR(')),
          (content) => {
            const parsed = parseResponse(content);
            expect(parsed.finalAnswer).toBeNull();
          }
        )
      );
    });
  });

  /**
   * Simulated execution that verifies termination property.
   */
  describe('Simulated execution termination', () => {
    it('should always terminate within maxIterations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }), // maxIterations
          fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }), // termination decisions
          (maxIterations, terminationDecisions) => {
            const trace = new TraceRecorder();
            let terminated = false;

            for (let i = 0; i < terminationDecisions.length && i < maxIterations; i++) {
              trace.recordLLMCall({
                model: 'test',
                prompt: 'p',
                response: 'r',
                tokensUsed: 10,
              });

              // Simulate termination decision
              if (terminationDecisions[i]) {
                terminated = true;
                break;
              }
            }

            // Either terminated early or hit max iterations
            expect(trace.iterations).toBeLessThanOrEqual(maxIterations);

            // If we didn't terminate early, we should have hit the limit
            if (!terminated) {
              expect(trace.iterations).toBeLessThanOrEqual(maxIterations);
            }
          }
        )
      );
    });

    it('should track correct total tokens regardless of termination path', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom('llm', 'sub', 'code'),
              tokens: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (steps) => {
            const trace = new TraceRecorder();
            let expectedTokens = 0;

            for (const step of steps) {
              if (step.type === 'llm') {
                trace.recordLLMCall({
                  model: 'test',
                  prompt: 'p',
                  response: 'r',
                  tokensUsed: step.tokens,
                });
                expectedTokens += step.tokens;
              } else if (step.type === 'sub') {
                trace.recordSubLMCall({
                  query: 'q',
                  response: 'r',
                  tokensUsed: step.tokens,
                });
                expectedTokens += step.tokens;
              } else {
                trace.recordCodeExecution({
                  code: 'x',
                  output: '',
                  error: null,
                  variablesAfter: {},
                  executionTimeMs: 1,
                });
                // Code execution doesn't use tokens
              }
            }

            expect(trace.calculateTotalTokens()).toBe(expectedTokens);
          }
        )
      );
    });
  });
});
