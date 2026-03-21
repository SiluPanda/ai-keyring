import type { HealthCheckFn, HealthCheckResult } from '../../types';

export const alwaysHealthy: HealthCheckFn = async (_key: string): Promise<HealthCheckResult> => ({
  healthy: true,
  latencyMs: 50,
});

export const alwaysUnhealthy: HealthCheckFn = async (_key: string): Promise<HealthCheckResult> => ({
  healthy: false,
  latencyMs: 0,
  error: 'Connection refused',
});

export function toggleHealthy(): HealthCheckFn {
  let callCount = 0;
  return async (_key: string): Promise<HealthCheckResult> => {
    callCount++;
    const healthy = callCount % 2 === 1;
    return { healthy, latencyMs: healthy ? 50 : 0, error: healthy ? undefined : 'Unhealthy' };
  };
}

export const withQuota: HealthCheckFn = async (_key: string): Promise<HealthCheckResult> => ({
  healthy: true,
  latencyMs: 50,
  remainingQuota: 1000,
});

export const slowHealthCheck: HealthCheckFn = async (_key: string): Promise<HealthCheckResult> => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { healthy: true, latencyMs: 200 };
};
