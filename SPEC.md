# ai-keyring -- Specification

## 1. Overview

`ai-keyring` is a key management and rotation library for AI API keys across multiple providers. It manages pools of API keys, rotates between them using configurable strategies (round-robin, least-recently-used, weighted random, priority-based), automatically handles rate limit responses (HTTP 429 with `Retry-After` parsing and per-key cooldown), fails over from a throttled or broken key to the next available key, tracks per-key usage metrics (request count, token usage, error rate, latency, last used time), and performs periodic health checks to verify key validity and remaining quota. The package exposes a programmatic TypeScript/JavaScript API and an optional CLI for key stats and health checking.

The gap this package fills is specific and well-defined. Developers and teams operating AI-powered applications routinely manage 20 to 37+ API keys across providers -- OpenAI, Anthropic, Google, Mistral, Cohere, and others. Each key has its own rate limits, usage quotas, billing tiers, and expiration dates. Without centralized key management, the typical approach is to hardcode a single key per provider in an environment variable, hit the rate limit, and watch requests fail with 429 errors until the rate limit window resets. Scaling up means manually rotating keys, building ad-hoc retry logic around 429 responses, and losing visibility into which keys are being used, how much quota remains, and which keys are approaching expiration.

Existing solutions address fragments of this problem. Secret managers (AWS Secrets Manager, HashiCorp Vault, 1Password) store keys securely but do not rotate between multiple keys for the same provider based on rate limit pressure. Rate limiting libraries (`bottleneck`, `p-limit`, `mcp-rate-guard`) control outbound request volume but do not manage multiple keys or fail over when a specific key is throttled. Retry libraries (`p-retry`, `tool-call-retry`) retry failed requests with backoff but do not switch to a different API key on the retry -- they retry with the same key, which does nothing if the key is the one being rate-limited. Load balancers distribute requests across servers, not across API keys for the same endpoint.

`ai-keyring` combines key pooling, rotation strategy, rate limit detection, per-key cooldown, automatic failover, usage tracking, and health checking into a single cohesive package. The caller creates a keyring, adds keys (grouped by provider or pool), and asks the keyring for the next available key. The keyring returns a key based on the configured rotation strategy, automatically skipping keys that are in cooldown (recently rate-limited), disabled (failed health check), or exhausted (quota depleted). When the caller reports a 429 error back to the keyring, the offending key enters cooldown for the duration specified by the `Retry-After` header (or a configurable default), and the next request gets a different key. When all keys in a pool are in cooldown, the keyring either waits for the shortest cooldown to expire, throws an error, or invokes a caller-provided fallback.

The package composes with other packages in this monorepo. `ai-circuit-breaker` provides spend-based circuit breaking -- it controls how much money is spent. `ai-keyring` controls which key is used to spend that money. A key can be rate-limited (429) without exceeding a budget, and a budget can be exceeded without any key being rate-limited. The two are orthogonal. `tool-call-retry` retries failed tool calls with backoff and error classification. `ai-keyring` does not retry -- it provides the key selection layer that a retry system uses to pick a different key on each attempt. `ai-provider-healthcheck` monitors AI provider endpoint availability and latency. `ai-keyring` monitors individual key health within a provider -- a provider can be up but a specific key can be invalid, expired, or quota-exhausted. `prompt-price` estimates prompt costs; combined with `ai-keyring`'s per-key usage tracking, teams can attribute costs to specific keys, tiers, or organizational units.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `createKeyring(config)` function that returns a keyring instance managing one or more key pools, each with a configurable rotation strategy, cooldown policy, and health check schedule.
- Provide a `keyring.getKey(provider?)` method that returns the next available API key based on the configured rotation strategy, automatically skipping keys in cooldown, disabled, or exhausted states.
- Provide a `keyring.reportUsage(keyId, usage)` method that records usage metrics (request count, token count, cost, latency) against a specific key.
- Provide a `keyring.reportError(keyId, error)` method that processes an error associated with a key -- detecting 429 responses, parsing `Retry-After` headers, placing the key in cooldown, and updating error counters.
- Provide `keyring.addKey(keyConfig)` and `keyring.removeKey(keyId)` methods for dynamic key pool management at runtime.
- Provide a `keyring.getStats()` method that returns per-key and per-pool usage statistics: request count, token usage, error count, error rate, average latency, last used time, cooldown status, and health status.
- Provide a `keyring.healthCheck()` method that validates all keys (or keys in a specific pool) by making lightweight probe requests to the provider's API and reporting each key's validity, remaining quota, and response latency.
- Implement five rotation strategies: round-robin, least-recently-used, least-requests, weighted random, and priority-based. Each strategy is documented with its algorithm, use case, and trade-offs.
- Implement per-key cooldown: when a 429 response is reported, the key enters a cooldown period (from the `Retry-After` header or a configurable default). During cooldown, the key is skipped by all rotation strategies. When the cooldown expires, the key becomes available again automatically.
- Implement automatic failover: when the selected key is in cooldown or disabled, the keyring transparently selects the next available key from the pool. The caller does not need to implement failover logic.
- Implement pool exhaustion handling: when all keys in a pool are in cooldown or disabled, the keyring either waits for the shortest cooldown to expire (blocking), throws a `PoolExhaustedError` (non-blocking), or invokes a caller-provided fallback function.
- Support grouping keys by provider, tier, purpose, or any arbitrary tag. Keys can belong to multiple pools. `getKey` accepts an optional pool or provider filter.
- Load keys from environment variables, plain objects, or a caller-provided async loader function (for integration with secret managers).
- Emit events on key state changes: `onCooldownStart`, `onCooldownEnd`, `onKeyDisabled`, `onKeyEnabled`, `onPoolExhausted`, `onHealthCheckComplete`, `onKeyRotation`.
- Provide a CLI (`ai-keyring`) with commands for displaying key stats, running health checks, and listing pool status.
- Keep runtime dependencies to zero. All rotation logic, cooldown tracking, usage accounting, and health checking use built-in JavaScript APIs and the caller-provided HTTP function for probe requests.

### Non-Goals

- **Not a secret manager.** This package stores keys in memory for the duration of the process. It does not encrypt keys at rest, manage key lifecycle (creation, revocation, renewal), or integrate with hardware security modules. For persistent, encrypted key storage, use AWS Secrets Manager, HashiCorp Vault, or 1Password. `ai-keyring` can load keys from these systems via the async loader, but it is not a replacement for them.
- **Not a rate limiter.** This package does not control how many requests per second are sent to a provider. It manages which key is used for each request and reacts to rate limit responses after they happen. For proactive rate limiting (preventing 429s before they occur), use `bottleneck`, `p-limit`, or `mcp-rate-guard`. The two are complementary: rate limit the aggregate request volume with a rate limiter, and manage key rotation with `ai-keyring` when individual keys are throttled despite the rate limit.
- **Not a retry library.** This package does not retry failed requests. When `reportError` is called with a 429 error, the key enters cooldown, but the failed request is not re-executed. Use `tool-call-retry` or `p-retry` for retry logic. The integration pattern is: the retry library retries the request, and on each attempt, asks `ai-keyring` for a key (which may be a different key if the previous one entered cooldown).
- **Not an HTTP client.** This package does not make API requests on behalf of the caller (except for health check probes, which use a caller-provided function). It provides keys; the caller uses them in their own HTTP client, SDK, or API wrapper.
- **Not a proxy or middleware.** This package does not sit between the application and the AI provider at the network level. It is a library that the application calls to get a key before making a request.
- **Not a billing or cost tracking system.** This package tracks per-key usage metrics (request count, tokens, errors) for operational visibility. It does not compute dollar costs, generate invoices, or enforce budgets. For cost control, use `ai-circuit-breaker`. For cost estimation, use `prompt-price`.
- **Not a provider SDK.** This package does not wrap provider-specific APIs. It manages keys that the caller uses with any SDK or HTTP client. It is provider-agnostic: any string can be a key, any string can be a provider name.

---

## 3. Target Users and Use Cases

### Multi-Key Operators

Individual developers or small teams who have multiple API keys for the same provider -- personal keys, project keys, trial keys, keys from different billing accounts. They want to spread load across keys to avoid hitting any single key's rate limit. A typical scenario: a developer has three OpenAI keys (personal, company project A, company project B), each with a 10,000 RPM limit. By rotating across all three, they effectively triple their aggregate rate limit. `ai-keyring` manages the rotation and automatically switches away from a key that gets throttled.

### Teams Sharing API Access

Engineering teams where multiple developers, services, or environments (dev, staging, production) share a set of API keys. Each key has a tier and quota. Some keys are "premium" (higher rate limits, priority support) and should be used first; others are "fallback" keys with lower limits. The team needs visibility into which keys are being used, how much quota remains, and whether any key is consistently hitting limits. `ai-keyring`'s priority-based rotation, usage tracking, and health checking provide this visibility and control.

### High-Volume AI Applications

Applications making thousands of API calls per minute across multiple providers. At this volume, individual key rate limits become the bottleneck. The application needs a pool of keys per provider, intelligent rotation to spread load, automatic failover when any key is throttled, and usage metrics to identify hot keys or providers approaching quota exhaustion. A typical integration: `const key = keyring.getKey('openai')` at the top of every API call, with `keyring.reportUsage(key.id, { tokens: response.usage.total_tokens })` after each response and `keyring.reportError(key.id, error)` on failure.

### Multi-Provider Routing Applications

Applications that call multiple AI providers (OpenAI, Anthropic, Google, Mistral) and need to manage keys for each. The keyring organizes keys into provider-specific pools, each with its own rotation strategy. When OpenAI keys are all in cooldown, the application can query the keyring for an Anthropic key instead, implementing cross-provider failover at the key level.

### Agent and Autonomous System Operators

Teams running autonomous AI agents that make unpredictable numbers of API calls. Agents can trigger bursts of requests that exhaust a single key's rate limit within seconds. Without key rotation, the agent stalls on 429 errors. With `ai-keyring`, the agent transparently rotates to the next available key, maintaining throughput even during bursts. Combined with `ai-circuit-breaker` for spend control, the agent operates within both rate and budget constraints.

### API Key Auditing and Compliance

Organizations that need to track API key usage for compliance, auditing, or chargeback purposes. `ai-keyring`'s per-key usage tracking provides a record of how many requests each key handled, how many tokens were consumed, what the error rate was, and when the key was last used. This data feeds into internal dashboards, chargeback systems, or compliance reports.

---

## 4. Core Concepts

### Keyring

The keyring is the top-level container. It holds one or more key pools, manages rotation strategies, tracks usage, and coordinates cooldown and health checking. A single keyring instance manages all keys for an application. The keyring is created via `createKeyring(config)` and is the only object the caller interacts with directly.

The keyring is stateful: it maintains in-memory records of each key's usage, cooldown status, health, and rotation position. The state is not persisted -- if the process restarts, usage counters reset to zero and all keys start as available. For cross-restart tracking, the keyring supports `exportState()` and `initialState` for manual persistence.

### Key Pool

A key pool is a logical grouping of keys that serve the same purpose. The most common grouping is by provider (`openai`, `anthropic`, `google`), but pools can also represent tiers (`premium`, `standard`, `fallback`), environments (`production`, `staging`), teams (`ml-team`, `product-team`), or any arbitrary label.

Each pool has its own rotation strategy. An `openai` pool might use round-robin to spread load evenly, while an `anthropic` pool uses priority-based rotation to prefer the premium-tier key and fall back to the standard key only when the premium key is in cooldown.

