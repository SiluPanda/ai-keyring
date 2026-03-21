# ai-keyring

Manage, rotate, and health-check AI API keys across providers.

`ai-keyring` provides a key pool manager for AI/LLM API keys with automatic rotation, 429 rate-limit detection, cooldown management, health checking, and usage tracking. Works with any provider (OpenAI, Anthropic, Google, etc.).

## Installation

```bash
npm install ai-keyring
```

## Quick Start

```typescript
import { createKeyring } from 'ai-keyring';

// Note: createKeyring is not yet implemented. This shows the target API.
const keyring = createKeyring({
  keys: [
    { id: 'oai-1', key: process.env.OPENAI_KEY_1!, provider: 'openai' },
    { id: 'oai-2', key: process.env.OPENAI_KEY_2!, provider: 'openai' },
    { id: 'ant-1', key: process.env.ANTHROPIC_KEY!, provider: 'anthropic' },
  ],
  strategy: 'round-robin',
  defaultCooldownMs: 60_000,
});

// Get the next available key
const entry = keyring.getKey('openai');
// entry.key -> 'sk-...'

// Report usage after a successful request
keyring.reportUsage(entry.id, { tokens: 500, latencyMs: 120 });

// Report errors (429s trigger automatic cooldown)
try {
  // ... make API call
} catch (err) {
  keyring.reportError(entry.id, err);
}
```

## Available Exports

### Types

All TypeScript interfaces for key configuration, pool management, health checking, usage tracking, and the keyring instance:

```typescript
import type {
  KeyConfig, KeyEntry, RotationStrategy, PoolConfig,
  ThrowExhaustion, WaitExhaustion, FallbackExhaustion, PoolExhaustionConfig,
  HealthCheckResult, HealthCheckFn, HealthCheckConfig, HealthCheckReport,
  UsageReport, KeyStats, PoolState, KeyringStats,
  ExportedKeyringState, KeyringHooks, KeyringConfig, Keyring,
} from 'ai-keyring';
```

### Error Classes

```typescript
import { PoolExhaustedError } from 'ai-keyring';
import type { KeyState } from 'ai-keyring';
```

`PoolExhaustedError` is thrown when all keys in a pool are unavailable (in cooldown or disabled). It includes:
- `pool` - the pool name
- `keyStates` - per-key status details
- `shortestCooldownMs` - shortest remaining cooldown across all keys

### Rate Limit Detection

```typescript
import { isRateLimitError, extractRetryAfterMs } from 'ai-keyring';
```

#### `isRateLimitError(error: unknown): boolean`

Detects 429 rate-limit errors from any AI provider SDK. Checks multiple properties to handle different error shapes:

| Check | Detected Pattern |
|---|---|
| `error.status === 429` | OpenAI SDK, fetch responses |
| `error.statusCode === 429` | Various HTTP clients |
| `error.response.status === 429` | Axios-style errors |
| `error.code === 'rate_limited'` | Provider-specific codes |
| `error.type === 'rate_limit_error'` | Anthropic SDK |
| `error.message` contains "rate limit" | Last-resort detection |

```typescript
try {
  await openai.chat.completions.create({ /* ... */ });
} catch (err) {
  if (isRateLimitError(err)) {
    const cooldownMs = extractRetryAfterMs(err, 60_000);
    // Wait before retrying...
  }
}
```

#### `extractRetryAfterMs(error: unknown, defaultCooldownMs: number): number`

Extracts the `Retry-After` header value from an error and returns the cooldown duration in milliseconds. Checks multiple header locations and parses both integer-seconds and HTTP-date formats.

- Integer seconds (e.g., `"30"`) are converted to milliseconds (`30000`)
- HTTP dates are converted to a delta from now
- If the header is missing or unparseable, returns `defaultCooldownMs`

## License

MIT
