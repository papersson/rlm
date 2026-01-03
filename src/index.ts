/**
 * RLM - Recursive Language Model Framework
 *
 * A TypeScript framework for processing long contexts by treating prompts
 * as external environment variables that an LLM can programmatically examine,
 * decompose, and recursively process via sub-LM calls.
 *
 * @packageDocumentation
 * @module rlm
 */

// Types
export * from './types/index.js';

// LLM Client
export * from './llm/index.js';

// REPL
export * from './repl/index.js';

// Executor
export * from './executor/index.js';

// Prompts
export * from './prompts/index.js';