A key can belong to multiple pools. A key tagged with both `openai` and `premium` appears in both the `openai` pool and the `premium` pool. When `getKey('openai')` is called, only keys in the `openai` pool are considered; when `getKey('premium')` is called, only keys in the `premium` pool are considered.

### Key Entry

A key entry represents a single API key with its metadata. Every key entry has:

- **`id`**: A unique identifier for the key within the keyring. Can be any string. Used in `reportUsage`, `reportError`, `removeKey`, and stats. If not provided, an auto-generated ID is assigned.
- **`key`**: The actual API key string. This is the secret value passed to API calls. The keyring never logs, serializes, or exposes this value in stats or events -- it is write-only from the caller's perspective.
- **`provider`**: The provider this key belongs to (e.g., `'openai'`, `'anthropic'`, `'google'`). Used for pool-based key selection.
- **`tags`**: Optional array of arbitrary strings for additional pool membership (e.g., `['premium', 'us-east']`).
- **`weight`**: Optional numeric weight for weighted random rotation. Default: `1`. Higher weight means the key is selected more frequently.
- **`priority`**: Optional numeric priority for priority-based rotation. Lower numbers mean higher priority. Default: `0`.
- **`maxRequestsPerMinute`**: Optional rate limit hint. The keyring uses this to proactively avoid keys approaching their rate limit, not just to react to 429 responses.
- **`metadata`**: Optional arbitrary object for caller-specific data (owner, billing account, notes, expiry date). The keyring does not interpret metadata -- it is stored and returned in stats.

### Rotation Strategy

The rotation strategy determines which key is selected when `getKey` is called. The strategy operates over the set of available keys in a pool (excluding keys in cooldown, disabled, or exhausted). Five strategies are supported:

- **Round-robin**: Keys are selected in a fixed cyclic order. Each call returns the next key in the sequence. Even distribution across keys. Deterministic and predictable.
- **Least-recently-used (LRU)**: The key that has not been used for the longest time is selected. Naturally spreads load across keys. Adapts to keys entering and leaving cooldown without manual rebalancing.
- **Least-requests**: The key with the fewest total requests is selected. Balances cumulative load over time, not just recent usage. Useful when keys have different rate limits and some were added later than others.
- **Weighted random**: Keys are selected randomly with probability proportional to their weight. A key with weight 3 is three times as likely to be selected as a key with weight 1. Useful for preferring higher-tier keys without excluding lower-tier ones entirely.
- **Priority-based**: Keys are selected in priority order (lowest priority number first). If the highest-priority key is available, it is always selected. Lower-priority keys are used only when higher-priority keys are in cooldown or disabled. Useful for "primary + fallback" configurations.

### Cooldown

When a key receives a 429 (Too Many Requests) response, it enters a cooldown period during which it is excluded from key selection. The cooldown duration is determined by:

1. **`Retry-After` header**: If the 429 response includes a `Retry-After` header, the cooldown duration is the value specified in the header (parsed as seconds or as an HTTP date). This is the most accurate signal, as the provider is telling the caller exactly how long to wait.
2. **Default cooldown**: If no `Retry-After` header is present, a configurable default duration is used (default: 60 seconds).
3. **Escalating cooldown**: Optionally, repeated 429s on the same key within a window trigger escalating cooldown durations (e.g., 60s, 120s, 240s) to back off more aggressively from a persistently throttled key.

When the cooldown period expires, the key automatically becomes available again. The transition is evaluated lazily -- there is no background timer. When the next `getKey` call occurs, the keyring checks whether any cooled-down keys have passed their expiry time and re-enables them.

### Failover

Failover is the mechanism by which the keyring transparently selects an alternative key when the preferred key is unavailable. Failover happens at two levels:

1. **Intra-pool failover**: Within a single pool, if the key selected by the rotation strategy is in cooldown, the strategy skips it and selects the next candidate. This is transparent to the caller -- `getKey('openai')` always returns an available key if one exists in the pool.
2. **Cross-pool failover**: If all keys in a pool are unavailable (all in cooldown or disabled), the keyring can optionally try a fallback pool. This is configured per pool: `{ provider: 'openai', fallbackPool: 'openai-backup' }`.

When no key is available in any applicable pool, the keyring's pool exhaustion strategy determines what happens.

### Health Check

Health checking validates that keys are still functional. A key can become non-functional for reasons other than rate limiting: the key may be revoked, expired, associated with a suspended account, or have its quota fully exhausted (distinct from rate limiting -- quota exhaustion is permanent until the billing cycle resets).

Health checks are performed by calling a lightweight endpoint with each key. The specific endpoint varies by provider: OpenAI's `/v1/models` endpoint, Anthropic's `/v1/messages` with a minimal request, Google's model listing endpoint, etc. The keyring does not hard-code these endpoints -- the caller provides a health check function per provider that takes a key string and returns a health result.

Health checks can run on-demand (`keyring.healthCheck()`) or on a configurable interval. Keys that fail health checks are marked as disabled and excluded from rotation until a subsequent health check passes.

### Usage Tracking

Every key maintains a set of usage counters:

- **`requests`**: Total number of times this key was returned by `getKey`.
- **`tokens`**: Cumulative token count reported via `reportUsage`.
- **`errors`**: Total number of errors reported via `reportError`.
- **`rateLimits`**: Total number of 429 responses reported via `reportError`.
- **`errorRate`**: Rolling error rate over a configurable window (errors / requests in the last N minutes).
- **`avgLatencyMs`**: Rolling average response latency over a configurable window.
- **`lastUsedAt`**: ISO 8601 timestamp of the last `getKey` call that returned this key.
- **`lastErrorAt`**: ISO 8601 timestamp of the last error reported for this key.
- **`cooldownEndsAt`**: ISO 8601 timestamp when the current cooldown expires. `null` if not in cooldown.
- **`totalCooldownMs`**: Cumulative time this key has spent in cooldown.
- **`healthStatus`**: `'healthy'` | `'unhealthy'` | `'unknown'`. Updated by health checks.
- **`lastHealthCheckAt`**: ISO 8601 timestamp of the most recent health check for this key.

Counters are updated in real time as `getKey`, `reportUsage`, and `reportError` are called. They are accessible via `keyring.getStats()`.

---

## 5. Key Pool Management

### Adding Keys

Keys are added at keyring creation time via the `keys` array in the configuration, or at runtime via `keyring.addKey(keyConfig)`.

```typescript
// At creation time
const keyring = createKeyring({
  keys: [
    { id: 'openai-1', key: process.env.OPENAI_KEY_1!, provider: 'openai' },
    { id: 'openai-2', key: process.env.OPENAI_KEY_2!, provider: 'openai', weight: 2 },
    { id: 'anthropic-1', key: process.env.ANTHROPIC_KEY_1!, provider: 'anthropic', priority: 0 },
    { id: 'anthropic-2', key: process.env.ANTHROPIC_KEY_2!, provider: 'anthropic', priority: 1 },
  ],
});

// At runtime
keyring.addKey({
  id: 'openai-3',
  key: newKeyFromSecretManager,
  provider: 'openai',
  tags: ['backup'],
  weight: 1,
});
```

Adding a key with a duplicate `id` throws a `TypeError`. Adding a key with an empty `key` string throws a `TypeError`.

### Removing Keys

Keys are removed at runtime via `keyring.removeKey(keyId)`. The key is immediately removed from all pools. If the key was the current position in a round-robin sequence, the sequence adjusts.

```typescript
keyring.removeKey('openai-2');
```

Removing a non-existent key ID is a no-op (does not throw). Removing the last key in a pool leaves the pool empty; subsequent `getKey` calls for that pool will trigger the pool exhaustion handler.

### Grouping by Provider

Keys with the same `provider` value are automatically grouped into a pool. `getKey('openai')` returns a key from the pool of keys with `provider: 'openai'`. This is the primary pool mechanism and requires no additional configuration.

### Grouping by Tags

Keys with the same tag value are grouped into a tag-based pool. `getKey({ tag: 'premium' })` returns a key from all keys that have `'premium'` in their `tags` array. Tag-based pools overlay provider pools -- a key can be in both the `openai` pool and the `premium` pool.

### Key Metadata

Each key can carry an arbitrary `metadata` object. The keyring does not interpret metadata -- it stores it and returns it in `getStats()`. Typical metadata includes:

```typescript
{
  id: 'openai-prod-1',
  key: process.env.OPENAI_PROD_KEY!,
  provider: 'openai',
  metadata: {
    owner: 'ml-platform-team',
    billingAccount: 'acct_abc123',
    tier: 'tier-4',
    monthlyQuota: 10_000_000,  // tokens
    expiresAt: '2026-12-31T23:59:59Z',
    notes: 'Production key, do not use for dev',
  },
}
```

---

## 6. Rotation Strategies

### Round-Robin

**Algorithm:** Maintain a counter `i` initialized to 0. On each `getKey` call, select the key at index `i % availableKeys.length`, then increment `i`. Skip keys that are in cooldown or disabled. If skipping causes a full cycle (all keys skipped), trigger pool exhaustion.

**Behavior:** Distributes requests evenly across all available keys. Deterministic and predictable. The rotation order is the insertion order of keys into the pool. When a key enters cooldown, the remaining keys absorb its share of traffic. When the key exits cooldown, it re-enters the rotation at its original position.

**When to use:** Default strategy. Best when all keys have similar rate limits and tiers. Simple, fair, and predictable.

**Trade-offs:** Does not account for differing rate limits. A key with a 1,000 RPM limit and a key with a 10,000 RPM limit each get 50% of requests, which may throttle the smaller key while leaving the larger key underutilized. Use weighted random or priority-based for heterogeneous key tiers.

```typescript
const keyring = createKeyring({
  keys: [
    { id: 'k1', key: '...', provider: 'openai' },
    { id: 'k2', key: '...', provider: 'openai' },
    { id: 'k3', key: '...', provider: 'openai' },
  ],
  strategy: 'round-robin', // This is the default
});

// Returns k1, k2, k3, k1, k2, k3, ...
```

### Least-Recently-Used (LRU)

**Algorithm:** Track the `lastUsedAt` timestamp for each key. On each `getKey` call, select the available key with the oldest (smallest) `lastUsedAt` value. Break ties by insertion order. Update `lastUsedAt` to the current time when a key is selected.

**Behavior:** Naturally spreads load across keys by always selecting the key that has been idle the longest. When a key enters cooldown, it stops being selected, so its `lastUsedAt` falls behind. When the cooldown expires, the key has the oldest `lastUsedAt` and is immediately selected, quickly reintegrating it into the rotation.

**When to use:** When keys have varying cooldown durations and you want automatic rebalancing. When keys are added at different times and you want the newest key to be used immediately.

**Trade-offs:** Slightly more overhead than round-robin (timestamp comparison vs. modular arithmetic). In practice, negligible for pools under 1,000 keys.

```typescript
const keyring = createKeyring({
  keys: [/* ... */],
  strategy: 'least-recently-used',
});
```

### Least-Requests

**Algorithm:** Track the `requests` counter for each key. On each `getKey` call, select the available key with the fewest total requests. Break ties by insertion order.

**Behavior:** Balances cumulative load over the lifetime of the keyring. A key added to the pool later will be preferred until its request count catches up with the others. This is useful when keys have different start times or when you want true cumulative balance rather than temporal balance.

