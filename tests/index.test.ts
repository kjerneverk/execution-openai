/**
 * Tests for execution-openai package
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAIProvider,
  createOpenAIProvider,
  VERSION,
  type Message,
  type Request,
  type ExecutionOptions,
  type ProviderResponse,
  type Provider,
} from '../src/index.js';

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
  });

  describe('name', () => {
    it('should have name "openai"', () => {
      expect(provider.name).toBe('openai');
    });
  });

  describe('supportsModel', () => {
    it('should support GPT models', () => {
      expect(provider.supportsModel('gpt-4')).toBe(true);
      expect(provider.supportsModel('gpt-4o')).toBe(true);
      expect(provider.supportsModel('gpt-4-turbo')).toBe(true);
      expect(provider.supportsModel('gpt-3.5-turbo')).toBe(true);
    });

    it('should support O1/O3/O4 models', () => {
      expect(provider.supportsModel('o1-preview')).toBe(true);
      expect(provider.supportsModel('o1-mini')).toBe(true);
      expect(provider.supportsModel('o3-mini')).toBe(true);
      expect(provider.supportsModel('o4-mini')).toBe(true);
    });

    it('should not support Claude models', () => {
      expect(provider.supportsModel('claude-3-opus-20240229')).toBe(false);
      expect(provider.supportsModel('claude-3-sonnet-20240229')).toBe(false);
    });

    it('should not support Gemini models', () => {
      expect(provider.supportsModel('gemini-1.5-pro')).toBe(false);
      expect(provider.supportsModel('gemini-1.5-flash')).toBe(false);
    });

    it('should return true for empty/undefined model (default to OpenAI)', () => {
      expect(provider.supportsModel('')).toBe(true);
    });
  });

  describe('execute', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.OPENAI_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw error when no API key is provided', async () => {
      const request: Request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
        addMessage: vi.fn(),
      };

      await expect(provider.execute(request)).rejects.toThrow(
        'OpenAI API key is required'
      );
    });

    it('should throw error when API key is empty string', async () => {
      const request: Request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
        addMessage: vi.fn(),
      };

      await expect(provider.execute(request, { apiKey: '' })).rejects.toThrow(
        'OpenAI API key is required'
      );
    });
  });

  describe('implements Provider interface', () => {
    it('should satisfy Provider interface', () => {
      const p: Provider = provider;
      expect(p.name).toBe('openai');
      expect(typeof p.execute).toBe('function');
      expect(typeof p.supportsModel).toBe('function');
    });
  });
});

describe('createOpenAIProvider', () => {
  it('should create a new OpenAIProvider instance', () => {
    const provider = createOpenAIProvider();
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });
});

describe('VERSION', () => {
  it('should export version string', () => {
    expect(VERSION).toBe('0.0.1');
  });
});

describe('Type exports', () => {
  it('should export Message type', () => {
    const msg: Message = {
      role: 'user',
      content: 'Hello',
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('should support all message roles', () => {
    const roles: Message['role'][] = ['user', 'assistant', 'system', 'developer', 'tool'];
    roles.forEach(role => {
      const msg: Message = { role, content: 'test' };
      expect(msg.role).toBe(role);
    });
  });

  it('should support array content', () => {
    const msg: Message = {
      role: 'user',
      content: ['Hello', 'World'],
    };
    expect(Array.isArray(msg.content)).toBe(true);
  });

  it('should support null content', () => {
    const msg: Message = {
      role: 'assistant',
      content: null,
    };
    expect(msg.content).toBeNull();
  });

  it('should export ExecutionOptions type', () => {
    const opts: ExecutionOptions = {
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000,
      timeout: 30000,
      retries: 3,
    };
    expect(opts.apiKey).toBe('test-key');
    expect(opts.temperature).toBe(0.7);
  });

  it('should export ProviderResponse type', () => {
    const response: ProviderResponse = {
      content: 'Hello!',
      model: 'gpt-4',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
      },
    };
    expect(response.content).toBe('Hello!');
    expect(response.usage?.inputTokens).toBe(10);
  });

  it('should support toolCalls in ProviderResponse', () => {
    const response: ProviderResponse = {
      content: '',
      model: 'gpt-4',
      toolCalls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "NYC"}',
          },
        },
      ],
    };
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls?.[0].function.name).toBe('get_weather');
  });
});

