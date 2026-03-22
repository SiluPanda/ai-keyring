"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoundRobinStrategy = void 0;
class RoundRobinStrategy {
    counter = 0;
    select(availableKeys) {
        if (availableKeys.length === 0)
            return null;
        const key = availableKeys[this.counter % availableKeys.length];
        this.counter++;
        return key;
    }
}
exports.RoundRobinStrategy = RoundRobinStrategy;
//# sourceMappingURL=round-robin.js.map