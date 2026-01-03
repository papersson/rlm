/**
 * LLM client module.
 * Provides provider-agnostic LLM access with support for
 * Anthropic, OpenAI, Ollama, and custom providers.
 * @module llm
 */

// Client interface and base class
export {
  type LLMResponse,
  type LLMCallOptions,
  type LLMClient,
  BaseLLMClient,
} from './client.js';

// Provider implementations
export { AnthropicClient } from './providers/anthropic.js';
export { OpenAIClient } from './providers/openai.js';
export { OllamaClient } from './providers/ollama.js';
export { CustomClient } from './providers/custom.js';

// Factory
export { createLLMClient, clearClientCache } from './factory.js';
