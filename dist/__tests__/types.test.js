"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Types - compile-time shape checks', () => {
    (0, vitest_1.describe)('KeyConfig', () => {
        (0, vitest_1.it)('minimal fields (key + provider only) are valid', () => {
            const minimal = { key: 'sk-test', provider: 'openai' };
            (0, vitest_1.expect)(minimal.key).toBe('sk-test');
            (0, vitest_1.expect)(minimal.provider).toBe('openai');
            (0, vitest_1.expect)(minimal.id).toBeUndefined();
            (0, vitest_1.expect)(minimal.tags).toBeUndefined();
            (0, vitest_1.expect)(minimal.weight).toBeUndefined();
            (0, vitest_1.expect)(minimal.priority).toBeUndefined();
            (0, vitest_1.expect)(minimal.maxRequestsPerMinute).toBeUndefined();
            (0, vitest_1.expect)(minimal.metadata).toBeUndefined();
        });
        (0, vitest_1.it)('all optional fields are valid', () => {
            const full = {
                id: 'my-key',
                key: 'sk-full-test',
                provider: 'anthropic',
                tags: ['premium', 'us-east'],
                weight: 3,
                priority: 0,
                maxRequestsPerMinute: 1000,
                metadata: { owner: 'team-a', billingAccount: 'acct_123' },
            };
            (0, vitest_1.expect)(full.id).toBe('my-key');
            (0, vitest_1.expect)(full.tags).toEqual(['premium', 'us-east']);
            (0, vitest_1.expect)(full.weight).toBe(3);
            (0, vitest_1.expect)(full.priority).toBe(0);
            (0, vitest_1.expect)(full.maxRequestsPerMinute).toBe(1000);
            (0, vitest_1.expect)(full.metadata?.owner).toBe('team-a');
        });
    });
    (0, vitest_1.describe)('RotationStrategy', () => {
        (0, vitest_1.it)('covers all expected strategies', () => {
            const strategies = [
                'round-robin',
                'least-recently-used',
                'least-requests',
                'weighted-random',
                'priority',
            ];
            (0, vitest_1.expect)(strategies).toHaveLength(5);
            (0, vitest_1.expect)(strategies).toContain('round-robin');
            (0, vitest_1.expect)(strategies).toContain('least-recently-used');
            (0, vitest_1.expect)(strategies).toContain('least-requests');
            (0, vitest_1.expect)(strategies).toContain('weighted-random');
            (0, vitest_1.expect)(strategies).toContain('priority');
        });
    });
    (0, vitest_1.describe)('PoolExhaustionConfig discriminated union', () => {
        (0, vitest_1.it)('ThrowExhaustion is valid', () => {
            const config = { strategy: 'throw' };
            (0, vitest_1.expect)(config.strategy).toBe('throw');
        });
        (0, vitest_1.it)('WaitExhaustion is valid with optional maxWaitMs', () => {
            const withMax = { strategy: 'wait', maxWaitMs: 15000 };
            const withoutMax = { strategy: 'wait' };
            (0, vitest_1.expect)(withMax.maxWaitMs).toBe(15000);
            (0, vitest_1.expect)(withoutMax.maxWaitMs).toBeUndefined();
        });
        (0, vitest_1.it)('FallbackExhaustion requires fn', () => {
            const mockPoolState = {
                totalKeys: 2,
                availableKeys: 0,
                cooldownKeys: 2,
                disabledKeys: 0,
                totalRequests: 100,
                totalTokens: 5000,
                totalErrors: 3,
            };
            const mockEntry = { id: 'fb-1', key: 'sk-fb', provider: 'anthropic', tags: [] };
            const config = {
                strategy: 'fallback',
                fn: async (_pool, _state) => {
                    void mockPoolState;
                    return mockEntry;
                },
            };
            (0, vitest_1.expect)(config.strategy).toBe('fallback');
            (0, vitest_1.expect)(typeof config.fn).toBe('function');
        });
        (0, vitest_1.it)('PoolExhaustionConfig union accepts all three', () => {
            const configs = [
                { strategy: 'throw' },
                { strategy: 'wait', maxWaitMs: 5000 },
                { strategy: 'fallback', fn: async () => ({ id: 'x', key: 'sk-x', provider: 'openai', tags: [] }) },
            ];
            (0, vitest_1.expect)(configs[0].strategy).toBe('throw');
            (0, vitest_1.expect)(configs[1].strategy).toBe('wait');
            (0, vitest_1.expect)(configs[2].strategy).toBe('fallback');
        });
    });
});
//# sourceMappingURL=types.test.js.map