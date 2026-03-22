# AI Agent Guide: execution-openai

OpenAI provider for the `execution` interface.

## Quick Start

```typescript
import { OpenAIProvider } from 'execution-openai';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await provider.execute(messages, {
  model: 'gpt-5.4'
});
```

## Configuration

```typescript
new OpenAIProvider({
  apiKey: 'sk-...',      // Or use OPENAI_API_KEY env var
  baseURL: '...',        // Custom endpoint
  organization: '...',   // Org ID
  timeout: 30000         // Request timeout
});
```

## Supported Models

| Model | Vision | Tools | Notes |
|-------|--------|-------|-------|
| gpt-5.4 | ✅ | ✅ | Default when model omitted; current GPT‑5 flagship (per SDK) |
| gpt-5 / gpt-5-mini | ✅ | ✅ | Smaller / alternate GPT‑5 variants |
| gpt-4o | ✅ | ✅ | Still supported |
| o1 / o3 / o4 | varies | varies | Reasoning family; custom `temperature` omitted |

## Token Counting

```typescript
import { countTokens, getEncoding } from 'execution-openai';

const tokens = countTokens('Hello!', 'gpt-5.4');
```

## Dependencies

- `openai` - Official SDK
- `tiktoken` - Token counting
- `execution` - Interface definitions (peer)

