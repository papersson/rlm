/**
 * LLM provider factory.
 * Creates appropriate LLM client based on provider type.
 * @module llm/factory
 */

import type { Provider } from '../types/index.js';
import type { LLMClient } from './client.js';
import { AnthropicClient } from './providers/anthropic.js';
import { OpenAIClient } from './providers/openai.js';
import { OllamaClient } from './providers/ollama.js';
import { CustomClient } from './providers/custom.js';

/**
 * Cache of instantiated clients by provider.
 * Clients are reused to avoid creating multiple instances.
 */
const clientCache = new Map<Provider, LLMClient>();

/**
 * Create an LLM client for the specified provider.
 * Clients are cached and reused for efficiency.
 *
 * @param provider - The LLM provider to use
 * @returns An LLMClient instance for the provider
 *
 * @example
 * ```typescript
 * const client = createLLMClient('anthropic');
 * const response = await client.call('Hello!', config);
 * ```
 */
export function createLLMClient(provider: Provider): LLMClient {
  // Return cached client if available
  const cached = clientCache.get(provider);
  if (cached) {
    return cached;
  }

  // Create new client based on provider
  let client: LLMClient;
  switch (provider) {
    case 'anthropic':
      client = new AnthropicClient();
      break;
    case 'openai':
      client = new OpenAIClient();
      break;
    case 'ollama':
      client = new OllamaClient();
      break;
    case 'custom':
      client = new CustomClient();
      break;
    default: {
      // Exhaustive check
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }

  // Cache and return
  clientCache.set(provider, client);
  return client;
}

/**
 * Clear the client cache.
 * Useful for testing or when you need to recreate clients.
 */
export function clearClientCache(): void {
  clientCache.clear();
}
