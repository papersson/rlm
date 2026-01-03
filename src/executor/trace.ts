/**
 * Execution trace recorder.
 * Records all execution steps for transparency and debugging.
 * @module executor/trace
 */

import type {
  ExecutionStep,
  ExecutionTrace,
  LLMCallStep,
  CodeExecutionStep,
  SubLMCallStep,
} from '../types/index.js';
import { now, type Timestamp } from '../types/index.js';

/**
 * Input for recording an LLM call step (without auto-generated fields).
 */
export type LLMCallInput = Omit<LLMCallStep, 'type' | 'timestamp'>;

/**
 * Input for recording a code execution step (without auto-generated fields).
 */
export type CodeExecutionInput = Omit<CodeExecutionStep, 'type' | 'timestamp'>;

/**
 * Input for recording a sub-LM call step (without auto-generated fields).
 */
export type SubLMCallInput = Omit<SubLMCallStep, 'type' | 'timestamp'>;

/**
 * Records execution steps and produces a complete trace.
 * All state changes are recorded for transparency (requirement P1).
 */
export class TraceRecorder {
  private readonly steps: ExecutionStep[] = [];
  private readonly startTime: Timestamp;
  private iterationCount = 0;

  constructor() {
    this.startTime = now();
  }

  /**
   * Get the current number of recorded steps.
   */
  get stepCount(): number {
    return this.steps.length;
  }

  /**
   * Get the current iteration count.
   */
  get iterations(): number {
    return this.iterationCount;
  }

  /**
   * Record a root LLM call.
   * This also increments the iteration counter.
   *
   * @param input - LLM call details
   */
  recordLLMCall(input: LLMCallInput): void {
    const step: LLMCallStep = {
      type: 'llm_call',
      ...input,
      timestamp: now(),
    };
    this.steps.push(step);
    this.iterationCount++;
  }

  /**
   * Record a code execution step.
   *
   * @param input - Code execution details
   */
  recordCodeExecution(input: CodeExecutionInput): void {
    const step: CodeExecutionStep = {
      type: 'code_execution',
      ...input,
      timestamp: now(),
    };
    this.steps.push(step);
  }

  /**
   * Record a sub-LM call step.
   *
   * @param input - Sub-LM call details
   */
  recordSubLMCall(input: SubLMCallInput): void {
    const step: SubLMCallStep = {
      type: 'sub_lm_call',
      ...input,
      timestamp: now(),
    };
    this.steps.push(step);
  }

  /**
   * Get all recorded steps.
   */
  getSteps(): readonly ExecutionStep[] {
    return this.steps;
  }

  /**
   * Calculate total tokens used across all LLM calls and sub-calls.
   */
  calculateTotalTokens(): number {
    return this.steps.reduce((total, step) => {
      if (step.type === 'llm_call' || step.type === 'sub_lm_call') {
        return total + step.tokensUsed;
      }
      return total;
    }, 0);
  }

  /**
   * Count total sub-LM calls.
   */
  countSubLMCalls(): number {
    return this.steps.filter((step) => step.type === 'sub_lm_call').length;
  }

  /**
   * Finalize the trace and produce the complete ExecutionTrace.
   *
   * @returns Complete execution trace
   */
  finalize(): ExecutionTrace {
    return {
      steps: [...this.steps],
      totalTokens: this.calculateTotalTokens(),
      totalSubLMCalls: this.countSubLMCalls(),
      totalIterations: this.iterationCount,
      startTime: this.startTime,
      endTime: now(),
    };
  }

  /**
   * Get the last LLM call step.
   */
  getLastLLMCall(): LLMCallStep | undefined {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i];
      if (step?.type === 'llm_call') {
        return step;
      }
    }
    return undefined;
  }

  /**
   * Get the last code execution step.
   */
  getLastCodeExecution(): CodeExecutionStep | undefined {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i];
      if (step?.type === 'code_execution') {
        return step;
      }
    }
    return undefined;
  }

  /**
   * Get all steps of a specific type.
   */
  getStepsByType<T extends ExecutionStep['type']>(
    type: T
  ): Extract<ExecutionStep, { type: T }>[] {
    return this.steps.filter(
      (step): step is Extract<ExecutionStep, { type: T }> => step.type === type
    );
  }

  /**
   * Check if there were any code execution errors.
   */
  hasExecutionErrors(): boolean {
    return this.steps.some(
      (step) => step.type === 'code_execution' && step.error !== null
    );
  }

  /**
   * Get all code execution errors.
   */
  getExecutionErrors(): Array<{ code: string; error: string }> {
    return this.steps
      .filter(
        (step): step is CodeExecutionStep =>
          step.type === 'code_execution' && step.error !== null
      )
      .map((step) => ({
        code: step.code,
        error: step.error!,
      }));
  }
}
