// Feature: webrtc-retry-and-geolocation-sync, Property 1: Non-throttle errors propagate immediately without retrying
// Validates: Requirements 1.5

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { withRetry, isThrottle } from '../App';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an error that isThrottle() returns false for. */
function makeNonThrottleError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates an error whose name and message are guaranteed NOT to trigger
 * the isThrottle predicate:
 *   - name !== 'LimitExceededException'
 *   - message does not contain 'throttle' or 'limit exceeded' (case-sensitive)
 *   - no $metadata.httpStatusCode === 429
 */
const nonThrottleErrorArb = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 40 }).filter(
      (s) => s !== 'LimitExceededException'
    ),
    message: fc.string({ minLength: 0, maxLength: 80 }).filter(
      (s) => !s.includes('throttle') && !s.includes('limit exceeded')
    ),
  })
  .map(({ name, message }) => makeNonThrottleError(name, message));

/** Random retry count in [0, 5] */
const retriesArb = fc.integer({ min: 0, max: 5 });

/** Random base delay in [1, 500] ms */
const delayMsArb = fc.integer({ min: 1, max: 500 });

/** No-op delay injected in tests so withRetry's backoff resolves instantly. */
const noopDelay = () => Promise.resolve();

// ---------------------------------------------------------------------------
// Property 1 — Non-throttle errors propagate immediately without retrying
// ---------------------------------------------------------------------------

