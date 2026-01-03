/**
 * REPL Manager for Python subprocess.
 * Handles spawning, communication, and lifecycle of the Python REPL.
 * @module repl/manager
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import type { Sha256Hash } from '../types/index.js';
import {
  REPLError,
  ContextIntegrityError,
  TimeoutError,
} from '../types/index.js';
import { sha256Hash } from '../types/branded.js';
import { PYTHON_BRIDGE_SCRIPT } from './bridge.js';
import type {
  REPLRequest,
  REPLResponse,
  ExecutionResultResponse,
} from './protocol.js';
import { isLLMQueryRequest, isErrorResponse } from './protocol.js';

/**
 * Result of code execution in the REPL.
 */
export interface ExecutionResult {
  /** Captured stdout output */
  output: string;
  /** Error message if execution failed, null otherwise */
  error: string | null;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Current state of REPL variables */
  variables: Record<string, unknown>;
}

/**
 * Callback type for handling sub-LM queries from Python.
 */
export type SubLMQueryCallback = (query: string) => Promise<string>;

/**
 * Configuration for the REPL manager.
 */
export interface REPLManagerConfig {
  /** Python executable path (default: 'python3') */
  pythonPath?: string;
  /** Timeout for operations in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Manages the Python REPL subprocess.
 * Provides methods to execute code, get variables, and verify context integrity.
 */
export class REPLManager {
  private process: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private tempDir: string | null = null;
  private scriptPath: string | null = null;
  private contextHash: Sha256Hash | null = null;
  private onSubLMQuery: SubLMQueryCallback | null = null;
  private pendingResponse: {
    resolve: (response: REPLResponse) => void;
    reject: (error: Error) => void;
  } | null = null;

  private readonly pythonPath: string;
  private readonly timeout: number;

  constructor(config: REPLManagerConfig = {}) {
    this.pythonPath = config.pythonPath ?? 'python3';
    this.timeout = config.timeout ?? 60000;
  }

  /**
   * Check if the REPL is currently running.
   */
  get isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * Get the initial context hash.
   */
  get initialContextHash(): Sha256Hash | null {
    return this.contextHash;
  }

  /**
   * Start the REPL with the given context.
   *
   * @param context - The context string to load as the `context` variable
   * @param onSubLMQuery - Callback invoked when Python calls llm_query()
   * @throws REPLError if startup fails
   */
  async start(context: string, onSubLMQuery: SubLMQueryCallback): Promise<void> {
    if (this.isRunning) {
      throw new REPLError('REPL is already running');
    }

    this.onSubLMQuery = onSubLMQuery;

    // Write Python bridge script to temp file
    this.tempDir = await mkdtemp(join(tmpdir(), 'rlm-'));
    this.scriptPath = join(this.tempDir, 'bridge.py');
    await writeFile(this.scriptPath, PYTHON_BRIDGE_SCRIPT, 'utf-8');

    // Spawn Python process
    this.process = spawn(this.pythonPath, [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Set up readline for reading responses
    this.readline = createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity,
    });

    // Handle process errors
    this.process.on('error', (error) => {
      this.handleProcessError(error);
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        this.handleProcessError(
          new Error(`Python process exited with code ${code}, signal ${signal}`)
        );
      }
    });

