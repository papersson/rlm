/**
 * RLM Execution Engine.
 * Main orchestration loop implementing the RLM algorithm.
 * @module executor/engine
 */

import type {
  RLMInput,
  RLMResult,
  RLMConfig,
  ModelConfig,
  Message,
  ExecutionTrace,
  AnswerSource,
} from '../types/index.js';
import {
  RLMInputSchema,
  ValidationError,
  MaxIterationsError,
  MaxSubLMCallsError,
  LLMCallError,
} from '../types/index.js';
import { createLLMClient, type LLMClient } from '../llm/index.js';
import { REPLManager, type ExecutionResult } from '../repl/index.js';
import { TraceRecorder } from './trace.js';
import { parseResponse, type FinalAnswer } from './parser.js';
import { formatSystemPrompt } from '../prompts/system.js';

/**
 * Configuration for the RLM engine.
 */
export interface RLMEngineConfig {
  /** Python executable path for REPL */
  pythonPath?: string;
  /** Timeout for REPL operations in milliseconds */
  replTimeout?: number;
}

/**
 * The main RLM execution engine.
 * Orchestrates the interaction between LLM, REPL, and trace recording.
 */
export class RLMEngine {
  private readonly pythonPath: string;
  private readonly replTimeout: number;

  constructor(config: RLMEngineConfig = {}) {
    this.pythonPath = config.pythonPath ?? 'python3';
    this.replTimeout = config.replTimeout ?? 60000;
  }

  /**
   * Run the RLM with the given input.
   *
   * @param input - RLM input (context, query, config)
   * @returns RLM result with answer or error and trace
   *
   * @example
   * ```typescript
   * const engine = new RLMEngine();
   * const result = await engine.run({
   *   context: "Long document...",
   *   query: "What is the main topic?",
   *   config: {
   *     rootModel: { provider: 'anthropic', model: 'claude-3-opus-20240229' },
   *     subModel: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
   *   }
   * });
   * ```
   */
  async run(input: RLMInput): Promise<RLMResult> {
    // Validate input
    const validationResult = RLMInputSchema.safeParse(input);
    if (!validationResult.success) {
      const trace = new TraceRecorder().finalize();
      return {
        status: 'error',
        error: `Validation error: ${validationResult.error.message}`,
        errorType: 'validation',
        trace,
      };
    }

    const validated = validationResult.data;
    const { context, query, config } = validated;

    // Initialize components
    const trace = new TraceRecorder();
    const rootClient = createLLMClient(config.rootModel.provider);
    const subClient = createLLMClient(config.subModel.provider);

    const repl = new REPLManager({
      pythonPath: this.pythonPath,
      timeout: this.replTimeout,
    });

    // Track sub-LM call count
    let subLMCallCount = 0;

    // Sub-LM call handler
    const handleSubLMCall = async (query: string): Promise<string> => {
      // Check limit
      if (subLMCallCount >= config.maxSubLMCalls) {
        throw new MaxSubLMCallsError(config.maxSubLMCalls);
      }
      subLMCallCount++;

      // Call sub-LM
      const response = await subClient.call(query, config.subModel);

      // Record in trace
      trace.recordSubLMCall({
        query,
        response: response.response,
        tokensUsed: response.tokensUsed,
      });

      return response.response;
    };

    try {
      // Start REPL with context
      await repl.start(context, handleSubLMCall);

      // Build initial conversation
      const conversation: Message[] = [
        {
          role: 'system',
          content: formatSystemPrompt(context.length),
        },
        {
          role: 'user',
          content: this.buildInitialPrompt(query, context.length),
        },
      ];

      // Main execution loop
      let retryCount = 0;

      for (let iteration = 0; iteration < config.maxIterations; iteration++) {
        // Call root LLM
        const llmResponse = await this.callRootLLM(
          rootClient,
          config.rootModel,
          conversation
        );

        // Record LLM call
        trace.recordLLMCall({
          model: config.rootModel.model,
          prompt: this.serializeConversation(conversation),
          response: llmResponse.response,
          tokensUsed: llmResponse.tokensUsed,
        });

        // Add assistant response to conversation
        conversation.push({
          role: 'assistant',
          content: llmResponse.response,
        });

        // Parse response
        const parsed = parseResponse(llmResponse.response);

        // Execute code blocks FIRST (before checking for FINAL)
        // This allows the model to run calculations and provide FINAL in the same response
        if (parsed.codeBlocks.length > 0) {
          for (const block of parsed.codeBlocks) {
            try {
              const result = await repl.execute(block.code);

              // Record code execution
              trace.recordCodeExecution({
                code: block.code,
                output: result.output,
                error: result.error,
                variablesAfter: result.variables,
                executionTimeMs: result.executionTimeMs,
              });

              // Add execution result to conversation
              conversation.push({
                role: 'user',
                content: this.formatExecutionResult(result),
              });

              // Handle execution error
              if (result.error) {
                retryCount++;
                if (retryCount > config.maxRetries) {
                  await repl.stop();
                  return {
                    status: 'error',
                    error: `Max retries (${config.maxRetries}) exceeded. Last error: ${result.error}`,
                    errorType: 'code_execution',
                    trace: trace.finalize(),
                  };
                }
              } else {
                // Reset retry count on success
                retryCount = 0;
              }

              // Verify context integrity
              await repl.assertContextIntegrity();
            } catch (error) {
              if (error instanceof MaxSubLMCallsError) {
                await repl.stop();
                const variables = await repl.getVariables().catch(() => ({}));
                return {
                  status: 'max_sub_lm_calls',
                  partialState: variables,
                  trace: trace.finalize(),
                };
              }
              throw error;
            }
          }
        } else {
          // No code blocks, add a prompt to continue
          conversation.push({
            role: 'user',
            content: 'Please continue. Remember to use code blocks to interact with the context or provide a FINAL() answer.',
          });
        }

        // Check for termination AFTER executing code blocks
        // This allows the model to compute results and provide FINAL in the same iteration
        if (parsed.finalAnswer) {
          const answer = await this.resolveFinalAnswer(
            parsed.finalAnswer,
            repl
          );

          await repl.stop();

          return {
            status: 'success',
            answer,
            answerSource: parsed.finalAnswer.type as AnswerSource,
            trace: trace.finalize(),
          };
        }
      }

      // Max iterations reached
      await repl.stop();
      const variables = await repl.getVariables().catch(() => ({}));

      return {
        status: 'max_iterations',
        partialState: variables,
        trace: trace.finalize(),
      };
    } catch (error) {
      // Clean up
      await repl.stop().catch(() => {});

      // Determine error type
      let errorType: 'code_execution' | 'llm_call' | 'validation' | 'timeout' =
        'llm_call';
      let errorMessage = 'Unknown error';

      if (error instanceof LLMCallError) {
        errorType = 'llm_call';
        errorMessage = error.message;
      } else if (error instanceof ValidationError) {
        errorType = 'validation';
        errorMessage = error.message;
      } else if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorType = 'timeout';
        }
        errorMessage = error.message;
      }

