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

/** O-series / reasoning models reject custom temperature on Chat Completions. */
function isOpenAIReasoningModel(model: string): boolean {
    return /^o\d/i.test(model.trim());
}

function mapRequestMessagesToOpenAI(request: Request): OpenAI.ChatCompletionMessageParam[] {
    return request.messages.map((msg) => {
        if (msg.role === 'tool') {
            return {
                role: 'tool',
                content: typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content),
                tool_call_id: (msg as { tool_call_id?: string }).tool_call_id || '',
            };
        }
        if (msg.role === 'assistant') {
            const extra = msg as unknown as { tool_calls?: unknown };
            if (extra.tool_calls) {
                return {
                    role: 'assistant',
                    content: msg.content,
                    tool_calls: extra.tool_calls,
                } as OpenAI.ChatCompletionMessageParam;
            }
        }
        return {
            role: msg.role,
            content:
                typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content),
            ...(msg.name ? { name: msg.name } : {}),
        } as OpenAI.ChatCompletionMessageParam;
    });
}

function buildTools(request: Request): OpenAI.ChatCompletionTool[] | undefined {
    if (!request.tools?.length) {
        return undefined;
    }
    return request.tools.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as unknown as OpenAI.FunctionParameters,
        },
    }));
}

function appendMaxTokensAndTemperature(
    model: string,
    options: ExecutionOptions,
    params: OpenAI.ChatCompletionCreateParams
): void {
    if (options.maxTokens != null) {
        params.max_completion_tokens = options.maxTokens;
    }
    if (
        options.temperature !== undefined &&
        options.temperature !== null &&
        !isOpenAIReasoningModel(model)
    ) {
        params.temperature = options.temperature;
    }
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
        const m = model.toLowerCase();
        return (
            m.startsWith('gpt') ||
            /^o\d/.test(m) ||
            m.startsWith('ft:') ||
            m.startsWith('chatgpt-4o')
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

            const model = options.model || request.model || 'gpt-4o';

            const messages = mapRequestMessagesToOpenAI(request);
            const openaiTools = buildTools(request);

            const params: OpenAI.ChatCompletionCreateParams = {
                model,
                messages,
                ...(request.responseFormat != null ? { response_format: request.responseFormat } : {}),
                ...(openaiTools ? { tools: openaiTools } : {}),
            };
            appendMaxTokensAndTemperature(model, options, params);

            const response = await client.chat.completions.create(params);

            const choice = response.choices[0];
            const assistantMessage = choice.message;

            return {
                content: assistantMessage.content ?? assistantMessage.refusal ?? '',
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
            const clientOptions: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
            const proxyUrl = getProxyUrl();
            if (proxyUrl) {
                clientOptions.fetch = createProxyFetch(proxyUrl);
            }
            const client = new OpenAI(clientOptions);

            const model = options.model || request.model || 'gpt-4o';

            const messages = mapRequestMessagesToOpenAI(request);
            const openaiTools = buildTools(request);

            const params: OpenAI.ChatCompletionCreateParamsStreaming = {
                model,
                messages,
                stream: true,
                stream_options: { include_usage: true },
                ...(request.responseFormat != null ? { response_format: request.responseFormat } : {}),
                ...(openaiTools ? { tools: openaiTools } : {}),
            };
            appendMaxTokensAndTemperature(model, options, params);

            const stream = await client.chat.completions.create(params);

            // Track tool calls being built
            const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                
                if (delta?.content) {
                    yield { type: 'text', text: delta.content };
                }

                if (delta?.refusal) {
                    yield { type: 'text', text: delta.refusal };
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

                        if (tc.function?.name) {
                            const existing = toolCallsInProgress.get(index);
                            if (existing) {
                                existing.name = tc.function.name;
                            } else {
                                toolCallsInProgress.set(index, {
                                    id: tc.id || '',
                                    name: tc.function.name,
                                    arguments: '',
                                });
                            }
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
