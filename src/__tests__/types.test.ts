import { describe, it, expect } from 'vitest';
import type {
  KeyConfig,
  RotationStrategy,
  PoolExhaustionConfig,
  ThrowExhaustion,
  WaitExhaustion,
  FallbackExhaustion,
  KeyEntry,
  PoolState,
} from '../types';

describe('Types - compile-time shape checks', () => {
  describe('KeyConfig', () => {
    it('minimal fields (key + provider only) are valid', () => {
      const minimal: KeyConfig = { key: 'sk-test', provider: 'openai' };
      expect(minimal.key).toBe('sk-test');
      expect(minimal.provider).toBe('openai');
      expect(minimal.id).toBeUndefined();
      expect(minimal.tags).toBeUndefined();
      expect(minimal.weight).toBeUndefined();
      expect(minimal.priority).toBeUndefined();
      expect(minimal.maxRequestsPerMinute).toBeUndefined();
      expect(minimal.metadata).toBeUndefined();
    });

    it('all optional fields are valid', () => {
      const full: KeyConfig = {
        id: 'my-key',
        key: 'sk-full-test',
        provider: 'anthropic',
        tags: ['premium', 'us-east'],
        weight: 3,
        priority: 0,
        maxRequestsPerMinute: 1000,
        metadata: { owner: 'team-a', billingAccount: 'acct_123' },
      };
      expect(full.id).toBe('my-key');
      expect(full.tags).toEqual(['premium', 'us-east']);
      expect(full.weight).toBe(3);
      expect(full.priority).toBe(0);
      expect(full.maxRequestsPerMinute).toBe(1000);
      expect(full.metadata?.owner).toBe('team-a');
    });
  });

  describe('RotationStrategy', () => {
    it('covers all expected strategies', () => {
      const strategies: RotationStrategy[] = [
        'round-robin',
        'least-recently-used',
        'least-requests',
        'weighted-random',
        'priority',
      ];
      expect(strategies).toHaveLength(5);
      expect(strategies).toContain('round-robin');
      expect(strategies).toContain('least-recently-used');
      expect(strategies).toContain('least-requests');
      expect(strategies).toContain('weighted-random');
      expect(strategies).toContain('priority');
    });
  });

  describe('PoolExhaustionConfig discriminated union', () => {
    it('ThrowExhaustion is valid', () => {
      const config: ThrowExhaustion = { strategy: 'throw' };
      expect(config.strategy).toBe('throw');
    });

    it('WaitExhaustion is valid with optional maxWaitMs', () => {
      const withMax: WaitExhaustion = { strategy: 'wait', maxWaitMs: 15000 };
      const withoutMax: WaitExhaustion = { strategy: 'wait' };
      expect(withMax.maxWaitMs).toBe(15000);
      expect(withoutMax.maxWaitMs).toBeUndefined();
    });

    it('FallbackExhaustion requires fn', () => {
      const mockPoolState: PoolState = {
        totalKeys: 2,
        availableKeys: 0,
        cooldownKeys: 2,
        disabledKeys: 0,
        totalRequests: 100,
        totalTokens: 5000,
        totalErrors: 3,
      };
      const mockEntry: KeyEntry = { id: 'fb-1', key: 'sk-fb', provider: 'anthropic', tags: [] };
      const config: FallbackExhaustion = {
        strategy: 'fallback',
        fn: async (_pool: string, _state: PoolState) => {
          void mockPoolState;
          return mockEntry;
        },
      };
      expect(config.strategy).toBe('fallback');
      expect(typeof config.fn).toBe('function');
    });

    it('PoolExhaustionConfig union accepts all three', () => {
      const configs: PoolExhaustionConfig[] = [
        { strategy: 'throw' },
        { strategy: 'wait', maxWaitMs: 5000 },
        { strategy: 'fallback', fn: async () => ({ id: 'x', key: 'sk-x', provider: 'openai', tags: [] }) },
      ];
      expect(configs[0].strategy).toBe('throw');
      expect(configs[1].strategy).toBe('wait');
      expect(configs[2].strategy).toBe('fallback');
    });
  });
});
