/**
 * Execution OpenAI Package
 *
 * OpenAI provider implementation for LLM execution.
 *
 * @packageDocumentation
 */

import OpenAI from 'openai';

// ===== INLINE TYPES (from 'execution' package) =====
// These types are duplicated here for build independence.
// When 'execution' is published, these can be imported from there.

export type Model = string;

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'developer' | 'tool';
    content: string | string[] | null;
    name?: string;
}

export interface Request {
    messages: Message[];
    model: Model;
    responseFormat?: any;
    validator?: any;
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
        if (!apiKey) throw new Error('OpenAI API key is required');

        const client = new OpenAI({ apiKey });

        const model = options.model || request.model || 'gpt-4';

        // Convert messages to OpenAI format
        const messages = request.messages.map((msg) => {
            const role =
                msg.role === 'developer' ? 'system' : msg.role;

            return {
                role: role,
                content:
                    typeof msg.content === 'string'
                        ? msg.content
                        : JSON.stringify(msg.content),
                name: msg.name,
            } as any;
        });

        const response = await client.chat.completions.create({
            model: model,
            messages: messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            response_format: request.responseFormat,
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
            toolCalls: choice.message.tool_calls?.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                },
            })),
        };
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
