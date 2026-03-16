import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createCompletion: vi.fn(),
}));

vi.mock('openai', () => {
    class MockOpenAI {
        chat = {
            completions: {
                create: mocks.createCompletion,
            },
        };
        constructor(_: unknown) {}
    }
    return { default: MockOpenAI };
});

import { OpenAIProvider, type StreamChunk } from '../src/index.js';

describe('OpenAIProvider streaming tool metadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    });

    it('retains tool call name when function.name arrives after id', async () => {
        async function* mockStream() {
            yield {
                choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1' }] } }],
            };
            yield {
                choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'lookup_weather' } }] } }],
            };
            yield {
                choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] } }],
            };
            yield {
                choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Oslo"}' } }] } }],
            };
            yield {
                choices: [{ finish_reason: 'tool_calls', delta: {} }],
            };
            yield {
                choices: [{ delta: {} }],
                usage: { prompt_tokens: 10, completion_tokens: 4 },
            };
        }

        mocks.createCompletion.mockResolvedValueOnce(mockStream() as any);

        const provider = new OpenAIProvider();
        const chunks: StreamChunk[] = [];

        for await (const chunk of provider.executeStream({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: 'weather?' }],
            addMessage: () => undefined,
        } as any)) {
            chunks.push(chunk);
        }

        const toolCallEnd = chunks.find((chunk) => chunk.type === 'tool_call_end');
        expect(toolCallEnd).toBeDefined();
        expect(toolCallEnd?.toolCall?.name).toBe('lookup_weather');
    });
});
