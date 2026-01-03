/**
 * Anthropic LLM provider implementation.
 * @module llm/providers/anthropic
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelConfig, Message } from '../../types/index.js';
import { LLMCallError, ValidationError } from '../../types/index.js';
import { BaseLLMClient, type LLMResponse, type LLMCallOptions } from '../client.js';

/**
 * Default max tokens for Anthropic models.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic provider client.
 */
export class AnthropicClient extends BaseLLMClient {
  readonly providerName = 'anthropic';

  private client: Anthropic | null = null;
  private currentApiKey: string | null = null;

  /**
   * Get or create the Anthropic client.
   */
  private getClient(config: ModelConfig): Anthropic {
    const apiKey = this.getApiKey(config, 'ANTHROPIC_API_KEY');

    if (!apiKey) {
      throw new ValidationError(
        'Anthropic API key required. Set ANTHROPIC_API_KEY environment variable or provide apiKey in config.'
      );
    }

    // Reuse client if API key hasn't changed
    if (this.client && this.currentApiKey === apiKey) {
      return this.client;
    }

    this.client = new Anthropic({ apiKey });
    this.currentApiKey = apiKey;
    return this.client;
  }

  validateConfig(config: ModelConfig): void {
    if (config.provider !== 'anthropic') {
      throw new ValidationError(
        `Expected provider 'anthropic', got '${config.provider}'`
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

    // Separate system message from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Convert to Anthropic message format
    const anthropicMessages: Anthropic.MessageParam[] = conversationMessages.map(
      (m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })
    );

    try {
      const createParams: Anthropic.MessageCreateParams = {
        model: config.model,
        max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: anthropicMessages,
      };

      if (systemMessage?.content) {
        createParams.system = systemMessage.content;
      }
      if (options?.temperature !== undefined) {
        createParams.temperature = options.temperature;
      }
      if (options?.stopSequences) {
        createParams.stop_sequences = options.stopSequences;
      }

      const response = await client.messages.create(createParams);

      // Extract text from response
      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.type === 'text' ? textContent.text : '';

      return {
        response: responseText,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new LLMCallError(
          `Anthropic API error: ${error.message}`,
          'anthropic',
          error.status
        );
      }
      throw new LLMCallError(
        `Anthropic call failed: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic'
      );
    }
  }
}
