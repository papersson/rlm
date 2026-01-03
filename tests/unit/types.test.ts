/**
 * Tests for types and schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  // Branded types
  positiveInt,
  nonEmptyString,
  timestamp,
  sha256Hash,
  isPositiveInt,
  isNonEmptyString,
  // Schemas
  ModelConfigSchema,
  RLMConfigSchema,
  ExecutionStepSchema,
  RLMResultSchema,
  RLMInputSchema,
} from '../../src/types/index.js';

describe('Branded Types', () => {
  describe('positiveInt', () => {
    it('should create a positive integer', () => {
      const n = positiveInt(5);
      expect(n).toBe(5);
    });

    it('should throw for zero', () => {
      expect(() => positiveInt(0)).toThrow('Expected positive integer');
    });

    it('should throw for negative numbers', () => {
      expect(() => positiveInt(-1)).toThrow('Expected positive integer');
    });

    it('should throw for non-integers', () => {
      expect(() => positiveInt(1.5)).toThrow('Expected positive integer');
    });
  });

  describe('nonEmptyString', () => {
    it('should create a non-empty string', () => {
      const s = nonEmptyString('hello');
      expect(s).toBe('hello');
    });

    it('should throw for empty string', () => {
      expect(() => nonEmptyString('')).toThrow('Expected non-empty string');
    });
  });

  describe('timestamp', () => {
    it('should create a timestamp', () => {
      const t = timestamp(Date.now());
      expect(t).toBeGreaterThan(0);
    });

    it('should throw for negative values', () => {
      expect(() => timestamp(-1)).toThrow('Expected non-negative timestamp');
    });
  });

  describe('sha256Hash', () => {
    it('should create a valid hash', () => {
      const hash = sha256Hash('a'.repeat(64));
      expect(hash).toHaveLength(64);
    });

    it('should throw for invalid length', () => {
      expect(() => sha256Hash('abc')).toThrow('Expected SHA-256 hash');
    });

    it('should throw for invalid characters', () => {
      expect(() => sha256Hash('g'.repeat(64))).toThrow('Expected SHA-256 hash');
    });
  });

  describe('type guards', () => {
    it('isPositiveInt should work', () => {
      expect(isPositiveInt(5)).toBe(true);
      expect(isPositiveInt(0)).toBe(false);
      expect(isPositiveInt(-1)).toBe(false);
    });

    it('isNonEmptyString should work', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('')).toBe(false);
    });
  });
});

describe('Zod Schemas', () => {
  describe('ModelConfigSchema', () => {
    it('should validate a valid config', () => {
      const config = {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
      };
      const result = ModelConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const config = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com',
        maxTokens: 4096,
      };
      const result = ModelConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid provider', () => {
      const config = {
        provider: 'invalid',
        model: 'test',
      };
      const result = ModelConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject empty model', () => {
      const config = {
        provider: 'anthropic',
        model: '',
      };
      const result = ModelConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('RLMConfigSchema', () => {
    it('should apply defaults', () => {
      const config = {
        rootModel: { provider: 'anthropic', model: 'claude-3-opus-20240229' },
        subModel: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      };
      const result = RLMConfigSchema.parse(config);
      expect(result.maxIterations).toBe(50);
      expect(result.maxRetries).toBe(3);
      expect(result.maxSubLMCalls).toBe(100);
    });

    it('should allow overriding defaults', () => {
      const config = {
        maxIterations: 10,
        maxRetries: 5,
        maxSubLMCalls: 50,
        rootModel: { provider: 'anthropic', model: 'claude-3-opus-20240229' },
        subModel: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      };
      const result = RLMConfigSchema.parse(config);
      expect(result.maxIterations).toBe(10);
      expect(result.maxRetries).toBe(5);
      expect(result.maxSubLMCalls).toBe(50);
    });
  });

  describe('ExecutionStepSchema', () => {
    it('should parse llm_call step', () => {
      const step = {
        type: 'llm_call',
        model: 'claude-3-opus-20240229',
        prompt: 'Hello',
        response: 'Hi there!',
        tokensUsed: 100,
        timestamp: Date.now(),
      };
      const result = ExecutionStepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });

    it('should parse code_execution step', () => {
      const step = {
        type: 'code_execution',
        code: 'print("hello")',
        output: 'hello\n',
        error: null,
        variablesAfter: { x: 1 },
        executionTimeMs: 50,
        timestamp: Date.now(),
      };
      const result = ExecutionStepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });

    it('should parse sub_lm_call step', () => {
      const step = {
        type: 'sub_lm_call',
        query: 'What is 2+2?',
        response: '4',
        tokensUsed: 20,
        timestamp: Date.now(),
      };
      const result = ExecutionStepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });
  });

  describe('RLMResultSchema', () => {
    it('should parse success result', () => {
      const result = {
        status: 'success',
        answer: 'The answer is 42',
        answerSource: 'FINAL',
        trace: {
          steps: [],
          totalTokens: 100,
          totalSubLMCalls: 5,
          totalIterations: 3,
          startTime: Date.now(),
          endTime: Date.now() + 1000,
        },
      };
      const parsed = RLMResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('should parse error result', () => {
      const result = {
        status: 'error',
        error: 'Something went wrong',
        errorType: 'llm_call',
        trace: {
          steps: [],
          totalTokens: 0,
          totalSubLMCalls: 0,
          totalIterations: 0,
          startTime: Date.now(),
          endTime: Date.now(),
        },
      };
      const parsed = RLMResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('should parse max_iterations result', () => {
      const result = {
        status: 'max_iterations',
        partialState: { context: 'test' },
        trace: {
          steps: [],
          totalTokens: 5000,
          totalSubLMCalls: 50,
          totalIterations: 50,
          startTime: Date.now(),
          endTime: Date.now() + 60000,
        },
      };
      const parsed = RLMResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('RLMInputSchema', () => {
    it('should validate complete input', () => {
      const input = {
        context: 'Some long context...',
        query: 'What is this about?',
        config: {
          rootModel: { provider: 'anthropic', model: 'claude-3-opus-20240229' },
          subModel: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
        },
      };
      const result = RLMInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty context', () => {
      const input = {
        context: '',
        query: 'What?',
        config: {
          rootModel: { provider: 'anthropic', model: 'test' },
          subModel: { provider: 'anthropic', model: 'test' },
        },
      };
      const result = RLMInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty query', () => {
      const input = {
        context: 'Some context',
        query: '',
        config: {
          rootModel: { provider: 'anthropic', model: 'test' },
          subModel: { provider: 'anthropic', model: 'test' },
        },
      };
      const result = RLMInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
