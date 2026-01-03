#!/usr/bin/env node
/**
 * RLM Command Line Interface.
 * @module cli
 */

import { readFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import { Command } from 'commander';
import { RLMEngine } from '../executor/index.js';
import type { RLMConfig, Provider, RLMResult } from '../types/index.js';

// Load .env file
loadEnv();

const program = new Command();

program
  .name('rlm')
  .description('Recursive Language Model CLI - Process long contexts with LLMs')
  .version('0.1.0');

program
  .command('run')
  .description('Run an RLM query against a context')
  .requiredOption('-c, --context <file>', 'Path to context file')
  .requiredOption('-q, --query <string>', 'Query to answer')
  .option(
    '--root-provider <provider>',
    'Root model provider (anthropic, openai, ollama, custom)',
    'anthropic'
  )
  .option(
    '--root-model <model>',
    'Root model name',
    'claude-opus-4-5-20251101'
  )
  .option(
    '--sub-provider <provider>',
    'Sub model provider (anthropic, openai, ollama, custom)',
    'anthropic'
  )
  .option(
    '--sub-model <model>',
    'Sub model name',
    'claude-sonnet-4-5-20250929'
  )
  .option('--max-iterations <n>', 'Maximum iterations', '50')
  .option('--max-retries <n>', 'Maximum retries on error', '3')
  .option('--max-sub-calls <n>', 'Maximum sub-LM calls', '100')
  .option('--root-api-key <key>', 'API key for root model (or use env var)')
  .option('--sub-api-key <key>', 'API key for sub model (or use env var)')
  .option('--root-base-url <url>', 'Base URL for root model')
  .option('--sub-base-url <url>', 'Base URL for sub model')
  .option('--python <path>', 'Python executable path', 'python3')
  .option('--repl-timeout <ms>', 'Timeout for REPL operations in ms', '120000')
  .option(
    '--output <format>',
    'Output format: json, summary, trace',
    'summary'
  )
  .option('--verbose', 'Enable verbose output')
  .action(async (options) => {
    try {
      // Read context file
      const context = await readFile(options.context, 'utf-8');

      if (options.verbose) {
        console.log(`Loaded context: ${context.length} characters`);
      }

      // Build configuration
      const config: RLMConfig = {
        maxIterations: parseInt(options.maxIterations, 10),
        maxRetries: parseInt(options.maxRetries, 10),
        maxSubLMCalls: parseInt(options.maxSubCalls, 10),
        rootModel: {
          provider: options.rootProvider as Provider,
          model: options.rootModel,
          apiKey: options.rootApiKey,
          baseUrl: options.rootBaseUrl,
        },
        subModel: {
          provider: options.subProvider as Provider,
          model: options.subModel,
          apiKey: options.subApiKey,
          baseUrl: options.subBaseUrl,
        },
      };

      // Create engine and run
      const engine = new RLMEngine({
        pythonPath: options.python,
        replTimeout: parseInt(options.replTimeout, 10),
      });

      if (options.verbose) {
        console.log('Starting RLM execution...');
        console.log(`Root model: ${config.rootModel.provider}/${config.rootModel.model}`);
        console.log(`Sub model: ${config.subModel.provider}/${config.subModel.model}`);
      }

      const result = await engine.run({
        context,
        query: options.query,
        config,
      });

      // Output result
      outputResult(result, options.output, options.verbose);

      // Exit with appropriate code
      process.exit(result.status === 'success' ? 0 : 1);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

/**
 * Output the result in the specified format.
 */
function outputResult(
  result: RLMResult,
  format: string,
  verbose: boolean
): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'trace':
      outputTrace(result);
      break;

    case 'summary':
    default:
      outputSummary(result, verbose);
      break;
  }
}

/**
 * Output a summary of the result.
 */
function outputSummary(result: RLMResult, verbose: boolean): void {
  console.log('\n' + '='.repeat(60));
  console.log('RLM RESULT');
  console.log('='.repeat(60));

  console.log(`\nStatus: ${result.status.toUpperCase()}`);

  if (result.status === 'success') {
    console.log(`\nAnswer (via ${result.answerSource}):`);
    console.log(result.answer);
  } else if (result.status === 'error') {
    console.log(`\nError Type: ${result.errorType}`);
    console.log(`Error: ${result.error}`);
  } else if (result.status === 'max_iterations') {
    console.log('\nMax iterations reached without finding answer.');
    if (verbose && Object.keys(result.partialState).length > 0) {
      console.log('\nPartial state:');
      console.log(JSON.stringify(result.partialState, null, 2));
    }
  } else if (result.status === 'max_sub_lm_calls') {
    console.log('\nMax sub-LM calls reached.');
    if (verbose && Object.keys(result.partialState).length > 0) {
      console.log('\nPartial state:');
      console.log(JSON.stringify(result.partialState, null, 2));
    }
  }

  // Trace summary
  const { trace } = result;
  console.log('\n' + '-'.repeat(40));
  console.log('Execution Summary:');
  console.log(`  Iterations: ${trace.totalIterations}`);
  console.log(`  Sub-LM calls: ${trace.totalSubLMCalls}`);
  console.log(`  Total tokens: ${trace.totalTokens}`);
  console.log(`  Duration: ${trace.endTime - trace.startTime}ms`);
  console.log(`  Steps: ${trace.steps.length}`);

  if (verbose) {
    const llmCalls = trace.steps.filter((s) => s.type === 'llm_call').length;
    const codeExecs = trace.steps.filter((s) => s.type === 'code_execution').length;
    const subCalls = trace.steps.filter((s) => s.type === 'sub_lm_call').length;
    console.log(`    - LLM calls: ${llmCalls}`);
    console.log(`    - Code executions: ${codeExecs}`);
    console.log(`    - Sub-LM calls: ${subCalls}`);
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Output the full execution trace.
 */
function outputTrace(result: RLMResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('EXECUTION TRACE');
  console.log('='.repeat(60));

  for (let i = 0; i < result.trace.steps.length; i++) {
    const step = result.trace.steps[i];
    if (!step) continue;

    console.log(`\n--- Step ${i + 1}: ${step.type} ---`);

    switch (step.type) {
      case 'llm_call':
        console.log(`Model: ${step.model}`);
        console.log(`Tokens: ${step.tokensUsed}`);
        console.log('\nPrompt (truncated):');
        console.log(truncate(step.prompt, 500));
        console.log('\nResponse (truncated):');
        console.log(truncate(step.response, 500));
        break;

      case 'code_execution':
        console.log(`Execution time: ${step.executionTimeMs.toFixed(2)}ms`);
        console.log('\nCode:');
        console.log(step.code);
        console.log('\nOutput:');
        console.log(step.output || '(no output)');
        if (step.error) {
          console.log('\nError:');
          console.log(step.error);
        }
        break;

      case 'sub_lm_call':
        console.log(`Tokens: ${step.tokensUsed}`);
        console.log('\nQuery (truncated):');
        console.log(truncate(step.query, 300));
        console.log('\nResponse (truncated):');
        console.log(truncate(step.response, 300));
        break;
    }
  }

  console.log('\n' + '='.repeat(60));
  outputSummary(result, true);
}

/**
 * Truncate a string to a maximum length.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '... [truncated]';
}

// Parse command line arguments
program.parse();