**When to use:** When keys are added at different times and you want to equalize total usage. When keys have similar rate limits and you want the most even distribution possible over time.

**Trade-offs:** Does not account for request weight (some requests use more tokens than others). Does not adapt to cooldown well -- a key that spent time in cooldown will have fewer requests and be over-preferred when it recovers.

```typescript
const keyring = createKeyring({
  keys: [/* ... */],
  strategy: 'least-requests',
});
```

### Weighted Random

**Algorithm:** Assign each available key a weight (default: 1). Compute the cumulative weight sum. Generate a random number between 0 and the sum. Walk the available keys, accumulating weights, and select the key whose cumulative range contains the random number.

**Behavior:** Keys with higher weights are selected proportionally more often, but selection is non-deterministic. A key with weight 3 in a pool of total weight 10 has a 30% chance of being selected on each call. Over many requests, the distribution converges to the weight ratios.

**When to use:** When keys have different rate limits or tiers and you want to distribute load proportionally. A premium key with a 10x higher rate limit gets a weight of 10; a standard key gets a weight of 1. Traffic distribution naturally matches capacity.

**Trade-offs:** Non-deterministic. Short-term distribution may not match weights (e.g., the premium key might be selected 5 times in a row by chance). Over hundreds of requests, distribution converges. Not suitable when strict ordering or fairness is required.

```typescript
const keyring = createKeyring({
  keys: [
    { id: 'premium', key: '...', provider: 'openai', weight: 5 },
    { id: 'standard', key: '...', provider: 'openai', weight: 2 },
    { id: 'fallback', key: '...', provider: 'openai', weight: 1 },
  ],
  strategy: 'weighted-random',
});
// premium: ~62.5%, standard: ~25%, fallback: ~12.5%
```

### Priority-Based

**Algorithm:** Sort available keys by priority (ascending -- lower number = higher priority). Select the key with the lowest priority value. If multiple keys share the same priority, use round-robin among them as a tiebreaker.

**Behavior:** The highest-priority key is always selected when available. Lower-priority keys are used only when all higher-priority keys are in cooldown or disabled. This creates a strict "primary + fallback" hierarchy. When the primary key exits cooldown, traffic immediately returns to it.

**When to use:** When one key is the preferred key (e.g., paid, high-quota, low-latency) and other keys are backups. When you want predictable, deterministic key selection with explicit failover ordering.

**Trade-offs:** Does not spread load -- the primary key handles 100% of traffic until it is unavailable. The secondary key may have stale credentials or quota issues that are not discovered until failover occurs (mitigated by health checking). Not suitable when even load distribution is the goal.

```typescript
const keyring = createKeyring({
  keys: [
    { id: 'primary', key: '...', provider: 'openai', priority: 0 },
    { id: 'secondary', key: '...', provider: 'openai', priority: 1 },
    { id: 'emergency', key: '...', provider: 'openai', priority: 2 },
  ],
  strategy: 'priority',
});
// Always returns 'primary' unless it is in cooldown, then 'secondary', then 'emergency'
```

### Per-Pool Strategy Override

The global strategy can be overridden per pool:

```typescript
const keyring = createKeyring({
  keys: [/* ... */],
  strategy: 'round-robin', // Global default
  pools: {
    openai: { strategy: 'weighted-random' },
    anthropic: { strategy: 'priority' },
  },
});
```

---

## 7. Rate Limit Handling

### 429 Detection

When the caller reports an error via `keyring.reportError(keyId, error)`, the keyring examines the error to determine if it is a rate limit response. The detection logic checks for:

1. **HTTP status code**: A `status`, `statusCode`, or `response.status` property with value `429`.
2. **Error code**: An `error.code` property with value `'rate_limited'`, `'rate-limited'`, or `'too_many_requests'`.
3. **Error type**: An `error.type` property with value `'rate_limit_error'` (Anthropic SDK pattern) or `'tokens'` (some providers signal token-based rate limits distinctly).
4. **Error message pattern**: A `message` containing "rate limit" (case-insensitive) as a last-resort heuristic.

If any of these checks matches, the key is placed into cooldown. If none matches, the error is recorded in the key's error counters but the key is not placed into cooldown.

### Retry-After Parsing

When a 429 is detected, the keyring extracts the `Retry-After` value to determine the cooldown duration. The extraction logic checks for:

1. **Error property**: `error.headers?.['retry-after']`, `error.response?.headers?.['retry-after']`, `error.retryAfter`, or `error.headers?.get?.('retry-after')` (for `Headers` objects from `fetch`).
2. **Parsing as seconds**: If the value is a string parseable as a positive integer, it is interpreted as seconds.
3. **Parsing as HTTP date**: If the value is a string not parseable as an integer, it is parsed as an HTTP date (`new Date(value)`). The cooldown duration is the difference between the parsed date and `Date.now()`. If the date is in the past, the default cooldown is used.
4. **Fallback**: If no `Retry-After` value is found or parsing fails, the configured default cooldown duration is used.

```typescript
// Error with Retry-After header: key enters cooldown for 30 seconds
keyring.reportError('openai-1', {
  status: 429,
  headers: { 'retry-after': '30' },
  message: 'Rate limit exceeded',
});

// Error without Retry-After: key enters cooldown for the default duration (60s)
keyring.reportError('openai-1', {
  status: 429,
  message: 'Too many requests',
});
```

### Per-Key Cooldown Tracking

Each key maintains a `cooldownEndsAt` timestamp. When a 429 is detected:

1. The cooldown duration is computed (from `Retry-After` or default).
2. `cooldownEndsAt` is set to `Date.now() + cooldownDurationMs`.
3. The `onCooldownStart` event fires with the key ID, cooldown duration, and reason.
4. The key's `rateLimits` counter increments.

The key is excluded from rotation until `Date.now() >= cooldownEndsAt`. The check is performed in `getKey` -- there is no background timer.

When the cooldown expires:

1. The next `getKey` call detects that `Date.now() >= cooldownEndsAt`.
2. `cooldownEndsAt` is set to `null`.
3. The `onCooldownEnd` event fires with the key ID.
4. The key is included in rotation again.

### Escalating Cooldown

When the same key receives multiple 429 responses within a rolling window (`cooldownEscalationWindowMs`, default: 5 minutes), the cooldown duration escalates:

| Consecutive 429s | Multiplier | Effective cooldown (with 60s default) |
|---|---|---|
| 1st | 1x | 60s |
| 2nd | 2x | 120s |
| 3rd | 4x | 240s |
| 4th+ | 8x (capped) | 480s |

The escalation multiplier resets after a successful request (a `reportUsage` call without a preceding error) or after `cooldownEscalationWindowMs` elapses with no 429s.

Escalating cooldown is only applied when no `Retry-After` header is present. When the provider specifies `Retry-After`, that value is used directly (the provider knows best).

### Automatic Re-Enable After Cooldown

Cooldown expiration is lazy. No timers run in the background. When `getKey` is called, the keyring iterates through the pool's keys and checks each key's `cooldownEndsAt`. If `Date.now() >= cooldownEndsAt`, the key is re-enabled in the same call and is eligible for selection. This design ensures no `setInterval` prevents process exit and no CPU is consumed while the keyring is idle.

---

## 8. Failover

### Key Failure to Next Key

When `getKey` selects a key according to the rotation strategy and that key is in cooldown or disabled, the strategy transparently moves to the next candidate. The caller does not observe the skip -- they receive a valid, available key. The process:

1. The rotation strategy produces a candidate key.
2. The keyring checks the candidate's status: is it in cooldown? Is it disabled (failed health check)?
3. If the candidate is unavailable, the strategy produces the next candidate.
4. This repeats until an available key is found or the entire pool has been exhausted.

For round-robin, "next candidate" means the next key in the cycle. For LRU, it means the key with the next-oldest `lastUsedAt`. For priority, it means the key with the next-lowest priority value.

### Exhausted Pool Handling

When all keys in a pool are unavailable (all in cooldown, all disabled, or the pool is empty), the keyring follows the configured `onPoolExhausted` strategy:

| Strategy | Behavior | When to Use |
|---|---|---|
| `throw` (default) | Throws a `PoolExhaustedError` with details about each key's status and the shortest remaining cooldown. | When the caller has its own fallback logic or wants to propagate the error to the user. |
| `wait` | Blocks (async) until the key with the shortest remaining cooldown exits cooldown, then returns that key. The maximum wait time is bounded by `maxWaitMs` (default: 30000). If no key becomes available within `maxWaitMs`, throws `PoolExhaustedError`. | When latency is acceptable and you want the keyring to handle the wait transparently. |
| `fallback` | Invokes a caller-provided fallback function that receives the provider/pool name and the pool state, and returns a key string or result. | When the caller has a backup key source, a different provider, or a cached response. |

```typescript
const keyring = createKeyring({
  keys: [/* ... */],
  onPoolExhausted: {
    strategy: 'wait',
    maxWaitMs: 15000,
  },
});

// Or with fallback
const keyring = createKeyring({
  keys: [/* ... */],
  onPoolExhausted: {
    strategy: 'fallback',
    fn: async (pool, state) => {
      // Try a different provider
      return keyring.getKey('anthropic');
    },
  },
});
```

### Cross-Provider Failover

The keyring supports cross-provider failover via the fallback pool mechanism:

```typescript
const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: '...', provider: 'openai' },
    { id: 'oai-2', key: '...', provider: 'openai' },
    { id: 'ant-1', key: '...', provider: 'anthropic' },
  ],
  pools: {
    openai: { fallbackPool: 'anthropic' },
  },
});

// If all openai keys are in cooldown, automatically tries anthropic pool
const key = await keyring.getKey('openai');
```

---

## 9. Health Checking

### Purpose

Health checks answer the question: "Is this key still valid and usable?" A key can be syntactically correct (the right format, the right length) but functionally broken for many reasons:

- **Revoked**: The key was deleted in the provider's dashboard.
- **Expired**: The key had an expiration date that has passed.
- **Suspended**: The associated account is suspended for non-payment or policy violation.
- **Quota exhausted**: The key has consumed its entire monthly/daily quota (distinct from per-minute rate limiting).
- **Wrong permissions**: The key's scope or role does not include the required API endpoints.

Health checks detect these conditions by making a lightweight probe request with each key.

### Health Check Function

The keyring does not hard-code provider-specific health check logic. Instead, the caller provides a `healthCheckFn` per provider:

```typescript
const keyring = createKeyring({
  keys: [/* ... */],
  healthCheck: {
    openai: async (key: string) => {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return { healthy: false, error: `HTTP ${res.status}` };
      return { healthy: true, latencyMs: /* ... */ };
    },
    anthropic: async (key: string) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-20250514',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      if (!res.ok) return { healthy: false, error: `HTTP ${res.status}` };
      return { healthy: true };
    },
  },
});
```

The health check function receives the raw key string and returns a `HealthCheckResult`:

```typescript
interface HealthCheckResult {
  healthy: boolean;
  error?: string;
  latencyMs?: number;
  remainingQuota?: number;  // Optional: remaining tokens/requests in current billing period
  quotaResetsAt?: string;   // Optional: ISO 8601 timestamp of quota reset
}
```

### On-Demand Health Check

`keyring.healthCheck()` runs health checks on all keys (or keys in a specific pool) and returns a comprehensive report:

