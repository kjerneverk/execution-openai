# execution-openai

OpenAI provider implementation for LLM execution. Implements the `Provider` interface from the `execution` package.

## Installation

```bash
npm install execution-openai openai
```

## Usage

```typescript
import { OpenAIProvider, createOpenAIProvider } from 'execution-openai';

// Create provider
const provider = createOpenAIProvider();

// Or use the class directly
const provider = new OpenAIProvider();

// Execute a request
const response = await provider.execute(
  {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' }
    ],
    addMessage: () => {},
  },
  {
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0.7,
    maxTokens: 1000,
  }
);

console.log(response.content);
console.log(response.usage); // { inputTokens: X, outputTokens: Y }
```

## Supported Models

The provider supports Chat Completions for current OpenAI models, including:
- GPT family (`gpt-*`, e.g. `gpt-4o`, `gpt-5`)
- Reasoning models (`o1`, `o3`, `o4`, …)
- Fine-tuned chat models (`ft:…`)
- Consumer-style IDs such as `chatgpt-4o-latest` where your key has access

It uses `max_completion_tokens` (not deprecated `max_tokens`) so O-series models receive a valid cap, and it omits `temperature` for reasoning models where the API rejects custom values. `developer` system prompts are sent as the `developer` role per current API guidance.

## API Key

Set via:
1. `options.apiKey` parameter
2. `OPENAI_API_KEY` environment variable

## Response Format

```typescript
interface ProviderResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls?: ToolCall[];
}
```

## Related Packages

- `execution` - Core interfaces (no SDK dependencies)
- `execution-anthropic` - Anthropic provider
- `execution-gemini` - Google Gemini provider

## License

Apache-2.0

<!-- v1.0.0 -->
