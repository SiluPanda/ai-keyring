"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeastRecentlyUsedStrategy = void 0;
class LeastRecentlyUsedStrategy {
    lastUsed = new Map();
    select(availableKeys) {
        if (availableKeys.length === 0)
            return null;
        let oldest = null;
        let oldestTime = Infinity;
        for (const key of availableKeys) {
            const time = this.lastUsed.get(key.id) ?? 0;
            if (time < oldestTime) {
                oldestTime = time;
                oldest = key;
            }
        }
        if (oldest)
            this.lastUsed.set(oldest.id, Date.now());
        return oldest;
    }
}
exports.LeastRecentlyUsedStrategy = LeastRecentlyUsedStrategy;
//# sourceMappingURL=lru.js.map