```typescript
const report = await keyring.healthCheck();
// report: {
//   overall: 'healthy' | 'degraded' | 'unhealthy',
//   keys: [
//     { id: 'openai-1', healthy: true, latencyMs: 142, remainingQuota: 950000 },
//     { id: 'openai-2', healthy: false, error: 'HTTP 401: Invalid API key' },
//     { id: 'anthropic-1', healthy: true, latencyMs: 98 },
//   ],
//   checkedAt: '2026-03-19T10:30:00Z',
//   durationMs: 456,
// }

// Check a specific provider
const openaiReport = await keyring.healthCheck('openai');
```

The overall status is:
- **`healthy`**: All keys passed their health check.
- **`degraded`**: At least one key failed, but at least one key in each pool is still healthy.
- **`unhealthy`**: All keys in one or more pools failed health checks.

### Periodic Health Check

Health checks can run on a configurable interval:

```typescript
const keyring = createKeyring({
  keys: [/* ... */],
  healthCheck: {
    openai: healthCheckFn,
    intervalMs: 300_000,  // Every 5 minutes
    onUnhealthy: (keyId, error) => {
      console.warn(`Key ${keyId} failed health check: ${error}`);
    },
  },
});
```

Periodic health checks use `setInterval` internally. To avoid preventing process exit, the timer is created with `unref()` so it does not keep the event loop alive. The interval can be stopped via `keyring.stopHealthChecks()` and restarted via `keyring.startHealthChecks()`.

### Key Disabling on Health Check Failure

When a key fails a health check, it is marked as `healthStatus: 'unhealthy'` and excluded from rotation (treated like a permanently cooled-down key). The `onKeyDisabled` event fires.

When a subsequent health check passes, the key is marked as `healthStatus: 'healthy'` and re-included in rotation. The `onKeyEnabled` event fires.

A configurable `unhealthyThreshold` (default: 1) controls how many consecutive health check failures are required before disabling a key. Setting it to 3 means a key must fail three consecutive health checks before being excluded, reducing false positives from transient network issues during the health check itself.

### Key Expiry Detection

If a key's `metadata.expiresAt` is set and the timestamp is in the past, the keyring marks the key as disabled without needing a health check probe. This check is performed lazily in `getKey` and proactively in `healthCheck`.

---

## 10. Per-Key Usage Tracking

### Reporting Usage

After a successful API call, the caller reports usage metrics:

```typescript
keyring.reportUsage('openai-1', {
  tokens: response.usage.total_tokens,           // Optional: total tokens consumed
  inputTokens: response.usage.prompt_tokens,     // Optional: input tokens
  outputTokens: response.usage.completion_tokens, // Optional: output tokens
  latencyMs: endTime - startTime,                 // Optional: request latency
  cost: computedCost,                             // Optional: dollar cost
});
```

All fields in the usage object are optional. The keyring accumulates whatever is provided. If only `tokens` is reported, only the token counter updates. If nothing is reported (empty object), only the request count increments.

### Reporting Errors

When an API call fails, the caller reports the error:

```typescript
keyring.reportError('openai-1', error);
```

The keyring:
1. Increments the key's `errors` counter.
2. Updates the key's `lastErrorAt` timestamp.
3. Checks if the error is a 429 (see section 7).
4. If 429: places the key in cooldown.
5. If not 429: records the error type for debugging but does not place the key in cooldown.

### Accessing Stats

`keyring.getStats()` returns per-key and aggregate statistics:

```typescript
const stats = keyring.getStats();
// stats: {
//   keys: {
//     'openai-1': {
//       id: 'openai-1',
//       provider: 'openai',
//       requests: 1523,
//       tokens: 2_450_000,
//       inputTokens: 1_800_000,
//       outputTokens: 650_000,
//       errors: 12,
//       rateLimits: 3,
//       errorRate: 0.0079,  // 12/1523
//       avgLatencyMs: 342,
//       lastUsedAt: '2026-03-19T10:29:55Z',
//       lastErrorAt: '2026-03-19T09:15:02Z',
//       cooldownEndsAt: null,
//       totalCooldownMs: 180000,
//       healthStatus: 'healthy',
//       lastHealthCheckAt: '2026-03-19T10:25:00Z',
//       cost: 12.35,
//       metadata: { owner: 'ml-team', tier: 'premium' },
//       status: 'available',  // 'available' | 'cooldown' | 'disabled'
//     },
//     // ... other keys
//   },
//   pools: {
//     openai: {
//       totalKeys: 3,
//       availableKeys: 2,
//       cooldownKeys: 1,
//       disabledKeys: 0,
//       totalRequests: 4200,
//       totalTokens: 7_100_000,
//       totalErrors: 28,
//     },
//     // ... other pools
//   },
// }
```

The key string (the actual API key secret) is never included in stats output. Only the key's `id`, metadata, and usage counters are exposed.

### Rolling Window Metrics

Error rate and average latency are computed over a rolling window (`metricsWindowMs`, default: 300,000 -- 5 minutes) rather than over all time. This provides a current view of key health:

- **Error rate**: `errors in last 5 minutes / requests in last 5 minutes`. A key that was flaky an hour ago but has been fine since shows a low current error rate.
- **Average latency**: `sum(latencies in last 5 minutes) / count(latencies in last 5 minutes)`. A key that was slow during a provider outage but has recovered shows current latency, not historical latency.

Rolling window metrics are maintained using a bounded array of timestamped entries. Entries older than the window are pruned lazily on access.

---

## 11. API Surface

### Installation

```bash
npm install ai-keyring
```

### Primary Function: `createKeyring`

Creates a new keyring instance.

```typescript
import { createKeyring } from 'ai-keyring';

const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_KEY_1!, provider: 'openai' },
    { id: 'oai-2', key: process.env.OPENAI_KEY_2!, provider: 'openai', weight: 2 },
    { id: 'ant-1', key: process.env.ANTHROPIC_KEY!, provider: 'anthropic' },
  ],
  strategy: 'round-robin',
  defaultCooldownMs: 60_000,
});
```

### Key Selection: `keyring.getKey`

Returns the next available key entry from a pool.

```typescript
// Get a key for a specific provider
const entry = keyring.getKey('openai');
console.log(entry.id);  // 'oai-1'
// entry.key is the actual API key string -- use it in API calls
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { Authorization: `Bearer ${entry.key}` },
  // ...
});

// Get a key from any provider
const anyEntry = keyring.getKey();

// Get a key by tag
const premiumEntry = keyring.getKey({ tag: 'premium' });

// Get a key by provider and tag
const entry = keyring.getKey({ provider: 'openai', tag: 'us-east' });
```

`getKey` returns a `KeyEntry` object:

```typescript
interface KeyEntry {
  /** Unique identifier for this key. */
  id: string;
  /** The actual API key string. */
  key: string;
  /** The provider this key belongs to. */
  provider: string;
  /** Tags for additional pool membership. */
  tags: string[];
  /** Caller-provided metadata. */
  metadata?: Record<string, unknown>;
}
```

If no available key is found, behavior depends on the `onPoolExhausted` configuration (see section 8).

### Usage Reporting: `keyring.reportUsage`

Records usage metrics for a key.

```typescript
keyring.reportUsage('oai-1', {
  tokens: 1500,
  inputTokens: 1200,
  outputTokens: 300,
  latencyMs: 420,
  cost: 0.0045,
});
```

```typescript
interface UsageReport {
  /** Total tokens consumed. */
  tokens?: number;
  /** Input/prompt tokens. */
  inputTokens?: number;
  /** Output/completion tokens. */
  outputTokens?: number;
  /** Request latency in milliseconds. */
  latencyMs?: number;
  /** Dollar cost of the request. */
  cost?: number;
}
```

### Error Reporting: `keyring.reportError`

Reports an error for a key. Handles 429 detection and cooldown.

```typescript
try {
  const response = await callApi(entry.key);
  keyring.reportUsage(entry.id, { tokens: response.usage.total_tokens });
} catch (error) {
  keyring.reportError(entry.id, error);
  // The key may now be in cooldown; next getKey() call returns a different key
}
```

The `error` parameter is `unknown`. The keyring inspects it for status codes, `Retry-After` headers, and error patterns as described in section 7.

### Dynamic Key Management: `keyring.addKey` / `keyring.removeKey`

```typescript
// Add a new key at runtime
keyring.addKey({
  id: 'oai-3',
  key: freshKeyFromVault,
  provider: 'openai',
  tags: ['backup'],
});

// Remove a key at runtime
keyring.removeKey('oai-3');
```

### Stats: `keyring.getStats`

Returns per-key and per-pool usage statistics.

```typescript
const stats = keyring.getStats();
// See section 10 for the full shape
```

### Health Check: `keyring.healthCheck`

Runs health checks on all keys or a specific pool.

```typescript
// Check all keys
const report = await keyring.healthCheck();

// Check a specific provider's keys
const openaiReport = await keyring.healthCheck('openai');
```

### State Persistence: `keyring.exportState` / `initialState`

```typescript
// Export state before shutdown
const snapshot = keyring.exportState();
fs.writeFileSync('keyring-state.json', JSON.stringify(snapshot));

// Restore state on startup
const saved = JSON.parse(fs.readFileSync('keyring-state.json', 'utf-8'));
const keyring = createKeyring({
  keys: [/* ... */],
  initialState: saved,
});
```

The exported state includes per-key usage counters, cooldown timestamps, and health status. It does not include the actual key strings -- those must be provided again at creation time (matched by `id`).

### Lifecycle: `keyring.startHealthChecks` / `keyring.stopHealthChecks` / `keyring.shutdown`

```typescript
// Stop periodic health checks (if configured)
keyring.stopHealthChecks();

// Restart periodic health checks
keyring.startHealthChecks();

// Full shutdown: stop health checks, clear all timers
keyring.shutdown();
```

### Type Definitions

