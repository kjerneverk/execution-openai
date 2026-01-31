/**
 * Execution OpenAI Package
 *
 * OpenAI provider implementation for LLM execution.
 *
 * @packageDocumentation
 */

import OpenAI from 'openai';
import { getRedactor } from '@utilarium/offrecord';
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
