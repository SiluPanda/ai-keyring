"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const key_pool_1 = require("../key-pool");
const round_robin_1 = require("../rotation/round-robin");
const lru_1 = require("../rotation/lru");
const least_requests_1 = require("../rotation/least-requests");
const weighted_random_1 = require("../rotation/weighted-random");
const priority_1 = require("../rotation/priority");
const rotation_1 = require("../rotation");
function makeEntry(id, weight = 1, priority = 0) {
    return {
        id,
        key: `sk-${id}`,
        provider: 'openai',
        tags: [],
        disabled: false,
        weight,
        priority,
    };
}
(0, vitest_1.describe)('RoundRobinStrategy', () => {
    let strategy;
    (0, vitest_1.beforeEach)(() => {
        strategy = new round_robin_1.RoundRobinStrategy();
    });
    (0, vitest_1.it)('cycles through keys in order', () => {
        const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('b');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('c');
    });
    (0, vitest_1.it)('wraps around after last key', () => {
        const keys = [makeEntry('a'), makeEntry('b')];
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('b');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('b');
    });
    (0, vitest_1.it)('returns null for empty array', () => {
        (0, vitest_1.expect)(strategy.select([])).toBeNull();
    });
    (0, vitest_1.it)('handles single key', () => {
        const keys = [makeEntry('only')];
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('only');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('only');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('only');
    });
    (0, vitest_1.it)('adapts when available set changes', () => {
        const allKeys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
        (0, vitest_1.expect)(strategy.select(allKeys).id).toBe('a');
        (0, vitest_1.expect)(strategy.select(allKeys).id).toBe('b');
        // Simulate key 'c' going into cooldown — only a and b available
        const reduced = [makeEntry('a'), makeEntry('b')];
        const result = strategy.select(reduced);
        // counter is 2, 2 % 2 = 0 -> 'a'
        (0, vitest_1.expect)(result.id).toBe('a');
    });
});
(0, vitest_1.describe)('LeastRecentlyUsedStrategy', () => {
    let strategy;
    (0, vitest_1.beforeEach)(() => {
        strategy = new lru_1.LeastRecentlyUsedStrategy();
        vitest_1.vi.useFakeTimers();
    });
    (0, vitest_1.it)('selects the least recently used key', () => {
        const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
        // First call — all have lastUsed=0, so 'a' wins (first in iteration)
        vitest_1.vi.setSystemTime(100);
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
        // 'a' now has lastUsed=100, b and c still 0
        vitest_1.vi.setSystemTime(200);
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('b');
        // b=200, a=100, c=0
        vitest_1.vi.setSystemTime(300);
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('c');
    });
    (0, vitest_1.it)('breaks ties by insertion order (first key wins)', () => {
        const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
        // All have lastUsed=0, first key wins
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
    });
    (0, vitest_1.it)('returns null for empty array', () => {
        (0, vitest_1.expect)(strategy.select([])).toBeNull();
    });
    (0, vitest_1.it)('key returning from cooldown has stale lastUsed and is selected', () => {
        const a = makeEntry('a');
        const b = makeEntry('b');
        vitest_1.vi.setSystemTime(100);
        strategy.select([a, b]); // selects 'a', lastUsed=100
        vitest_1.vi.setSystemTime(200);
        strategy.select([a, b]); // selects 'b', lastUsed=200
        // 'a' returns from cooldown at time 500 — 'a' has lastUsed=100, 'b' has lastUsed=200
        vitest_1.vi.setSystemTime(500);
        (0, vitest_1.expect)(strategy.select([a, b]).id).toBe('a');
    });
});
(0, vitest_1.describe)('LeastRequestsStrategy', () => {
    let strategy;
    (0, vitest_1.beforeEach)(() => {
        strategy = new least_requests_1.LeastRequestsStrategy();
    });
    (0, vitest_1.it)('selects key with fewest requests', () => {
        const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
        // All start at 0 requests, 'a' wins by insertion order
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
        // a=1, b=0, c=0 -> 'b' wins
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('b');
        // a=1, b=1, c=0 -> 'c' wins
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('c');
    });
    (0, vitest_1.it)('returns null for empty array', () => {
        (0, vitest_1.expect)(strategy.select([])).toBeNull();
    });
    (0, vitest_1.it)('newly added key (0 requests) is preferred', () => {
        const a = makeEntry('a');
        const b = makeEntry('b');
        // Use a and b several times
        strategy.select([a, b]); // a
        strategy.select([a, b]); // b
        strategy.select([a, b]); // a (a=2, b=1)
        strategy.select([a, b]); // b (a=2, b=2)
        // Add new key
        const c = makeEntry('c');
        (0, vitest_1.expect)(strategy.select([a, b, c]).id).toBe('c');
    });
    (0, vitest_1.it)('equalizes distribution over many requests', () => {
        const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
        const counts = { a: 0, b: 0, c: 0 };
        for (let i = 0; i < 300; i++) {
            const selected = strategy.select(keys);
            counts[selected.id]++;
        }
        // Each key should get exactly 100 selections
        (0, vitest_1.expect)(counts.a).toBe(100);
        (0, vitest_1.expect)(counts.b).toBe(100);
        (0, vitest_1.expect)(counts.c).toBe(100);
    });
});
(0, vitest_1.describe)('WeightedRandomStrategy', () => {
    let strategy;
    (0, vitest_1.beforeEach)(() => {
        strategy = new weighted_random_1.WeightedRandomStrategy();
    });
    (0, vitest_1.it)('returns null for empty array', () => {
        (0, vitest_1.expect)(strategy.select([])).toBeNull();
    });
    (0, vitest_1.it)('single key is always selected', () => {
        const keys = [makeEntry('only', 5)];
        for (let i = 0; i < 100; i++) {
            (0, vitest_1.expect)(strategy.select(keys).id).toBe('only');
        }
    });
    (0, vitest_1.it)('distribution converges to weight ratios over many iterations', () => {
        const keys = [makeEntry('a', 3), makeEntry('b', 1)];
        const counts = { a: 0, b: 0 };
        const iterations = 10000;
        for (let i = 0; i < iterations; i++) {
            const selected = strategy.select(keys);
            counts[selected.id]++;
        }
        const ratioA = counts.a / iterations;
        const ratioB = counts.b / iterations;
        // Expected: a ~75%, b ~25%, tolerance 5%
        (0, vitest_1.expect)(ratioA).toBeGreaterThan(0.70);
        (0, vitest_1.expect)(ratioA).toBeLessThan(0.80);
        (0, vitest_1.expect)(ratioB).toBeGreaterThan(0.20);
        (0, vitest_1.expect)(ratioB).toBeLessThan(0.30);
    });
    (0, vitest_1.it)('equal weights produce roughly equal distribution', () => {
        const keys = [makeEntry('a', 1), makeEntry('b', 1), makeEntry('c', 1)];
        const counts = { a: 0, b: 0, c: 0 };
        const iterations = 9000;
        for (let i = 0; i < iterations; i++) {
            const selected = strategy.select(keys);
            counts[selected.id]++;
        }
        // Each should be ~33%, tolerance 5%
        for (const key of ['a', 'b', 'c']) {
            const ratio = counts[key] / iterations;
            (0, vitest_1.expect)(ratio).toBeGreaterThan(0.28);
            (0, vitest_1.expect)(ratio).toBeLessThan(0.38);
        }
    });
    (0, vitest_1.it)('uses weight field from InternalKeyEntry', () => {
        // Verify it reads the weight property directly
        const pool = new key_pool_1.KeyPool();
        pool.addKey({ id: 'heavy', key: 'sk-1', provider: 'openai', weight: 100 });
        pool.addKey({ id: 'light', key: 'sk-2', provider: 'openai', weight: 1 });
        const keys = pool.getAllKeys();
        const counts = { heavy: 0, light: 0 };
        const iterations = 1000;
        for (let i = 0; i < iterations; i++) {
            const selected = strategy.select(keys);
            counts[selected.id]++;
        }
        // 'heavy' should dominate (~99%)
        (0, vitest_1.expect)(counts.heavy).toBeGreaterThan(950);
    });
});
(0, vitest_1.describe)('PriorityStrategy', () => {
    let strategy;
    (0, vitest_1.beforeEach)(() => {
        strategy = new priority_1.PriorityStrategy();
    });
    (0, vitest_1.it)('selects lowest priority number key', () => {
        const keys = [makeEntry('low', 1, 2), makeEntry('high', 1, 0), makeEntry('mid', 1, 1)];
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('high');
    });
    (0, vitest_1.it)('returns null for empty array', () => {
        (0, vitest_1.expect)(strategy.select([])).toBeNull();
    });
    (0, vitest_1.it)('round-robin tiebreaker among same priority keys', () => {
        const keys = [
            makeEntry('a', 1, 0),
            makeEntry('b', 1, 0),
            makeEntry('c', 1, 1),
        ];
        // a and b both have priority 0
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('b');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('a');
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('b');
    });
    (0, vitest_1.it)('falls back to next priority level when top is unavailable', () => {
        const allKeys = [
            makeEntry('p0', 1, 0),
            makeEntry('p1a', 1, 1),
            makeEntry('p1b', 1, 1),
        ];
        // Top priority key selected
        (0, vitest_1.expect)(strategy.select(allKeys).id).toBe('p0');
        // Now simulate p0 going into cooldown
        const withoutP0 = [makeEntry('p1a', 1, 1), makeEntry('p1b', 1, 1)];
        const result = strategy.select(withoutP0);
        (0, vitest_1.expect)(result.priority).toBe(1);
    });
    (0, vitest_1.it)('uses priority field from InternalKeyEntry via KeyPool', () => {
        const pool = new key_pool_1.KeyPool();
        pool.addKey({ id: 'low', key: 'sk-1', provider: 'openai', priority: 10 });
        pool.addKey({ id: 'high', key: 'sk-2', provider: 'openai', priority: 0 });
        pool.addKey({ id: 'mid', key: 'sk-3', provider: 'openai', priority: 5 });
        const keys = pool.getAllKeys();
        (0, vitest_1.expect)(strategy.select(keys).id).toBe('high');
    });
});
(0, vitest_1.describe)('createRotationStrategy factory', () => {
    (0, vitest_1.it)('returns RoundRobinStrategy for "round-robin"', () => {
        const s = (0, rotation_1.createRotationStrategy)('round-robin');
        (0, vitest_1.expect)(s).toBeInstanceOf(round_robin_1.RoundRobinStrategy);
    });
    (0, vitest_1.it)('returns LeastRecentlyUsedStrategy for "least-recently-used"', () => {
        const s = (0, rotation_1.createRotationStrategy)('least-recently-used');
        (0, vitest_1.expect)(s).toBeInstanceOf(lru_1.LeastRecentlyUsedStrategy);
    });
    (0, vitest_1.it)('returns LeastRequestsStrategy for "least-requests"', () => {
        const s = (0, rotation_1.createRotationStrategy)('least-requests');
        (0, vitest_1.expect)(s).toBeInstanceOf(least_requests_1.LeastRequestsStrategy);
    });
    (0, vitest_1.it)('returns WeightedRandomStrategy for "weighted-random"', () => {
        const s = (0, rotation_1.createRotationStrategy)('weighted-random');
        (0, vitest_1.expect)(s).toBeInstanceOf(weighted_random_1.WeightedRandomStrategy);
    });
    (0, vitest_1.it)('returns PriorityStrategy for "priority"', () => {
        const s = (0, rotation_1.createRotationStrategy)('priority');
        (0, vitest_1.expect)(s).toBeInstanceOf(priority_1.PriorityStrategy);
    });
    (0, vitest_1.it)('throws TypeError for unknown strategy', () => {
        (0, vitest_1.expect)(() => (0, rotation_1.createRotationStrategy)('unknown'))
            .toThrow(TypeError);
        (0, vitest_1.expect)(() => (0, rotation_1.createRotationStrategy)('unknown'))
            .toThrow('Unknown rotation strategy: unknown');
    });
    (0, vitest_1.it)('returned strategy has a select method', () => {
        const strategies = [
            'round-robin',
            'least-recently-used',
            'least-requests',
            'weighted-random',
            'priority',
        ];
        for (const name of strategies) {
            const s = (0, rotation_1.createRotationStrategy)(name);
            (0, vitest_1.expect)(typeof s.select).toBe('function');
        }
    });
});
//# sourceMappingURL=rotation.test.js.map