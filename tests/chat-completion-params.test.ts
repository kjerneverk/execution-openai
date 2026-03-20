/**
 * Verifies Chat Completions request shape matches current OpenAI API expectations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    create: vi.fn(),
}));

vi.mock('openai', () => {
    class MockOpenAI {
        chat = {
            completions: {
                create: mocks.create,
            },
        };
        constructor(_: unknown) {}
    }
    return { default: MockOpenAI };
});

import { OpenAIProvider } from '../src/index.js';

describe('Chat completion request params', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'sk-abcdefghijklmnopqrstuvwxyz123456';
        mocks.create.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: 'ok',
                        refusal: null,
                        role: 'assistant',
                    },
                },
            ],
            model: 'gpt-4o',
            usage: { prompt_tokens: 1, completion_tokens: 1 },
        });
    });

    it('uses max_completion_tokens instead of deprecated max_tokens', async () => {
        const provider = new OpenAIProvider();
        await provider.execute(
            {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: 'hi' }],
                addMessage: () => undefined,
            } as any,
            { maxTokens: 500 }
        );

        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({
                max_completion_tokens: 500,
            })
        );
        const arg = mocks.create.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.max_tokens).toBeUndefined();
    });

    it('omits temperature for O-series models', async () => {
        const provider = new OpenAIProvider();
        await provider.execute(
            {
                model: 'o3-mini',
                messages: [{ role: 'user', content: 'hi' }],
                addMessage: () => undefined,
            } as any,
            { temperature: 0.2, maxTokens: 100 }
        );

        const arg = mocks.create.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.temperature).toBeUndefined();
        expect(arg.max_completion_tokens).toBe(100);
    });

    it('passes temperature for non-reasoning GPT models', async () => {
        const provider = new OpenAIProvider();
        await provider.execute(
            {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: 'hi' }],
                addMessage: () => undefined,
            } as any,
            { temperature: 0.2 }
        );

        const arg = mocks.create.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.temperature).toBe(0.2);
    });

    it('maps developer messages with role developer', async () => {
        const provider = new OpenAIProvider();
        await provider.execute(
            {
                model: 'gpt-4o',
                messages: [{ role: 'developer', content: 'You are concise.' }],
                addMessage: () => undefined,
            } as any
        );

        const arg = mocks.create.mock.calls[0][0] as {
            messages: Array<{ role: string; content: string }>;
        };
        expect(arg.messages[0].role).toBe('developer');
        expect(arg.messages[0].content).toBe('You are concise.');
    });
});