describe('withRetry – Property 1', () => {
  it(
    'invokes the thunk exactly once, never calls onRetry, and re-throws the same error ' +
      'for any non-throttle error, retry count, and base delay',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          nonThrottleErrorArb,
          retriesArb,
          delayMsArb,
          async (error, retries, delayMs) => {
            // Sanity-check: confirm our generated error is indeed non-throttle
            expect(isThrottle(error)).toBe(false);

            let callCount = 0;
            const onRetry = vi.fn();

            // Throw synchronously so no floating rejected Promise is created —
            // withRetry's try/catch catches it immediately. Non-throttle errors
            // propagate on the first call so no delay is ever reached; passing
            // the no-op delay is defensive but harmless.
            const thunk = () => { callCount++; throw error; };

            await expect(
              withRetry(thunk, retries, delayMs, onRetry, noopDelay)
            ).rejects.toThrow(error.message);

            // Thunk invoked exactly once
            expect(callCount).toBe(1);

            // onRetry never called
            expect(onRetry).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it('re-throws the identical error object reference for a non-throttle error', async () => {
    await fc.assert(
      fc.asyncProperty(nonThrottleErrorArb, retriesArb, delayMsArb, async (error, retries, delayMs) => {
        const thunk = () => { throw error; };
        let caught: unknown;
        try {
          await withRetry(thunk, retries, delayMs, undefined, noopDelay);
        } catch (e) {
          caught = e;
        }
        // Same reference, not just same message
        expect(caught).toBe(error);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: webrtc-retry-and-geolocation-sync, Property 2: Throttle-only thunk retries exactly N times then throws
// Validates: Requirements 1.2

// ---------------------------------------------------------------------------
// Property 2 — Throttle-only thunk retries exactly N times then throws
// ---------------------------------------------------------------------------

describe('withRetry – Property 2', () => {
  it(
    'invokes the thunk exactly retries+1 times and re-throws the throttle error ' +
      'for any throttle error variant, retry count, and base delay',
    async () => {
      /**
       * Represent each throttle-error variant as a numeric discriminant so we
       * construct a *fresh* Error object inside the property (never shared
       * across iterations).
       */
      type ThrottleVariant = 0 | 1 | 2 | 3;
      const makeThrottleErr = (variant: ThrottleVariant): Error => {
        switch (variant) {
          case 0: return Object.assign(new Error('rate limited'), { name: 'LimitExceededException' });
          case 1: return new Error('Request throttle exceeded');
          case 2: return new Error('limit exceeded on resource');
          case 3: return Object.assign(new Error('Too many requests'), { $metadata: { httpStatusCode: 429 } });
        }
      };

      const throttleVariantArb = fc.integer({ min: 0, max: 3 }) as fc.Arbitrary<ThrottleVariant>;

      await fc.assert(
        fc.asyncProperty(
          throttleVariantArb,
          retriesArb,
          delayMsArb,
          async (variant, retries, delayMs) => {
            // Fresh error object per iteration
            const throttleError = makeThrottleErr(variant);

            // Sanity-check: all variants must be detected as throttle errors
            expect(isThrottle(throttleError)).toBe(true);

            let callCount = 0;
            // Throw synchronously — withRetry's try/catch catches it immediately.
            // No-op delay injected so the backoff resolves without any real wait.
            const thunk = () => { callCount++; throw throttleError; };

            await expect(
              withRetry(thunk, retries, delayMs, undefined, noopDelay)
            ).rejects.toThrow(throttleError.message);

            // Thunk must be called exactly retries + 1 times (initial + N retries)
            expect(callCount).toBe(retries + 1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it('re-throws the identical throttle error object reference after exhausting retries', async () => {
    await fc.assert(
      fc.asyncProperty(retriesArb, delayMsArb, async (retries, delayMs) => {
        // Fresh per iteration
        const throttleError = Object.assign(new Error('limit exceeded on resource'), {
          name: 'LimitExceededException',
        });

        const thunk = () => { throw throttleError; };

        let caught: unknown;
        try {
          await withRetry(thunk, retries, delayMs, undefined, noopDelay);
        } catch (e) {
          caught = e;
        }
        // Same reference, not just same message
        expect(caught).toBe(throttleError);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: webrtc-retry-and-geolocation-sync, Property 3: Throttle-then-success thunk returns the result after k retries
// Validates: Requirements 1.2

// ---------------------------------------------------------------------------
// Property 3 — Throttle-then-success thunk returns the result after k retries
// ---------------------------------------------------------------------------

describe('withRetry – Property 3', () => {
  it(
    'returns the resolved value after exactly k throttle failures, for any k in [0, retries], ' +
      'retry count, base delay, and success value',
    async () => {
      /**
       * Throttle variant discriminant — same as Property 2 so each iteration
       * gets a fresh, valid throttle-error object.
       */
      type ThrottleVariant = 0 | 1 | 2 | 3;
      const makeThrottleErr = (variant: ThrottleVariant): Error => {
        switch (variant) {
          case 0: return Object.assign(new Error('rate limited'), { name: 'LimitExceededException' });
          case 1: return new Error('Request throttle exceeded');
          case 2: return new Error('limit exceeded on resource');
          case 3: return Object.assign(new Error('Too many requests'), { $metadata: { httpStatusCode: 429 } });
        }
      };

      const throttleVariantArb = fc.integer({ min: 0, max: 3 }) as fc.Arbitrary<ThrottleVariant>;

      /** retries in [0, 5] */
      const retriesArb2 = fc.integer({ min: 0, max: 5 });

      await fc.assert(
        fc.asyncProperty(
          throttleVariantArb,
          retriesArb2,
          // k is the number of throttle failures before the thunk succeeds;
          // constrained to [0, retries] so the thunk always gets a chance to succeed.
          fc.integer({ min: 0, max: 5 }).chain((retries) =>
            fc.tuple(
              fc.constant(retries),
              fc.integer({ min: 0, max: retries })
            )
          ),
          // Arbitrary success value (non-null, non-undefined string to keep assertions simple)
          fc.string({ minLength: 1, maxLength: 40 }),
          delayMsArb,
          async (variant, _retries, [retries, k], successValue, delayMs) => {
            const throttleError = makeThrottleErr(variant);

            // Sanity-checks
            expect(isThrottle(throttleError)).toBe(true);
            expect(k).toBeGreaterThanOrEqual(0);
            expect(k).toBeLessThanOrEqual(retries);

            let callCount = 0;

            /**
             * Thunk: throws throttleError for the first k calls,
             * then resolves with successValue on call k+1.
             */
            const thunk = (): Promise<string> => {
              callCount++;
              if (callCount <= k) {
                throw throttleError;
              }
              return Promise.resolve(successValue);
            };

            const result = await withRetry(thunk, retries, delayMs, undefined, noopDelay);

            // The resolved value must be exactly what the thunk returned
            expect(result).toBe(successValue);

            // The thunk was invoked exactly k+1 times (k failures + 1 success)
            expect(callCount).toBe(k + 1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it('returns immediately with the correct value when k = 0 (no throttle failures)', async () => {
    await fc.assert(
      fc.asyncProperty(
        retriesArb,
        delayMsArb,
        fc.string({ minLength: 1, maxLength: 40 }),
        async (retries, delayMs, successValue) => {
          let callCount = 0;
          const onRetry = vi.fn();

          // Thunk succeeds immediately — no throttle errors at all
          const thunk = (): Promise<string> => {
            callCount++;
            return Promise.resolve(successValue);
          };

          const result = await withRetry(thunk, retries, delayMs, onRetry, noopDelay);

          expect(result).toBe(successValue);
          // Called exactly once
          expect(callCount).toBe(1);
          // onRetry never called when there are no failures
          expect(onRetry).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: webrtc-retry-and-geolocation-sync, Property 4: onRetry callback receives correct attempt, wait, and error
// Validates: Requirements 1.3, 1.4

// ---------------------------------------------------------------------------
// Property 4 — onRetry receives correct attempt, wait, and error
// ---------------------------------------------------------------------------

describe('withRetry – Property 4', () => {
  it(
    'calls onRetry exactly k times, where the i-th call (1-based) receives ' +
      'attempt = i, waitMs = delayMs * 2^(i-1), and the err thrown on that attempt',
    async () => {
      type ThrottleVariant = 0 | 1 | 2 | 3;
      const makeThrottleErr = (variant: ThrottleVariant, tag: number): Error => {
        // Tag each error with a unique message so we can assert the correct
        // error object is forwarded to the onRetry callback.
        switch (variant) {
          case 0: return Object.assign(new Error(`rate limited #${tag}`), { name: 'LimitExceededException' });
          case 1: return new Error(`Request throttle exceeded #${tag}`);
          case 2: return new Error(`limit exceeded on resource #${tag}`);
          case 3: return Object.assign(new Error(`Too many requests #${tag}`), { $metadata: { httpStatusCode: 429 } });
        }
      };

      const throttleVariantArb = fc.integer({ min: 0, max: 3 }) as fc.Arbitrary<ThrottleVariant>;

      await fc.assert(
        fc.asyncProperty(
          throttleVariantArb,
          // retries in [1, 5] — at least 1 so k can be >= 1
          fc.integer({ min: 1, max: 5 }),
          // k in [1, retries] — at least 1 throttle failure so onRetry is called at least once
          fc.integer({ min: 1, max: 5 }).chain((retries) =>
            fc.tuple(
              fc.constant(retries),
              fc.integer({ min: 1, max: retries })
            )
          ),
          // base delay in [1, 500] ms
          fc.integer({ min: 1, max: 500 }),
          // arbitrary success value
          fc.string({ minLength: 1, maxLength: 40 }),
          async (variant, _retries, [retries, k], delayMs, successValue) => {
            // Sanity-checks
            expect(k).toBeGreaterThanOrEqual(1);
            expect(k).toBeLessThanOrEqual(retries);

            // Build k distinct throttle errors — one per failing attempt so we
            // can verify the exact error object forwarded to the callback.
            const throttleErrors: Error[] = Array.from({ length: k }, (_, i) =>
              makeThrottleErr(variant, i)
            );

            // All generated errors must be detected as throttle errors
            for (const e of throttleErrors) {
              expect(isThrottle(e)).toBe(true);
            }

            let callCount = 0;

            /**
             * Thunk: throws throttleErrors[callCount-1] for the first k calls,
             * then resolves with successValue on call k+1.
             * Using synchronous throw so withRetry's try/catch catches it immediately.
             */
            const thunk = (): Promise<string> => {
              const attempt = ++callCount;
              if (attempt <= k) {
                throw throttleErrors[attempt - 1];
              }
              return Promise.resolve(successValue);
            };

            // Collect every onRetry invocation in order
            const onRetryCalls: Array<{ attempt: number; waitMs: number; err: any }> = [];
            const onRetry = (attempt: number, waitMs: number, err: any) => {
              onRetryCalls.push({ attempt, waitMs, err });
            };

            const result = await withRetry(thunk, retries, delayMs, onRetry, noopDelay);

            // The thunk eventually resolves
            expect(result).toBe(successValue);

            // onRetry was called exactly k times (one per throttle failure)
            expect(onRetryCalls).toHaveLength(k);

            // Verify each call's arguments
            for (let i = 0; i < k; i++) {
              const call = onRetryCalls[i];
              const expectedAttempt = i + 1;                             // 1-based
              const expectedWaitMs = delayMs * Math.pow(2, i);           // delayMs * 2^(i) where i is 0-based → same as delayMs * 2^(attempt-1)
              const expectedErr = throttleErrors[i];

              // attempt must be 1-based sequential
              expect(call.attempt).toBe(expectedAttempt);

              // waitMs must follow exponential backoff formula
              expect(call.waitMs).toBe(expectedWaitMs);

              // err must be the exact error thrown on that attempt
              expect(call.err).toBe(expectedErr);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it('never calls onRetry when k = 0 (thunk succeeds immediately)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),   // retries
        fc.integer({ min: 1, max: 500 }), // delayMs
        fc.string({ minLength: 1, maxLength: 40 }), // success value
        async (retries, delayMs, successValue) => {
          const onRetry = vi.fn();
          const thunk = () => Promise.resolve(successValue);

          const result = await withRetry(thunk, retries, delayMs, onRetry, noopDelay);

          expect(result).toBe(successValue);
          expect(onRetry).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('onRetry receives waitMs = delayMs * 2^(i-1) for each 1-based attempt i', async () => {
    // Deterministic spot-check with fixed inputs to make the backoff formula crystal clear
    const delayMs = 100;
    const retries = 3;
    const throttleErr = Object.assign(new Error('limit exceeded on resource'), { name: 'LimitExceededException' });

    let call = 0;
    const thunk = (): Promise<string> => {
      call++;
      if (call <= 3) throw throttleErr; // fail 3 times, succeed on 4th
      return Promise.resolve('ok');
    };

    const calls: Array<{ attempt: number; waitMs: number }> = [];
    await withRetry(thunk, retries, delayMs, (attempt, waitMs) => {
      calls.push({ attempt, waitMs });
    }, noopDelay);

    // attempt=1 → 100 * 2^0 = 100ms
    expect(calls[0]).toEqual({ attempt: 1, waitMs: 100 });
    // attempt=2 → 100 * 2^1 = 200ms
    expect(calls[1]).toEqual({ attempt: 2, waitMs: 200 });
    // attempt=3 → 100 * 2^2 = 400ms
    expect(calls[2]).toEqual({ attempt: 3, waitMs: 400 });
  });
});
