/**
 * Tests for the response parser.
 */

import { describe, it, expect } from 'vitest';
import {
  parseResponse,
  hasCodeBlocks,
  hasTerminationSignal,
  extractCodeBlocks,
  extractFinalAnswer,
} from '../../src/executor/parser.js';

describe('parseResponse', () => {
  describe('code block extraction', () => {
    it('should extract a single repl code block', () => {
      const response = `Let me check the context.

\`\`\`repl
print(len(context))
\`\`\`
`;
      const result = parseResponse(response);
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]?.code).toBe('print(len(context))');
      expect(result.codeBlocks[0]?.language).toBe('repl');
    });

    it('should extract multiple code blocks', () => {
      const response = `First, let's check the length:

\`\`\`repl
print(len(context))
\`\`\`

Now let's look at the content:

\`\`\`repl
print(context[:100])
\`\`\`
`;
      const result = parseResponse(response);
      expect(result.codeBlocks).toHaveLength(2);
      expect(result.codeBlocks[0]?.code).toBe('print(len(context))');
      expect(result.codeBlocks[1]?.code).toBe('print(context[:100])');
    });

    it('should extract python code blocks', () => {
      const response = `\`\`\`python
x = 1 + 1
print(x)
\`\`\``;
      const result = parseResponse(response);
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]?.language).toBe('python');
    });

    it('should extract unmarked code blocks as repl', () => {
      const response = `\`\`\`
print("hello")
\`\`\``;
      const result = parseResponse(response);
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]?.language).toBe('repl');
    });

    it('should ignore non-python code blocks', () => {
      const response = `\`\`\`javascript
console.log("hello")
\`\`\``;
      const result = parseResponse(response);
      expect(result.codeBlocks).toHaveLength(0);
    });

    it('should preserve code indentation', () => {
      const response = `\`\`\`repl
for i in range(10):
    print(i)
    if i > 5:
        break
\`\`\``;
      const result = parseResponse(response);
      expect(result.codeBlocks[0]?.code).toContain('    print(i)');
      expect(result.codeBlocks[0]?.code).toContain('        break');
    });
  });

  describe('FINAL detection', () => {
    it('should detect FINAL with simple answer', () => {
      const response = `After analysis, the answer is clear.

FINAL(The main topic is climate change)`;
      const result = parseResponse(response);
      expect(result.finalAnswer).toEqual({
        type: 'FINAL',
        value: 'The main topic is climate change',
      });
    });

    it('should detect FINAL with multiline answer', () => {
      const response = `FINAL(The three main causes are:
1. Fossil fuels
2. Deforestation
3. Industrial agriculture)`;
      const result = parseResponse(response);
      expect(result.finalAnswer?.type).toBe('FINAL');
      expect(result.finalAnswer?.value).toContain('Fossil fuels');
    });

    it('should detect FINAL_VAR', () => {
      const response = `I've stored the answer in a variable.

FINAL_VAR(final_answer)`;
      const result = parseResponse(response);
      expect(result.finalAnswer).toEqual({
        type: 'FINAL_VAR',
        value: 'final_answer',
      });
    });

    it('should prefer FINAL_VAR over FINAL if both present', () => {
      const response = `FINAL(test)
FINAL_VAR(my_var)`;
      const result = parseResponse(response);
      expect(result.finalAnswer?.type).toBe('FINAL_VAR');
      expect(result.finalAnswer?.value).toBe('my_var');
    });

    it('should return null if no termination signal', () => {
      const response = `Let me continue working on this.

\`\`\`repl
print(context[:100])
\`\`\``;
      const result = parseResponse(response);
      expect(result.finalAnswer).toBeNull();
    });
  });

  describe('combined parsing', () => {
    it('should extract both code blocks and final answer', () => {
      const response = `First, let me check:

\`\`\`repl
result = llm_query("Summarize: " + context)
print(result)
\`\`\`

Based on the analysis:

FINAL(The document is about renewable energy)`;
      const result = parseResponse(response);
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.finalAnswer).not.toBeNull();
      expect(result.text).toBe(response);
    });
  });
});

describe('helper functions', () => {
  describe('hasCodeBlocks', () => {
    it('should return true for responses with code blocks', () => {
      expect(hasCodeBlocks('```repl\nprint(1)\n```')).toBe(true);
    });

    it('should return false for responses without code blocks', () => {
      expect(hasCodeBlocks('Just some text')).toBe(false);
    });
  });

  describe('hasTerminationSignal', () => {
    it('should return true for FINAL', () => {
      expect(hasTerminationSignal('FINAL(answer)')).toBe(true);
    });

    it('should return true for FINAL_VAR', () => {
      expect(hasTerminationSignal('FINAL_VAR(x)')).toBe(true);
    });

    it('should return false without termination', () => {
      expect(hasTerminationSignal('No termination here')).toBe(false);
    });
  });

  describe('extractCodeBlocks', () => {
    it('should return only code blocks', () => {
      const response = 'Text ```repl\ncode\n``` more text';
      const blocks = extractCodeBlocks(response);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.code).toBe('code');
    });
  });

  describe('extractFinalAnswer', () => {
    it('should return only final answer', () => {
      const response = '```repl\ncode\n``` FINAL(answer)';
      const final = extractFinalAnswer(response);
      expect(final?.value).toBe('answer');
    });
  });
});
