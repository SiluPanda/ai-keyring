# ai-keyring — Task Breakdown

## Phase 1: Project Scaffolding & Type Definitions

- [x] **Install dev dependencies** — Add `typescript`, `vitest`, `eslint`, and `@types/node` as devDependencies in `package.json`. Ensure `vitest` config is compatible with the existing `tsconfig.json` (ES2022 target, commonjs module). | Status: done

- [x] **Add CLI bin entry to package.json** — Add a `"bin": { "ai-keyring": "./dist/cli.js" }` field to `package.json` for the optional CLI. | Status: done

- [x] **Create `src/types.ts` — All TypeScript interfaces and type aliases** — Define every type from the spec: `KeyConfig`, `KeyEntry`, `RotationStrategy`, `PoolConfig`, `ThrowExhaustion`, `WaitExhaustion`, `FallbackExhaustion`, `PoolExhaustionConfig`, `HealthCheckResult`, `HealthCheckFn`, `HealthCheckConfig`, `HealthCheckReport`, `UsageReport`, `KeyStats`, `PoolState`, `KeyringStats`, `ExportedKeyringState`, `KeyringHooks`, `KeyringConfig`, `Keyring`. Ensure `KeyEntry` never exposes the raw key string in stats or events — only in the return value of `getKey`. | Status: done

- [x] **Create `src/pool-exhausted-error.ts` — PoolExhaustedError class** — Implement a custom error class extending `Error` with readonly properties: `pool` (string), `keyStates` (array of `{ id, status, cooldownEndsAt?, cooldownRemainingMs? }`), and `shortestCooldownMs` (number). Set `name` to `'PoolExhaustedError'`. | Status: done

- [x] **Create test fixtures `src/__tests__/fixtures/mock-keys.ts`** — Define reusable mock key configurations for tests: multiple OpenAI keys, Anthropic keys, keys with weights, keys with priorities, keys with tags, keys with metadata including `expiresAt`. | Status: done

- [x] **Create test fixtures `src/__tests__/fixtures/mock-errors.ts`** — Define reusable mock error objects for 429 detection tests: errors with `status: 429`, `statusCode: 429`, `response.status: 429`, `error.code: 'rate_limited'`, `error.type: 'rate_limit_error'`, various `Retry-After` header formats (integer seconds, HTTP date string, Headers object with `.get()`), non-429 errors (400, 401, 500). | Status: done

- [x] **Create test fixtures `src/__tests__/fixtures/mock-health.ts`** — Define reusable mock health check functions: one that always returns healthy, one that always returns unhealthy, one that toggles, and one that returns quota information. | Status: done

---

## Phase 2: Rate Limit Detection & Retry-After Parsing

- [x] **Implement `src/rate-limit-detector.ts` — 429 detection logic** — Implement a function `isRateLimitError(error: unknown): boolean` that checks for: (1) `status`, `statusCode`, or `response.status` property with value `429`; (2) `error.code` being `'rate_limited'`, `'rate-limited'`, or `'too_many_requests'`; (3) `error.type` being `'rate_limit_error'` or `'tokens'`; (4) message containing "rate limit" (case-insensitive) as a last resort. | Status: done

- [x] **Implement Retry-After extraction in `src/rate-limit-detector.ts`** — Implement a function `extractRetryAfterMs(error: unknown, defaultCooldownMs: number): number` that extracts the Retry-After value from: `error.headers?.['retry-after']`, `error.response?.headers?.['retry-after']`, `error.retryAfter`, `error.headers?.get?.('retry-after')` (for fetch Headers). Parse as seconds (positive integer string) or as HTTP date (compute diff from `Date.now()`). If date is in the past or parsing fails, return `defaultCooldownMs`. | Status: done

- [x] **Write tests `src/__tests__/rate-limit-detector.test.ts`** — Test 429 detection: `status: 429`, `statusCode: 429`, `response.status: 429`, `error.code === 'rate_limited'`, `error.code === 'rate-limited'`, `error.code === 'too_many_requests'`, `error.type === 'rate_limit_error'`, `error.type === 'tokens'`, message-based detection. Verify non-429 errors (400, 401, 500) do NOT trigger detection. Test Retry-After parsing: integer seconds, HTTP date in future, HTTP date in past (falls back to default), missing header (falls back to default), `Headers` object with `.get()` method, various header locations. | Status: done

---

## Phase 3: Cooldown Tracking

