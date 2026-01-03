/**
 * Tests for the REPL manager and Python bridge.
 * These tests verify critical fixes from implementation:
 * - Variable persistence across code executions
 * - IPC works during stdout capture (llm_query fix)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { REPLManager } from '../../src/repl/manager.js';

describe('REPLManager', () => {
  let repl: REPLManager;

  beforeEach(() => {
    repl = new REPLManager({ timeout: 10000 });
  });

  afterEach(async () => {
    if (repl.isRunning) {
      await repl.stop();
    }
  });

  describe('basic operations', () => {
    it('should start and stop cleanly', async () => {
      await repl.start('test context', async () => 'mock response');
      expect(repl.isRunning).toBe(true);

      await repl.stop();
      expect(repl.isRunning).toBe(false);
    });

    it('should execute simple code', async () => {
      await repl.start('hello world', async () => 'mock');

      const result = await repl.execute('print(1 + 1)');
      expect(result.output.trim()).toBe('2');
      expect(result.error).toBeNull();
    });

    it('should provide access to context variable', async () => {
      await repl.start('my test context', async () => 'mock');

      const result = await repl.execute('print(context)');
      expect(result.output.trim()).toBe('my test context');
    });
  });

  describe('variable persistence', () => {
    it('should persist variables across code executions', async () => {
      await repl.start('ctx', async () => 'mock');

      // First execution: define a variable
      const result1 = await repl.execute('x = 42');
      expect(result1.error).toBeNull();

      // Second execution: use the variable
      const result2 = await repl.execute('print(x * 2)');
      expect(result2.error).toBeNull();
      expect(result2.output.trim()).toBe('84');
    });

    it('should persist complex data structures', async () => {
      await repl.start('ctx', async () => 'mock');

      await repl.execute('data = {"a": 1, "b": [1, 2, 3]}');
      const result = await repl.execute('print(data["b"][1])');

      expect(result.error).toBeNull();
      expect(result.output.trim()).toBe('2');
    });

    it('should persist imports across executions', async () => {
      await repl.start('ctx', async () => 'mock');

      await repl.execute('import json');
      const result = await repl.execute('print(json.dumps({"x": 1}))');

      expect(result.error).toBeNull();
      expect(result.output.trim()).toBe('{"x": 1}');
    });

    it('should persist function definitions', async () => {
      await repl.start('ctx', async () => 'mock');

      await repl.execute('def double(n): return n * 2');
      const result = await repl.execute('print(double(21))');

      expect(result.error).toBeNull();
      expect(result.output.trim()).toBe('42');
    });
  });

  describe('llm_query IPC', () => {
    it('should call llm_query callback and return result', async () => {
      const responses: string[] = [];
      await repl.start('ctx', async (query) => {
        responses.push(query);
        return `Answer to: ${query}`;
      });

      const result = await repl.execute(`
response = llm_query("What is 2+2?")
print(response)
`);

      expect(result.error).toBeNull();
      expect(responses).toContain('What is 2+2?');
      expect(result.output).toContain('Answer to: What is 2+2?');
    });

    it('should handle multiple llm_query calls in sequence', async () => {
      let callCount = 0;
      await repl.start('ctx', async (query) => {
        callCount++;
        return `Response ${callCount}`;
      });

      const result = await repl.execute(`
r1 = llm_query("first")
r2 = llm_query("second")
print(f"{r1} | {r2}")
`);

      expect(result.error).toBeNull();
      expect(callCount).toBe(2);
      expect(result.output).toContain('Response 1 | Response 2');
    });

    it('should work when called from within a function', async () => {
      await repl.start('ctx', async () => 'sub-answer');

      const result = await repl.execute(`
def ask_llm(q):
    return llm_query(q)

result = ask_llm("test question")
print(result)
`);

      expect(result.error).toBeNull();
      expect(result.output.trim()).toBe('sub-answer');
    });
  });

  describe('context integrity', () => {
    it('should verify unchanged context', async () => {
      await repl.start('original context', async () => 'mock');

      const isIntact = await repl.verifyContextIntegrity();
      expect(isIntact).toBe(true);
    });

    it('should have initial context hash', async () => {
      await repl.start('test', async () => 'mock');

      expect(repl.initialContextHash).toBeDefined();
      expect(repl.initialContextHash).toHaveLength(64); // SHA-256 hex
    });
  });

  describe('error handling', () => {
    it('should capture Python errors', async () => {
      await repl.start('ctx', async () => 'mock');

      const result = await repl.execute('raise ValueError("test error")');

      expect(result.error).not.toBeNull();
      expect(result.error).toContain('ValueError');
      expect(result.error).toContain('test error');
    });

    it('should continue working after an error', async () => {
      await repl.start('ctx', async () => 'mock');

      // Cause an error
      await repl.execute('x = undefined_var');

      // Should still work
      const result = await repl.execute('print("recovered")');
      expect(result.output.trim()).toBe('recovered');
    });
  });
});
