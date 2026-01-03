/**
 * Tests for the trace recorder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TraceRecorder } from '../../src/executor/trace.js';

describe('TraceRecorder', () => {
  let trace: TraceRecorder;

  beforeEach(() => {
    trace = new TraceRecorder();
  });

  describe('initialization', () => {
    it('should start with empty steps', () => {
      expect(trace.stepCount).toBe(0);
      expect(trace.iterations).toBe(0);
    });

    it('should record start time', () => {
      const finalized = trace.finalize();
      expect(finalized.startTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('recordLLMCall', () => {
    it('should record an LLM call step', () => {
      trace.recordLLMCall({
        model: 'claude-3-opus',
        prompt: 'Hello',
        response: 'Hi there!',
        tokensUsed: 100,
      });

      expect(trace.stepCount).toBe(1);
      expect(trace.iterations).toBe(1);
    });

    it('should increment iteration count', () => {
      trace.recordLLMCall({
        model: 'test',
        prompt: 'p1',
        response: 'r1',
        tokensUsed: 50,
      });
      trace.recordLLMCall({
        model: 'test',
        prompt: 'p2',
        response: 'r2',
        tokensUsed: 50,
      });

      expect(trace.iterations).toBe(2);
    });
  });

  describe('recordCodeExecution', () => {
    it('should record a code execution step', () => {
      trace.recordCodeExecution({
        code: 'print(1)',
        output: '1\n',
        error: null,
        variablesAfter: { x: 1 },
        executionTimeMs: 10,
      });

      expect(trace.stepCount).toBe(1);
      expect(trace.iterations).toBe(0); // Code execution doesn't count as iteration
    });

    it('should record errors', () => {
      trace.recordCodeExecution({
        code: 'raise Exception("test")',
        output: '',
        error: 'Exception: test',
        variablesAfter: {},
        executionTimeMs: 5,
      });

      expect(trace.hasExecutionErrors()).toBe(true);
      const errors = trace.getExecutionErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.error).toBe('Exception: test');
    });
  });

  describe('recordSubLMCall', () => {
    it('should record a sub-LM call step', () => {
      trace.recordSubLMCall({
        query: 'What is 2+2?',
        response: '4',
        tokensUsed: 20,
      });

      expect(trace.stepCount).toBe(1);
      expect(trace.countSubLMCalls()).toBe(1);
    });
  });

  describe('calculateTotalTokens', () => {
    it('should sum tokens from LLM calls and sub-calls', () => {
      trace.recordLLMCall({
        model: 'test',
        prompt: 'p',
        response: 'r',
        tokensUsed: 100,
      });
      trace.recordSubLMCall({
        query: 'q',
        response: 'r',
        tokensUsed: 50,
      });
      trace.recordCodeExecution({
        code: 'x',
        output: '',
        error: null,
        variablesAfter: {},
        executionTimeMs: 1,
      });

      expect(trace.calculateTotalTokens()).toBe(150);
    });
  });

  describe('getStepsByType', () => {
    it('should filter steps by type', () => {
      trace.recordLLMCall({
        model: 'test',
        prompt: 'p',
        response: 'r',
        tokensUsed: 100,
      });
      trace.recordCodeExecution({
        code: 'x',
        output: '',
        error: null,
        variablesAfter: {},
        executionTimeMs: 1,
      });
      trace.recordSubLMCall({
        query: 'q',
        response: 'r',
        tokensUsed: 50,
      });

      expect(trace.getStepsByType('llm_call')).toHaveLength(1);
      expect(trace.getStepsByType('code_execution')).toHaveLength(1);
      expect(trace.getStepsByType('sub_lm_call')).toHaveLength(1);
    });
  });

  describe('getLastLLMCall', () => {
    it('should return the most recent LLM call', () => {
      trace.recordLLMCall({
        model: 'first',
        prompt: 'p1',
        response: 'r1',
        tokensUsed: 50,
      });
      trace.recordCodeExecution({
        code: 'x',
        output: '',
        error: null,
        variablesAfter: {},
        executionTimeMs: 1,
      });
      trace.recordLLMCall({
        model: 'second',
        prompt: 'p2',
        response: 'r2',
        tokensUsed: 50,
      });

      const last = trace.getLastLLMCall();
      expect(last?.model).toBe('second');
    });

    it('should return undefined if no LLM calls', () => {
      trace.recordCodeExecution({
        code: 'x',
        output: '',
        error: null,
        variablesAfter: {},
        executionTimeMs: 1,
      });

      expect(trace.getLastLLMCall()).toBeUndefined();
    });
  });

  describe('finalize', () => {
    it('should produce a complete execution trace', () => {
      trace.recordLLMCall({
        model: 'test',
        prompt: 'p',
        response: 'r',
        tokensUsed: 100,
      });
      trace.recordSubLMCall({
        query: 'q',
        response: 'r',
        tokensUsed: 50,
      });

      const finalized = trace.finalize();

      expect(finalized.steps).toHaveLength(2);
      expect(finalized.totalTokens).toBe(150);
      expect(finalized.totalSubLMCalls).toBe(1);
      expect(finalized.totalIterations).toBe(1);
      expect(finalized.startTime).toBeLessThanOrEqual(finalized.endTime);
    });

    it('should create a copy of steps', () => {
      trace.recordLLMCall({
        model: 'test',
        prompt: 'p',
        response: 'r',
        tokensUsed: 100,
      });

      const finalized = trace.finalize();
      const originalSteps = trace.getSteps();

      // Modifying finalized shouldn't affect original
      expect(finalized.steps).not.toBe(originalSteps);
    });
  });
});