- [x] **Implement `src/cooldown.ts` — Per-key cooldown manager** — Implement a `CooldownManager` class that tracks per-key cooldown state. Methods: `setCooldown(keyId: string, durationMs: number)` to set `cooldownEndsAt`, `isInCooldown(keyId: string): boolean` that checks `Date.now() < cooldownEndsAt` (lazy evaluation, no timers), `getCooldownRemainingMs(keyId: string): number`, `clearCooldown(keyId: string)` for when cooldown expires. Track `totalCooldownMs` per key. | Status: done

- [x] **Implement escalating cooldown in `src/cooldown.ts`** — Track consecutive 429 counts per key within a rolling `cooldownEscalationWindowMs` window. Multiplier: 1st=1x, 2nd=2x, 3rd=4x, 4th+=8x (capped). Only apply escalation when no `Retry-After` header is present. Reset escalation counter on: (a) successful `reportUsage` call, (b) `cooldownEscalationWindowMs` elapses with no 429. Cap final duration at `maxCooldownMs`. | Status: done

- [x] **Implement minimum cooldown enforcement** — When `Retry-After: 0` is received, enforce a minimum cooldown of 1 second. When `Retry-After` value exceeds `maxCooldownMs`, cap at `maxCooldownMs`. | Status: done

- [x] **Write tests `src/__tests__/cooldown.test.ts`** — Test: setting cooldown places key in cooldown state. Key is excluded during cooldown (`isInCooldown` returns true). Key is included after cooldown expires (lazy evaluation via `Date.now()`). Escalating cooldown: second 429 doubles duration. Escalation multipliers (1x, 2x, 4x, 8x cap). Escalation resets after successful `reportUsage`. Escalation resets after `cooldownEscalationWindowMs` elapses. `Retry-After: 0` enforces 1-second minimum. Large `Retry-After` capped at `maxCooldownMs`. `totalCooldownMs` accumulates correctly. Use `vi.useFakeTimers()` for time control. | Status: done

---

## Phase 4: Usage Tracking & Rolling Metrics

- [x] **Implement `src/usage-tracker.ts` — Per-key usage counters** — Implement a `UsageTracker` class that tracks per-key metrics: `requests`, `tokens`, `inputTokens`, `outputTokens`, `errors`, `rateLimits`, `cost`, `lastUsedAt`, `lastErrorAt`. Methods: `recordRequest(keyId)` to increment requests and set `lastUsedAt`, `recordUsage(keyId, usage: UsageReport)` to accumulate tokens/cost/latency, `recordError(keyId)` to increment errors and set `lastErrorAt`, `recordRateLimit(keyId)` to increment rateLimits, `getKeyStats(keyId): KeyStats`. | Status: done

- [x] **Implement rolling window metrics in `src/usage-tracker.ts`** — Maintain bounded arrays of timestamped entries for error rate and latency. Entries older than `metricsWindowMs` are pruned lazily on access. `errorRate` = errors in window / requests in window. `avgLatencyMs` = sum(latencies in window) / count(latencies in window). When `metricsWindowMs` is 0, disable rolling metrics (return 0 for both). | Status: done

- [x] **Write tests `src/__tests__/usage-tracker.test.ts`** — Test: `recordRequest` increments request count. `recordUsage` accumulates tokens, inputTokens, outputTokens, cost. `recordUsage` with `latencyMs` updates rolling average. `recordError` increments error count, updates `lastErrorAt`. Error rate computed over rolling window. Average latency computed over rolling window. Old entries pruned after `metricsWindowMs`. Empty usage report (`{}`) still increments request count. `getKeyStats` returns correct shape with all fields. Use fake timers for window testing. | Status: done

---

## Phase 5: Key Pool Management

- [x] **Implement `src/key-pool.ts` — Key pool data structure** — Implement a `KeyPool` class managing keys grouped by provider and tags. Methods: `addKey(config: KeyConfig)` — validates and adds key, throws `TypeError` on duplicate `id` or empty `key`/`provider`. `removeKey(keyId: string)` — removes from all pools, no-op for non-existent ID. `getKeysByProvider(provider: string): InternalKeyEntry[]`. `getKeysByTag(tag: string): InternalKeyEntry[]`. `getAllKeys(): InternalKeyEntry[]`. `getKey(keyId: string): InternalKeyEntry | undefined`. Auto-generate `id` via `crypto.randomUUID()` when not provided. | Status: done

- [x] **Implement provider-based pool grouping** — Keys with the same `provider` value are automatically grouped. Maintain an internal `Map<string, InternalKeyEntry[]>` keyed by provider name. Insertion order is preserved within each pool. | Status: done

- [x] **Implement tag-based pool grouping** — Keys with tags are additionally grouped by each tag value. `getKeysByTag('premium')` returns all keys that include `'premium'` in their `tags` array. A key can appear in multiple tag pools. | Status: done