```typescript
// ── Key Configuration ───────────────────────────────────────────────

/** Configuration for a single key. */
interface KeyConfig {
  /** Unique identifier. Auto-generated if not provided. */
  id?: string;

  /** The actual API key string. Required. */
  key: string;

  /** Provider name (e.g., 'openai', 'anthropic'). Required. */
  provider: string;

  /** Optional tags for additional pool membership. */
  tags?: string[];

  /** Weight for weighted-random rotation. Default: 1. */
  weight?: number;

  /** Priority for priority-based rotation. Lower = higher priority. Default: 0. */
  priority?: number;

  /** Rate limit hint: maximum requests per minute for this key. */
  maxRequestsPerMinute?: number;

  /** Arbitrary metadata. Stored and returned in stats, not interpreted. */
  metadata?: Record<string, unknown>;
}

// ── Rotation Strategy ───────────────────────────────────────────────

/** Rotation strategy identifier. */
type RotationStrategy =
  | 'round-robin'
  | 'least-recently-used'
  | 'least-requests'
  | 'weighted-random'
  | 'priority';

// ── Pool Configuration ──────────────────────────────────────────────

/** Per-pool configuration overrides. */
interface PoolConfig {
  /** Override the global rotation strategy for this pool. */
  strategy?: RotationStrategy;

  /** Fallback pool name when this pool is exhausted. */
  fallbackPool?: string;
}

// ── Pool Exhaustion Strategy ────────────────────────────────────────

/** Throw a PoolExhaustedError. */
interface ThrowExhaustion {
  strategy: 'throw';
}

/** Wait for a key to exit cooldown. */
interface WaitExhaustion {
  strategy: 'wait';
  /** Maximum wait time in milliseconds. Default: 30000. */
  maxWaitMs?: number;
}

/** Invoke a fallback function. */
interface FallbackExhaustion {
  strategy: 'fallback';
  /** The fallback function. Receives the pool name and pool state. */
  fn: (pool: string, state: PoolState) => Promise<KeyEntry>;
}

type PoolExhaustionConfig = ThrowExhaustion | WaitExhaustion | FallbackExhaustion;

// ── Health Check Configuration ──────────────────────────────────────

/** Health check result returned by the caller's health check function. */
interface HealthCheckResult {
  /** Whether the key is healthy. */
  healthy: boolean;
  /** Error message if unhealthy. */
  error?: string;
  /** Probe latency in milliseconds. */
  latencyMs?: number;
  /** Remaining quota (tokens, requests, or other unit). */
  remainingQuota?: number;
  /** ISO 8601 timestamp when quota resets. */
  quotaResetsAt?: string;
}

/** Per-provider health check function. */
type HealthCheckFn = (key: string) => Promise<HealthCheckResult>;

/** Health check configuration. */
interface HealthCheckConfig {
  /** Per-provider health check functions. */
  [provider: string]: HealthCheckFn | number | undefined;

  /** Interval in milliseconds for periodic health checks. 0 or undefined disables periodic checks. */
  intervalMs?: number;

  /** Number of consecutive failures before disabling a key. Default: 1. */
  unhealthyThreshold?: number;

  /** Callback when a key is determined unhealthy. */
  onUnhealthy?: (keyId: string, error: string) => void;
}

// ── Health Check Report ─────────────────────────────────────────────

/** Health check report for all keys. */
interface HealthCheckReport {
  /** Overall status. */
  overall: 'healthy' | 'degraded' | 'unhealthy';
  /** Per-key results. */
  keys: Array<{
    id: string;
    provider: string;
    healthy: boolean;
    error?: string;
    latencyMs?: number;
    remainingQuota?: number;
    quotaResetsAt?: string;
  }>;
  /** ISO 8601 timestamp of when the check ran. */
  checkedAt: string;
  /** Total duration of the health check in milliseconds. */
  durationMs: number;
}

// ── Usage and Error Reporting ───────────────────────────────────────

/** Usage report for a single request. */
interface UsageReport {
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  cost?: number;
}

// ── Key Stats ───────────────────────────────────────────────────────

/** Per-key usage statistics. */
interface KeyStats {
  id: string;
  provider: string;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  errors: number;
  rateLimits: number;
  errorRate: number;
  avgLatencyMs: number;
  lastUsedAt: string | null;
  lastErrorAt: string | null;
  cooldownEndsAt: string | null;
  totalCooldownMs: number;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheckAt: string | null;
  cost: number;
  metadata?: Record<string, unknown>;
  status: 'available' | 'cooldown' | 'disabled';
}

/** Per-pool aggregate statistics. */
interface PoolState {
  totalKeys: number;
  availableKeys: number;
  cooldownKeys: number;
  disabledKeys: number;
  totalRequests: number;
  totalTokens: number;
  totalErrors: number;
}

/** Complete stats returned by getStats(). */
interface KeyringStats {
  keys: Record<string, KeyStats>;
  pools: Record<string, PoolState>;
}

// ── Key Entry ───────────────────────────────────────────────────────

/** A key entry returned by getKey(). */
interface KeyEntry {
  id: string;
  key: string;
  provider: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

// ── Exported State ──────────────────────────────────────────────────

/** Serializable state for persistence. Does not include key strings. */
interface ExportedKeyringState {
  keys: Record<string, {
    requests: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    errors: number;
    rateLimits: number;
    cost: number;
    totalCooldownMs: number;
    cooldownEndsAt: string | null;
    healthStatus: 'healthy' | 'unhealthy' | 'unknown';
    lastUsedAt: string | null;
    lastErrorAt: string | null;
    lastHealthCheckAt: string | null;
  }>;
  exportedAt: string;
}

// ── Pool Exhaustion Error ───────────────────────────────────────────

/** Error thrown when all keys in a pool are unavailable. */
declare class PoolExhaustedError extends Error {
  /** The pool that was exhausted. */
  readonly pool: string;
  /** State of each key in the pool. */
  readonly keyStates: Array<{
    id: string;
    status: 'cooldown' | 'disabled';
    cooldownEndsAt?: string;
    cooldownRemainingMs?: number;
  }>;
  /** Shortest remaining cooldown across all keys, in milliseconds. */
  readonly shortestCooldownMs: number;
}

// ── Event Hooks ─────────────────────────────────────────────────────

/** Event hooks for observability. */
interface KeyringHooks {
  /** A key entered cooldown due to a 429 response. */
  onCooldownStart?: (info: {
    keyId: string;
    provider: string;
    cooldownMs: number;
    retryAfter?: number;
    escalationLevel: number;
  }) => void;

  /** A key exited cooldown and is available again. */
  onCooldownEnd?: (info: {
    keyId: string;
    provider: string;
    cooldownDurationMs: number;
  }) => void;

  /** A key was disabled (failed health check or expired). */
  onKeyDisabled?: (info: {
    keyId: string;
    provider: string;
    reason: 'health-check' | 'expired' | 'manual';
    error?: string;
  }) => void;

  /** A disabled key was re-enabled (passed health check). */
  onKeyEnabled?: (info: {
    keyId: string;
    provider: string;
  }) => void;

  /** All keys in a pool are unavailable. */
  onPoolExhausted?: (info: {
    pool: string;
    totalKeys: number;
    cooldownKeys: number;
    disabledKeys: number;
    shortestCooldownMs: number;
  }) => void;

  /** A health check completed. */
  onHealthCheckComplete?: (info: {
    report: HealthCheckReport;
  }) => void;

  /** A key was selected by getKey(). */
  onKeyRotation?: (info: {
    keyId: string;
    provider: string;
    strategy: RotationStrategy;
    poolSize: number;
    availableKeys: number;
  }) => void;
}

// ── Keyring Configuration ───────────────────────────────────────────

/** Configuration for createKeyring. */
interface KeyringConfig {
  /** Initial set of keys. At least one is required. */
  keys: KeyConfig[];

  /** Global rotation strategy. Default: 'round-robin'. */
  strategy?: RotationStrategy;

  /** Default cooldown duration in milliseconds when no Retry-After header is present. Default: 60000 (60s). */
  defaultCooldownMs?: number;

  /** Maximum cooldown duration in milliseconds (caps escalating cooldown). Default: 600000 (10 minutes). */
  maxCooldownMs?: number;

  /** Time window for cooldown escalation tracking. Default: 300000 (5 minutes). */
  cooldownEscalationWindowMs?: number;

  /** Pool exhaustion strategy. Default: { strategy: 'throw' }. */
  onPoolExhausted?: PoolExhaustionConfig;

  /** Per-pool configuration overrides. */
  pools?: Record<string, PoolConfig>;

  /** Health check configuration. */
  healthCheck?: HealthCheckConfig;

  /** Time window in milliseconds for rolling metrics (error rate, avg latency). Default: 300000 (5 minutes). */
  metricsWindowMs?: number;

  /** Event hooks. */
  hooks?: KeyringHooks;

  /** Previously exported state to restore. Keys are matched by id. */
  initialState?: ExportedKeyringState;
}

// ── Keyring Instance ────────────────────────────────────────────────

/** The keyring instance returned by createKeyring. */
interface Keyring {
  /** Get the next available key from a provider pool, tag pool, or any pool. */
  getKey(provider?: string | { provider?: string; tag?: string }): KeyEntry;

  /** Record usage metrics for a key. */
  reportUsage(keyId: string, usage: UsageReport): void;

  /** Report an error for a key. Handles 429 detection and cooldown. */
  reportError(keyId: string, error: unknown): void;

  /** Add a key to the keyring at runtime. */
  addKey(config: KeyConfig): void;

  /** Remove a key from the keyring at runtime. */
  removeKey(keyId: string): void;

  /** Get per-key and per-pool usage statistics. */
  getStats(): KeyringStats;

  /** Run health checks on all keys or a specific provider's keys. */
  healthCheck(provider?: string): Promise<HealthCheckReport>;

  /** Start periodic health checks (if intervalMs is configured). */
  startHealthChecks(): void;

  /** Stop periodic health checks. */
  stopHealthChecks(): void;

  /** Export state for persistence. Does not include key strings. */
  exportState(): ExportedKeyringState;

  /** Stop all timers and clean up resources. */
  shutdown(): void;
}
```

### Function Signatures

```typescript
/**
 * Create a new keyring for managing AI API keys.
 *
 * @param config - Keyring configuration with keys, rotation strategy, and hooks.
 * @returns A Keyring instance.
 * @throws TypeError if configuration is invalid.
 */
function createKeyring(config: KeyringConfig): Keyring;
```

---

## 12. Security

### Keys in Memory Only

API key strings are stored in memory within the keyring instance for the duration of the process. They are not written to disk, not logged, not serialized, and not included in stats or event payloads. The only place the key string appears is in the `KeyEntry` object returned by `getKey`, which the caller uses to make API calls.

### Key Strings Never Logged

The keyring's internal logging (if any) and event hooks never include raw key strings. Events include `keyId` (the caller-assigned identifier), not the key itself. The `getStats()` method returns usage data keyed by `id`, never by the raw key string.

### Key Strings Never Serialized

`exportState()` exports usage counters, timestamps, and health status, keyed by `id`. The exported state does not include key strings. When restoring state via `initialState`, the caller must provide the key strings again via the `keys` configuration. State is matched by `id`.

### Environment Variable Loading

The keyring supports loading keys from environment variables via a conventional pattern:

```typescript
const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_API_KEY_1!, provider: 'openai' },
    { id: 'oai-2', key: process.env.OPENAI_API_KEY_2!, provider: 'openai' },
  ],
});
```

The keyring does not read environment variables itself -- the caller passes the values. This avoids the keyring needing to know environment variable naming conventions and keeps the caller in control of where keys come from.

### Async Key Loader

For integration with secret managers, the keyring supports an async key loader:

```typescript
const keyring = createKeyring({
  keys: [], // Start empty
  keyLoader: async () => {
    const secrets = await vault.getSecrets('ai-keys/*');
    return secrets.map((s) => ({
      id: s.name,
      key: s.value,
      provider: s.metadata.provider,
    }));
  },
});

// Load keys from the secret manager
await keyring.loadKeys();
```

The key loader function is called explicitly via `keyring.loadKeys()`, not automatically on creation. This gives the caller control over when async initialization happens.

### Key Masking in Error Messages

If a key string accidentally appears in an error message (e.g., a provider SDK includes the key in a 401 error), the keyring's `reportError` method does not propagate the raw error to events. Event payloads include the error message after stripping patterns that match common API key formats (`sk-...`, `key-...`, `AIza...`, etc.).

---

## 13. Configuration

### Default Values

