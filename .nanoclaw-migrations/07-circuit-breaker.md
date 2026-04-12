# Circuit Breaker

**Intent:** Prevent cascading errors from locking up the system. After 15 errors within 5 minutes for a group, the circuit breaker trips and blocks further processing for 1 hour. Sends a Telegram alert to the admin.

## Files

- `src/group-queue.ts` — MODIFIED

## How to Apply

### 1. Add constants at top of group-queue.ts

```typescript
const CIRCUIT_BREAKER_THRESHOLD = 15;
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000;  // 5 minutes
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 60 * 1000;  // 1 hour
const CIRCUIT_BREAKER_ALERT_CHAT_ID = '8164655724';  // Oliver's Telegram chat ID
```

### 2. Extend per-group state

In the group state object (wherever active groups are tracked), add:

```typescript
circuitBreakerErrors: number;        // error count in current window
circuitBreakerFirstError: number | null;  // timestamp of first error in window
circuitBreakerTrippedAt: number | null;   // timestamp when breaker tripped
```

### 3. Add circuit breaker check

At the start of `enqueueMessageCheck()` and any task queueing method:

```typescript
const state = this.groups.get(groupJid);
if (state?.circuitBreakerTrippedAt) {
  const elapsed = Date.now() - state.circuitBreakerTrippedAt;
  if (elapsed < CIRCUIT_BREAKER_COOLDOWN_MS) {
    logger.warn({ groupJid, remainingMs: CIRCUIT_BREAKER_COOLDOWN_MS - elapsed },
      'Circuit breaker active, dropping message');
    return;
  }
  // Cooldown expired, reset
  state.circuitBreakerTrippedAt = null;
  state.circuitBreakerErrors = 0;
  state.circuitBreakerFirstError = null;
}
```

### 4. Record errors and trip breaker

On processing error (in the error handler after `processGroupMessages` returns false):

```typescript
const now = Date.now();
if (!state.circuitBreakerFirstError ||
    now - state.circuitBreakerFirstError > CIRCUIT_BREAKER_WINDOW_MS) {
  // Reset window
  state.circuitBreakerErrors = 1;
  state.circuitBreakerFirstError = now;
} else {
  state.circuitBreakerErrors++;
}

if (state.circuitBreakerErrors >= CIRCUIT_BREAKER_THRESHOLD) {
  state.circuitBreakerTrippedAt = now;
  logger.error({ groupJid, errors: state.circuitBreakerErrors },
    'Circuit breaker tripped');
  // Send Telegram alert
  sendCircuitBreakerAlert(groupJid, state.circuitBreakerErrors);
}
```

### 5. Telegram alert function

```typescript
function sendCircuitBreakerAlert(groupJid: string, errors: number): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const windowMin = Math.round(CIRCUIT_BREAKER_WINDOW_MS / 60000);
  const cooldownMin = Math.round(CIRCUIT_BREAKER_COOLDOWN_MS / 60000);
  const text = `\u26a0\ufe0f CIRCUIT BREAKER: Gruppe ${groupJid} nach ${errors} Fehlern in ${windowMin} Min gesperrt. Automatische Entsperrung in ${cooldownMin} Min.`;
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CIRCUIT_BREAKER_ALERT_CHAT_ID,
      text,
    }),
  }).catch(() => {});
}
```

### 6. Reset on success

When a message is processed successfully:

```typescript
state.circuitBreakerErrors = 0;
state.circuitBreakerFirstError = null;
```