- [x] **Implement key availability filtering** — `getAvailableKeys(provider?: string, tag?: string)` returns keys that are not in cooldown and not disabled (health check failed or expired). Checks `cooldownEndsAt` lazily (re-enables if `Date.now() >= cooldownEndsAt`). Checks `metadata.expiresAt` and disables expired keys. | Status: done

- [x] **Write tests `src/__tests__/key-pool.test.ts`** — Test: adding keys groups them by provider. Adding keys groups them by tags. `addKey` with duplicate `id` throws `TypeError`. `addKey` with empty `key` string throws `TypeError`. `addKey` with empty `provider` throws `TypeError`. `removeKey` removes from all pools. `removeKey` with non-existent `id` is a no-op. Removing last key in pool leaves pool empty. Auto-generated IDs are unique. Keys with multiple tags appear in all tag pools. Filtering by provider returns correct subset. Filtering by tag returns correct subset. | Status: done

---

## Phase 6: Rotation Strategies

- [x] **Create `src/rotation/index.ts` — Strategy factory** — Implement a factory function `createRotationStrategy(strategy: RotationStrategy): RotationStrategyImpl` that returns the appropriate strategy implementation. Define a common interface: `{ select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null }`. | Status: done

- [x] **Implement `src/rotation/round-robin.ts`** — Maintain a counter `i` initialized to 0. On each call, select key at `i % availableKeys.length`, then increment `i`. When a key is removed and was at or before the current position, adjust the counter. When keys enter/leave the available set, the rotation order (insertion order) is preserved. | Status: done

- [x] **Write tests `src/__tests__/rotation/round-robin.test.ts`** — Test: returns keys in insertion order. Wraps around after last key. Skips keys not in available set. Full cycle with all keys skipped returns null (signals pool exhaustion). Adding a key mid-rotation integrates it into the cycle. Removing a key adjusts the counter correctly. | Status: done

- [x] **Implement `src/rotation/lru.ts`** — Track `lastUsedAt` per key. Select the available key with the oldest `lastUsedAt`. Break ties by insertion order. Update `lastUsedAt` when a key is selected. | Status: done

- [x] **Write tests `src/__tests__/rotation/lru.test.ts`** — Test: selects key with oldest `lastUsedAt`. Breaks ties by insertion order. After selection, the selected key has the newest `lastUsedAt`. Key returning from cooldown has stale `lastUsedAt` and is immediately selected. | Status: done

- [x] **Implement `src/rotation/least-requests.ts`** — Track `requests` counter per key. Select the available key with the fewest total requests. Break ties by insertion order. | Status: done

- [x] **Write tests `src/__tests__/rotation/least-requests.test.ts`** — Test: selects key with fewest requests. Breaks ties by insertion order. Newly added key (0 requests) is preferred. After many requests, distribution equalizes. | Status: done

- [x] **Implement `src/rotation/weighted-random.ts`** — Compute cumulative weight sum of available keys. Generate `Math.random() * totalWeight`. Walk keys accumulating weights, select the key whose cumulative range contains the random number. Default weight is 1. | Status: done

- [x] **Write tests `src/__tests__/rotation/weighted-random.test.ts`** — Test: over 10,000 iterations, distribution converges to weight ratios within tolerance (e.g., weights [3, 1] produce ~75%/25% within 5% tolerance). Single key always selected. All keys with equal weight produce roughly equal distribution. Key with weight 0 is never selected (or disallowed by validation). | Status: done

- [x] **Implement `src/rotation/priority.ts`** — Sort available keys by priority (ascending). Select the key with the lowest priority value. If multiple keys share the same priority, use round-robin among them as a tiebreaker. | Status: done

- [x] **Write tests `src/__tests__/rotation/priority.test.ts`** — Test: selects lowest-priority-number key. Falls back to next priority level when top-priority key is unavailable. Round-robin tiebreaker among same-priority keys. All keys unavailable returns null. | Status: done

---

## Phase 7: Core Keyring Factory & `getKey`

- [x] **Implement `src/keyring.ts` — `createKeyring` factory function** — Wire together `KeyPool`, rotation strategies, `CooldownManager`, `UsageTracker`, and `RateLimitDetector`. Accept `KeyringConfig`, validate all options (see Phase 8), construct internal state, and return a `Keyring` instance object with all methods. | Status: done

