"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoolExhaustedError = void 0;
class PoolExhaustedError extends Error {
    pool;
    keyStates;
    shortestCooldownMs;
    name = 'PoolExhaustedError';
    constructor(message, pool, keyStates, shortestCooldownMs) {
        super(message);
        this.pool = pool;
        this.keyStates = keyStates;
        this.shortestCooldownMs = shortestCooldownMs;
        Object.setPrototypeOf(this, PoolExhaustedError.prototype);
    }
}
exports.PoolExhaustedError = PoolExhaustedError;
//# sourceMappingURL=pool-exhausted-error.js.map