| Option | Default | Description |
|---|---|---|
| `keys` | (required) | At least one key is required. |
| `strategy` | `'round-robin'` | Global rotation strategy. |
| `defaultCooldownMs` | `60000` (60s) | Cooldown duration when no `Retry-After` header is present. |
| `maxCooldownMs` | `600000` (10 min) | Maximum cooldown duration (caps escalating cooldown). |
| `cooldownEscalationWindowMs` | `300000` (5 min) | Window for tracking repeated 429s for cooldown escalation. |
| `onPoolExhausted.strategy` | `'throw'` | What to do when all keys in a pool are unavailable. |
| `onPoolExhausted.maxWaitMs` | `30000` (30s) | Maximum wait time for the `wait` strategy. |
| `metricsWindowMs` | `300000` (5 min) | Rolling window for error rate and average latency. |
| `healthCheck.intervalMs` | `undefined` (disabled) | Interval for periodic health checks. |
| `healthCheck.unhealthyThreshold` | `1` | Consecutive failures before disabling a key. |

### Configuration Validation

All options are validated synchronously when `createKeyring` is called. Invalid values throw `TypeError` with actionable messages:

| Rule | Error |
|---|---|
| `keys` must be a non-empty array | `TypeError: keys must be a non-empty array of KeyConfig objects` |
| Each key must have a non-empty `key` string | `TypeError: key must be a non-empty string, received empty string for key at index 0` |
| Each key must have a non-empty `provider` string | `TypeError: provider must be a non-empty string, received empty string for key 'oai-1'` |
| Key `id` values must be unique | `TypeError: duplicate key id 'oai-1'` |
| `weight` must be a positive number | `TypeError: weight must be a positive number, received -1 for key 'oai-1'` |
| `priority` must be a non-negative integer | `TypeError: priority must be a non-negative integer, received -1 for key 'oai-1'` |
| `strategy` must be a valid RotationStrategy | `TypeError: strategy must be one of 'round-robin', 'least-recently-used', 'least-requests', 'weighted-random', 'priority', received 'invalid'` |
| `defaultCooldownMs` must be a positive integer | `TypeError: defaultCooldownMs must be a positive integer, received 0` |
| `maxCooldownMs` must be a positive integer | `TypeError: maxCooldownMs must be a positive integer` |
| `maxCooldownMs` must be >= `defaultCooldownMs` | `TypeError: maxCooldownMs (30000) must be >= defaultCooldownMs (60000)` |
| `metricsWindowMs` must be a positive integer | `TypeError: metricsWindowMs must be a positive integer` |
| `onPoolExhausted.fn` must be a function (for `fallback` strategy) | `TypeError: onPoolExhausted.fn must be a function when strategy is 'fallback'` |
| `healthCheck` provider functions must be functions | `TypeError: healthCheck['openai'] must be a function, received string` |

---

## 14. CLI

### Overview

`ai-keyring` provides an optional CLI for inspecting keyring state, running health checks, and displaying key statistics. The CLI reads key configuration from environment variables or a configuration file and creates a keyring instance for the duration of the command.

### Commands

#### `ai-keyring stats`

Display per-key and per-pool usage statistics.

```bash
# Default: human-readable table output
ai-keyring stats

# JSON output for scripting
ai-keyring stats --json

# Filter by provider
ai-keyring stats --provider openai
```

**Output (human-readable):**

```
Key Pool: openai (3 keys, round-robin)
  oai-1      available   1,523 reqs   2.45M tokens   0.8% errors   342ms avg   $12.35
  oai-2      cooldown    1,201 reqs   1.90M tokens   1.2% errors   298ms avg   $9.80
             └─ cooldown ends in 45s (429 at 10:29:55)
  oai-3      available     856 reqs   1.30M tokens   0.5% errors   310ms avg   $7.15

Key Pool: anthropic (1 key, priority)
  ant-1      available     412 reqs   0.95M tokens   0.2% errors   185ms avg   $5.20
```

#### `ai-keyring health`

Run health checks on all keys.

```bash
# Default: human-readable output
ai-keyring health

# JSON output
ai-keyring health --json

# Filter by provider
ai-keyring health --provider openai

# Exit code: 0 if all healthy, 1 if any unhealthy
ai-keyring health && echo "All keys healthy"
```

**Output:**

```
Health Check Report (completed in 456ms)
  oai-1      healthy    142ms   quota: 950,000 remaining
  oai-2      unhealthy  HTTP 401: Invalid API key
  oai-3      healthy    98ms    quota: 780,000 remaining
  ant-1      healthy    65ms

Overall: DEGRADED (1 of 4 keys unhealthy)
```

**Exit codes:**
- `0`: All keys healthy.
- `1`: One or more keys unhealthy.
- `2`: Configuration error (missing keys, invalid config file).

#### `ai-keyring list`

List all configured keys (without revealing the key strings).

```bash
ai-keyring list
```

**Output:**

```
ID           Provider    Priority  Weight  Tags           Status
oai-1        openai      0         1       production     available
oai-2        openai      0         2       production     cooldown (45s)
oai-3        openai      1         1       backup         available
ant-1        anthropic   0         1       production     available
```

### Configuration File

The CLI reads configuration from `ai-keyring.config.json` or `ai-keyring.config.js` in the current directory:

```json
{
  "keys": [
    { "id": "oai-1", "env": "OPENAI_KEY_1", "provider": "openai" },
    { "id": "oai-2", "env": "OPENAI_KEY_2", "provider": "openai", "weight": 2 },
    { "id": "ant-1", "env": "ANTHROPIC_KEY", "provider": "anthropic" }
  ],
  "strategy": "round-robin",
  "healthCheck": {
    "providers": ["openai", "anthropic"]
  }
}
```

The `env` property specifies the environment variable name to read the key from. The CLI reads the environment variable at startup and passes the value to `createKeyring`. The key string is never written to the config file.

---

## 15. Integration

### With ai-provider-healthcheck

`ai-provider-healthcheck` monitors AI provider endpoint availability and latency at the provider level (is api.openai.com reachable? what is the latency?). `ai-keyring` monitors individual key health within a provider (is this specific key valid? what is its remaining quota?). The two are complementary:

```typescript
import { createKeyring } from 'ai-keyring';
import { checkProvider } from 'ai-provider-healthcheck';

// Check provider-level health before key-level health
const providerHealth = await checkProvider('openai');

if (!providerHealth.available) {
  // Provider is down -- key-level health checks will all fail.
  // Skip key health checks and handle the outage at the provider level.
  console.error('OpenAI API is unavailable');
} else {
  // Provider is up -- check individual key health
  const keyHealth = await keyring.healthCheck('openai');
  // Handle any unhealthy keys
}
```

### With ai-circuit-breaker

`ai-circuit-breaker` controls how much money is spent. `ai-keyring` controls which key is used to spend that money. They operate on orthogonal axes:

```typescript
import { createKeyring } from 'ai-keyring';
import { createBreaker } from 'ai-circuit-breaker';

const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_KEY_1!, provider: 'openai' },
    { id: 'oai-2', key: process.env.OPENAI_KEY_2!, provider: 'openai' },
  ],
});

const breaker = createBreaker({
  budgets: [{ window: 'hourly', limit: 50 }],
});

const chat = breaker.wrap(async (params) => {
  // Get a key from the keyring (rotates, handles cooldown)
  const entry = keyring.getKey('openai');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${entry.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = Object.assign(new Error(response.statusText), {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      });
      keyring.reportError(entry.id, error);
      throw error;
    }

    const data = await response.json();
    keyring.reportUsage(entry.id, {
      tokens: data.usage.total_tokens,
      latencyMs: data.latencyMs,
    });

    return data;
  } catch (error) {
    keyring.reportError(entry.id, error);
    throw error;
  }
});
```

### With tool-call-retry

`tool-call-retry` retries failed requests. `ai-keyring` provides key rotation so each retry can use a different key:

```typescript
import { createKeyring } from 'ai-keyring';
import { withRetry } from 'tool-call-retry';

const keyring = createKeyring({
  keys: [/* ... */],
});

async function callOpenAI(params: any) {
  // Each invocation gets the next available key
  const entry = keyring.getKey('openai');
  try {
    const result = await makeApiCall(entry.key, params);
    keyring.reportUsage(entry.id, { tokens: result.usage.total_tokens });
    return result;
  } catch (error) {
    keyring.reportError(entry.id, error);
    throw error;
  }
}

// Retry wraps the function -- each retry attempt calls getKey() again,
// potentially getting a different key if the previous one entered cooldown
const resilientCall = withRetry(callOpenAI, {
  maxRetries: 3,
  initialDelayMs: 1000,
});

const result = await resilientCall({ model: 'gpt-4o', messages });
```

### With prompt-price

`prompt-price` estimates the cost of a prompt. Combined with `ai-keyring`'s per-key cost tracking, teams can attribute costs to specific keys:

```typescript
import { createKeyring } from 'ai-keyring';
import { estimateCost } from 'prompt-price';

const keyring = createKeyring({ keys: [/* ... */] });

const entry = keyring.getKey('openai');
const estimate = estimateCost({ model: 'gpt-4o', messages });

const result = await makeApiCall(entry.key, { model: 'gpt-4o', messages });
keyring.reportUsage(entry.id, {
  tokens: result.usage.total_tokens,
  cost: estimate.totalCost,
});

// Later: check per-key cost attribution
const stats = keyring.getStats();
console.log(`Key ${entry.id} total cost: $${stats.keys[entry.id].cost.toFixed(2)}`);
```

### OpenAI SDK Integration

```typescript
import { createKeyring } from 'ai-keyring';
import OpenAI from 'openai';

const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_KEY_1!, provider: 'openai' },
    { id: 'oai-2', key: process.env.OPENAI_KEY_2!, provider: 'openai' },
    { id: 'oai-3', key: process.env.OPENAI_KEY_3!, provider: 'openai' },
  ],
  strategy: 'round-robin',
});

async function chat(messages: OpenAI.ChatCompletionMessageParam[]) {
  const entry = keyring.getKey('openai');
  const client = new OpenAI({ apiKey: entry.key });

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
    });

    keyring.reportUsage(entry.id, {
      tokens: response.usage?.total_tokens,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });

    return response;
  } catch (error) {
    keyring.reportError(entry.id, error);
    throw error;
  }
}
```

### Anthropic SDK Integration

```typescript
import { createKeyring } from 'ai-keyring';
import Anthropic from '@anthropic-ai/sdk';

const keyring = createKeyring({
  keys: [
    { id: 'ant-1', key: process.env.ANTHROPIC_KEY_1!, provider: 'anthropic' },
    { id: 'ant-2', key: process.env.ANTHROPIC_KEY_2!, provider: 'anthropic' },
  ],
  strategy: 'priority',
});

async function chat(messages: Anthropic.MessageParam[]) {
  const entry = keyring.getKey('anthropic');
  const client = new Anthropic({ apiKey: entry.key });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages,
    });

    keyring.reportUsage(entry.id, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return response;
  } catch (error) {
    keyring.reportError(entry.id, error);
    throw error;
  }
}
```

---

## 16. Testing Strategy

### Unit Tests

**Rotation strategy tests:** Round-robin returns keys in insertion order. Round-robin wraps around after the last key. Round-robin skips keys in cooldown. LRU selects the key with the oldest `lastUsedAt`. LRU breaks ties by insertion order. Least-requests selects the key with the fewest requests. Weighted random selects keys proportionally to weights over many iterations (statistical test). Priority selects the lowest-priority-number key. Priority falls back to the next priority level when the top-priority key is in cooldown. Priority uses round-robin as a tiebreaker among same-priority keys.