- [x] **Implement `keyring.getKey(provider?)` method** — Accept optional provider string, `{ provider?, tag? }` object, or no argument (any pool). Look up the appropriate pool. Filter to available keys (not in cooldown, not disabled, not expired). Apply the rotation strategy (global or per-pool override). If a key is selected: increment request counter, update `lastUsedAt`, fire `onKeyRotation` hook, return `KeyEntry`. If during filtering a key's cooldown has expired, re-enable it and fire `onCooldownEnd`. If a key's `metadata.expiresAt` is in the past, disable it and fire `onKeyDisabled`. | Status: done

- [x] **Implement pool exhaustion handling in `getKey`** — When no available key is found after rotation: (1) If `fallbackPool` is configured for the pool, try the fallback pool recursively (avoid infinite loops). (2) Apply the `onPoolExhausted` strategy: `'throw'` throws `PoolExhaustedError`, `'wait'` blocks until shortest cooldown expires (bounded by `maxWaitMs`), `'fallback'` invokes the provided function. Fire `onPoolExhausted` hook before applying the strategy. | Status: done

- [x] **Implement `keyring.reportUsage(keyId, usage)` method** — Look up key by ID. If not found, no-op (do not throw). Delegate to `UsageTracker.recordUsage`. Reset cooldown escalation counter for the key (successful request). | Status: done

- [x] **Implement `keyring.reportError(keyId, error)` method** — Look up key by ID. If not found, no-op. Increment error counter. Check if error is a rate limit (429) via `isRateLimitError`. If 429: extract Retry-After, compute cooldown (with escalation if applicable), set cooldown, increment rateLimits counter, fire `onCooldownStart` hook. If not 429: record error type but do not place in cooldown. | Status: done

- [x] **Implement `keyring.addKey(config)` method** — Validate config (non-empty key, non-empty provider, unique id). Delegate to `KeyPool.addKey`. Initialize usage counters and cooldown state for the new key. The key is immediately available for selection. | Status: done

- [x] **Implement `keyring.removeKey(keyId)` method** — Delegate to `KeyPool.removeKey`. Clean up usage counters, cooldown state. If the key was the current position in round-robin, adjust. No-op for non-existent ID. | Status: done

- [x] **Implement `keyring.getStats()` method** — Build and return `KeyringStats` object. Per-key stats: all fields from `KeyStats` interface. Per-pool stats: aggregate `totalKeys`, `availableKeys`, `cooldownKeys`, `disabledKeys`, `totalRequests`, `totalTokens`, `totalErrors`. Never include raw key strings. Derive `status` field: `'available'`, `'cooldown'`, or `'disabled'`. | Status: done

- [x] **Implement per-pool strategy override** — When `pools` config specifies a `strategy` for a specific provider pool, use that strategy for that pool instead of the global strategy. | Status: done

- [x] **Write tests `src/__tests__/keyring.test.ts`** — Test `createKeyring` with valid config returns a Keyring instance. `getKey` returns keys. `reportUsage` records usage. `reportError` with 429 places key in cooldown. `addKey` adds a key dynamically. `removeKey` removes a key. `getStats` returns correct shape. Per-pool strategy override works. `getKey` with no provider returns any available key. `getKey` with `{ tag: 'premium' }` returns tagged key. `getKey` with `{ provider: 'openai', tag: 'us-east' }` filters by both. | Status: done

---

## Phase 8: Configuration Validation

- [ ] **Implement config validation in `createKeyring`** — Validate all config options synchronously at creation time. Throw `TypeError` with actionable messages for each invalid case: `keys` must be a non-empty array. Each key must have a non-empty `key` string. Each key must have a non-empty `provider` string. Key `id` values must be unique. `weight` must be a positive number. `priority` must be a non-negative integer. `strategy` must be a valid `RotationStrategy` value. `defaultCooldownMs` must be a positive integer. `maxCooldownMs` must be a positive integer and >= `defaultCooldownMs`. `metricsWindowMs` must be a positive integer. `onPoolExhausted.fn` must be a function when strategy is `'fallback'`. Health check provider functions must be functions. | Status: not_done

- [ ] **Write tests `src/__tests__/keyring.test.ts` (validation section)** — Test each validation rule produces the expected `TypeError` message: missing `keys`, empty `keys` array, key with empty `key` string, key with empty `provider`, duplicate `id`, invalid `strategy`, negative `weight`, negative `priority`, non-integer `priority`, `defaultCooldownMs` of 0, `maxCooldownMs` < `defaultCooldownMs`, `metricsWindowMs` of 0, `onPoolExhausted.fn` not a function, health check provider not a function. | Status: not_done

---

## Phase 9: Pool Exhaustion Strategies

