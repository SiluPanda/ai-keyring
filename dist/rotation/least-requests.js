"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeastRequestsStrategy = void 0;
class LeastRequestsStrategy {
    requests = new Map();
    select(availableKeys) {
        if (availableKeys.length === 0)
            return null;
        let fewest = null;
        let fewestCount = Infinity;
        for (const key of availableKeys) {
            const count = this.requests.get(key.id) ?? 0;
            if (count < fewestCount) {
                fewestCount = count;
                fewest = key;
            }
        }
        if (fewest)
            this.requests.set(fewest.id, (this.requests.get(fewest.id) ?? 0) + 1);
        return fewest;
    }
}
exports.LeastRequestsStrategy = LeastRequestsStrategy;
//# sourceMappingURL=least-requests.js.map