**Cooldown tests:** `reportError` with a 429 status places the key in cooldown. Cooldown duration matches the `Retry-After` header when present. Cooldown duration uses `defaultCooldownMs` when no `Retry-After` header is present. `Retry-After` parsed as seconds (integer string). `Retry-After` parsed as HTTP date (date string). `Retry-After` in the past uses `defaultCooldownMs`. Key is excluded from `getKey` during cooldown. Key is included in `getKey` after cooldown expires (lazy evaluation). Escalating cooldown: second 429 doubles the duration. Escalating cooldown: capped at `maxCooldownMs`. Escalation resets after a successful `reportUsage`. Escalation resets after `cooldownEscalationWindowMs` with no 429.

**429 detection tests:** Detects `status: 429`. Detects `statusCode: 429`. Detects `response.status: 429`. Detects `error.code === 'rate_limited'`. Detects `error.type === 'rate_limit_error'` (Anthropic pattern). Does not trigger cooldown for non-429 errors (400, 401, 500). Detects rate limit keywords in message as last resort.

**Pool exhaustion tests:** `getKey` throws `PoolExhaustedError` when all keys in pool are in cooldown (default strategy). `PoolExhaustedError` includes per-key cooldown details and shortest remaining cooldown. `wait` strategy resolves when a key exits cooldown. `wait` strategy throws after `maxWaitMs`. `fallback` strategy calls the provided function.

**Key management tests:** `addKey` adds a key to the appropriate pool. `addKey` with duplicate `id` throws `TypeError`. `removeKey` removes the key from all pools. `removeKey` with non-existent `id` is a no-op. Removing the current round-robin position adjusts the counter. Adding a key to an existing pool makes it immediately available.

**Usage tracking tests:** `reportUsage` increments request count. `reportUsage` accumulates tokens. `reportUsage` updates `lastUsedAt`. `reportUsage` records latency for rolling average. `reportError` increments error count. `reportError` updates `lastErrorAt`. Error rate is computed over rolling window. Average latency is computed over rolling window. Rolling window entries older than `metricsWindowMs` are pruned.

**Stats tests:** `getStats` returns per-key stats with correct fields. `getStats` returns per-pool aggregate stats. Key strings are never present in stats output. `getStats` reflects current cooldown status.

**Health check tests:** `healthCheck` calls the provider-specific function for each key. Keys that fail health check are marked disabled. Disabled keys are excluded from `getKey`. Keys that pass a subsequent health check are re-enabled. `unhealthyThreshold > 1`: key is not disabled until N consecutive failures. Health check report includes overall status (healthy/degraded/unhealthy).

**Configuration validation tests:** Missing `keys` throws. Empty `keys` array throws. Key with empty `key` string throws. Key with empty `provider` throws. Duplicate `id` throws. Invalid `strategy` throws. Negative `weight` throws. Each invalid configuration produces the expected `TypeError` message.

**State export/import tests:** `exportState` produces a serializable object without key strings. Creating a keyring with `initialState` restores usage counters. Expired cooldowns in imported state are cleared on first interaction. Keys in `initialState` but not in `keys` config are ignored. Keys in `keys` config but not in `initialState` start fresh.

### Integration Tests

**End-to-end rotation with cooldown:** Create a keyring with 3 keys and round-robin. Call `getKey` 3 times, verify rotation. Report a 429 on key 1. Call `getKey`, verify key 1 is skipped. Advance time past the cooldown. Call `getKey`, verify key 1 is back in rotation.

**Multi-provider failover:** Create a keyring with openai and anthropic keys. Place all openai keys in cooldown. Call `getKey('openai')` with a cross-provider fallback pool. Verify an anthropic key is returned.

**Health check integration:** Create a keyring with a mock health check function. One key returns `healthy: false`. Run `healthCheck()`. Verify the unhealthy key is disabled. Call `getKey` and verify the disabled key is skipped. Update the mock to return `healthy: true`. Run `healthCheck()` again. Verify the key is re-enabled.

**Weighted random distribution:** Create a keyring with weights [3, 1]. Call `getKey` 10,000 times. Verify the distribution is approximately 75%/25% within statistical bounds (chi-squared test or tolerance band).

**Concurrent key usage with mixed errors:** Simulate 100 concurrent requests. Mix of successes, 429s, and 500s. Verify usage counters, cooldown states, and error rates are correct after all requests complete.

### Edge Cases to Test

- Pool with a single key: rotation strategy degenerates to always returning that key.
- Pool with a single key that enters cooldown: pool exhaustion is triggered.
- `getKey` with no provider: returns any available key from any pool.
- `getKey` with non-existent provider: throws `PoolExhaustedError` (empty pool).
- `reportUsage` for a non-existent key ID: no-op (does not throw).
- `reportError` for a non-existent key ID: no-op (does not throw).
- `addKey` while pool is in use by round-robin: new key enters the rotation without disrupting the sequence.
- `removeKey` for the key currently in use: next `getKey` selects the next key normally.
- Cooldown with `Retry-After: 0`: key is immediately available (minimum cooldown of 1 second is enforced).
- Extremely large `Retry-After` values: capped at `maxCooldownMs`.
- `healthCheck` when no health check function is configured for the provider: skips the key with `healthStatus: 'unknown'`.
- All keys in all pools disabled: `getKey` with no provider throws `PoolExhaustedError`.
- `exportState` with no usage (freshly created keyring): returns valid state with zero counters.
- Key with `metadata.expiresAt` in the past: automatically disabled on first `getKey` check.

### Test Framework

Tests use Vitest, matching the project's existing configuration. Time-dependent tests use Vitest's fake timers (`vi.useFakeTimers`, `vi.advanceTimersByTime`) to control cooldown expiration without real-time delays. Statistical tests (weighted random distribution) use a tolerance band rather than exact equality.

---

## 17. Performance

### `getKey` Overhead

When the pool has available keys and no cooldowns to evaluate, `getKey` performs:

1. **Pool lookup**: Hash map lookup by provider string (~1 microsecond).
2. **Strategy selection**: One of: counter increment (round-robin), min-timestamp scan (LRU), min-count scan (least-requests), weighted random selection, or sorted priority scan. For pools under 100 keys, all strategies complete in under 5 microseconds.
3. **Cooldown check**: One `Date.now()` call and one comparison per key examined (~1 microsecond per key).
4. **Usage counter update**: One timestamp write, one counter increment (~1 microsecond).

**Total overhead for `getKey` with a 10-key pool**: approximately 5-15 microseconds. This is negligible compared to any AI API call (hundreds of milliseconds to seconds).

### `reportUsage` / `reportError` Overhead

Both methods perform in-memory counter updates: additions, timestamp writes, and (for rolling metrics) array pushes. No I/O, no timers, no async operations.

**Total overhead**: approximately 2-5 microseconds per call.

### Memory

Per-keyring memory consumption:

- Per-key state (counters, timestamps, references): ~500 bytes per key.
- Per-key rolling metrics window: bounded by `metricsWindowMs` and request rate. At 100 requests per second over a 5-minute window, each key stores up to 30,000 entries at ~50 bytes each = ~1.5 MB per key. This is the upper bound for extremely high-throughput keys. Most keys store far fewer entries.
- Pool data structures (arrays, rotation state): ~100 bytes per pool.

**Total for a typical keyring with 10 keys across 3 providers, moderate traffic**: approximately 50-200 KB.

For high-throughput scenarios, the `metricsWindowMs` can be reduced (e.g., to 60 seconds) to limit the rolling window size, or rolling metrics can be disabled entirely (`metricsWindowMs: 0`) for minimal memory usage.

### Timer Management

The only timer used by the keyring is the optional periodic health check interval (`setInterval` with `unref()`). All cooldown and expiration logic is evaluated lazily in `getKey` -- no background timers. This means:

