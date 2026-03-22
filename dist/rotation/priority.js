"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityStrategy = void 0;
class PriorityStrategy {
    counter = 0;
    select(availableKeys) {
        if (availableKeys.length === 0)
            return null;
        // Sort by priority ascending (lower = higher priority)
        const sorted = [...availableKeys].sort((a, b) => a.priority - b.priority);
        const topPriority = sorted[0].priority;
        const samePriority = sorted.filter(k => k.priority === topPriority);
        const key = samePriority[this.counter % samePriority.length];
        this.counter++;
        return key;
    }
}
exports.PriorityStrategy = PriorityStrategy;
//# sourceMappingURL=priority.js.map