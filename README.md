# ai-keyring

Manage, rotate, and health-check AI API keys across providers.

[![npm version](https://img.shields.io/npm/v/ai-keyring.svg)](https://www.npmjs.com/package/ai-keyring)
[![license](https://img.shields.io/npm/l/ai-keyring.svg)](https://github.com/SiluPanda/ai-keyring/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/ai-keyring.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

`ai-keyring` is a key pool manager for AI/LLM API keys with automatic rotation, 429 rate-limit detection, cooldown management with escalating backoff, and per-key usage tracking. It works with any provider (OpenAI, Anthropic, Google, Mistral, Cohere, etc.) and has zero runtime dependencies.

## Installation

```bash
npm install ai-keyring
```

## Quick Start

```typescript
import { createKeyring } from 'ai-keyring';

const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_KEY_1!, provider: 'openai' },
    { id: 'oai-2', key: process.env.OPENAI_KEY_2!, provider: 'openai' },
    { id: 'ant-1', key: process.env.ANTHROPIC_KEY!, provider: 'anthropic' },
  ],
  strategy: 'round-robin',
  defaultCooldownMs: 60_000,
});

// Get the next available key for a provider
const entry = keyring.getKey('openai');
console.log(entry.key); // 'sk-...'

// Report usage after a successful request
keyring.reportUsage(entry.id, { tokens: 500, latencyMs: 120 });

// Report errors -- 429s trigger automatic cooldown
try {
  await openai.chat.completions.create({ model: 'gpt-4', messages });
} catch (err) {
  keyring.reportError(entry.id, err);
  // The key is now in cooldown; next getKey() call returns a different key
}

// Clean up when done
keyring.shutdown();
```

## Features

- **Five rotation strategies** -- round-robin, least-recently-used, least-requests, weighted-random, and priority-based
- **Automatic 429 detection** -- recognizes rate-limit errors from any provider SDK (status codes, error codes, error types, message patterns)
- **Retry-After parsing** -- extracts cooldown duration from `Retry-After` headers (integer seconds and HTTP date formats)
- **Escalating cooldown** -- consecutive rate limits on the same key escalate the cooldown duration (1x, 2x, 4x, 8x) up to a configurable maximum
- **Per-key usage tracking** -- request count, token usage (total, input, output), error rate, average latency, cost, last-used timestamps
- **Rolling window metrics** -- error rate and average latency computed over a configurable time window with lazy pruning
- **Dynamic key management** -- add and remove keys at runtime without restarting
- **Tag-based pools** -- group keys by provider, tier, purpose, or any arbitrary tag
- **Key expiration** -- keys with `metadata.expiresAt` are automatically disabled when expired
- **State export/import** -- serialize keyring state for persistence across restarts (key strings are never exported)
- **Event hooks** -- observe cooldown start/end, key disabled/enabled, pool exhaustion, health checks, and key rotation
- **Per-pool strategy overrides** -- use different rotation strategies for different providers
- **Zero dependencies** -- only uses built-in Node.js APIs

## API Reference

### `createKeyring(config)`

Creates and returns a `Keyring` instance.

```typescript
import { createKeyring } from 'ai-keyring';

const keyring = createKeyring(config);
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `config.keys` | `KeyConfig[]` | *required* | Initial set of keys. Must be non-empty. |
| `config.strategy` | `RotationStrategy` | `'round-robin'` | Global rotation strategy. |
| `config.defaultCooldownMs` | `number` | `60000` | Default cooldown duration (ms) when no `Retry-After` header is present. |
| `config.maxCooldownMs` | `number` | `600000` | Maximum cooldown duration (ms). Caps escalating cooldown. |
| `config.cooldownEscalationWindowMs` | `number` | `300000` | Time window (ms) for tracking consecutive rate limits for escalation. |
| `config.metricsWindowMs` | `number` | `300000` | Rolling window (ms) for error rate and average latency metrics. |
| `config.onPoolExhausted` | `PoolExhaustionConfig` | `{ strategy: 'throw' }` | What to do when all keys in a pool are unavailable. |
| `config.pools` | `Record<string, PoolConfig>` | `undefined` | Per-pool configuration overrides. |
| `config.healthCheck` | `HealthCheckConfig` | `undefined` | Health check configuration. |
| `config.hooks` | `KeyringHooks` | `undefined` | Event hooks for observability. |
| `config.initialState` | `ExportedKeyringState` | `undefined` | Previously exported state to restore. |

**Returns:** `Keyring`

**Throws:** `TypeError` if `keys` is empty or missing.

---

### `keyring.getKey(provider?)`

Returns the next available key from the pool based on the configured rotation strategy. Keys in cooldown, disabled, or expired are automatically skipped.

```typescript
// Get any available key
const entry = keyring.getKey();

// Filter by provider (string shorthand)
const openaiKey = keyring.getKey('openai');

// Filter by provider (object syntax)
const anthropicKey = keyring.getKey({ provider: 'anthropic' });

// Filter by tag
const premiumKey = keyring.getKey({ tag: 'premium' });
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `provider` | `string \| { provider?: string; tag?: string }` | Optional. Filter keys by provider name or tag. |

**Returns:** `KeyEntry`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for this key. |
| `key` | `string` | The actual API key string. |
| `provider` | `string` | The provider this key belongs to. |
| `tags` | `string[]` | Tags for additional pool membership. |
| `metadata` | `Record<string, unknown> \| undefined` | Caller-provided metadata. |

**Throws:** `PoolExhaustedError` when all keys in the requested pool are in cooldown or disabled.

---

### `keyring.reportUsage(keyId, usage)`

Records usage metrics for a key after a successful request. Also resets the cooldown escalation counter for the key.

```typescript
keyring.reportUsage(entry.id, {
  tokens: 1500,
  inputTokens: 1000,
  outputTokens: 500,
  latencyMs: 230,
  cost: 0.045,
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `keyId` | `string` | The key's unique identifier. |
| `usage.tokens` | `number \| undefined` | Total tokens consumed. |
| `usage.inputTokens` | `number \| undefined` | Input/prompt tokens. |
| `usage.outputTokens` | `number \| undefined` | Output/completion tokens. |
| `usage.latencyMs` | `number \| undefined` | Request latency in milliseconds. |
| `usage.cost` | `number \| undefined` | Dollar cost of the request. |

**Returns:** `void`. No-op if `keyId` is not found.

---

### `keyring.reportError(keyId, error)`

Reports an error for a key. If the error is a 429 rate-limit response, the key is placed in cooldown automatically. The cooldown duration is extracted from the `Retry-After` header when available, or falls back to the configured default with escalating backoff for consecutive rate limits.

```typescript
try {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    headers: { Authorization: `Bearer ${entry.key}` },
    // ...
  });
} catch (err) {
  keyring.reportError(entry.id, err);
}
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `keyId` | `string` | The key's unique identifier. |
| `error` | `unknown` | The error object. Checked for 429 status and `Retry-After` headers. |

**Returns:** `void`. No-op if `keyId` is not found.

---

### `keyring.addKey(config)`

Adds a key to the keyring at runtime. The key is immediately available for selection.

```typescript
keyring.addKey({
  id: 'new-key',
  key: process.env.NEW_API_KEY!,
  provider: 'openai',
  tags: ['premium'],
  weight: 2,
  priority: 0,
});
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `config.id` | `string \| undefined` | Auto-generated UUID | Unique identifier. |
| `config.key` | `string` | *required* | The API key string. |
| `config.provider` | `string` | *required* | Provider name. |
| `config.tags` | `string[]` | `[]` | Tags for pool membership. |
| `config.weight` | `number` | `1` | Weight for weighted-random rotation. |
| `config.priority` | `number` | `0` | Priority for priority-based rotation (lower = higher priority). |
| `config.maxRequestsPerMinute` | `number \| undefined` | `undefined` | Rate limit hint. |
| `config.metadata` | `Record<string, unknown>` | `undefined` | Arbitrary metadata. |

**Returns:** `void`

**Throws:** `TypeError` if `key` or `provider` is empty, or if `id` is a duplicate.

---

### `keyring.removeKey(keyId)`

Removes a key from the keyring. The key will no longer be returned by `getKey()`.

```typescript
keyring.removeKey('old-key');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `keyId` | `string` | The key's unique identifier. |

**Returns:** `void`. No-op if `keyId` is not found.

---

### `keyring.getStats()`

Returns per-key and per-pool usage statistics.

```typescript
const stats = keyring.getStats();

// Per-key stats
console.log(stats.keys['oai-1'].requests);    // 42
console.log(stats.keys['oai-1'].tokens);       // 15000
console.log(stats.keys['oai-1'].errorRate);    // 0.02
console.log(stats.keys['oai-1'].avgLatencyMs); // 180
console.log(stats.keys['oai-1'].status);       // 'available' | 'cooldown' | 'disabled'

// Per-pool stats
console.log(stats.pools['openai'].totalKeys);     // 2
console.log(stats.pools['openai'].availableKeys); // 1
console.log(stats.pools['openai'].cooldownKeys);  // 1
```

**Returns:** `KeyringStats`

```typescript
interface KeyringStats {
  keys: Record<string, KeyStats>;
  pools: Record<string, PoolState>;
}
```

**`KeyStats` fields:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Key identifier. |
| `provider` | `string` | Provider name. |
| `requests` | `number` | Total request count. |
| `tokens` | `number` | Total tokens consumed. |
| `inputTokens` | `number` | Total input tokens. |
| `outputTokens` | `number` | Total output tokens. |
| `errors` | `number` | Total error count. |
| `rateLimits` | `number` | Total 429 responses. |
| `errorRate` | `number` | Error rate within the rolling metrics window. |
| `avgLatencyMs` | `number` | Average latency within the rolling metrics window. |
| `cost` | `number` | Total cost. |
| `lastUsedAt` | `string \| null` | ISO 8601 timestamp of last use. |
| `lastErrorAt` | `string \| null` | ISO 8601 timestamp of last error. |
| `cooldownEndsAt` | `string \| null` | ISO 8601 timestamp when cooldown ends. |
| `totalCooldownMs` | `number` | Total accumulated cooldown time. |
| `healthStatus` | `'healthy' \| 'unhealthy' \| 'unknown'` | Health check status. |
| `lastHealthCheckAt` | `string \| null` | ISO 8601 timestamp of last health check. |
| `status` | `'available' \| 'cooldown' \| 'disabled'` | Current key status. |
| `metadata` | `Record<string, unknown> \| undefined` | Caller-provided metadata. |

**`PoolState` fields:**

| Field | Type | Description |
|---|---|---|
| `totalKeys` | `number` | Total keys in the pool. |
| `availableKeys` | `number` | Keys currently available. |
| `cooldownKeys` | `number` | Keys currently in cooldown. |
| `disabledKeys` | `number` | Keys currently disabled. |
| `totalRequests` | `number` | Total requests across all keys. |
| `totalTokens` | `number` | Total tokens across all keys. |
| `totalErrors` | `number` | Total errors across all keys. |

---

### `keyring.healthCheck(provider?)`

Runs health checks on all keys or a specific provider's keys.

```typescript
const report = await keyring.healthCheck();
console.log(report.overall); // 'healthy' | 'degraded' | 'unhealthy'
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `provider` | `string \| undefined` | Optional. Run checks only for this provider's keys. |

**Returns:** `Promise<HealthCheckReport>`

---

### `keyring.startHealthChecks()` / `keyring.stopHealthChecks()`

Starts or stops periodic health checks based on the `healthCheck.intervalMs` configuration.

```typescript
keyring.startHealthChecks();
// ... later
keyring.stopHealthChecks();
```

---

### `keyring.exportState()`

Exports the keyring state for persistence. The exported state does not contain raw API key strings and is safe to serialize.

```typescript
const state = keyring.exportState();
// Persist to disk, database, etc.
fs.writeFileSync('keyring-state.json', JSON.stringify(state));

// Restore on next startup
const saved = JSON.parse(fs.readFileSync('keyring-state.json', 'utf-8'));
const keyring = createKeyring({
  keys: myKeys,
  initialState: saved,
});
```

**Returns:** `ExportedKeyringState`

---

### `keyring.shutdown()`

Stops all internal timers and cleans up resources. Call this when the keyring is no longer needed.

```typescript
keyring.shutdown();
```

**Returns:** `void`

---

### `isRateLimitError(error)`

Standalone utility to detect whether an error represents a 429 rate-limit response. Works with error shapes from any provider SDK.

```typescript
import { isRateLimitError } from 'ai-keyring';

if (isRateLimitError(err)) {
  // Handle rate limit
}
```

**Detection strategies (checked in order):**

| Check | Detected Pattern |
|---|---|
| `error.status === 429` | OpenAI SDK, fetch responses |
| `error.statusCode === 429` | Various HTTP clients |
| `error.response?.status === 429` | Axios-style errors |
| `error.code === 'rate_limited'` | Provider-specific codes |
| `error.code === 'rate-limited'` | Provider-specific codes |
| `error.code === 'too_many_requests'` | Provider-specific codes |
| `error.type === 'rate_limit_error'` | Anthropic SDK |
| `error.type === 'tokens'` | Token-based rate limits |
| `error.message` matches `/rate limit/i` | Last-resort string matching |

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `error` | `unknown` | The error to check. |

**Returns:** `boolean`

---

### `extractRetryAfterMs(error, defaultCooldownMs)`

Standalone utility to extract the `Retry-After` header value from an error and return the cooldown duration in milliseconds.

```typescript
import { extractRetryAfterMs } from 'ai-keyring';

const cooldownMs = extractRetryAfterMs(err, 60_000);
```

**Header locations checked (in order):**

1. `error.headers['retry-after']`
2. `error.response.headers['retry-after']`
3. `error.retryAfter`
4. `error.headers.get('retry-after')` (fetch `Headers` API)

**Parsing rules:**

- Positive integer string (e.g., `"30"`) is interpreted as seconds and converted to milliseconds (`30000`)
- HTTP date string is converted to a delta from `Date.now()`
- If the header is missing, the date is in the past, or parsing fails, returns `defaultCooldownMs`

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `error` | `unknown` | The error to extract headers from. |
| `defaultCooldownMs` | `number` | Fallback cooldown duration in milliseconds. |

**Returns:** `number` -- cooldown duration in milliseconds.

---

### `PoolExhaustedError`

Custom error thrown when all keys in a pool are unavailable.

```typescript
import { PoolExhaustedError } from 'ai-keyring';

try {
  keyring.getKey('openai');
} catch (err) {
  if (err instanceof PoolExhaustedError) {
    console.log(err.pool);              // 'openai'
    console.log(err.keyStates);         // [{ id, status, cooldownEndsAt?, cooldownRemainingMs? }]
    console.log(err.shortestCooldownMs); // 45000
  }
}
```

**Properties:**

| Property | Type | Description |
|---|---|---|
| `name` | `'PoolExhaustedError'` | Error name. |
| `pool` | `string` | The pool that was exhausted. |
| `keyStates` | `KeyState[]` | Per-key status details. |
| `shortestCooldownMs` | `number` | Shortest remaining cooldown across all keys in the pool. |

---

### `CooldownManager`

Low-level class for per-key cooldown tracking with escalating backoff. Used internally by the keyring, but exported for advanced use cases.

```typescript
import { CooldownManager } from 'ai-keyring';

const cooldown = new CooldownManager(
  60_000,  // defaultCooldownMs
  600_000, // maxCooldownMs
  300_000  // cooldownEscalationWindowMs
);

cooldown.setCooldown('key-1', 30_000);
cooldown.isInCooldown('key-1');          // true
cooldown.getCooldownRemainingMs('key-1'); // ~30000
cooldown.clearCooldown('key-1');
```

**Constructor:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `defaultCooldownMs` | `number` | `10000` | Default cooldown duration. |
| `maxCooldownMs` | `number` | `300000` | Maximum cooldown cap. |
| `cooldownEscalationWindowMs` | `number` | `60000` | Escalation tracking window. |

**Methods:**

| Method | Returns | Description |
|---|---|---|
| `setCooldown(keyId, durationMs)` | `void` | Places a key in cooldown. Enforces 1s minimum, caps at `maxCooldownMs`. |
| `isInCooldown(keyId)` | `boolean` | Checks if a key is in cooldown. Lazily cleans up expired entries. |
| `getCooldownRemainingMs(keyId)` | `number` | Remaining cooldown time in ms. Returns 0 if not in cooldown. |
| `clearCooldown(keyId)` | `void` | Removes a key from cooldown immediately. |
| `getTotalCooldownMs(keyId)` | `number` | Total accumulated cooldown time for a key. |
| `recordRateLimit(keyId, retryAfterMs?)` | `number` | Records a rate limit hit and returns the escalated cooldown duration. |
| `resetEscalation(keyId)` | `void` | Resets the escalation counter for a key. |
| `getCooldownEndsAt(keyId)` | `Date \| null` | Returns the cooldown end timestamp, or `null`. |

---

### `UsageTracker`

Low-level class for per-key usage metrics with rolling window support. Used internally by the keyring, but exported for advanced use cases.

```typescript
import { UsageTracker } from 'ai-keyring';

const tracker = new UsageTracker(300_000); // 5-minute rolling window

tracker.recordRequest('key-1');
tracker.recordUsage('key-1', { tokens: 500, latencyMs: 120 });
tracker.recordError('key-1');
tracker.recordRateLimit('key-1');

const metrics = tracker.getMetrics('key-1');
console.log(metrics.requests);    // 1
console.log(metrics.errorRate);   // 1.0
console.log(metrics.avgLatencyMs); // 120
```

**Constructor:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `metricsWindowMs` | `number` | `60000` | Rolling window for error rate and latency metrics. Set to 0 to disable. |

**Methods:**

| Method | Returns | Description |
|---|---|---|
| `recordRequest(keyId)` | `void` | Increments request count and sets `lastUsedAt`. |
| `recordUsage(keyId, usage)` | `void` | Accumulates token, cost, and latency metrics. |
| `recordError(keyId)` | `void` | Increments error count and sets `lastErrorAt`. |
| `recordRateLimit(keyId)` | `void` | Increments rate limit count. |
| `getErrorRate(keyId)` | `number` | Error rate within the rolling window. |
| `getAvgLatencyMs(keyId)` | `number` | Average latency within the rolling window. |
| `getMetrics(keyId)` | `KeyMetrics & { errorRate, avgLatencyMs }` | All metrics for a key. |

---

### `KeyPool`

Low-level class for key storage and pool grouping. Used internally by the keyring, but exported for advanced use cases.

```typescript
import { KeyPool } from 'ai-keyring';

const pool = new KeyPool();
pool.addKey({ id: 'k1', key: 'sk-1', provider: 'openai', tags: ['premium'] });

pool.getKeysByProvider('openai');  // [InternalKeyEntry]
pool.getKeysByTag('premium');      // [InternalKeyEntry]
pool.getAvailableKeys({ provider: 'openai' }); // excludes disabled/expired
pool.removeKey('k1');
```

---

### Rotation Strategies

Five built-in rotation strategies are available. Each can be used globally or overridden per pool.

```typescript
import {
  createRotationStrategy,
  RoundRobinStrategy,
  LeastRecentlyUsedStrategy,
  LeastRequestsStrategy,
  WeightedRandomStrategy,
  PriorityStrategy,
} from 'ai-keyring';
```

| Strategy | Value | Algorithm |
|---|---|---|
| **Round Robin** | `'round-robin'` | Cycles through keys in insertion order. |
| **Least Recently Used** | `'least-recently-used'` | Selects the key with the oldest `lastUsedAt` timestamp. |
| **Least Requests** | `'least-requests'` | Selects the key with the fewest total requests. |
| **Weighted Random** | `'weighted-random'` | Selects randomly, weighted by each key's `weight` property. |
| **Priority** | `'priority'` | Selects the key with the lowest `priority` value (lower = higher priority). Ties broken by round-robin. |

**Factory function:**

```typescript
const strategy = createRotationStrategy('weighted-random');
const selected = strategy.select(availableKeys); // InternalKeyEntry | null
```

---

### `createRotationStrategy(strategy)`

Factory function that returns a `RotationStrategyImpl` instance for the given strategy name.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `strategy` | `RotationStrategy` | One of `'round-robin'`, `'least-recently-used'`, `'least-requests'`, `'weighted-random'`, `'priority'`. |

**Returns:** `RotationStrategyImpl` with a `select(availableKeys): InternalKeyEntry | null` method.

**Throws:** `TypeError` for unknown strategy names.

## Configuration

### Rotation Strategy

```typescript
const keyring = createKeyring({
  keys: myKeys,
  strategy: 'weighted-random', // Global default
  pools: {
    openai: { strategy: 'round-robin' },    // Override for OpenAI pool
    anthropic: { strategy: 'priority' },     // Override for Anthropic pool
  },
});
```

### Cooldown Tuning

```typescript
const keyring = createKeyring({
  keys: myKeys,
  defaultCooldownMs: 30_000,             // 30s default cooldown
  maxCooldownMs: 300_000,                // 5-minute cap
  cooldownEscalationWindowMs: 120_000,   // Reset escalation after 2 minutes without a 429
});
```

**Escalation behavior:** When a key receives consecutive 429 responses within the escalation window, the cooldown duration multiplies: 1x, 2x, 4x, 8x (capped). A successful `reportUsage()` call or the escalation window expiring resets the counter. When a `Retry-After` header is present, its value is used directly without escalation.

### Key Weights and Priorities

```typescript
const keyring = createKeyring({
  keys: [
    { id: 'primary', key: 'sk-1', provider: 'openai', weight: 3, priority: 0 },
    { id: 'secondary', key: 'sk-2', provider: 'openai', weight: 1, priority: 1 },
  ],
  strategy: 'weighted-random', // primary gets ~75% of traffic
});
```

### Tags and Multi-Pool Membership

```typescript
const keyring = createKeyring({
  keys: [
    { id: 'k1', key: 'sk-1', provider: 'openai', tags: ['premium', 'us-east'] },
    { id: 'k2', key: 'sk-2', provider: 'openai', tags: ['standard', 'us-west'] },
    { id: 'k3', key: 'sk-3', provider: 'anthropic', tags: ['premium'] },
  ],
});

keyring.getKey('openai');           // From the openai pool
keyring.getKey({ tag: 'premium' }); // k1 or k3
```

### Key Expiration

Set `metadata.expiresAt` to automatically disable keys when they expire:

```typescript
const keyring = createKeyring({
  keys: [
    {
      id: 'trial',
      key: 'sk-trial',
      provider: 'openai',
      metadata: { expiresAt: '2026-06-01T00:00:00Z' },
    },
  ],
});
```

### Event Hooks

```typescript
const keyring = createKeyring({
  keys: myKeys,
  hooks: {
    onCooldownStart({ keyId, provider, cooldownMs, retryAfter, escalationLevel }) {
      console.log(`Key ${keyId} entering ${cooldownMs}ms cooldown`);
    },
    onCooldownEnd({ keyId, provider, cooldownDurationMs }) {
      console.log(`Key ${keyId} available again`);
    },
    onKeyDisabled({ keyId, provider, reason, error }) {
      console.warn(`Key ${keyId} disabled: ${reason}`);
    },
    onKeyEnabled({ keyId, provider }) {
      console.log(`Key ${keyId} re-enabled`);
    },
    onPoolExhausted({ pool, totalKeys, cooldownKeys, disabledKeys, shortestCooldownMs }) {
      console.error(`Pool ${pool} exhausted, retry in ${shortestCooldownMs}ms`);
    },
    onHealthCheckComplete({ report }) {
      console.log(`Health: ${report.overall}`);
    },
    onKeyRotation({ keyId, provider, strategy, poolSize, availableKeys }) {
      console.log(`Selected ${keyId} via ${strategy}`);
    },
  },
});
```

### State Persistence

```typescript
// Export state before shutdown
const state = keyring.exportState();
saveToDatabase(state);

// Restore state on next startup
const savedState = loadFromDatabase();
const keyring = createKeyring({
  keys: myKeys,
  initialState: savedState,
});
```

The exported state includes per-key counters (requests, tokens, errors, cost, cooldown) but never includes raw API key strings.

## Error Handling

### Pool Exhaustion

When all keys in a pool are in cooldown or disabled, `getKey()` throws a `PoolExhaustedError`:

```typescript
import { PoolExhaustedError } from 'ai-keyring';

try {
  const key = keyring.getKey('openai');
} catch (err) {
  if (err instanceof PoolExhaustedError) {
    // Wait for the shortest cooldown to expire
    await new Promise(resolve => setTimeout(resolve, err.shortestCooldownMs));
    // Retry
    const key = keyring.getKey('openai');
  }
}
```

### Integration with Retry Libraries

`ai-keyring` does not retry requests. Use it with a retry library like `p-retry` or `tool-call-retry`:

```typescript
import pRetry from 'p-retry';

const result = await pRetry(async () => {
  const entry = keyring.getKey('openai');
  try {
    const response = await callOpenAI(entry.key, prompt);
    keyring.reportUsage(entry.id, { tokens: response.usage.total_tokens });
    return response;
  } catch (err) {
    keyring.reportError(entry.id, err);
    throw err; // Let p-retry handle the retry
  }
}, { retries: 3 });
```

On each retry attempt, `getKey()` returns a different key if the previous one entered cooldown.

### Non-429 Errors

Non-rate-limit errors (400, 401, 500, etc.) are counted in error metrics but do not trigger cooldown. The key remains available for selection.

## Advanced Usage

### Cross-Provider Failover

```typescript
function getKeyWithFallback(): KeyEntry {
  try {
    return keyring.getKey('openai');
  } catch (err) {
    if (err instanceof PoolExhaustedError) {
      return keyring.getKey('anthropic');
    }
    throw err;
  }
}
```

### Custom Rotation Strategy

Implement the `RotationStrategyImpl` interface for custom selection logic:

```typescript
import type { RotationStrategyImpl, InternalKeyEntry } from 'ai-keyring';

class RandomStrategy implements RotationStrategyImpl {
  select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null {
    if (availableKeys.length === 0) return null;
    return availableKeys[Math.floor(Math.random() * availableKeys.length)];
  }
}
```

### Monitoring Dashboard

Use `getStats()` to build a monitoring dashboard:

```typescript
setInterval(() => {
  const stats = keyring.getStats();
  for (const [id, key] of Object.entries(stats.keys)) {
    metrics.gauge(`keyring.requests.${id}`, key.requests);
    metrics.gauge(`keyring.error_rate.${id}`, key.errorRate);
    metrics.gauge(`keyring.avg_latency.${id}`, key.avgLatencyMs);
    metrics.gauge(`keyring.status.${id}`, key.status === 'available' ? 1 : 0);
  }
  for (const [pool, state] of Object.entries(stats.pools)) {
    metrics.gauge(`keyring.pool.available.${pool}`, state.availableKeys);
    metrics.gauge(`keyring.pool.cooldown.${pool}`, state.cooldownKeys);
  }
}, 10_000);
```

## TypeScript

`ai-keyring` is written in TypeScript with strict mode enabled. All types are exported:

```typescript
import type {
  // Key configuration
  KeyConfig,
  KeyEntry,

  // Rotation
  RotationStrategy,
  RotationStrategyImpl,

  // Pool
  PoolConfig,
  InternalKeyEntry,

  // Pool exhaustion
  PoolExhaustionConfig,
  ThrowExhaustion,
  WaitExhaustion,
  FallbackExhaustion,

  // Health check
  HealthCheckResult,
  HealthCheckFn,
  HealthCheckConfig,
  HealthCheckReport,

  // Usage
  UsageReport,
  KeyStats,
  PoolState,
  KeyringStats,

  // State
  ExportedKeyringState,

  // Hooks
  KeyringHooks,

  // Top-level
  KeyringConfig,
  Keyring,

  // Error
  KeyState,
} from 'ai-keyring';
```

## License

MIT
