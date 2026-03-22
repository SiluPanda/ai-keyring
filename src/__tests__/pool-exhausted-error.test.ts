import { describe, it, expect } from 'vitest';
import { PoolExhaustedError } from '../pool-exhausted-error';
import type { KeyState } from '../pool-exhausted-error';

describe('PoolExhaustedError', () => {
  const keyStates: KeyState[] = [
    { id: 'key-1', status: 'cooldown', cooldownRemainingMs: 5000, cooldownEndsAt: new Date(Date.now() + 5000) },
    { id: 'key-2', status: 'disabled' },
    { id: 'key-3', status: 'available' },
  ];

  const err = new PoolExhaustedError('All keys exhausted', 'openai', keyStates, 5000);

  it('extends Error', () => {
    expect(err).toBeInstanceOf(Error);
  });

  it('name is PoolExhaustedError', () => {
    expect(err.name).toBe('PoolExhaustedError');
  });

  it('message is correct', () => {
    expect(err.message).toBe('All keys exhausted');
  });

  it('pool is accessible', () => {
    expect(err.pool).toBe('openai');
  });

  it('keyStates is accessible and correct', () => {
    expect(err.keyStates).toBe(keyStates);
    expect(err.keyStates).toHaveLength(3);
    expect(err.keyStates[0].id).toBe('key-1');
    expect(err.keyStates[0].status).toBe('cooldown');
    expect(err.keyStates[1].status).toBe('disabled');
    expect(err.keyStates[2].status).toBe('available');
  });

  it('shortestCooldownMs is accessible', () => {
    expect(err.shortestCooldownMs).toBe(5000);
  });

  it('instanceof PoolExhaustedError is true', () => {
    expect(err).toBeInstanceOf(PoolExhaustedError);
  });

  it('instanceof Error is true', () => {
    expect(err).toBeInstanceOf(Error);
  });

  it('works with zero keyStates', () => {
    const emptyErr = new PoolExhaustedError('Empty pool', 'anthropic', [], 0);
    expect(emptyErr.keyStates).toHaveLength(0);
    expect(emptyErr.pool).toBe('anthropic');
    expect(emptyErr.shortestCooldownMs).toBe(0);
  });
});
