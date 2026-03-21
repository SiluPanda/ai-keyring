import { describe, it, expect, vi } from 'vitest';
import { KeyPool } from '../key-pool';

describe('KeyPool', () => {
  describe('addKey', () => {
    it('groups keys by provider', () => {
      const pool = new KeyPool();
      pool.addKey({ key: 'sk-1', provider: 'openai' });
      pool.addKey({ key: 'sk-2', provider: 'openai' });
      pool.addKey({ key: 'sk-3', provider: 'anthropic' });

      const openaiKeys = pool.getKeysByProvider('openai');
      expect(openaiKeys).toHaveLength(2);
      expect(openaiKeys.every(k => k.provider === 'openai')).toBe(true);

      const anthropicKeys = pool.getKeysByProvider('anthropic');
      expect(anthropicKeys).toHaveLength(1);
      expect(anthropicKeys[0].provider).toBe('anthropic');
    });

    it('groups keys by tags', () => {
      const pool = new KeyPool();
      pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium'] });
      pool.addKey({ key: 'sk-2', provider: 'openai', tags: ['free'] });
      pool.addKey({ key: 'sk-3', provider: 'anthropic', tags: ['premium'] });

      const premiumKeys = pool.getKeysByTag('premium');
      expect(premiumKeys).toHaveLength(2);
      expect(premiumKeys.map(k => k.key)).toEqual(['sk-1', 'sk-3']);

      const freeKeys = pool.getKeysByTag('free');
      expect(freeKeys).toHaveLength(1);
      expect(freeKeys[0].key).toBe('sk-2');
    });

    it('throws TypeError on duplicate id', () => {
      const pool = new KeyPool();
      pool.addKey({ id: 'dup', key: 'sk-1', provider: 'openai' });

      expect(() => pool.addKey({ id: 'dup', key: 'sk-2', provider: 'openai' }))
        .toThrow(TypeError);
      expect(() => pool.addKey({ id: 'dup', key: 'sk-2', provider: 'openai' }))
        .toThrow('Duplicate key id: "dup"');
    });

    it('throws TypeError on empty key', () => {
      const pool = new KeyPool();
      expect(() => pool.addKey({ key: '', provider: 'openai' }))
        .toThrow(TypeError);
      expect(() => pool.addKey({ key: '', provider: 'openai' }))
        .toThrow('key must be a non-empty string');
    });

    it('throws TypeError on empty provider', () => {
      const pool = new KeyPool();
      expect(() => pool.addKey({ key: 'sk-1', provider: '' }))
        .toThrow(TypeError);
      expect(() => pool.addKey({ key: 'sk-1', provider: '' }))
        .toThrow('provider must be a non-empty string');
    });

    it('auto-generates unique ids when not provided', () => {
      const pool = new KeyPool();
      const entry1 = pool.addKey({ key: 'sk-1', provider: 'openai' });
      const entry2 = pool.addKey({ key: 'sk-2', provider: 'openai' });

      expect(entry1.id).toBeTruthy();
      expect(entry2.id).toBeTruthy();
      expect(entry1.id).not.toBe(entry2.id);
    });

    it('uses provided id when given', () => {
      const pool = new KeyPool();
      const entry = pool.addKey({ id: 'my-id', key: 'sk-1', provider: 'openai' });
      expect(entry.id).toBe('my-id');
    });

    it('defaults tags to empty array when not provided', () => {
      const pool = new KeyPool();
      const entry = pool.addKey({ key: 'sk-1', provider: 'openai' });
      expect(entry.tags).toEqual([]);
    });

    it('sets disabled to false on newly added key', () => {
      const pool = new KeyPool();
      const entry = pool.addKey({ key: 'sk-1', provider: 'openai' });
      expect(entry.disabled).toBe(false);
    });

    it('keys with multiple tags appear in all tag pools', () => {
      const pool = new KeyPool();
      pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium', 'fast', 'gpt4'] });

      expect(pool.getKeysByTag('premium')).toHaveLength(1);
      expect(pool.getKeysByTag('fast')).toHaveLength(1);
      expect(pool.getKeysByTag('gpt4')).toHaveLength(1);

      // All should reference the same key
      expect(pool.getKeysByTag('premium')[0].key).toBe('sk-1');
      expect(pool.getKeysByTag('fast')[0].key).toBe('sk-1');
      expect(pool.getKeysByTag('gpt4')[0].key).toBe('sk-1');
    });
  });

  describe('removeKey', () => {
    it('removes key from all groups', () => {
      const pool = new KeyPool();
      pool.addKey({
        id: 'k1',
        key: 'sk-1',
        provider: 'openai',
        tags: ['premium', 'fast'],
      });

      pool.removeKey('k1');

      expect(pool.getKey('k1')).toBeUndefined();
      expect(pool.getKeysByProvider('openai')).toHaveLength(0);
      expect(pool.getKeysByTag('premium')).toHaveLength(0);
      expect(pool.getKeysByTag('fast')).toHaveLength(0);
      expect(pool.size()).toBe(0);
    });

    it('is a no-op for non-existent id', () => {
      const pool = new KeyPool();
      pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });

      // Should not throw
      pool.removeKey('non-existent');

      expect(pool.size()).toBe(1);
      expect(pool.getKey('k1')).toBeDefined();
    });

    it('removing last key in pool leaves pool empty', () => {
      const pool = new KeyPool();
      pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai', tags: ['solo'] });

      pool.removeKey('k1');

      expect(pool.size()).toBe(0);
      expect(pool.getAllKeys()).toEqual([]);
      expect(pool.getKeysByProvider('openai')).toEqual([]);
      expect(pool.getKeysByTag('solo')).toEqual([]);
    });

    it('only removes the specified key, leaving others intact', () => {
      const pool = new KeyPool();
      pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai', tags: ['premium'] });
      pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai', tags: ['premium'] });

      pool.removeKey('k1');

      expect(pool.size()).toBe(1);
      expect(pool.getKey('k1')).toBeUndefined();
      expect(pool.getKey('k2')).toBeDefined();
      expect(pool.getKeysByProvider('openai')).toHaveLength(1);
      expect(pool.getKeysByTag('premium')).toHaveLength(1);
    });
  });

  describe('getKeysByProvider', () => {
    it('returns correct subset of keys for a given provider', () => {
      const pool = new KeyPool();
      pool.addKey({ key: 'sk-1', provider: 'openai' });
      pool.addKey({ key: 'sk-2', provider: 'anthropic' });
      pool.addKey({ key: 'sk-3', provider: 'openai' });

      const openaiKeys = pool.getKeysByProvider('openai');
      expect(openaiKeys).toHaveLength(2);
      expect(openaiKeys.map(k => k.key).sort()).toEqual(['sk-1', 'sk-3']);

      const anthropicKeys = pool.getKeysByProvider('anthropic');
      expect(anthropicKeys).toHaveLength(1);
    });

    it('returns empty array for unknown provider', () => {
      const pool = new KeyPool();
      pool.addKey({ key: 'sk-1', provider: 'openai' });

      expect(pool.getKeysByProvider('unknown')).toEqual([]);
    });
  });

  describe('getKeysByTag', () => {
    it('returns correct subset of keys for a given tag', () => {
      const pool = new KeyPool();
      pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium'] });
      pool.addKey({ key: 'sk-2', provider: 'openai', tags: ['free'] });
      pool.addKey({ key: 'sk-3', provider: 'anthropic', tags: ['premium'] });

      const premiumKeys = pool.getKeysByTag('premium');
      expect(premiumKeys).toHaveLength(2);
      expect(premiumKeys.map(k => k.key).sort()).toEqual(['sk-1', 'sk-3']);
    });

    it('returns empty array for unknown tag', () => {
      const pool = new KeyPool();
      pool.addKey({ key: 'sk-1', provider: 'openai', tags: ['premium'] });

      expect(pool.getKeysByTag('unknown')).toEqual([]);
    });
  });

  describe('getAvailableKeys', () => {
    it('filters out disabled keys', () => {
      const pool = new KeyPool();
      const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
      pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });

      k1.disabled = true;

      const available = pool.getAvailableKeys();
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('k2');
    });

    it('filters out disabled keys for a specific provider', () => {
      const pool = new KeyPool();
      const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
      pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });

      k1.disabled = true;

      const available = pool.getAvailableKeys({ provider: 'openai' });
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('k2');
    });

    it('filters out disabled keys for a specific tag', () => {
      const pool = new KeyPool();
      const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai', tags: ['premium'] });
      pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai', tags: ['premium'] });

      k1.disabled = true;

      const available = pool.getAvailableKeys({ tag: 'premium' });
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('k2');
    });

    it('filters expired keys via metadata.expiresAt (number)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));

      const pool = new KeyPool();
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
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('k2');

      // The expired key should now be disabled
      expect(pool.getKey('k1')!.disabled).toBe(true);

      vi.useRealTimers();
    });

    it('filters expired keys via metadata.expiresAt (string)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));

      const pool = new KeyPool();
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
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('k2');

      vi.useRealTimers();
    });

    it('returns all keys when none are disabled or expired', () => {
      const pool = new KeyPool();
      pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
      pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });
      pool.addKey({ id: 'k3', key: 'sk-3', provider: 'anthropic' });

      const available = pool.getAvailableKeys();
      expect(available).toHaveLength(3);
    });

    it('returns empty array when all keys are disabled', () => {
      const pool = new KeyPool();
      const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
      const k2 = pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });

      k1.disabled = true;
      k2.disabled = true;

      expect(pool.getAvailableKeys()).toEqual([]);
    });
  });

  describe('getAllKeys', () => {
    it('returns all keys regardless of disabled state', () => {
      const pool = new KeyPool();
      const k1 = pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
      pool.addKey({ id: 'k2', key: 'sk-2', provider: 'anthropic' });

      k1.disabled = true;

      const all = pool.getAllKeys();
      expect(all).toHaveLength(2);
    });

    it('returns empty array when pool is empty', () => {
      const pool = new KeyPool();
      expect(pool.getAllKeys()).toEqual([]);
    });
  });

  describe('getKey', () => {
    it('returns key entry by id', () => {
      const pool = new KeyPool();
      pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });

      const entry = pool.getKey('k1');
      expect(entry).toBeDefined();
      expect(entry!.id).toBe('k1');
      expect(entry!.key).toBe('sk-1');
      expect(entry!.provider).toBe('openai');
    });

    it('returns undefined for non-existent id', () => {
      const pool = new KeyPool();
      expect(pool.getKey('non-existent')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('returns correct count', () => {
      const pool = new KeyPool();
      expect(pool.size()).toBe(0);

      pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai' });
      expect(pool.size()).toBe(1);

      pool.addKey({ id: 'k2', key: 'sk-2', provider: 'openai' });
      expect(pool.size()).toBe(2);

      pool.removeKey('k1');
      expect(pool.size()).toBe(1);

      pool.removeKey('k2');
      expect(pool.size()).toBe(0);
    });
  });
});
