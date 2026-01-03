/**
 * Custom LLM provider for user-defined API endpoints.
 * Supports any OpenAI-compatible API.
 * @module llm/providers/custom
 */

import type { ModelConfig, Message } from '../../types/index.js';
import { LLMCallError, ValidationError } from '../../types/index.js';
import { BaseLLMClient, type LLMResponse, type LLMCallOptions } from '../client.js';

/**
 * OpenAI-compatible API response format.
 */
interface OpenAICompatibleResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Custom provider client for OpenAI-compatible APIs.
 * Requires baseUrl to be specified in config.
 */
export class CustomClient extends BaseLLMClient {
  readonly providerName = 'custom';

  validateConfig(config: ModelConfig): void {
    if (config.provider !== 'custom') {
      throw new ValidationError(
        `Expected provider 'custom', got '${config.provider}'`
      );
    }

    if (!config.model) {
      throw new ValidationError('Model name is required');
    }

    if (!config.baseUrl) {
      throw new ValidationError(
        'Base URL is required for custom provider. Set baseUrl in config.'
      );
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

    // TypeScript knows baseUrl is defined after validateConfig
    const baseUrl = config.baseUrl!;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key if provided
    const apiKey = config.apiKey;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Convert to OpenAI-compatible message format
    const apiMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: apiMessages,
          max_tokens: config.maxTokens,
          temperature: options?.temperature,
          stop: options?.stopSequences,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMCallError(
          `Custom API error: ${response.status} ${errorText}`,
          'custom',
          response.status
        );
      }

      const data = (await response.json()) as OpenAICompatibleResponse;

      const choice = data.choices[0];
      const responseText = choice?.message?.content ?? '';
      const usage = data.usage;

      const result: import('../client.js').LLMResponse = {
        response: responseText,
        tokensUsed: usage?.total_tokens ?? 0,
      };
      if (usage?.prompt_tokens !== undefined) {
        result.inputTokens = usage.prompt_tokens;
      }
      if (usage?.completion_tokens !== undefined) {
        result.outputTokens = usage.completion_tokens;
      }
      return result;
    } catch (error) {
      if (error instanceof LLMCallError) {
        throw error;
      }
      throw new LLMCallError(
        `Custom API call failed: ${error instanceof Error ? error.message : String(error)}`,
        'custom'
      );
    }
  }
}
