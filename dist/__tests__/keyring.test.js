"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const keyring_1 = require("../keyring");
const pool_exhausted_error_1 = require("../pool-exhausted-error");
function makeConfig(overrides) {
    return {
        keys: [
            { id: 'k1', key: 'sk-1', provider: 'openai' },
            { id: 'k2', key: 'sk-2', provider: 'openai' },
            { id: 'k3', key: 'sk-3', provider: 'anthropic' },
        ],
        ...overrides,
    };
}
(0, vitest_1.describe)('createKeyring', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.describe)('factory validation', () => {
        (0, vitest_1.it)('creates a keyring with valid config', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            (0, vitest_1.expect)(keyring).toBeDefined();
            (0, vitest_1.expect)(typeof keyring.getKey).toBe('function');
            (0, vitest_1.expect)(typeof keyring.reportUsage).toBe('function');
            (0, vitest_1.expect)(typeof keyring.reportError).toBe('function');
            (0, vitest_1.expect)(typeof keyring.addKey).toBe('function');
            (0, vitest_1.expect)(typeof keyring.removeKey).toBe('function');
            (0, vitest_1.expect)(typeof keyring.getStats).toBe('function');
        });
        (0, vitest_1.it)('throws TypeError when keys is empty', () => {
            (0, vitest_1.expect)(() => (0, keyring_1.createKeyring)({ keys: [] })).toThrow(TypeError);
            (0, vitest_1.expect)(() => (0, keyring_1.createKeyring)({ keys: [] })).toThrow('keys must be a non-empty array');
        });
        (0, vitest_1.it)('throws TypeError when keys is missing', () => {
            (0, vitest_1.expect)(() => (0, keyring_1.createKeyring)({})).toThrow(TypeError);
        });
    });
    (0, vitest_1.describe)('getKey', () => {
        (0, vitest_1.it)('returns a KeyEntry with key string', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            const entry = keyring.getKey();
            (0, vitest_1.expect)(entry).toBeDefined();
            (0, vitest_1.expect)(typeof entry.id).toBe('string');
            (0, vitest_1.expect)(typeof entry.key).toBe('string');
            (0, vitest_1.expect)(typeof entry.provider).toBe('string');
            (0, vitest_1.expect)(Array.isArray(entry.tags)).toBe(true);
        });
        (0, vitest_1.it)('rotates through keys with round-robin', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig({ strategy: 'round-robin' }));
            const ids = [];
            for (let i = 0; i < 6; i++) {
                ids.push(keyring.getKey().id);
            }
            // Round-robin should cycle through all 3 keys twice
            (0, vitest_1.expect)(ids[0]).toBe('k1');
            (0, vitest_1.expect)(ids[1]).toBe('k2');
            (0, vitest_1.expect)(ids[2]).toBe('k3');
            (0, vitest_1.expect)(ids[3]).toBe('k1');
            (0, vitest_1.expect)(ids[4]).toBe('k2');
            (0, vitest_1.expect)(ids[5]).toBe('k3');
        });
        (0, vitest_1.it)('filters by provider', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            const entry = keyring.getKey('anthropic');
            (0, vitest_1.expect)(entry.provider).toBe('anthropic');
            (0, vitest_1.expect)(entry.id).toBe('k3');
        });
        (0, vitest_1.it)('filters by provider using object syntax', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            const entry = keyring.getKey({ provider: 'anthropic' });
            (0, vitest_1.expect)(entry.provider).toBe('anthropic');
            (0, vitest_1.expect)(entry.id).toBe('k3');
        });
        (0, vitest_1.it)('filters by tag', () => {
            const keyring = (0, keyring_1.createKeyring)({
                keys: [
                    { id: 'k1', key: 'sk-1', provider: 'openai', tags: ['premium'] },
                    { id: 'k2', key: 'sk-2', provider: 'openai', tags: ['standard'] },
                    { id: 'k3', key: 'sk-3', provider: 'anthropic', tags: ['premium'] },
                ],
            });
            const entry = keyring.getKey({ tag: 'premium' });
            (0, vitest_1.expect)(['k1', 'k3']).toContain(entry.id);
        });
        (0, vitest_1.it)('returns any available key when no filter provided', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            const entry = keyring.getKey();
            (0, vitest_1.expect)(['k1', 'k2', 'k3']).toContain(entry.id);
        });
        (0, vitest_1.it)('skips keys in cooldown', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            // Put k1 in cooldown via a 429 error
            keyring.reportError('k1', { status: 429 });
            // Now getKey should skip k1
            const ids = new Set();
            for (let i = 0; i < 10; i++) {
                ids.add(keyring.getKey().id);
            }
            (0, vitest_1.expect)(ids.has('k1')).toBe(false);
            (0, vitest_1.expect)(ids.has('k2')).toBe(true);
            (0, vitest_1.expect)(ids.has('k3')).toBe(true);
        });
    });
    (0, vitest_1.describe)('reportUsage', () => {
        (0, vitest_1.it)('records usage metrics', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.getKey(); // use k1
            keyring.reportUsage('k1', { tokens: 100, inputTokens: 60, outputTokens: 40, cost: 0.01 });
            const stats = keyring.getStats();
            (0, vitest_1.expect)(stats.keys['k1'].tokens).toBe(100);
            (0, vitest_1.expect)(stats.keys['k1'].inputTokens).toBe(60);
            (0, vitest_1.expect)(stats.keys['k1'].outputTokens).toBe(40);
            (0, vitest_1.expect)(stats.keys['k1'].cost).toBe(0.01);
        });
        (0, vitest_1.it)('is a no-op for unknown keyId', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            // Should not throw
            keyring.reportUsage('non-existent', { tokens: 100 });
        });
    });
    (0, vitest_1.describe)('reportError', () => {
        (0, vitest_1.it)('places key in cooldown on 429 error', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.reportError('k1', { status: 429 });
            const stats = keyring.getStats();
            (0, vitest_1.expect)(stats.keys['k1'].status).toBe('cooldown');
            (0, vitest_1.expect)(stats.keys['k1'].errors).toBe(1);
            (0, vitest_1.expect)(stats.keys['k1'].rateLimits).toBe(1);
        });
        (0, vitest_1.it)('does not place key in cooldown for non-429 error', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.reportError('k1', { status: 500 });
            const stats = keyring.getStats();
            (0, vitest_1.expect)(stats.keys['k1'].status).toBe('available');
            (0, vitest_1.expect)(stats.keys['k1'].errors).toBe(1);
            (0, vitest_1.expect)(stats.keys['k1'].rateLimits).toBe(0);
        });
        (0, vitest_1.it)('is a no-op for unknown keyId', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            // Should not throw
            keyring.reportError('non-existent', { status: 429 });
        });
        (0, vitest_1.it)('fires onCooldownStart hook on 429', () => {
            const onCooldownStart = vitest_1.vi.fn();
            const keyring = (0, keyring_1.createKeyring)(makeConfig({ hooks: { onCooldownStart } }));
            keyring.reportError('k1', { status: 429 });
            (0, vitest_1.expect)(onCooldownStart).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(onCooldownStart).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                keyId: 'k1',
                provider: 'openai',
            }));
        });
    });
    (0, vitest_1.describe)('addKey', () => {
        (0, vitest_1.it)('adds a key dynamically', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.addKey({ id: 'k4', key: 'sk-4', provider: 'google' });
            const stats = keyring.getStats();
            (0, vitest_1.expect)(stats.keys['k4']).toBeDefined();
            (0, vitest_1.expect)(stats.keys['k4'].provider).toBe('google');
            (0, vitest_1.expect)(stats.pools['google']).toBeDefined();
            (0, vitest_1.expect)(stats.pools['google'].totalKeys).toBe(1);
        });
        (0, vitest_1.it)('newly added key is immediately available for selection', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.addKey({ id: 'k4', key: 'sk-4', provider: 'google' });
            const entry = keyring.getKey('google');
            (0, vitest_1.expect)(entry.id).toBe('k4');
        });
    });
    (0, vitest_1.describe)('removeKey', () => {
        (0, vitest_1.it)('removes a key from the keyring', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.removeKey('k1');
            const stats = keyring.getStats();
            (0, vitest_1.expect)(stats.keys['k1']).toBeUndefined();
        });
        (0, vitest_1.it)('is a no-op for non-existent id', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            // Should not throw
            keyring.removeKey('non-existent');
            const stats = keyring.getStats();
            (0, vitest_1.expect)(Object.keys(stats.keys)).toHaveLength(3);
        });
        (0, vitest_1.it)('removed key is no longer returned by getKey', () => {
            const keyring = (0, keyring_1.createKeyring)({
                keys: [
                    { id: 'k1', key: 'sk-1', provider: 'openai' },
                    { id: 'k2', key: 'sk-2', provider: 'openai' },
                ],
            });
            keyring.removeKey('k1');
            // All getKey calls should return k2
            for (let i = 0; i < 5; i++) {
                (0, vitest_1.expect)(keyring.getKey().id).toBe('k2');
            }
        });
    });
    (0, vitest_1.describe)('getStats', () => {
        (0, vitest_1.it)('returns correct shape with per-key and per-pool stats', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            // Generate some usage
            keyring.getKey(); // k1
            keyring.reportUsage('k1', { tokens: 50 });
            keyring.getKey(); // k2
            keyring.reportUsage('k2', { tokens: 30 });
            const stats = keyring.getStats();
            // Per-key stats
            (0, vitest_1.expect)(stats.keys['k1']).toBeDefined();
            (0, vitest_1.expect)(stats.keys['k1'].id).toBe('k1');
            (0, vitest_1.expect)(stats.keys['k1'].provider).toBe('openai');
            (0, vitest_1.expect)(stats.keys['k1'].requests).toBe(1);
            (0, vitest_1.expect)(stats.keys['k1'].tokens).toBe(50);
            (0, vitest_1.expect)(stats.keys['k1'].status).toBe('available');
            (0, vitest_1.expect)(stats.keys['k1'].healthStatus).toBe('unknown');
            (0, vitest_1.expect)(stats.keys['k2']).toBeDefined();
            (0, vitest_1.expect)(stats.keys['k2'].requests).toBe(1);
            (0, vitest_1.expect)(stats.keys['k2'].tokens).toBe(30);
            (0, vitest_1.expect)(stats.keys['k3']).toBeDefined();
            (0, vitest_1.expect)(stats.keys['k3'].requests).toBe(0);
            // Per-pool stats
            (0, vitest_1.expect)(stats.pools['openai']).toBeDefined();
            (0, vitest_1.expect)(stats.pools['openai'].totalKeys).toBe(2);
            (0, vitest_1.expect)(stats.pools['openai'].availableKeys).toBe(2);
            (0, vitest_1.expect)(stats.pools['openai'].cooldownKeys).toBe(0);
            (0, vitest_1.expect)(stats.pools['openai'].disabledKeys).toBe(0);
            (0, vitest_1.expect)(stats.pools['openai'].totalRequests).toBe(2);
            (0, vitest_1.expect)(stats.pools['openai'].totalTokens).toBe(80);
            (0, vitest_1.expect)(stats.pools['openai'].totalErrors).toBe(0);
            (0, vitest_1.expect)(stats.pools['anthropic']).toBeDefined();
            (0, vitest_1.expect)(stats.pools['anthropic'].totalKeys).toBe(1);
        });
        (0, vitest_1.it)('reflects cooldown status correctly', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.reportError('k1', { status: 429 });
            const stats = keyring.getStats();
            (0, vitest_1.expect)(stats.keys['k1'].status).toBe('cooldown');
            (0, vitest_1.expect)(stats.keys['k1'].cooldownEndsAt).not.toBeNull();
            (0, vitest_1.expect)(stats.pools['openai'].cooldownKeys).toBe(1);
            (0, vitest_1.expect)(stats.pools['openai'].availableKeys).toBe(1);
        });
    });
    (0, vitest_1.describe)('pool exhaustion', () => {
        (0, vitest_1.it)('throws PoolExhaustedError when all keys are in cooldown', () => {
            const keyring = (0, keyring_1.createKeyring)({
                keys: [
                    { id: 'k1', key: 'sk-1', provider: 'openai' },
                    { id: 'k2', key: 'sk-2', provider: 'openai' },
                ],
            });
            keyring.reportError('k1', { status: 429 });
            keyring.reportError('k2', { status: 429 });
            (0, vitest_1.expect)(() => keyring.getKey('openai')).toThrow(pool_exhausted_error_1.PoolExhaustedError);
        });
        (0, vitest_1.it)('PoolExhaustedError has correct properties', () => {
            const keyring = (0, keyring_1.createKeyring)({
                keys: [
                    { id: 'k1', key: 'sk-1', provider: 'openai' },
                ],
            });
            keyring.reportError('k1', { status: 429 });
            try {
                keyring.getKey('openai');
                vitest_1.expect.unreachable('Should have thrown');
            }
            catch (err) {
                (0, vitest_1.expect)(err).toBeInstanceOf(pool_exhausted_error_1.PoolExhaustedError);
                const poolErr = err;
                (0, vitest_1.expect)(poolErr.pool).toBe('openai');
                (0, vitest_1.expect)(poolErr.keyStates).toBeDefined();
                (0, vitest_1.expect)(poolErr.keyStates.length).toBeGreaterThan(0);
                (0, vitest_1.expect)(typeof poolErr.shortestCooldownMs).toBe('number');
            }
        });
        (0, vitest_1.it)('fires onPoolExhausted hook before throwing', () => {
            const onPoolExhausted = vitest_1.vi.fn();
            const keyring = (0, keyring_1.createKeyring)({
                keys: [
                    { id: 'k1', key: 'sk-1', provider: 'openai' },
                ],
                hooks: { onPoolExhausted },
            });
            keyring.reportError('k1', { status: 429 });
            try {
                keyring.getKey('openai');
            }
            catch {
                // expected
            }
            (0, vitest_1.expect)(onPoolExhausted).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(onPoolExhausted).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                pool: 'openai',
                totalKeys: 1,
                cooldownKeys: 1,
                disabledKeys: 0,
            }));
        });
    });
    (0, vitest_1.describe)('custom strategy', () => {
        (0, vitest_1.it)('respects strategy option', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig({ strategy: 'least-recently-used' }));
            // Should still return keys without error
            const entry = keyring.getKey();
            (0, vitest_1.expect)(entry).toBeDefined();
        });
        (0, vitest_1.it)('per-pool strategy override works', () => {
            const keyring = (0, keyring_1.createKeyring)({
                keys: [
                    { id: 'k1', key: 'sk-1', provider: 'openai', priority: 2 },
                    { id: 'k2', key: 'sk-2', provider: 'openai', priority: 0 },
                ],
                strategy: 'round-robin',
                pools: {
                    openai: { strategy: 'priority' },
                },
            });
            // With priority strategy, k2 (priority 0) should always be selected first
            const entry = keyring.getKey('openai');
            (0, vitest_1.expect)(entry.id).toBe('k2');
        });
    });
    (0, vitest_1.describe)('onKeyRotation hook', () => {
        (0, vitest_1.it)('fires on every getKey call', () => {
            const onKeyRotation = vitest_1.vi.fn();
            const keyring = (0, keyring_1.createKeyring)(makeConfig({ hooks: { onKeyRotation } }));
            keyring.getKey();
            keyring.getKey();
            (0, vitest_1.expect)(onKeyRotation).toHaveBeenCalledTimes(2);
            (0, vitest_1.expect)(onKeyRotation).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                keyId: vitest_1.expect.any(String),
                provider: vitest_1.expect.any(String),
                strategy: 'round-robin',
                poolSize: vitest_1.expect.any(Number),
                availableKeys: vitest_1.expect.any(Number),
            }));
        });
    });
    (0, vitest_1.describe)('exportState', () => {
        (0, vitest_1.it)('returns serializable state without key strings', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            keyring.getKey();
            keyring.reportUsage('k1', { tokens: 100 });
            const state = keyring.exportState();
            (0, vitest_1.expect)(state.exportedAt).toBeDefined();
            (0, vitest_1.expect)(state.keys['k1']).toBeDefined();
            (0, vitest_1.expect)(state.keys['k1'].requests).toBe(1);
            (0, vitest_1.expect)(state.keys['k1'].tokens).toBe(100);
            // Should not contain raw key strings
            (0, vitest_1.expect)(state.keys['k1'].key).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('shutdown', () => {
        (0, vitest_1.it)('does not throw', () => {
            const keyring = (0, keyring_1.createKeyring)(makeConfig());
            (0, vitest_1.expect)(() => keyring.shutdown()).not.toThrow();
        });
    });
});
//# sourceMappingURL=keyring.test.js.map