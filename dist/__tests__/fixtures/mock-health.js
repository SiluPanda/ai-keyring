"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slowHealthCheck = exports.withQuota = exports.alwaysUnhealthy = exports.alwaysHealthy = void 0;
exports.toggleHealthy = toggleHealthy;
const alwaysHealthy = async (_key) => ({
    healthy: true,
    latencyMs: 50,
});
exports.alwaysHealthy = alwaysHealthy;
const alwaysUnhealthy = async (_key) => ({
    healthy: false,
    latencyMs: 0,
    error: 'Connection refused',
});
exports.alwaysUnhealthy = alwaysUnhealthy;
function toggleHealthy() {
    let callCount = 0;
    return async (_key) => {
        callCount++;
        const healthy = callCount % 2 === 1;
        return { healthy, latencyMs: healthy ? 50 : 0, error: healthy ? undefined : 'Unhealthy' };
    };
}
const withQuota = async (_key) => ({
    healthy: true,
    latencyMs: 50,
    remainingQuota: 1000,
});
exports.withQuota = withQuota;
const slowHealthCheck = async (_key) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { healthy: true, latencyMs: 200 };
};
exports.slowHealthCheck = slowHealthCheck;
//# sourceMappingURL=mock-health.js.map