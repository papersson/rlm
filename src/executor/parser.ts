/**
 * Response parser for LLM outputs.
 * Extracts code blocks and termination signals from LLM responses.
 * @module executor/parser
 */

/**
 * A code block extracted from the LLM response.
 */
export interface CodeBlock {
  /** The code content (without fences) */
  code: string;
  /** The language identifier (e.g., 'repl', 'python') */
  language: string;
}

/**
 * A final answer termination signal.
 */
export interface FinalAnswer {
  /** The type of termination */
  type: 'FINAL' | 'FINAL_VAR';
  /** The answer value (for FINAL) or variable name (for FINAL_VAR) */
  value: string;
}

/**
 * Parsed result from an LLM response.
 */
export interface ParsedResponse {
  /** Extracted code blocks */
  codeBlocks: CodeBlock[];
  /** Final answer if present */
  finalAnswer: FinalAnswer | null;
  /** The original response text */
  text: string;
}

/**
 * Regular expression for matching fenced code blocks.
 * Matches ```language\ncode\n``` pattern.
 */
const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

/**
 * Regular expression for FINAL(answer) pattern.
 * Handles nested parentheses by matching balanced content.
 */
const FINAL_REGEX = /FINAL\(([^)]+(?:\([^)]*\)[^)]*)*)\)/;

/**
 * Regular expression for FINAL_VAR(variable_name) pattern.
 * Variable names must be valid Python identifiers.
 */
const FINAL_VAR_REGEX = /FINAL_VAR\((\w+)\)/;

/**
 * Parse an LLM response to extract code blocks and termination signals.
 *
 * @param response - The LLM response text
 * @returns Parsed response with code blocks and final answer
 *
 * @example
 * ```typescript
 * const result = parseResponse(`
 * Let me check the context.
 * \`\`\`repl
 * print(len(context))
 * \`\`\`
 * `);
 * // result.codeBlocks = [{ code: 'print(len(context))', language: 'repl' }]
 * // result.finalAnswer = null
 * ```
 */
export function parseResponse(response: string): ParsedResponse {
  const codeBlocks: CodeBlock[] = [];
  let finalAnswer: FinalAnswer | null = null;

  // Extract code blocks
  let match: RegExpExecArray | null;
  const codeBlockRegex = new RegExp(CODE_BLOCK_REGEX.source, 'g');

  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] ?? '';
    const code = match[2] ?? '';

    // Only include repl or python blocks (or unmarked blocks)
    if (language === '' || language === 'repl' || language === 'python') {
      codeBlocks.push({
        code: code.trim(),
        language: language || 'repl',
      });
    }
  }

  // Check for FINAL_VAR first (more specific pattern)
  const finalVarMatch = FINAL_VAR_REGEX.exec(response);
  if (finalVarMatch) {
    finalAnswer = {
      type: 'FINAL_VAR',
      value: finalVarMatch[1] ?? '',
    };
  } else {
    // Check for FINAL
    const finalMatch = FINAL_REGEX.exec(response);
    if (finalMatch) {
      finalAnswer = {
        type: 'FINAL',
        value: finalMatch[1]?.trim() ?? '',
      };
    }
  }

  return {
    codeBlocks,
    finalAnswer,
    text: response,
  };
}

/**
 * Check if a response contains any executable code blocks.
 *
 * @param response - The LLM response text
 * @returns true if there are code blocks
 */
export function hasCodeBlocks(response: string): boolean {
  return CODE_BLOCK_REGEX.test(response);
}

/**
 * Check if a response contains a termination signal.
 *
 * @param response - The LLM response text
 * @returns true if FINAL or FINAL_VAR is present
 */
export function hasTerminationSignal(response: string): boolean {
  return FINAL_REGEX.test(response) || FINAL_VAR_REGEX.test(response);
}

/**
 * Extract only the code blocks from a response.
 *
 * @param response - The LLM response text
 * @returns Array of code blocks
 */
export function extractCodeBlocks(response: string): CodeBlock[] {
  return parseResponse(response).codeBlocks;
}

/**
 * Extract the final answer from a response.
 *
 * @param response - The LLM response text
 * @returns Final answer or null
 */
export function extractFinalAnswer(response: string): FinalAnswer | null {
  return parseResponse(response).finalAnswer;
}
