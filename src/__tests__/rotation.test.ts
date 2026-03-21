import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyPool } from '../key-pool';
import type { InternalKeyEntry } from '../key-pool';
import { RoundRobinStrategy } from '../rotation/round-robin';
import { LeastRecentlyUsedStrategy } from '../rotation/lru';
import { LeastRequestsStrategy } from '../rotation/least-requests';
import { WeightedRandomStrategy } from '../rotation/weighted-random';
import { PriorityStrategy } from '../rotation/priority';
import { createRotationStrategy } from '../rotation';

function makeEntry(id: string, weight = 1, priority = 0): InternalKeyEntry {
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

describe('RoundRobinStrategy', () => {
  let strategy: RoundRobinStrategy;

  beforeEach(() => {
    strategy = new RoundRobinStrategy();
  });

  it('cycles through keys in order', () => {
    const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    expect(strategy.select(keys)!.id).toBe('a');
    expect(strategy.select(keys)!.id).toBe('b');
    expect(strategy.select(keys)!.id).toBe('c');
  });

  it('wraps around after last key', () => {
    const keys = [makeEntry('a'), makeEntry('b')];
    expect(strategy.select(keys)!.id).toBe('a');
    expect(strategy.select(keys)!.id).toBe('b');
    expect(strategy.select(keys)!.id).toBe('a');
    expect(strategy.select(keys)!.id).toBe('b');
  });

  it('returns null for empty array', () => {
    expect(strategy.select([])).toBeNull();
  });

  it('handles single key', () => {
    const keys = [makeEntry('only')];
    expect(strategy.select(keys)!.id).toBe('only');
    expect(strategy.select(keys)!.id).toBe('only');
    expect(strategy.select(keys)!.id).toBe('only');
  });

  it('adapts when available set changes', () => {
    const allKeys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    expect(strategy.select(allKeys)!.id).toBe('a');
    expect(strategy.select(allKeys)!.id).toBe('b');

    // Simulate key 'c' going into cooldown — only a and b available
    const reduced = [makeEntry('a'), makeEntry('b')];
    const result = strategy.select(reduced);
    // counter is 2, 2 % 2 = 0 -> 'a'
    expect(result!.id).toBe('a');
  });
});

describe('LeastRecentlyUsedStrategy', () => {
  let strategy: LeastRecentlyUsedStrategy;

  beforeEach(() => {
    strategy = new LeastRecentlyUsedStrategy();
    vi.useFakeTimers();
  });

  it('selects the least recently used key', () => {
    const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];

    // First call — all have lastUsed=0, so 'a' wins (first in iteration)
    vi.setSystemTime(100);
    expect(strategy.select(keys)!.id).toBe('a');

    // 'a' now has lastUsed=100, b and c still 0
    vi.setSystemTime(200);
    expect(strategy.select(keys)!.id).toBe('b');

    // b=200, a=100, c=0
    vi.setSystemTime(300);
    expect(strategy.select(keys)!.id).toBe('c');
  });

  it('breaks ties by insertion order (first key wins)', () => {
    const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    // All have lastUsed=0, first key wins
    expect(strategy.select(keys)!.id).toBe('a');
  });

  it('returns null for empty array', () => {
    expect(strategy.select([])).toBeNull();
  });

  it('key returning from cooldown has stale lastUsed and is selected', () => {
    const a = makeEntry('a');
    const b = makeEntry('b');

    vi.setSystemTime(100);
    strategy.select([a, b]); // selects 'a', lastUsed=100

    vi.setSystemTime(200);
    strategy.select([a, b]); // selects 'b', lastUsed=200

    // 'a' returns from cooldown at time 500 — 'a' has lastUsed=100, 'b' has lastUsed=200
    vi.setSystemTime(500);
    expect(strategy.select([a, b])!.id).toBe('a');
  });
});

describe('LeastRequestsStrategy', () => {
  let strategy: LeastRequestsStrategy;

  beforeEach(() => {
    strategy = new LeastRequestsStrategy();
  });

  it('selects key with fewest requests', () => {
    const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    // All start at 0 requests, 'a' wins by insertion order
    expect(strategy.select(keys)!.id).toBe('a');
    // a=1, b=0, c=0 -> 'b' wins
    expect(strategy.select(keys)!.id).toBe('b');
    // a=1, b=1, c=0 -> 'c' wins
    expect(strategy.select(keys)!.id).toBe('c');
  });

  it('returns null for empty array', () => {
    expect(strategy.select([])).toBeNull();
  });

  it('newly added key (0 requests) is preferred', () => {
    const a = makeEntry('a');
    const b = makeEntry('b');

    // Use a and b several times
    strategy.select([a, b]); // a
    strategy.select([a, b]); // b
    strategy.select([a, b]); // a (a=2, b=1)
    strategy.select([a, b]); // b (a=2, b=2)

    // Add new key
    const c = makeEntry('c');
    expect(strategy.select([a, b, c])!.id).toBe('c');
  });

  it('equalizes distribution over many requests', () => {
    const keys = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };

    for (let i = 0; i < 300; i++) {
      const selected = strategy.select(keys)!;
      counts[selected.id]++;
    }

    // Each key should get exactly 100 selections
    expect(counts.a).toBe(100);
    expect(counts.b).toBe(100);
    expect(counts.c).toBe(100);
  });
});

