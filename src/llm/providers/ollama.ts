/**
 * Ollama LLM provider implementation.
 * Ollama is a local LLM server that runs models locally.
 * @module llm/providers/ollama
 */

import type { ModelConfig, Message } from '../../types/index.js';
import { LLMCallError, ValidationError } from '../../types/index.js';
import { BaseLLMClient, type LLMResponse, type LLMCallOptions } from '../client.js';

/**
 * Default Ollama base URL.
 */
const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Ollama API response format.
 */
interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama provider client.
 * Uses HTTP API to communicate with local Ollama server.
 */
export class OllamaClient extends BaseLLMClient {
  readonly providerName = 'ollama';

  /**
   * Get the base URL for the Ollama server.
   */
  private getBaseUrl(config: ModelConfig): string {
    return config.baseUrl ?? process.env['OLLAMA_BASE_URL'] ?? DEFAULT_BASE_URL;
  }

  validateConfig(config: ModelConfig): void {
    if (config.provider !== 'ollama') {
      throw new ValidationError(
        `Expected provider 'ollama', got '${config.provider}'`
      );
    }

    if (!config.model) {
      throw new ValidationError('Model name is required');
    }
  }

  async call(
    prompt: string,
    config: ModelConfig,
    options?: LLMCallOptions
  ): Promise<LLMResponse> {
    this.validateConfig(config);
    const messages = this.buildMessages(prompt, options);
    return this.chat(messages, config, options);
  }

  async chat(
    messages: Message[],
    config: ModelConfig,
    options?: Omit<LLMCallOptions, 'messages'>
  ): Promise<LLMResponse> {
    this.validateConfig(config);
    const baseUrl = this.getBaseUrl(config);

    // Convert to Ollama message format
    const ollamaMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: ollamaMessages,
          stream: false,
          options: {
            temperature: options?.temperature,
            stop: options?.stopSequences,
            num_predict: config.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMCallError(
          `Ollama API error: ${response.status} ${errorText}`,
          'ollama',
          response.status
        );
      }

      const data = (await response.json()) as OllamaChatResponse;

      // Ollama doesn't provide exact token counts, estimate from response
      const promptTokens = data.prompt_eval_count ?? 0;
      const completionTokens = data.eval_count ?? 0;

      return {
        response: data.message.content,
        tokensUsed: promptTokens + completionTokens,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
      };
    } catch (error) {
      if (error instanceof LLMCallError) {
        throw error;
      }
      throw new LLMCallError(
        `Ollama call failed: ${error instanceof Error ? error.message : String(error)}`,
        'ollama'
      );
    }
  }
}