- [x] **Implement `throw` exhaustion strategy** — When all keys in a pool are unavailable, throw `PoolExhaustedError` with: the pool name, per-key states (id, status, cooldownEndsAt, cooldownRemainingMs), and shortestCooldownMs. This is the default strategy. | Status: done

- [ ] **Implement `wait` exhaustion strategy** — When all keys are unavailable, compute the shortest remaining cooldown across all keys. Create a `Promise` that resolves after that duration (using `setTimeout`). If the wait exceeds `maxWaitMs` (default 30000), throw `PoolExhaustedError` instead. When the wait completes, re-check availability and return the key. Note: `getKey` must be async-compatible for this strategy. | Status: not_done

- [ ] **Implement `fallback` exhaustion strategy** — When all keys are unavailable, invoke the caller-provided `fn(pool, state)` function. The function receives the pool name and current `PoolState`. The function returns a `KeyEntry` (or throws). | Status: not_done

- [ ] **Implement cross-pool failover via `fallbackPool`** — When a pool is exhausted and has a `fallbackPool` configured, try `getKey` on the fallback pool before applying the exhaustion strategy. Guard against infinite loops (track visited pools). | Status: not_done

- [ ] **Write tests `src/__tests__/pool-exhaustion.test.ts`** — Test: `throw` strategy throws `PoolExhaustedError` with correct details. `wait` strategy resolves when cooldown expires. `wait` strategy throws after `maxWaitMs`. `fallback` strategy invokes the provided function. `fallback` function receives correct pool and state. Cross-pool failover: all openai keys in cooldown, fallbackPool is 'anthropic', returns anthropic key. Fallback pool also exhausted: triggers exhaustion strategy. Empty pool triggers exhaustion. | Status: not_done

---

## Phase 10: Health Checking

- [ ] **Implement `src/health-checker.ts` — Health check orchestration** — Implement a `HealthChecker` class that: accepts per-provider health check functions, runs health checks on all keys (or keys for a specific provider) by calling the provider's function with the raw key string, collects results into a `HealthCheckReport`, computes overall status (`healthy`/`degraded`/`unhealthy`), and tracks `durationMs`. | Status: not_done

- [ ] **Implement `keyring.healthCheck(provider?)` method** — Delegate to `HealthChecker`. Update each key's `healthStatus` and `lastHealthCheckAt` based on results. For keys whose provider has no health check function configured, set `healthStatus: 'unknown'` and skip. Return the `HealthCheckReport`. | Status: not_done

- [ ] **Implement key disabling on health check failure** — When a key fails a health check, increment its consecutive failure counter. When the counter reaches `unhealthyThreshold` (default 1), mark the key as `healthStatus: 'unhealthy'` and exclude from rotation (treated like permanent cooldown). Fire `onKeyDisabled` event with `reason: 'health-check'`. | Status: not_done

- [ ] **Implement key re-enabling on health check success** — When a previously unhealthy key passes a health check, reset its consecutive failure counter, mark as `healthStatus: 'healthy'`, re-include in rotation. Fire `onKeyEnabled` event. | Status: not_done

- [ ] **Implement periodic health checks** — When `healthCheck.intervalMs` is configured, use `setInterval` to run `healthCheck()` at the specified interval. Call `unref()` on the timer to prevent blocking process exit. Implement `keyring.startHealthChecks()` and `keyring.stopHealthChecks()` methods. | Status: not_done

- [ ] **Implement `unhealthyThreshold` configuration** — Default is 1 (disable on first failure). When set to N, a key must fail N consecutive health checks before being disabled. Resets to 0 on any successful health check. | Status: not_done

- [ ] **Implement key expiry detection** — In `getKey`, check each candidate key's `metadata.expiresAt`. If the timestamp is in the past, mark the key as disabled (do not return it). Fire `onKeyDisabled` with `reason: 'expired'`. Also check expiry proactively in `healthCheck()`. | Status: not_done

- [ ] **Implement overall health status computation** — `healthy`: all keys passed. `degraded`: at least one key failed but at least one key per pool is healthy. `unhealthy`: all keys in one or more pools failed. | Status: not_done

- [ ] **Write tests `src/__tests__/health-checker.test.ts`** — Test: health check calls the provider-specific function for each key. Returns correct `HealthCheckReport` shape with `overall`, `keys`, `checkedAt`, `durationMs`. Keys failing health check are marked unhealthy/disabled. Disabled keys excluded from `getKey`. Keys passing subsequent health check are re-enabled. `unhealthyThreshold > 1`: key not disabled until N failures. Provider with no health check function: key status is `'unknown'`. Periodic health checks run at configured interval (use fake timers). `stopHealthChecks` stops the interval. `startHealthChecks` restarts. Timer uses `unref()`. Overall status: all healthy = 'healthy', mixed = 'degraded', all in a pool failed = 'unhealthy'. Key with expired `metadata.expiresAt` is automatically disabled. | Status: not_done

