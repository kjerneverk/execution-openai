/**
 * Execution OpenAI Package
 *
 * OpenAI provider implementation for LLM execution.
 *
 * @packageDocumentation
 */

import OpenAI from 'openai';
import { getRedactor } from '@utilarium/offrecord';
import { getProxyUrl, createProxyFetch } from './proxy.js';
import { 
    createSafeError, 
    configureErrorSanitizer,
    configureSecretGuard,
} from '@utilarium/spotclean';

// Register OpenAI API key patterns on module load
const redactor = getRedactor();
redactor.register({
    name: 'openai',
    patterns: [
        /sk-[a-zA-Z0-9]{20,}/g,
        /sk-proj-[a-zA-Z0-9_-]+/g,
    ],
    validator: (key: string) => /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/.test(key),
    envVar: 'OPENAI_API_KEY',
    description: 'OpenAI API keys',
});

// Configure spotclean for error sanitization
configureErrorSanitizer({
    enabled: true,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    includeCorrelationId: true,
    sanitizeStackTraces: process.env.NODE_ENV === 'production',
    maxMessageLength: 500,
});

configureSecretGuard({
    enabled: true,
    redactionText: '[REDACTED]',
    preservePartial: false,
    preserveLength: 0,
    customPatterns: [
        { name: 'openai', pattern: /sk-[a-zA-Z0-9]{20,}/g, description: 'OpenAI API key' },
        { name: 'openai-proj', pattern: /sk-proj-[a-zA-Z0-9_-]+/g, description: 'OpenAI project key' },
    ],
});

// ===== INLINE TYPES (from 'execution' package) =====
// These types are duplicated here for build independence.
// When 'execution' is published, these can be imported from there.

export type Model = string;

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'developer' | 'tool';
    content: string | string[] | null;
    name?: string;
}

export interface ToolParameterSchema {
    type: 'object';
    properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
        items?: { type: string };
        default?: any;
    }>;
    required?: string[];
    additionalProperties?: boolean;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
}

export type StreamChunkType = 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'usage' | 'done';

export interface StreamChunk {
    type: StreamChunkType;
    text?: string;
    toolCall?: {
        id?: string;
        index?: number;
        name?: string;
        argumentsDelta?: string;
    };
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}

export interface Request {
    messages: Message[];
    model: Model;
    responseFormat?: any;
    validator?: any;
    tools?: ToolDefinition[];
    addMessage(message: Message): void;
}

export interface ProviderResponse {
    content: string;
    model: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
    toolCalls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export interface ExecutionOptions {
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    retries?: number;
}

export interface Provider {
    readonly name: string;
    execute(request: Request, options?: ExecutionOptions): Promise<ProviderResponse>;
    executeStream?(request: Request, options?: ExecutionOptions): AsyncIterable<StreamChunk>;
    supportsModel?(model: Model): boolean;
}

/**
 * OpenAI Provider implementation
 */
export class OpenAIProvider implements Provider {
    readonly name = 'openai';

    /**
     * Check if this provider supports a given model
     */
    supportsModel(model: Model): boolean {
        if (!model) return true; // Default to OpenAI
        return (
            model.startsWith('gpt') ||
            model.startsWith('o1') ||
            model.startsWith('o3') ||
            model.startsWith('o4')
        );
    }

    /**
     * Execute a request against OpenAI
     */
    async execute(
        request: Request,
        options: ExecutionOptions = {}
    ): Promise<ProviderResponse> {
        const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
        }

        // Validate key format
        const validation = redactor.validateKey(apiKey, 'openai');
        if (!validation.valid) {
            throw new Error('Invalid OpenAI API key format');
        }

        try {
            const clientOptions: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
            const proxyUrl = getProxyUrl();
            if (proxyUrl) {
                clientOptions.fetch = createProxyFetch(proxyUrl);
            }
            const client = new OpenAI(clientOptions);

            const model = options.model || request.model || 'gpt-4';

            // Convert messages to OpenAI format
            const messages = request.messages.map((msg) => {
                if (msg.role === 'tool') {
                    // Tool result message
                    return {
                        role: 'tool',
                        content: typeof msg.content === 'string'
                            ? msg.content
                            : JSON.stringify(msg.content),
                        tool_call_id: (msg as any).tool_call_id || '',
                    };
                } else if (msg.role === 'assistant' && (msg as any).tool_calls) {
                    // Assistant message with tool calls
                    return {
                        role: 'assistant',
                        content: msg.content,
                        tool_calls: (msg as any).tool_calls,
                    };
                } else {
                    const role = msg.role === 'developer' ? 'system' : msg.role;
                    return {
                        role: role,
                        content:
                            typeof msg.content === 'string'
                                ? msg.content
                                : JSON.stringify(msg.content),
                        name: msg.name,
                    };
                }
            }) as any[];

            // Build tools array for OpenAI format
            let openaiTools: OpenAI.ChatCompletionTool[] | undefined;
            if (request.tools && request.tools.length > 0) {
                openaiTools = request.tools.map((tool) => ({
                    type: 'function' as const,
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parameters as unknown as OpenAI.FunctionParameters,
                    },
                }));
            }

