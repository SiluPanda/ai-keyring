"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const key_pool_1 = require("../key-pool");
(0, vitest_1.describe)('KeyPool', () => {
    (0, vitest_1.describe)('addKey', () => {
        (0, vitest_1.it)('groups keys by provider', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ key: 'sk-1', provider: 'openai' });
            pool.addKey({ key: 'sk-2', provider: 'openai' });
            pool.addKey({ key: 'sk-3', provider: 'anthropic' });
            const openaiKeys = pool.getKeysByProvider('openai');
            (0, vitest_1.expect)(openaiKeys).toHaveLength(2);
            (0, vitest_1.expect)(openaiKeys.every(k => k.provider === 'openai')).toBe(true);
            const anthropicKeys = pool.getKeysByProvider('anthropic');
            (0, vitest_1.expect)(anthropicKeys).toHaveLength(1);
            (0, vitest_1.expect)(anthropicKeys[0].provider).toBe('anthropic');
        });
        (0, vitest_1.it)('groups keys by tags', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium'] });
            pool.addKey({ key: 'sk-2', provider: 'openai', tags: ['free'] });
            pool.addKey({ key: 'sk-3', provider: 'anthropic', tags: ['premium'] });
            const premiumKeys = pool.getKeysByTag('premium');
            (0, vitest_1.expect)(premiumKeys).toHaveLength(2);
            (0, vitest_1.expect)(premiumKeys.map(k => k.key)).toEqual(['sk-1', 'sk-3']);
            const freeKeys = pool.getKeysByTag('free');
            (0, vitest_1.expect)(freeKeys).toHaveLength(1);
            (0, vitest_1.expect)(freeKeys[0].key).toBe('sk-2');
        });
        (0, vitest_1.it)('throws TypeError on duplicate id', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ id: 'dup', key: 'sk-1', provider: 'openai' });
            (0, vitest_1.expect)(() => pool.addKey({ id: 'dup', key: 'sk-2', provider: 'openai' }))
                .toThrow(TypeError);
            (0, vitest_1.expect)(() => pool.addKey({ id: 'dup', key: 'sk-2', provider: 'openai' }))
                .toThrow('Duplicate key id: "dup"');
        });
        (0, vitest_1.it)('throws TypeError on empty key', () => {
            const pool = new key_pool_1.KeyPool();
            (0, vitest_1.expect)(() => pool.addKey({ key: '', provider: 'openai' }))
                .toThrow(TypeError);
            (0, vitest_1.expect)(() => pool.addKey({ key: '', provider: 'openai' }))
                .toThrow('key must be a non-empty string');
        });
        (0, vitest_1.it)('throws TypeError on empty provider', () => {
            const pool = new key_pool_1.KeyPool();
            (0, vitest_1.expect)(() => pool.addKey({ key: 'sk-1', provider: '' }))
                .toThrow(TypeError);
            (0, vitest_1.expect)(() => pool.addKey({ key: 'sk-1', provider: '' }))
                .toThrow('provider must be a non-empty string');
        });
        (0, vitest_1.it)('auto-generates unique ids when not provided', () => {
            const pool = new key_pool_1.KeyPool();
            const entry1 = pool.addKey({ key: 'sk-1', provider: 'openai' });
            const entry2 = pool.addKey({ key: 'sk-2', provider: 'openai' });
            (0, vitest_1.expect)(entry1.id).toBeTruthy();
            (0, vitest_1.expect)(entry2.id).toBeTruthy();
            (0, vitest_1.expect)(entry1.id).not.toBe(entry2.id);
        });
        (0, vitest_1.it)('uses provided id when given', () => {
            const pool = new key_pool_1.KeyPool();
            const entry = pool.addKey({ id: 'my-id', key: 'sk-1', provider: 'openai' });
            (0, vitest_1.expect)(entry.id).toBe('my-id');
        });
        (0, vitest_1.it)('defaults tags to empty array when not provided', () => {
            const pool = new key_pool_1.KeyPool();
            const entry = pool.addKey({ key: 'sk-1', provider: 'openai' });
            (0, vitest_1.expect)(entry.tags).toEqual([]);
        });
        (0, vitest_1.it)('sets disabled to false on newly added key', () => {
            const pool = new key_pool_1.KeyPool();
            const entry = pool.addKey({ key: 'sk-1', provider: 'openai' });
            (0, vitest_1.expect)(entry.disabled).toBe(false);
        });
        (0, vitest_1.it)('keys with multiple tags appear in all tag pools', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium', 'fast', 'gpt4'] });
            (0, vitest_1.expect)(pool.getKeysByTag('premium')).toHaveLength(1);
            (0, vitest_1.expect)(pool.getKeysByTag('fast')).toHaveLength(1);
            (0, vitest_1.expect)(pool.getKeysByTag('gpt4')).toHaveLength(1);
            // All should reference the same key
            (0, vitest_1.expect)(pool.getKeysByTag('premium')[0].key).toBe('sk-1');
            (0, vitest_1.expect)(pool.getKeysByTag('fast')[0].key).toBe('sk-1');
            (0, vitest_1.expect)(pool.getKeysByTag('gpt4')[0].key).toBe('sk-1');
        });
    });
    (0, vitest_1.describe)('removeKey', () => {
        (0, vitest_1.it)('removes key from all groups', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({
                id: 'k1',
                key: 'sk-1',
                provider: 'openai',
                tags: ['premium', 'fast'],
            });
            pool.removeKey('k1');
            (0, vitest_1.expect)(pool.getKey('k1')).toBeUndefined();
            (0, vitest_1.expect)(pool.getKeysByProvider('openai')).toHaveLength(0);
            (0, vitest_1.expect)(pool.getKeysByTag('premium')).toHaveLength(0);
            (0, vitest_1.expect)(pool.getKeysByTag('fast')).toHaveLength(0);
            (0, vitest_1.expect)(pool.size()).toBe(0);
        });
        (0, vitest_1.it)('is a no-op for non-existent id', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            // Should not throw
            pool.removeKey('non-existent');
            (0, vitest_1.expect)(pool.size()).toBe(1);
            (0, vitest_1.expect)(pool.getKey('k1')).toBeDefined();
        });
        (0, vitest_1.it)('removing last key in pool leaves pool empty', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai', tags: ['solo'] });
            pool.removeKey('k1');
            (0, vitest_1.expect)(pool.size()).toBe(0);
            (0, vitest_1.expect)(pool.getAllKeys()).toEqual([]);
            (0, vitest_1.expect)(pool.getKeysByProvider('openai')).toEqual([]);
            (0, vitest_1.expect)(pool.getKeysByTag('solo')).toEqual([]);
        });
        (0, vitest_1.it)('only removes the specified key, leaving others intact', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai', tags: ['premium'] });
            pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai', tags: ['premium'] });
            pool.removeKey('k1');
            (0, vitest_1.expect)(pool.size()).toBe(1);
            (0, vitest_1.expect)(pool.getKey('k1')).toBeUndefined();
            (0, vitest_1.expect)(pool.getKey('k2')).toBeDefined();
            (0, vitest_1.expect)(pool.getKeysByProvider('openai')).toHaveLength(1);
            (0, vitest_1.expect)(pool.getKeysByTag('premium')).toHaveLength(1);
        });
    });
    (0, vitest_1.describe)('getKeysByProvider', () => {
        (0, vitest_1.it)('returns correct subset of keys for a given provider', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ key: 'sk-1', provider: 'openai' });
            pool.addKey({ key: 'sk-2', provider: 'anthropic' });
            pool.addKey({ key: 'sk-3', provider: 'openai' });
            const openaiKeys = pool.getKeysByProvider('openai');
            (0, vitest_1.expect)(openaiKeys).toHaveLength(2);
            (0, vitest_1.expect)(openaiKeys.map(k => k.key).sort()).toEqual(['sk-1', 'sk-3']);
            const anthropicKeys = pool.getKeysByProvider('anthropic');
            (0, vitest_1.expect)(anthropicKeys).toHaveLength(1);
        });
        (0, vitest_1.it)('returns empty array for unknown provider', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ key: 'sk-1', provider: 'openai' });
            (0, vitest_1.expect)(pool.getKeysByProvider('unknown')).toEqual([]);
        });
    });
    (0, vitest_1.describe)('getKeysByTag', () => {
        (0, vitest_1.it)('returns correct subset of keys for a given tag', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium'] });
            pool.addKey({ key: 'sk-2', provider: 'openai', tags: ['free'] });
            pool.addKey({ key: 'sk-3', provider: 'anthropic', tags: ['premium'] });
            const premiumKeys = pool.getKeysByTag('premium');
            (0, vitest_1.expect)(premiumKeys).toHaveLength(2);
            (0, vitest_1.expect)(premiumKeys.map(k => k.key).sort()).toEqual(['sk-1', 'sk-3']);
        });
        (0, vitest_1.it)('returns empty array for unknown tag', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium'] });
            (0, vitest_1.expect)(pool.getKeysByTag('unknown')).toEqual([]);
        });
    });
    (0, vitest_1.describe)('getAvailableKeys', () => {
        (0, vitest_1.it)('filters out disabled keys', () => {
            const pool = new key_pool_1.KeyPool();
            const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });
            k1.disabled = true;
            const available = pool.getAvailableKeys();
            (0, vitest_1.expect)(available).toHaveLength(1);
            (0, vitest_1.expect)(available[0].id).toBe('k2');
        });
        (0, vitest_1.it)('filters out disabled keys for a specific provider', () => {
            const pool = new key_pool_1.KeyPool();
            const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });
            k1.disabled = true;
            const available = pool.getAvailableKeys({ provider: 'openai' });
            (0, vitest_1.expect)(available).toHaveLength(1);
            (0, vitest_1.expect)(available[0].id).toBe('k2');
        });
        (0, vitest_1.it)('filters out disabled keys for a specific tag', () => {
            const pool = new key_pool_1.KeyPool();
            const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai', tags: ['premium'] });
            pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai', tags: ['premium'] });
            k1.disabled = true;
            const available = pool.getAvailableKeys({ tag: 'premium' });
            (0, vitest_1.expect)(available).toHaveLength(1);
            (0, vitest_1.expect)(available[0].id).toBe('k2');
        });
        (0, vitest_1.it)('filters expired keys via metadata.expiresAt (number)', () => {
            vitest_1.vi.useFakeTimers();
            vitest_1.vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
            const pool = new key_pool_1.KeyPool();
            pool.addKey({
                id: 'k1',
                key: 'sk-1',
                provider: 'openai',
                metadata: { expiresAt: Date.now() - 1000 }, // already expired
            });
            pool.addKey({
                id: 'k2',
                key: 'sk-2',
                provider: 'openai',
                metadata: { expiresAt: Date.now() + 60000 }, // not expired
            });
            const available = pool.getAvailableKeys();
            (0, vitest_1.expect)(available).toHaveLength(1);
            (0, vitest_1.expect)(available[0].id).toBe('k2');
            // The expired key should now be disabled
            (0, vitest_1.expect)(pool.getKey('k1').disabled).toBe(true);
            vitest_1.vi.useRealTimers();
        });
        (0, vitest_1.it)('filters expired keys via metadata.expiresAt (string)', () => {
            vitest_1.vi.useFakeTimers();
            vitest_1.vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
            const pool = new key_pool_1.KeyPool();
            pool.addKey({
                id: 'k1',
                key: 'sk-1',
                provider: 'openai',
                metadata: { expiresAt: '2026-03-21T11:00:00Z' }, // 1 hour ago
            });
            pool.addKey({
                id: 'k2',
                key: 'sk-2',
                provider: 'openai',
                metadata: { expiresAt: '2026-03-21T13:00:00Z' }, // 1 hour from now
            });
            const available = pool.getAvailableKeys();
            (0, vitest_1.expect)(available).toHaveLength(1);
            (0, vitest_1.expect)(available[0].id).toBe('k2');
            vitest_1.vi.useRealTimers();
        });
        (0, vitest_1.it)('returns all keys when none are disabled or expired', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });
            pool.addKey({ id: 'k3', key: 'sk-3', provider: 'anthropic' });
            const available = pool.getAvailableKeys();
            (0, vitest_1.expect)(available).toHaveLength(3);
        });
        (0, vitest_1.it)('returns empty array when all keys are disabled', () => {
            const pool = new key_pool_1.KeyPool();
            const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            const k2 = pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });
            k1.disabled = true;
            k2.disabled = true;
            (0, vitest_1.expect)(pool.getAvailableKeys()).toEqual([]);
        });
    });
    (0, vitest_1.describe)('getAllKeys', () => {
        (0, vitest_1.it)('returns all keys regardless of disabled state', () => {
            const pool = new key_pool_1.KeyPool();
            const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            pool.addKey({ id: 'k2', key: 'sk-2', provider: 'anthropic' });
            k1.disabled = true;
            const all = pool.getAllKeys();
            (0, vitest_1.expect)(all).toHaveLength(2);
        });
        (0, vitest_1.it)('returns empty array when pool is empty', () => {
            const pool = new key_pool_1.KeyPool();
            (0, vitest_1.expect)(pool.getAllKeys()).toEqual([]);
        });
    });
    (0, vitest_1.describe)('getKey', () => {
        (0, vitest_1.it)('returns key entry by id', () => {
            const pool = new key_pool_1.KeyPool();
            pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            const entry = pool.getKey('k1');
            (0, vitest_1.expect)(entry).toBeDefined();
            (0, vitest_1.expect)(entry.id).toBe('k1');
            (0, vitest_1.expect)(entry.key).toBe('sk-1');
            (0, vitest_1.expect)(entry.provider).toBe('openai');
        });
        (0, vitest_1.it)('returns undefined for non-existent id', () => {
            const pool = new key_pool_1.KeyPool();
            (0, vitest_1.expect)(pool.getKey('non-existent')).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('size', () => {
        (0, vitest_1.it)('returns correct count', () => {
            const pool = new key_pool_1.KeyPool();
            (0, vitest_1.expect)(pool.size()).toBe(0);
            pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
            (0, vitest_1.expect)(pool.size()).toBe(1);
            pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });
            (0, vitest_1.expect)(pool.size()).toBe(2);
            pool.removeKey('k1');
            (0, vitest_1.expect)(pool.size()).toBe(1);
            pool.removeKey('k2');
            (0, vitest_1.expect)(pool.size()).toBe(0);
        });
    });
});
//# sourceMappingURL=key-pool.test.js.map