---

## Phase 11: Event Hooks

- [x] **Implement `onCooldownStart` hook** — Fire when a key enters cooldown. Payload: `{ keyId, provider, cooldownMs, retryAfter? (raw Retry-After value if present), escalationLevel }`. | Status: done

- [ ] **Implement `onCooldownEnd` hook** — Fire when a key exits cooldown (detected lazily in `getKey`). Payload: `{ keyId, provider, cooldownDurationMs }`. | Status: not_done

- [ ] **Implement `onKeyDisabled` hook** — Fire when a key is disabled due to health check failure or expiry. Payload: `{ keyId, provider, reason: 'health-check' | 'expired' | 'manual', error? }`. | Status: not_done

- [ ] **Implement `onKeyEnabled` hook** — Fire when a disabled key is re-enabled (passes health check). Payload: `{ keyId, provider }`. | Status: not_done

- [x] **Implement `onPoolExhausted` hook** — Fire when all keys in a pool are unavailable. Payload: `{ pool, totalKeys, cooldownKeys, disabledKeys, shortestCooldownMs }`. | Status: done

- [ ] **Implement `onHealthCheckComplete` hook** — Fire after a health check completes. Payload: `{ report: HealthCheckReport }`. | Status: not_done

- [x] **Implement `onKeyRotation` hook** — Fire each time `getKey` selects a key. Payload: `{ keyId, provider, strategy, poolSize, availableKeys }`. | Status: done

- [ ] **Write tests `src/__tests__/events.test.ts`** — Test each hook fires at the correct time with the correct payload: `onCooldownStart` on 429 error, `onCooldownEnd` when cooldown expires in `getKey`, `onKeyDisabled` on health check failure and on expired key, `onKeyEnabled` on health check recovery, `onPoolExhausted` when all keys unavailable, `onHealthCheckComplete` after health check, `onKeyRotation` on every `getKey` call. Verify hooks are optional (no error when not provided). Verify hook errors do not crash the keyring (errors in hooks are swallowed or logged). | Status: not_done

---

## Phase 12: State Export & Import

- [x] **Implement `keyring.exportState()` method** — Return an `ExportedKeyringState` object containing per-key usage counters (`requests`, `tokens`, `inputTokens`, `outputTokens`, `errors`, `rateLimits`, `cost`, `totalCooldownMs`, `cooldownEndsAt`, `healthStatus`, `lastUsedAt`, `lastErrorAt`, `lastHealthCheckAt`) keyed by `id`, plus `exportedAt` timestamp. Never include raw key strings. The object must be JSON-serializable. | Status: done

- [ ] **Implement `initialState` restoration in `createKeyring`** — When `initialState` is provided, match exported state entries to keys by `id`. Restore usage counters and timestamps. Keys in `initialState` but not in `keys` config are ignored. Keys in `keys` config but not in `initialState` start fresh (zero counters). Expired cooldowns in imported state (`cooldownEndsAt` in the past) are cleared on first interaction. | Status: not_done

- [ ] **Write tests `src/__tests__/state-export.test.ts`** — Test: `exportState` produces serializable JSON. Exported state does not contain key strings. Round-trip: export then create new keyring with `initialState` restores counters. Expired cooldowns in imported state are cleared. Keys in state but not in config are ignored. Keys in config but not in state start fresh. Fresh keyring `exportState` returns zero counters. | Status: not_done

---

## Phase 13: Async Key Loader

- [ ] **Implement `keyLoader` option and `keyring.loadKeys()` method** — Accept an optional `keyLoader` function in `KeyringConfig` that returns `Promise<KeyConfig[]>`. Implement `keyring.loadKeys()` which calls the loader, validates returned configs, and adds keys to the keyring (skipping duplicates or throwing on conflict per validation rules). `loadKeys` is not called automatically — caller must invoke it explicitly. | Status: not_done

- [ ] **Write tests for async key loader** — Test: `loadKeys` calls the loader function. Loaded keys are added to the appropriate pools. Loaded keys are immediately available via `getKey`. Duplicate IDs from loader are handled (throw TypeError). `loadKeys` can be called multiple times. Keys from loader have the same validation as `addKey`. | Status: not_done

---

## Phase 14: Security Hardening

- [x] **Ensure key strings never appear in stats** — Audit `getStats()` return value: only `id`, metadata, and usage counters are exposed. The `key` field is never present. | Status: done

