import { describe, it, expect } from 'vitest';
import {
  openAiKey1,
  openAiKey2,
  anthropicKey1,
  weightedKeys,
  priorityKeys,
  taggedKeys,
  keyWithExpiry,
  minimalKey,
} from './mock-keys';

describe('mock-keys fixtures', () => {
  it('openAiKey1 has required key and provider fields', () => {
    expect(typeof openAiKey1.key).toBe('string');
    expect(openAiKey1.key.length).toBeGreaterThan(0);
    expect(typeof openAiKey1.provider).toBe('string');
    expect(openAiKey1.provider.length).toBeGreaterThan(0);
  });

  it('openAiKey2 has required key and provider fields', () => {
    expect(typeof openAiKey2.key).toBe('string');
    expect(openAiKey2.key.length).toBeGreaterThan(0);
    expect(typeof openAiKey2.provider).toBe('string');
  });

  it('anthropicKey1 has required key and provider fields', () => {
    expect(typeof anthropicKey1.key).toBe('string');
    expect(anthropicKey1.key.length).toBeGreaterThan(0);
    expect(anthropicKey1.provider).toBe('anthropic');
  });

  it('weightedKeys has 3 elements with different weights', () => {
    expect(weightedKeys).toHaveLength(3);
    const weights = weightedKeys.map((k) => k.weight);
    // All weights should be defined
    weights.forEach((w) => expect(w).toBeDefined());
    // Weights should not all be the same
    const uniqueWeights = new Set(weights);
    expect(uniqueWeights.size).toBeGreaterThan(1);
    // All should have key and provider
    weightedKeys.forEach((k) => {
      expect(typeof k.key).toBe('string');
      expect(k.key.length).toBeGreaterThan(0);
      expect(typeof k.provider).toBe('string');
    });
  });

  it('priorityKeys has 3 elements with different priority values', () => {
    expect(priorityKeys).toHaveLength(3);
    const priorities = priorityKeys.map((k) => k.priority);
    priorities.forEach((p) => expect(p).toBeDefined());
    // Priorities should be distinct
    const uniquePriorities = new Set(priorities);
    expect(uniquePriorities.size).toBe(3);
    // All should have key and provider
    priorityKeys.forEach((k) => {
      expect(typeof k.key).toBe('string');
      expect(typeof k.provider).toBe('string');
    });
  });

  it('taggedKeys have non-empty tags arrays', () => {
    expect(taggedKeys).toHaveLength(3);
    taggedKeys.forEach((k) => {
      expect(k.tags).toBeDefined();
      expect(Array.isArray(k.tags)).toBe(true);
      expect((k.tags as string[]).length).toBeGreaterThan(0);
      expect(typeof k.key).toBe('string');
      expect(typeof k.provider).toBe('string');
    });
  });

  it('keyWithExpiry has metadata.expiresAt as a Date', () => {
    expect(keyWithExpiry.metadata).toBeDefined();
    expect(keyWithExpiry.metadata?.expiresAt).toBeInstanceOf(Date);
    // Should be in the future
    expect((keyWithExpiry.metadata?.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('minimalKey has required key and provider fields only', () => {
    expect(minimalKey.key).toBe('sk-minimal');
    expect(minimalKey.provider).toBe('openai');
    expect(minimalKey.id).toBeUndefined();
    expect(minimalKey.tags).toBeUndefined();
    expect(minimalKey.weight).toBeUndefined();
    expect(minimalKey.priority).toBeUndefined();
  });
});
