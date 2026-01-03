/**
 * LLM Client interface and types.
 * Defines the contract for all LLM provider implementations.
 * @module llm/client
 */

import type { ModelConfig, Message } from '../types/index.js';

/**
 * Response from an LLM call.
 */
export interface LLMResponse {
  /** The generated text response */
  response: string;
  /** Total tokens used (input + output) */
  tokensUsed: number;
  /** Input tokens (if available) */
  inputTokens?: number;
  /** Output tokens (if available) */
  outputTokens?: number;
}

/**
 * Options for an LLM call.
 */
export interface LLMCallOptions {
  /** System prompt (prepended to conversation) */
  systemPrompt?: string;
  /** Conversation history */
  messages?: Message[];
  /** Temperature for sampling (0-1) */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Abstract interface for LLM clients.
 * All provider implementations must implement this interface.
 */
export interface LLMClient {
  /**
   * Make a call to the LLM.
   * @param prompt - The user prompt to send
   * @param config - Model configuration
   * @param options - Additional call options
   * @returns Response with generated text and token counts
   * @throws LLMCallError on API errors
   */
  call(
    prompt: string,
    config: ModelConfig,
    options?: LLMCallOptions
  ): Promise<LLMResponse>;

  /**
   * Make a call with full conversation history.
   * @param messages - Full conversation including system, user, and assistant messages
   * @param config - Model configuration
   * @param options - Additional call options
   * @returns Response with generated text and token counts
   * @throws LLMCallError on API errors
   */
  chat(
    messages: Message[],
    config: ModelConfig,
    options?: Omit<LLMCallOptions, 'messages'>
  ): Promise<LLMResponse>;

  /**
   * Validate that the configuration is valid for this provider.
   * @param config - Model configuration to validate
   * @throws ValidationError if config is invalid
   */
  validateConfig(config: ModelConfig): void;

  /**
   * Get the provider name for this client.
   */
  readonly providerName: string;
}

/**
 * Base class for LLM clients with common functionality.
 */
export abstract class BaseLLMClient implements LLMClient {
  abstract readonly providerName: string;

  abstract call(
    prompt: string,
    config: ModelConfig,
    options?: LLMCallOptions
  ): Promise<LLMResponse>;

  abstract chat(
    messages: Message[],
    config: ModelConfig,
    options?: Omit<LLMCallOptions, 'messages'>
  ): Promise<LLMResponse>;

  abstract validateConfig(config: ModelConfig): void;

  /**
   * Get API key from config or environment.
   * @param config - Model configuration
   * @param envVar - Environment variable name
   * @returns API key or undefined
   */
  protected getApiKey(config: ModelConfig, envVar: string): string | undefined {
    return config.apiKey ?? process.env[envVar];
  }

  /**
   * Build messages array from prompt and options.
   */
  protected buildMessages(
    prompt: string,
    options?: LLMCallOptions
  ): Message[] {
    const messages: Message[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    if (options?.messages) {
      messages.push(...options.messages);
    }

    messages.push({ role: 'user', content: prompt });

    return messages;
  }
}