- [x] **Ensure key strings never appear in events** — Audit all hook payloads: only `keyId` is used, never the raw key. | Status: done

- [x] **Ensure key strings never appear in exported state** — Audit `exportState()`: entries are keyed by `id`, raw key strings are not included. | Status: done

- [ ] **Implement key masking in error messages** — In `reportError`, if the error message contains patterns matching common API key formats (`sk-...`, `key-...`, `AIza...`, etc.), strip or mask them before propagating to event hooks. Use regex to detect and replace with `[REDACTED]`. | Status: not_done

- [x] **Ensure key strings never appear in `PoolExhaustedError`** — Audit the error class: `keyStates` contains `id` and `status`, never the raw key. The error `message` does not include keys. | Status: done

- [ ] **Write security-focused tests** — Test: `getStats` output does not contain any key string from the config. Event hook payloads do not contain key strings. `exportState` output does not contain key strings. `PoolExhaustedError` does not contain key strings. Error messages with embedded API keys are masked before reaching hooks. | Status: not_done

---

## Phase 15: CLI Implementation

- [ ] **Implement `src/cli.ts` — CLI entry point** — Parse command-line arguments (use minimal arg parsing, no external deps). Support three commands: `stats`, `health`, `list`. Support flags: `--json` (JSON output), `--provider <name>` (filter by provider). Add `#!/usr/bin/env node` shebang. | Status: not_done

- [ ] **Implement CLI configuration file loading** — Look for `ai-keyring.config.json` or `ai-keyring.config.js` in the current directory. Parse the config. Map `env` property in key configs to `process.env[env]` values. Create a keyring instance from the loaded config. | Status: not_done

- [ ] **Implement `ai-keyring stats` command** — Display per-key and per-pool usage statistics. Human-readable table format by default: pool name, strategy, key ID, status, request count, token count, error rate, avg latency, cost. Support `--json` for JSON output. Support `--provider` for filtering. | Status: not_done

- [ ] **Implement `ai-keyring health` command** — Run health checks on all keys. Display per-key health status, latency, remaining quota. Show overall status (HEALTHY/DEGRADED/UNHEALTHY). Exit code 0 for all healthy, 1 for any unhealthy, 2 for config error. Support `--json` and `--provider` flags. | Status: not_done

- [ ] **Implement `ai-keyring list` command** — List all configured keys without revealing key strings. Table format: ID, Provider, Priority, Weight, Tags, Status. | Status: not_done

- [ ] **Write CLI tests** — Test: `stats` command produces expected output format. `health` command produces expected output format with correct exit codes. `list` command produces expected output. `--json` flag outputs valid JSON. `--provider` filter works. Config file loading works. Missing config file produces error with exit code 2. Environment variable resolution works. | Status: not_done

---

## Phase 16: Lifecycle Management

- [ ] **Implement `keyring.shutdown()` method** — Stop periodic health checks (clear the interval timer). Clear all internal state references for garbage collection. After shutdown, `getKey` throws an error indicating the keyring is shut down. | Status: not_done

- [ ] **Write lifecycle tests** — Test: `shutdown` stops health check interval. After `shutdown`, `getKey` throws. `stopHealthChecks` stops periodic checks, `startHealthChecks` restarts them. Multiple `shutdown` calls do not throw. | Status: not_done

---

## Phase 17: Public API Exports

- [x] **Implement `src/index.ts` — Public API surface** — Export `createKeyring` as the primary function. Export `PoolExhaustedError` class. Export all TypeScript types/interfaces needed by consumers: `KeyConfig`, `KeyEntry`, `KeyringConfig`, `KeyringStats`, `KeyStats`, `PoolState`, `RotationStrategy`, `UsageReport`, `HealthCheckResult`, `HealthCheckFn`, `HealthCheckConfig`, `HealthCheckReport`, `PoolExhaustionConfig`, `KeyringHooks`, `ExportedKeyringState`, `Keyring`, `PoolConfig`. | Status: done

---

## Phase 18: Integration Tests

- [ ] **Write `src/__tests__/integration/end-to-end.test.ts`** — Full lifecycle test: create keyring with 3 keys and round-robin. Call `getKey` 3 times, verify rotation order. Report a 429 on key 1. Call `getKey`, verify key 1 is skipped. Advance time past cooldown. Call `getKey`, verify key 1 is back in rotation. Verify stats reflect all operations. | Status: not_done

- [ ] **Write `src/__tests__/integration/multi-provider.test.ts`** — Create keyring with openai and anthropic keys. Place all openai keys in cooldown. Configure `fallbackPool: 'anthropic'` on the openai pool. Call `getKey('openai')` and verify an anthropic key is returned. Test cross-provider stats isolation. | Status: not_done

