/**
 * OpenAI LLM provider implementation.
 * @module llm/providers/openai
 */

import OpenAI from 'openai';
import type { ModelConfig, Message } from '../../types/index.js';
import { LLMCallError, ValidationError } from '../../types/index.js';
import { BaseLLMClient, type LLMResponse, type LLMCallOptions } from '../client.js';

/**
 * Default max tokens for OpenAI models.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * OpenAI provider client.
 */
export class OpenAIClient extends BaseLLMClient {
  readonly providerName = 'openai';

  private client: OpenAI | null = null;
  private currentApiKey: string | null = null;

  /**
   * Get or create the OpenAI client.
   */
  private getClient(config: ModelConfig): OpenAI {
    const apiKey = this.getApiKey(config, 'OPENAI_API_KEY');

    if (!apiKey) {
      throw new ValidationError(
        'OpenAI API key required. Set OPENAI_API_KEY environment variable or provide apiKey in config.'
      );
    }

    // Reuse client if API key hasn't changed
    if (this.client && this.currentApiKey === apiKey) {
      return this.client;
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
    });
    this.currentApiKey = apiKey;
    return this.client;
  }

  validateConfig(config: ModelConfig): void {
    if (config.provider !== 'openai') {
      throw new ValidationError(
        `Expected provider 'openai', got '${config.provider}'`
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
    const client = this.getClient(config);

    // Convert to OpenAI message format
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(
      (m) => ({
        role: m.role,
        content: m.content,
      })
    );

    try {
      const createParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model: config.model,
        max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: openaiMessages,
      };

      if (options?.temperature !== undefined) {
        createParams.temperature = options.temperature;
      }
      if (options?.stopSequences) {
        createParams.stop = options.stopSequences;
      }

      const response = await client.chat.completions.create(createParams);

      const choice = response.choices[0];
      const responseText = choice?.message?.content ?? '';
      const usage = response.usage;

      const result: import('../client.js').LLMResponse = {
        response: responseText,
        tokensUsed: usage ? usage.prompt_tokens + usage.completion_tokens : 0,
      };
      if (usage?.prompt_tokens !== undefined) {
        result.inputTokens = usage.prompt_tokens;
      }
      if (usage?.completion_tokens !== undefined) {
        result.outputTokens = usage.completion_tokens;
      }
      return result;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LLMCallError(
          `OpenAI API error: ${error.message}`,
          'openai',
          error.status
        );
      }
      throw new LLMCallError(
        `OpenAI call failed: ${error instanceof Error ? error.message : String(error)}`,
        'openai'
      );
    }
  }
}
