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

The provider supports all OpenAI models:
- GPT-4 family (gpt-4, gpt-4o, gpt-4-turbo, etc.)
- O-series (o1, o1-preview, o1-mini, o3, etc.)
- GPT-3.5 family

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