- [ ] **Write `src/__tests__/integration/openai.test.ts`** — Test the OpenAI SDK integration pattern from the spec: get key, create OpenAI client, simulate success with reportUsage, simulate 429 with reportError, verify key rotation on next call. | Status: not_done

- [ ] **Write `src/__tests__/integration/anthropic.test.ts`** — Test the Anthropic SDK integration pattern: get key, create Anthropic client, simulate success, simulate rate_limit_error (Anthropic error type), verify cooldown. | Status: not_done

- [ ] **Write health check integration test** — Create keyring with mock health check function. One key returns unhealthy. Run `healthCheck()`. Verify unhealthy key is disabled. Call `getKey`, verify disabled key is skipped. Update mock to return healthy. Run `healthCheck()` again. Verify key is re-enabled and available. | Status: not_done

- [ ] **Write weighted random distribution test** — Create keyring with weights [3, 1]. Call `getKey` 10,000 times. Verify distribution is approximately 75%/25% within statistical tolerance (5%). | Status: not_done

- [ ] **Write concurrent usage test** — Simulate 100 concurrent requests. Mix of successes, 429s, and 500s. Verify usage counters, cooldown states, and error rates are correct after all complete. | Status: not_done

---

## Phase 19: Edge Case Tests

- [ ] **Test single-key pool** — Pool with one key: rotation strategy always returns that key. The one key enters cooldown: pool exhaustion is triggered. | Status: not_done

- [ ] **Test `getKey` with no provider** — Returns any available key from any pool. All keys disabled: throws `PoolExhaustedError`. | Status: not_done

- [ ] **Test `getKey` with non-existent provider** — Throws `PoolExhaustedError` (empty pool). | Status: not_done

- [ ] **Test `reportUsage`/`reportError` for non-existent key ID** — Both are no-ops (do not throw). | Status: not_done

- [ ] **Test `addKey` while pool is in use by round-robin** — New key enters rotation without disrupting the sequence. | Status: not_done

- [ ] **Test `removeKey` for the key currently in use** — Next `getKey` selects the next key normally. | Status: not_done

- [ ] **Test `Retry-After: 0`** — Minimum cooldown of 1 second is enforced. | Status: not_done

- [ ] **Test extremely large `Retry-After` values** — Capped at `maxCooldownMs`. | Status: not_done

- [ ] **Test `healthCheck` with no health check function for provider** — Key status remains `'unknown'`, key is not disabled. | Status: not_done

- [ ] **Test all keys in all pools disabled** — `getKey()` with no provider throws `PoolExhaustedError`. | Status: not_done

- [ ] **Test `exportState` on fresh keyring** — Returns valid state with zero counters and null timestamps. | Status: not_done

- [ ] **Test key with `metadata.expiresAt` in the past** — Automatically disabled on first `getKey` check. Fires `onKeyDisabled` with `reason: 'expired'`. | Status: not_done

---

## Phase 20: Documentation

- [ ] **Write README.md** — Include: package description, installation, quick start example, `createKeyring` API reference, `getKey`/`reportUsage`/`reportError`/`addKey`/`removeKey`/`getStats`/`healthCheck` method docs, rotation strategy comparison table, cooldown and failover explanation, health checking setup, event hooks reference, state export/import, CLI usage, integration examples (OpenAI SDK, Anthropic SDK, with `tool-call-retry`, with `ai-circuit-breaker`), configuration reference table with all defaults, security notes (keys in memory only, never logged/serialized). | Status: not_done

---

## Phase 21: Build & Publish Readiness

- [ ] **Verify `npm run build` succeeds** — Run `tsc` and ensure all source files compile without errors. Check that `dist/` output contains `.js`, `.d.ts`, and `.d.ts.map` files. | Status: not_done

- [ ] **Verify `npm run test` passes** — Run `vitest run` and ensure all tests pass. Check coverage is adequate across all modules. | Status: not_done

- [ ] **Verify `npm run lint` passes** — Run `eslint src/` and ensure no lint errors. Configure ESLint if not yet configured (add `.eslintrc` or ESLint config in `package.json`). | Status: not_done

- [ ] **Version bump** — Bump version in `package.json` per semver based on the phase/release being published (0.1.0 for Phase 1, 0.2.0 for Phase 2, etc., 1.0.0 for final release). | Status: not_done

- [ ] **Verify `npm publish` dry run** — Run `npm publish --dry-run` to verify the package is publishable, `dist/` is included in the `files` field, and no unnecessary files are included. | Status: not_done
