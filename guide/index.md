# AI Agent Guide: execution-openai

OpenAI provider for the `execution` interface.

## Quick Start

```typescript
import { OpenAIProvider } from 'execution-openai';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await provider.execute(messages, {
  model: 'gpt-4o'
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
| gpt-4o | ✅ | ✅ | Recommended |
| gpt-4o-mini | ✅ | ✅ | Cheaper |
| gpt-4-turbo | ✅ | ✅ | |
| o1 | ❌ | ❌ | Reasoning, uses 'developer' role |
| o1-mini | ❌ | ❌ | Faster reasoning |

## Token Counting

```typescript
import { countTokens, getEncoding } from 'execution-openai';

const tokens = countTokens('Hello!', 'gpt-4o');
```

## Dependencies

- `openai` - Official SDK
- `tiktoken` - Token counting
- `execution` - Interface definitions (peer)

