# RLM - Recursive Language Model Framework

A TypeScript implementation exploring the RLM (Recursive Language Model) inference strategy from the paper:

> **"RLM: Recursive Language Models"**
> Dosovitskiy et al., 2024
> [Paper PDF](docs/references/rlm.pdf)

## What is RLM?

Traditional LLMs are limited by context windows. RLM solves this by giving the LLM **programmatic access** to the context instead of pasting it into the prompt:

```
┌─────────────────────────────────────────┐
│              RLM Engine                 │
│                                         │
│  ┌─────────┐      ┌─────────────────┐  │
│  │ Root LLM│◄────►│   Python REPL   │  │
│  └────┬────┘      │                 │  │
│       │           │ context = "..." │  │
│       ▼           │ llm_query(...)  │  │
│  ┌─────────┐      └─────────────────┘  │
│  │ Sub LLM │                           │
│  └─────────┘                           │
└─────────────────────────────────────────┘
```

The LLM writes Python code to navigate, slice, and analyze the context. It can also delegate subtasks to a cheaper sub-LLM via `llm_query()`.

## Install

```bash
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

## Usage

```bash
# Simple query
npm run dev -- run \
  -c examples/simple-sublm.txt \
  -q "What is the net profit?" \
  --output trace

# With sub-LLM calls
npm run dev -- run \
  -c examples/multi-document.txt \
  -q "Summarize each document using llm_query()" \
  --output trace

# Large dataset (2MB CSV)
npm run dev -- run \
  -c examples/airlines.csv \
  -q "Which airport had the most weather delays in 2008?" \
  --output trace
```

## Output Formats

- `--output summary` - Brief result (default)
- `--output trace` - Full execution trace showing LLM calls, code executions, and sub-LM calls
- `--output json` - Machine-readable result

## Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--root-provider` | `anthropic` | LLM provider for main model |
| `--root-model` | `claude-opus-4-5-20251101` | Main model |
| `--sub-provider` | `anthropic` | LLM provider for sub-queries |
| `--sub-model` | `claude-sonnet-4-5-20250929` | Sub-query model |
| `--max-iterations` | `50` | Max LLM call iterations |
| `--max-sub-calls` | `100` | Max llm_query() calls |
| `--repl-timeout` | `120000` | REPL operation timeout (ms) |

## Tests

```bash
npm test
```

## Project Structure

```
src/
├── cli/           # Command-line interface
├── executor/      # Main RLM loop, parser, trace recorder
├── llm/           # LLM client abstraction (Anthropic, OpenAI, etc.)
├── prompts/       # System prompt from paper Appendix D
├── repl/          # Python subprocess manager + IPC bridge
└── types/         # Zod schemas, branded types, errors
```

## Credits

This is an exploratory implementation based on the RLM paper. See [docs/references/rlm.pdf](docs/references/rlm.pdf) for the original research.