- No `setInterval` keeping the process alive (the health check timer is `unref`'d).
- No CPU usage when the keyring is idle.
- `process.exit()` is never blocked by keyring timers.

---

## 18. Dependencies

### Runtime Dependencies

None. `ai-keyring` has zero runtime dependencies. All functionality is implemented using built-in JavaScript APIs:

| API | Purpose |
|---|---|
| `Date.now()` | Cooldown tracking, timestamp generation, metrics windowing |
| `Date` constructor | ISO 8601 timestamp formatting, `Retry-After` date parsing |
| `Math.random()` | Weighted random rotation strategy |
| `Math.floor`, `Math.min`, `Math.max` | Weight calculation, cooldown capping |
| `Map`, `Array` | Key pools, usage counters, rolling metrics |
| `crypto.randomUUID()` | Auto-generated key IDs (Node.js 18+ built-in) |

### Development Dependencies

| Package | Purpose |
|---|---|
| `typescript` | TypeScript compiler |
| `vitest` | Test runner |
| `eslint` | Linting |
| `@types/node` | Node.js type definitions |

### Why Zero Dependencies

The package performs four categories of operations: key selection (rotation algorithms), state management (cooldown tracking, usage counters), time logic (cooldown expiration, Retry-After parsing), and statistics (rolling window metrics). All four are trivially implementable with built-in JavaScript APIs. The total implementation is estimated at under 1500 lines of TypeScript. Adding a dependency for any of these would increase install size and introduce supply chain risk with no tangible benefit.

---

## 19. File Structure

```
ai-keyring/
  package.json
  tsconfig.json
  SPEC.md
  README.md
  src/
    index.ts                          -- Public API exports: createKeyring, PoolExhaustedError
    types.ts                          -- All TypeScript type definitions
    keyring.ts                        -- createKeyring factory and Keyring class implementation
    key-pool.ts                       -- Key pool data structure and management
    rotation/
      index.ts                        -- Strategy factory: creates the appropriate rotation strategy
      round-robin.ts                  -- Round-robin rotation implementation
      lru.ts                          -- Least-recently-used rotation implementation
      least-requests.ts               -- Least-requests rotation implementation
      weighted-random.ts              -- Weighted random rotation implementation
      priority.ts                     -- Priority-based rotation implementation
    cooldown.ts                       -- Per-key cooldown tracking, Retry-After parsing, escalation
    usage-tracker.ts                  -- Per-key usage counters and rolling window metrics
    health-checker.ts                 -- Health check orchestration, periodic scheduling
    rate-limit-detector.ts            -- 429 detection, Retry-After extraction logic
    pool-exhausted-error.ts           -- PoolExhaustedError class definition
    state-export.ts                   -- exportState/importState serialization logic
    cli.ts                            -- CLI entry point (stats, health, list commands)
  src/__tests__/
    rotation/
      round-robin.test.ts             -- Round-robin strategy tests
      lru.test.ts                     -- LRU strategy tests
      least-requests.test.ts          -- Least-requests strategy tests
      weighted-random.test.ts         -- Weighted random distribution tests
      priority.test.ts                -- Priority-based strategy tests
    cooldown.test.ts                  -- Cooldown tracking, escalation, Retry-After parsing tests
    rate-limit-detector.test.ts       -- 429 detection tests across error formats
    usage-tracker.test.ts             -- Usage counter and rolling metrics tests
    health-checker.test.ts            -- Health check orchestration tests
    key-pool.test.ts                  -- Pool management, add/remove key tests
    keyring.test.ts                   -- createKeyring factory tests, configuration validation
    pool-exhaustion.test.ts           -- Pool exhaustion strategy tests (throw, wait, fallback)
    events.test.ts                    -- Event hook emission tests
    state-export.test.ts              -- State export/import tests
    integration/
      openai.test.ts                  -- OpenAI SDK integration pattern
      anthropic.test.ts               -- Anthropic SDK integration pattern
      multi-provider.test.ts          -- Cross-provider failover tests
      end-to-end.test.ts              -- Full lifecycle: rotation -> cooldown -> failover -> recovery
    fixtures/
      mock-keys.ts                    -- Mock key configurations for tests
      mock-errors.ts                  -- Mock 429 errors with various Retry-After formats
      mock-health.ts                  -- Mock health check functions
  dist/                               -- Compiled output (generated by tsc)
```

---

## 20. Implementation Roadmap

### Phase 1: Core Keyring and Round-Robin (v0.1.0)

Implement the foundation: key pool management, round-robin rotation, and basic `getKey`/`reportError` flow.

1. **Types**: Define all TypeScript types in `types.ts` -- `KeyConfig`, `KeyEntry`, `KeyringConfig`, `KeyringStats`, `RotationStrategy`, `UsageReport`, `KeyringHooks`.
2. **Key pool**: Implement the `KeyPool` data structure in `key-pool.ts`. Add/remove keys, group by provider, iterate available keys.
3. **Rotation: round-robin**: Implement round-robin rotation in `rotation/round-robin.ts`. Cyclic counter, skip unavailable keys.
4. **Cooldown**: Implement per-key cooldown tracking in `cooldown.ts`. Set cooldown, check expiration, lazy re-enable.
5. **Rate limit detection**: Implement 429 detection and `Retry-After` parsing in `rate-limit-detector.ts`.
6. **Keyring factory**: Implement `createKeyring` in `keyring.ts`. Wire together pool, rotation, cooldown, and rate limit detection. Implement `getKey`, `reportError`, `addKey`, `removeKey`.
7. **Pool exhaustion**: Implement `PoolExhaustedError` and the `throw` exhaustion strategy.
8. **Configuration validation**: Validate all config options at creation time.
9. **Tests**: Round-robin tests, cooldown tests, 429 detection tests, pool exhaustion tests, validation tests.

### Phase 2: All Rotation Strategies and Usage Tracking (v0.2.0)

Add remaining rotation strategies and usage tracking.

1. **Rotation: LRU**: Implement least-recently-used strategy.
2. **Rotation: least-requests**: Implement least-requests strategy.
3. **Rotation: weighted random**: Implement weighted random selection.
4. **Rotation: priority**: Implement priority-based selection with round-robin tiebreaker.
5. **Per-pool strategy override**: Support per-pool strategy configuration.
6. **Usage tracker**: Implement per-key usage counters in `usage-tracker.ts`. Track requests, tokens, errors, latency.
7. **Rolling metrics**: Implement rolling window for error rate and average latency.
8. **`reportUsage`**: Record usage metrics per key.
9. **`getStats`**: Return per-key and per-pool statistics.
10. **Tests**: Each rotation strategy, usage counter accuracy, rolling window pruning, stats shape.

### Phase 3: Health Checking and Failover (v0.3.0)

Add health checking, cooldown escalation, and advanced failover.

1. **Health checker**: Implement health check orchestration in `health-checker.ts`. Call provider-specific functions, update key health status.
2. **Periodic health checks**: Implement `setInterval`-based periodic checks with `unref()`.
3. **Key disabling**: Disable keys on health check failure, re-enable on success.
4. **`unhealthyThreshold`**: Require N consecutive failures before disabling.
5. **Cooldown escalation**: Implement escalating cooldown durations for repeated 429s.
6. **Pool exhaustion: wait**: Implement the `wait` strategy with `maxWaitMs`.
7. **Pool exhaustion: fallback**: Implement the `fallback` strategy.
8. **Cross-pool failover**: Implement `fallbackPool` per-pool configuration.
9. **Key expiry detection**: Auto-disable keys with expired `metadata.expiresAt`.
10. **Tests**: Health check integration, escalation, wait/fallback exhaustion strategies, cross-pool failover, expiry detection.

### Phase 4: Events, CLI, and Production Readiness (v1.0.0)

Harden for production use.

1. **Event hooks**: Implement all event hooks (`onCooldownStart`, `onCooldownEnd`, `onKeyDisabled`, `onKeyEnabled`, `onPoolExhausted`, `onHealthCheckComplete`, `onKeyRotation`).
2. **State export/import**: Implement `exportState` and `initialState` for persistence.
3. **Async key loader**: Implement `keyLoader` and `loadKeys()` for secret manager integration.
4. **CLI**: Implement `stats`, `health`, and `list` commands with human-readable and JSON output.
5. **Security hardening**: Ensure key strings never appear in logs, events, stats, or exported state. Implement key masking in error messages.
6. **Edge case hardening**: Test with extreme values (single key, all keys disabled, zero cooldown, max cooldown, rapid concurrent access).
7. **Performance profiling**: Benchmark `getKey` overhead, verify sub-20-microsecond latency for 10-key pools.
8. **Documentation**: Comprehensive README with installation, quick start, configuration reference, rotation strategy comparison, and integration examples.

---

## 21. Example Use Cases

### 21.1 Spreading Load Across Multiple OpenAI Keys

A team has 5 OpenAI API keys with different rate limits. They want to distribute requests across all keys to maximize aggregate throughput.

```typescript
import { createKeyring } from 'ai-keyring';

const keyring = createKeyring({
  keys: [
    { id: 'key-1', key: process.env.OPENAI_KEY_1!, provider: 'openai', weight: 3 },
    { id: 'key-2', key: process.env.OPENAI_KEY_2!, provider: 'openai', weight: 3 },
    { id: 'key-3', key: process.env.OPENAI_KEY_3!, provider: 'openai', weight: 2 },
    { id: 'key-4', key: process.env.OPENAI_KEY_4!, provider: 'openai', weight: 1 },
    { id: 'key-5', key: process.env.OPENAI_KEY_5!, provider: 'openai', weight: 1 },
  ],
  strategy: 'weighted-random',
  hooks: {
    onCooldownStart: ({ keyId, cooldownMs }) => {
      console.warn(`Key ${keyId} rate-limited, cooling down for ${cooldownMs}ms`);
    },
    onPoolExhausted: ({ pool, shortestCooldownMs }) => {
      console.error(`All ${pool} keys exhausted. Next key available in ${shortestCooldownMs}ms`);
    },
  },
});

async function callOpenAI(messages: any[]) {
  const entry = keyring.getKey('openai');
  const client = new OpenAI({ apiKey: entry.key });

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
    });
    keyring.reportUsage(entry.id, {
      tokens: response.usage?.total_tokens,
    });
    return response;
  } catch (error) {
    keyring.reportError(entry.id, error);
    throw error;
  }
}
```

### 21.2 Primary + Fallback Key Configuration

A developer has a paid key (high quota, priority support) and a free-tier key (low quota, backup). The paid key should always be used when available.

```typescript
import { createKeyring } from 'ai-keyring';

const keyring = createKeyring({
  keys: [
    {
      id: 'paid',
      key: process.env.ANTHROPIC_PAID_KEY!,
      provider: 'anthropic',
      priority: 0,
      metadata: { tier: 'paid', monthlyQuota: 5_000_000 },
    },
    {
      id: 'free',
      key: process.env.ANTHROPIC_FREE_KEY!,
      provider: 'anthropic',
      priority: 1,
      metadata: { tier: 'free', monthlyQuota: 100_000 },
    },
  ],
  strategy: 'priority',
});

// Normally returns 'paid'. If 'paid' gets 429'd, returns 'free'.
const entry = keyring.getKey('anthropic');
```

### 21.3 Multi-Provider Application with Health Monitoring

An application uses OpenAI, Anthropic, and Google keys and wants periodic health monitoring.

```typescript
import { createKeyring } from 'ai-keyring';

const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_KEY!, provider: 'openai' },
    { id: 'ant-1', key: process.env.ANTHROPIC_KEY!, provider: 'anthropic' },
    { id: 'goog-1', key: process.env.GOOGLE_KEY!, provider: 'google' },
  ],
  healthCheck: {
    openai: async (key) => {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      return { healthy: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
    },
    anthropic: async (key) => {
      // Use a cheap ping endpoint
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-20250514', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      return { healthy: res.ok };
    },
    google: async (key) => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`);
      return { healthy: res.ok };
    },
    intervalMs: 600_000, // Every 10 minutes
    unhealthyThreshold: 2, // Require 2 consecutive failures before disabling
    onUnhealthy: (keyId, error) => {
      alertOpsTeam(`API key ${keyId} is unhealthy: ${error}`);
    },
  },
});

// On graceful shutdown
process.on('SIGTERM', () => {
  keyring.shutdown();
  process.exit(0);
});
```

### 21.4 Agent Loop with Key Rotation and Retry

An autonomous agent makes multiple API calls per query. Key rotation and retry are composed:

```typescript
import { createKeyring } from 'ai-keyring';
import { withRetry } from 'tool-call-retry';
import { createBreaker } from 'ai-circuit-breaker';

const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_KEY_1!, provider: 'openai' },
    { id: 'oai-2', key: process.env.OPENAI_KEY_2!, provider: 'openai' },
    { id: 'oai-3', key: process.env.OPENAI_KEY_3!, provider: 'openai' },
  ],
  strategy: 'round-robin',
  onPoolExhausted: { strategy: 'wait', maxWaitMs: 10_000 },
});

const breaker = createBreaker({
  budgets: [{ window: 'hourly', limit: 20 }],
});

async function makeCall(params: any) {
  const entry = keyring.getKey('openai');
  try {
    const result = await callOpenAI(entry.key, params);
    keyring.reportUsage(entry.id, { tokens: result.usage.total_tokens });
    return result;
  } catch (error) {
    keyring.reportError(entry.id, error);
    throw error;
  }
}

// Retry with key rotation: each retry gets a (potentially different) key
const resilientCall = withRetry(makeCall, { maxRetries: 3 });

// Spend protection wraps the whole thing
const protectedCall = breaker.wrap(resilientCall);

// Agent loop
async function runAgent(query: string) {
  const messages = [{ role: 'user', content: query }];
  for (let i = 0; i < 10; i++) {
    const response = await protectedCall({ model: 'gpt-4o', messages });
    breaker.recordSpend(computeCost(response));
    if (response.choices[0].finish_reason === 'stop') return response;
    messages.push(response.choices[0].message);
  }
}
```

### 21.5 Cost Attribution Across Teams

An organization uses shared API keys and wants to track costs by team:

```typescript
import { createKeyring } from 'ai-keyring';

const keyring = createKeyring({
  keys: [
    { id: 'team-ml', key: process.env.ML_TEAM_KEY!, provider: 'openai', tags: ['ml-team'], metadata: { team: 'ML', budget: 500 } },
    { id: 'team-product', key: process.env.PRODUCT_TEAM_KEY!, provider: 'openai', tags: ['product-team'], metadata: { team: 'Product', budget: 300 } },
    { id: 'shared', key: process.env.SHARED_KEY!, provider: 'openai', tags: ['shared'], metadata: { team: 'Shared', budget: 200 } },
  ],
  strategy: 'round-robin',
});

// ML team uses their dedicated key
function mlTeamCall(messages: any[]) {
  const entry = keyring.getKey({ tag: 'ml-team' });
  // ... make the call, report usage
}

// End of month: cost report
const stats = keyring.getStats();
for (const [id, keyStats] of Object.entries(stats.keys)) {
  console.log(`${id} (${keyStats.metadata?.team}): ${keyStats.requests} requests, $${keyStats.cost.toFixed(2)}`);
}
```