    // Handle stderr
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[Python stderr]', data.toString());
    });

    // Start listening for responses
    this.startResponseListener();

    // Initialize with context
    const response = await this.sendAndWait({
      type: 'init',
      context,
    });

    if (response.type !== 'init_complete') {
      throw new REPLError(`Unexpected init response: ${response.type}`);
    }

    this.contextHash = sha256Hash(response.contextHash);
  }

  /**
   * Execute Python code in the REPL.
   *
   * @param code - Python code to execute
   * @returns Execution result with output, error, and variables
   * @throws REPLError if REPL is not running
   * @throws TimeoutError if execution times out
   */
  async execute(code: string): Promise<ExecutionResult> {
    if (!this.isRunning) {
      throw new REPLError('REPL is not running');
    }

    const response = await this.sendAndWait({ type: 'execute', code });

    if (response.type !== 'result') {
      throw new REPLError(`Unexpected execute response: ${response.type}`);
    }

    return {
      output: response.output,
      error: response.error,
      executionTimeMs: response.timeMs,
      variables: response.variables,
    };
  }

  /**
   * Get the current REPL variables.
   *
   * @returns Current variable state
   * @throws REPLError if REPL is not running
   */
  async getVariables(): Promise<Record<string, unknown>> {
    if (!this.isRunning) {
      throw new REPLError('REPL is not running');
    }

    const response = await this.sendAndWait({ type: 'get_variables' });

    if (response.type !== 'variables') {
      throw new REPLError(`Unexpected variables response: ${response.type}`);
    }

    return response.data;
  }

  /**
   * Verify that the context has not been modified.
   *
   * @returns true if context is intact, false otherwise
   * @throws REPLError if REPL is not running
   */
  async verifyContextIntegrity(): Promise<boolean> {
    if (!this.isRunning || !this.contextHash) {
      throw new REPLError('REPL is not running');
    }

    const response = await this.sendAndWait({ type: 'get_context_hash' });

    if (response.type !== 'context_hash') {
      throw new REPLError(`Unexpected hash response: ${response.type}`);
    }

    return response.hash === this.contextHash;
  }

  /**
   * Assert that context integrity is maintained.
   *
   * @throws ContextIntegrityError if context has been modified
   * @throws REPLError if REPL is not running
   */
  async assertContextIntegrity(): Promise<void> {
    if (!this.isRunning || !this.contextHash) {
      throw new REPLError('REPL is not running');
    }

    const response = await this.sendAndWait({ type: 'get_context_hash' });

    if (response.type !== 'context_hash') {
      throw new REPLError(`Unexpected hash response: ${response.type}`);
    }

    if (response.hash !== this.contextHash) {
      throw new ContextIntegrityError(this.contextHash, response.hash);
    }
  }

  /**
   * Stop the REPL process gracefully.
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      // Send shutdown request
      this.sendMessage({ type: 'shutdown' });

      // Wait for graceful shutdown with timeout
      await Promise.race([
        new Promise<void>((resolve) => {
          this.process?.once('exit', () => resolve());
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Shutdown timeout')), 5000);
        }),
      ]);
    } catch {
      // Force kill if graceful shutdown fails
      this.process.kill('SIGKILL');
    }

    // Cleanup
    this.cleanup();
  }

  /**
   * Send a message to the Python process.
   */
  private sendMessage(request: REPLRequest): void {
    if (!this.process?.stdin?.writable) {
      throw new REPLError('Cannot send message: stdin not writable');
    }

    this.process.stdin.write(JSON.stringify(request) + '\n');
  }

  /**
   * Send a message and wait for a response.
   */
  private async sendAndWait(request: REPLRequest): Promise<REPLResponse> {
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        this.pendingResponse = null;
        reject(new TimeoutError('REPL operation timed out', this.timeout, request.type));
      }, this.timeout);

      // Store pending response handlers
      this.pendingResponse = {
        resolve: (response) => {
          clearTimeout(timeoutId);
          this.pendingResponse = null;
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.pendingResponse = null;
          reject(error);
        },
      };

      // Send the message
      try {
        this.sendMessage(request);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingResponse = null;
        reject(error);
      }
    });
  }

  /**
   * Start listening for responses from the Python process.
   */
  private startResponseListener(): void {
    if (!this.readline) return;

    this.readline.on('line', async (line) => {
      try {
        const response = JSON.parse(line) as REPLResponse;

        // Handle llm_query requests from Python
        if (isLLMQueryRequest(response)) {
          await this.handleLLMQuery(response.id, response.query);
          return;
        }

        // Handle errors
        if (isErrorResponse(response)) {
          if (this.pendingResponse) {
            this.pendingResponse.reject(new REPLError(response.message));
          }
          return;
        }

        // Resolve pending response
        if (this.pendingResponse) {
          this.pendingResponse.resolve(response);
        }
      } catch (error) {
        console.error('[REPL] Failed to parse response:', line, error);
        if (this.pendingResponse) {
          this.pendingResponse.reject(
            new REPLError(`Failed to parse response: ${line}`)
          );
        }
      }
    });
  }

  /**
   * Handle an llm_query request from Python.
   */
  private async handleLLMQuery(id: string, query: string): Promise<void> {
    if (!this.onSubLMQuery) {
      this.sendMessage({
        type: 'llm_response',
        id,
        response: 'Error: No llm_query callback configured',
      });
      return;
    }

    try {
      const response = await this.onSubLMQuery(query);
      this.sendMessage({
        type: 'llm_response',
        id,
        response,
      });
    } catch (error) {
      this.sendMessage({
        type: 'llm_response',
        id,
        response: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * Handle process errors.
   */
  private handleProcessError(error: Error): void {
    if (this.pendingResponse) {
      this.pendingResponse.reject(new REPLError(`Process error: ${error.message}`));
    }
    this.cleanup();
  }

  /**
   * Cleanup resources.
   */
  private async cleanup(): Promise<void> {
    this.readline?.close();
    this.readline = null;
    this.process = null;
    this.pendingResponse = null;
    this.onSubLMQuery = null;

    // Remove temp files
    if (this.scriptPath) {
      try {
        await unlink(this.scriptPath);
      } catch {
        // Ignore cleanup errors
      }
      this.scriptPath = null;
    }

    if (this.tempDir) {
      try {
        await unlink(this.tempDir);
      } catch {
        // Ignore cleanup errors
      }
      this.tempDir = null;
    }
  }
}

/**
 * Compute SHA-256 hash of a string.
 * Utility function for context integrity verification.
 */
export function computeSha256(content: string): Sha256Hash {
  const hash = createHash('sha256').update(content).digest('hex');
  return sha256Hash(hash);
}
