"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityStrategy = exports.WeightedRandomStrategy = exports.LeastRequestsStrategy = exports.LeastRecentlyUsedStrategy = exports.RoundRobinStrategy = void 0;
exports.createRotationStrategy = createRotationStrategy;
const round_robin_1 = require("./round-robin");
const lru_1 = require("./lru");
const least_requests_1 = require("./least-requests");
const weighted_random_1 = require("./weighted-random");
const priority_1 = require("./priority");
function createRotationStrategy(strategy) {
    switch (strategy) {
        case 'round-robin': return new round_robin_1.RoundRobinStrategy();
        case 'least-recently-used': return new lru_1.LeastRecentlyUsedStrategy();
        case 'least-requests': return new least_requests_1.LeastRequestsStrategy();
        case 'weighted-random': return new weighted_random_1.WeightedRandomStrategy();
        case 'priority': return new priority_1.PriorityStrategy();
        default: throw new TypeError(`Unknown rotation strategy: ${strategy}`);
    }
}
var round_robin_2 = require("./round-robin");
Object.defineProperty(exports, "RoundRobinStrategy", { enumerable: true, get: function () { return round_robin_2.RoundRobinStrategy; } });
var lru_2 = require("./lru");
Object.defineProperty(exports, "LeastRecentlyUsedStrategy", { enumerable: true, get: function () { return lru_2.LeastRecentlyUsedStrategy; } });
var least_requests_2 = require("./least-requests");
Object.defineProperty(exports, "LeastRequestsStrategy", { enumerable: true, get: function () { return least_requests_2.LeastRequestsStrategy; } });
var weighted_random_2 = require("./weighted-random");
Object.defineProperty(exports, "WeightedRandomStrategy", { enumerable: true, get: function () { return weighted_random_2.WeightedRandomStrategy; } });
var priority_2 = require("./priority");
Object.defineProperty(exports, "PriorityStrategy", { enumerable: true, get: function () { return priority_2.PriorityStrategy; } });
//# sourceMappingURL=index.js.map