export interface KeyState {
    id: string;
    status: 'available' | 'cooldown' | 'disabled';
    cooldownEndsAt?: Date;
    cooldownRemainingMs?: number;
}
export declare class PoolExhaustedError extends Error {
    readonly pool: string;
    readonly keyStates: KeyState[];
    readonly shortestCooldownMs: number;
    readonly name = "PoolExhaustedError";
    constructor(message: string, pool: string, keyStates: KeyState[], shortestCooldownMs: number);
}
//# sourceMappingURL=pool-exhausted-error.d.ts.map