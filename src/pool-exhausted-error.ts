export interface KeyState {
  id: string;
  status: 'available' | 'cooldown' | 'disabled';
  cooldownEndsAt?: Date;
  cooldownRemainingMs?: number;
}

export class PoolExhaustedError extends Error {
  readonly name = 'PoolExhaustedError';
  constructor(
    message: string,
    readonly pool: string,
    readonly keyStates: KeyState[],
    readonly shortestCooldownMs: number,
  ) {
    super(message);
    Object.setPrototypeOf(this, PoolExhaustedError.prototype);
  }
}
