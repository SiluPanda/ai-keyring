"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pool_exhausted_error_1 = require("../pool-exhausted-error");
(0, vitest_1.describe)('PoolExhaustedError', () => {
    const keyStates = [
        { id: 'key-1', status: 'cooldown', cooldownRemainingMs: 5000, cooldownEndsAt: new Date(Date.now() + 5000) },
        { id: 'key-2', status: 'disabled' },
        { id: 'key-3', status: 'available' },
    ];
    const err = new pool_exhausted_error_1.PoolExhaustedError('All keys exhausted', 'openai', keyStates, 5000);
    (0, vitest_1.it)('extends Error', () => {
        (0, vitest_1.expect)(err).toBeInstanceOf(Error);
    });
    (0, vitest_1.it)('name is PoolExhaustedError', () => {
        (0, vitest_1.expect)(err.name).toBe('PoolExhaustedError');
    });
    (0, vitest_1.it)('message is correct', () => {
        (0, vitest_1.expect)(err.message).toBe('All keys exhausted');
    });
    (0, vitest_1.it)('pool is accessible', () => {
        (0, vitest_1.expect)(err.pool).toBe('openai');
    });
    (0, vitest_1.it)('keyStates is accessible and correct', () => {
        (0, vitest_1.expect)(err.keyStates).toBe(keyStates);
        (0, vitest_1.expect)(err.keyStates).toHaveLength(3);
        (0, vitest_1.expect)(err.keyStates[0].id).toBe('key-1');
        (0, vitest_1.expect)(err.keyStates[0].status).toBe('cooldown');
        (0, vitest_1.expect)(err.keyStates[1].status).toBe('disabled');
        (0, vitest_1.expect)(err.keyStates[2].status).toBe('available');
    });
    (0, vitest_1.it)('shortestCooldownMs is accessible', () => {
        (0, vitest_1.expect)(err.shortestCooldownMs).toBe(5000);
    });
    (0, vitest_1.it)('instanceof PoolExhaustedError is true', () => {
        (0, vitest_1.expect)(err).toBeInstanceOf(pool_exhausted_error_1.PoolExhaustedError);
    });
    (0, vitest_1.it)('instanceof Error is true', () => {
        (0, vitest_1.expect)(err).toBeInstanceOf(Error);
    });
    (0, vitest_1.it)('works with zero keyStates', () => {
        const emptyErr = new pool_exhausted_error_1.PoolExhaustedError('Empty pool', 'anthropic', [], 0);
        (0, vitest_1.expect)(emptyErr.keyStates).toHaveLength(0);
        (0, vitest_1.expect)(emptyErr.pool).toBe('anthropic');
        (0, vitest_1.expect)(emptyErr.shortestCooldownMs).toBe(0);
    });
});
//# sourceMappingURL=pool-exhausted-error.test.js.map