describe('WeightedRandomStrategy', () => {
  let strategy: WeightedRandomStrategy;

  beforeEach(() => {
    strategy = new WeightedRandomStrategy();
  });

  it('returns null for empty array', () => {
    expect(strategy.select([])).toBeNull();
  });

  it('single key is always selected', () => {
    const keys = [makeEntry('only', 5)];
    for (let i = 0; i < 100; i++) {
      expect(strategy.select(keys)!.id).toBe('only');
    }
  });

  it('distribution converges to weight ratios over many iterations', () => {
    const keys = [makeEntry('a', 3), makeEntry('b', 1)];
    const counts: Record<string, number> = { a: 0, b: 0 };
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const selected = strategy.select(keys)!;
      counts[selected.id]++;
    }

    const ratioA = counts.a / iterations;
    const ratioB = counts.b / iterations;

    // Expected: a ~75%, b ~25%, tolerance 5%
    expect(ratioA).toBeGreaterThan(0.70);
    expect(ratioA).toBeLessThan(0.80);
    expect(ratioB).toBeGreaterThan(0.20);
    expect(ratioB).toBeLessThan(0.30);
  });

  it('equal weights produce roughly equal distribution', () => {
    const keys = [makeEntry('a', 1), makeEntry('b', 1), makeEntry('c', 1)];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const iterations = 9000;

    for (let i = 0; i < iterations; i++) {
      const selected = strategy.select(keys)!;
      counts[selected.id]++;
    }

    // Each should be ~33%, tolerance 5%
    for (const key of ['a', 'b', 'c']) {
      const ratio = counts[key] / iterations;
      expect(ratio).toBeGreaterThan(0.28);
      expect(ratio).toBeLessThan(0.38);
    }
  });

  it('uses weight field from InternalKeyEntry', () => {
    // Verify it reads the weight property directly
    const pool = new KeyPool();
    pool.addKey({ id: 'heavy', key: 'sk-1', provider: 'openai', weight: 100 });
    pool.addKey({ id: 'light', key: 'sk-2', provider: 'openai', weight: 1 });

    const keys = pool.getAllKeys();
    const counts: Record<string, number> = { heavy: 0, light: 0 };
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const selected = strategy.select(keys)!;
      counts[selected.id]++;
    }

    // 'heavy' should dominate (~99%)
    expect(counts.heavy).toBeGreaterThan(950);
  });
});

describe('PriorityStrategy', () => {
  let strategy: PriorityStrategy;

  beforeEach(() => {
    strategy = new PriorityStrategy();
  });

  it('selects lowest priority number key', () => {
    const keys = [makeEntry('low', 1, 2), makeEntry('high', 1, 0), makeEntry('mid', 1, 1)];
    expect(strategy.select(keys)!.id).toBe('high');
  });

  it('returns null for empty array', () => {
    expect(strategy.select([])).toBeNull();
  });

  it('round-robin tiebreaker among same priority keys', () => {
    const keys = [
      makeEntry('a', 1, 0),
      makeEntry('b', 1, 0),
      makeEntry('c', 1, 1),
    ];
    // a and b both have priority 0
    expect(strategy.select(keys)!.id).toBe('a');
    expect(strategy.select(keys)!.id).toBe('b');
    expect(strategy.select(keys)!.id).toBe('a');
    expect(strategy.select(keys)!.id).toBe('b');
  });

  it('falls back to next priority level when top is unavailable', () => {
    const allKeys = [
      makeEntry('p0', 1, 0),
      makeEntry('p1a', 1, 1),
      makeEntry('p1b', 1, 1),
    ];

    // Top priority key selected
    expect(strategy.select(allKeys)!.id).toBe('p0');

    // Now simulate p0 going into cooldown
    const withoutP0 = [makeEntry('p1a', 1, 1), makeEntry('p1b', 1, 1)];
    const result = strategy.select(withoutP0);
    expect(result!.priority).toBe(1);
  });

  it('uses priority field from InternalKeyEntry via KeyPool', () => {
    const pool = new KeyPool();
    pool.addKey({ id: 'low', key: 'sk-1', provider: 'openai', priority: 10 });
    pool.addKey({ id: 'high', key: 'sk-2', provider: 'openai', priority: 0 });
    pool.addKey({ id: 'mid', key: 'sk-3', provider: 'openai', priority: 5 });

    const keys = pool.getAllKeys();
    expect(strategy.select(keys)!.id).toBe('high');
  });
});

describe('createRotationStrategy factory', () => {
  it('returns RoundRobinStrategy for "round-robin"', () => {
    const s = createRotationStrategy('round-robin');
    expect(s).toBeInstanceOf(RoundRobinStrategy);
  });

  it('returns LeastRecentlyUsedStrategy for "least-recently-used"', () => {
    const s = createRotationStrategy('least-recently-used');
    expect(s).toBeInstanceOf(LeastRecentlyUsedStrategy);
  });

  it('returns LeastRequestsStrategy for "least-requests"', () => {
    const s = createRotationStrategy('least-requests');
    expect(s).toBeInstanceOf(LeastRequestsStrategy);
  });

  it('returns WeightedRandomStrategy for "weighted-random"', () => {
    const s = createRotationStrategy('weighted-random');
    expect(s).toBeInstanceOf(WeightedRandomStrategy);
  });

  it('returns PriorityStrategy for "priority"', () => {
    const s = createRotationStrategy('priority');
    expect(s).toBeInstanceOf(PriorityStrategy);
  });

  it('throws TypeError for unknown strategy', () => {
    expect(() => createRotationStrategy('unknown' as any))
      .toThrow(TypeError);
    expect(() => createRotationStrategy('unknown' as any))
      .toThrow('Unknown rotation strategy: unknown');
  });

  it('returned strategy has a select method', () => {
    const strategies = [
      'round-robin',
      'least-recently-used',
      'least-requests',
      'weighted-random',
      'priority',
    ] as const;

    for (const name of strategies) {
      const s = createRotationStrategy(name);
      expect(typeof s.select).toBe('function');
    }
  });
});
