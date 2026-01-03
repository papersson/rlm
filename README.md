# RLM

TypeScript implementation of Recursive Language Models.

**Paper:** [Recursive Language Models](https://arxiv.org/abs/2512.24601) — Zhang, Kraska, Khattab (MIT CSAIL)

**Tweet:** [@a1zhang](https://x.com/a1zhang/status/2007198916073136152)

## Idea

Instead of stuffing a huge document into the prompt, give the LLM programmatic access to it via a Python REPL. The LLM writes code to navigate and analyze the content, and can delegate subtasks to a cheaper sub-model via `llm_query()`.

## Setup

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-..." > .env
```

## Usage

```bash
npm run dev -- run -c <file> -q "<query>" --output trace
```

Example:
```bash
npm run dev -- run \
  -c examples/airlines.csv \
  -q "Which airport had the most weather delays?" \
  --output trace
```

## Options

```
--root-model <model>     Main model (default: claude-opus-4-5-20251101)
--sub-model <model>      Sub-query model (default: claude-sonnet-4-5-20250929)
--max-iterations <n>     Max LLM iterations (default: 50)
--output <format>        summary | trace | json
```

## Tests

```bash
npm test
```

## Notes

- In RLM, context never enters the LLM's context window, it stays in an external variable
- The LLM only sees what it explicitly `print()`s
- A coding agent (Claude Code, etc.) could do the same: write context to file, process via scripts, avoid reading directly
- RLM formalizes this into an architecture with a REPL protocol and sub-LM delegation
- Open question: is the value in the architectural constraint, or could a well-prompted agent achieve the same?
