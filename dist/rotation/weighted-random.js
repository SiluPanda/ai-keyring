"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeightedRandomStrategy = void 0;
class WeightedRandomStrategy {
    select(availableKeys) {
        if (availableKeys.length === 0)
            return null;
        const totalWeight = availableKeys.reduce((sum, k) => sum + k.weight, 0);
        let random = Math.random() * totalWeight;
        for (const key of availableKeys) {
            random -= key.weight;
            if (random <= 0)
                return key;
        }
        return availableKeys[availableKeys.length - 1];
    }
}
exports.WeightedRandomStrategy = WeightedRandomStrategy;
//# sourceMappingURL=weighted-random.js.map