      return {
        status: 'error',
        error: errorMessage,
        errorType,
        trace: trace.finalize(),
      };
    }
  }

  /**
   * Build the initial user prompt.
   */
  private buildInitialPrompt(query: string, contextLength: number): string {
    return `Your context has been loaded into the REPL environment as the \`context\` variable (${contextLength} characters).

Your task is to answer the following query:

${query}

Start by examining the context using code to understand its structure and content. Then develop a strategy to answer the query.`;
  }

  /**
   * Call the root LLM with the conversation.
   */
  private async callRootLLM(
    client: LLMClient,
    config: ModelConfig,
    conversation: Message[]
  ): Promise<{ response: string; tokensUsed: number }> {
    const response = await client.chat(conversation, config);
    return {
      response: response.response,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Serialize conversation for trace logging.
   */
  private serializeConversation(conversation: Message[]): string {
    return conversation
      .map((m) => `[${m.role}]\n${m.content}`)
      .join('\n\n---\n\n');
  }

  /**
   * Format execution result for the conversation.
   */
  private formatExecutionResult(result: ExecutionResult): string {
    const parts: string[] = [];

    if (result.output) {
      parts.push(`Output:\n${result.output}`);
    }

    if (result.error) {
      parts.push(`Error:\n${result.error}`);
    }

    if (!result.output && !result.error) {
      parts.push('(No output)');
    }

    parts.push(`Execution time: ${result.executionTimeMs.toFixed(2)}ms`);

    return parts.join('\n\n');
  }

  /**
   * Resolve a final answer to its string value.
   */
  private async resolveFinalAnswer(
    finalAnswer: FinalAnswer,
    repl: REPLManager
  ): Promise<string> {
    if (finalAnswer.type === 'FINAL') {
      return finalAnswer.value;
    }

    // FINAL_VAR - need to get the variable value from REPL
    const variableName = finalAnswer.value;
    const result = await repl.execute(`print(${variableName})`);

    if (result.error) {
      throw new Error(
        `Failed to resolve FINAL_VAR(${variableName}): ${result.error}`
      );
    }

    return result.output.trim();
  }
}