            const response = await client.chat.completions.create({
                model: model,
                messages: messages,
                temperature: options.temperature,
                max_tokens: options.maxTokens,
                response_format: request.responseFormat,
                ...(openaiTools ? { tools: openaiTools } : {}),
            });

            const choice = response.choices[0];

            return {
                content: choice.message.content || '',
                model: response.model,
                usage: response.usage
                    ? {
                        inputTokens: response.usage.prompt_tokens,
                        outputTokens: response.usage.completion_tokens,
                    }
                    : undefined,
                toolCalls: choice.message.tool_calls
                    ?.filter((tc) => tc.type === 'function')
                    .map((tc) => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                            name: (tc as any).function.name,
                            arguments: (tc as any).function.arguments,
                        },
                    })),
            };
        } catch (error) {
            // Sanitize error to remove any API keys from error messages
            // Use spotclean for comprehensive error sanitization
            throw createSafeError(error as Error, { provider: 'openai' });
        }
    }

    /**
     * Execute a request with streaming response
     */
    async *executeStream(
        request: Request,
        options: ExecutionOptions = {}
    ): AsyncIterable<StreamChunk> {
        const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
        }

        // Validate key format
        const validation = redactor.validateKey(apiKey, 'openai');
        if (!validation.valid) {
            throw new Error('Invalid OpenAI API key format');
        }

        try {
            const client = new OpenAI({ apiKey });

            const model = options.model || request.model || 'gpt-4';

            // Convert messages to OpenAI format
            const messages = request.messages.map((msg) => {
                if (msg.role === 'tool') {
                    return {
                        role: 'tool',
                        content: typeof msg.content === 'string'
                            ? msg.content
                            : JSON.stringify(msg.content),
                        tool_call_id: (msg as any).tool_call_id || '',
                    };
                } else if (msg.role === 'assistant' && (msg as any).tool_calls) {
                    return {
                        role: 'assistant',
                        content: msg.content,
                        tool_calls: (msg as any).tool_calls,
                    };
                } else {
                    const role = msg.role === 'developer' ? 'system' : msg.role;
                    return {
                        role: role,
                        content:
                            typeof msg.content === 'string'
                                ? msg.content
                                : JSON.stringify(msg.content),
                        name: msg.name,
                    };
                }
            }) as any[];

            // Build tools array
            let openaiTools: OpenAI.ChatCompletionTool[] | undefined;
            if (request.tools && request.tools.length > 0) {
                openaiTools = request.tools.map((tool) => ({
                    type: 'function' as const,
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parameters as unknown as OpenAI.FunctionParameters,
                    },
                }));
            }

            const stream = await client.chat.completions.create({
                model: model,
                messages: messages,
                temperature: options.temperature,
                max_tokens: options.maxTokens,
                stream: true,
                stream_options: { include_usage: true },
                ...(openaiTools ? { tools: openaiTools } : {}),
            });

            // Track tool calls being built
            const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                
                if (delta?.content) {
                    yield { type: 'text', text: delta.content };
                }

                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const index = tc.index;
                        
                        if (tc.id) {
                            // New tool call starting
                            toolCallsInProgress.set(index, {
                                id: tc.id,
                                name: tc.function?.name || '',
                                arguments: '',
                            });
                            yield {
                                type: 'tool_call_start',
                                toolCall: {
                                    id: tc.id,
                                    index,
                                    name: tc.function?.name,
                                },
                            };
                        }
                        
                        if (tc.function?.arguments) {
                            const toolCall = toolCallsInProgress.get(index);
                            if (toolCall) {
                                toolCall.arguments += tc.function.arguments;
                                yield {
                                    type: 'tool_call_delta',
                                    toolCall: {
                                        index,
                                        argumentsDelta: tc.function.arguments,
                                    },
                                };
                            }
                        }
                    }
                }

                // Check for finish reason to emit tool_call_end
                if (chunk.choices[0]?.finish_reason === 'tool_calls') {
                    for (const [index, toolCall] of toolCallsInProgress) {
                        yield {
                            type: 'tool_call_end',
                            toolCall: {
                                id: toolCall.id,
                                index,
                                name: toolCall.name,
                            },
                        };
                    }
                }

                // Usage comes at the end
                if (chunk.usage) {
                    yield {
                        type: 'usage',
                        usage: {
                            inputTokens: chunk.usage.prompt_tokens,
                            outputTokens: chunk.usage.completion_tokens,
                        },
                    };
                }
            }

            yield { type: 'done' };
        } catch (error) {
            throw createSafeError(error as Error, { provider: 'openai' });
        }
    }
}

/**
 * Create a new OpenAI provider instance
 */
export function createOpenAIProvider(): OpenAIProvider {
    return new OpenAIProvider();
}

/**
 * Package version
 */
export const VERSION = '0.0.1';

export default OpenAIProvider;
