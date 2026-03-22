"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mock_keys_1 = require("./mock-keys");
(0, vitest_1.describe)('mock-keys fixtures', () => {
    (0, vitest_1.it)('openAiKey1 has required key and provider fields', () => {
        (0, vitest_1.expect)(typeof mock_keys_1.openAiKey1.key).toBe('string');
        (0, vitest_1.expect)(mock_keys_1.openAiKey1.key.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(typeof mock_keys_1.openAiKey1.provider).toBe('string');
        (0, vitest_1.expect)(mock_keys_1.openAiKey1.provider.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('openAiKey2 has required key and provider fields', () => {
        (0, vitest_1.expect)(typeof mock_keys_1.openAiKey2.key).toBe('string');
        (0, vitest_1.expect)(mock_keys_1.openAiKey2.key.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(typeof mock_keys_1.openAiKey2.provider).toBe('string');
    });
    (0, vitest_1.it)('anthropicKey1 has required key and provider fields', () => {
        (0, vitest_1.expect)(typeof mock_keys_1.anthropicKey1.key).toBe('string');
        (0, vitest_1.expect)(mock_keys_1.anthropicKey1.key.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(mock_keys_1.anthropicKey1.provider).toBe('anthropic');
    });
    (0, vitest_1.it)('weightedKeys has 3 elements with different weights', () => {
        (0, vitest_1.expect)(mock_keys_1.weightedKeys).toHaveLength(3);
        const weights = mock_keys_1.weightedKeys.map((k) => k.weight);
        // All weights should be defined
        weights.forEach((w) => (0, vitest_1.expect)(w).toBeDefined());
        // Weights should not all be the same
        const uniqueWeights = new Set(weights);
        (0, vitest_1.expect)(uniqueWeights.size).toBeGreaterThan(1);
        // All should have key and provider
        mock_keys_1.weightedKeys.forEach((k) => {
            (0, vitest_1.expect)(typeof k.key).toBe('string');
            (0, vitest_1.expect)(k.key.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(typeof k.provider).toBe('string');
        });
    });
    (0, vitest_1.it)('priorityKeys has 3 elements with different priority values', () => {
        (0, vitest_1.expect)(mock_keys_1.priorityKeys).toHaveLength(3);
        const priorities = mock_keys_1.priorityKeys.map((k) => k.priority);
        priorities.forEach((p) => (0, vitest_1.expect)(p).toBeDefined());
        // Priorities should be distinct
        const uniquePriorities = new Set(priorities);
        (0, vitest_1.expect)(uniquePriorities.size).toBe(3);
        // All should have key and provider
        mock_keys_1.priorityKeys.forEach((k) => {
            (0, vitest_1.expect)(typeof k.key).toBe('string');
            (0, vitest_1.expect)(typeof k.provider).toBe('string');
        });
    });
    (0, vitest_1.it)('taggedKeys have non-empty tags arrays', () => {
        (0, vitest_1.expect)(mock_keys_1.taggedKeys).toHaveLength(3);
        mock_keys_1.taggedKeys.forEach((k) => {
            (0, vitest_1.expect)(k.tags).toBeDefined();
            (0, vitest_1.expect)(Array.isArray(k.tags)).toBe(true);
            (0, vitest_1.expect)(k.tags.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(typeof k.key).toBe('string');
            (0, vitest_1.expect)(typeof k.provider).toBe('string');
        });
    });
    (0, vitest_1.it)('keyWithExpiry has metadata.expiresAt as a Date', () => {
        (0, vitest_1.expect)(mock_keys_1.keyWithExpiry.metadata).toBeDefined();
        (0, vitest_1.expect)(mock_keys_1.keyWithExpiry.metadata?.expiresAt).toBeInstanceOf(Date);
        // Should be in the future
        (0, vitest_1.expect)((mock_keys_1.keyWithExpiry.metadata?.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
    (0, vitest_1.it)('minimalKey has required key and provider fields only', () => {
        (0, vitest_1.expect)(mock_keys_1.minimalKey.key).toBe('sk-minimal');
        (0, vitest_1.expect)(mock_keys_1.minimalKey.provider).toBe('openai');
        (0, vitest_1.expect)(mock_keys_1.minimalKey.id).toBeUndefined();
        (0, vitest_1.expect)(mock_keys_1.minimalKey.tags).toBeUndefined();
        (0, vitest_1.expect)(mock_keys_1.minimalKey.weight).toBeUndefined();
        (0, vitest_1.expect)(mock_keys_1.minimalKey.priority).toBeUndefined();
    });
});
//# sourceMappingURL=mock-keys.test.js.map