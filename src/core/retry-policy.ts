export interface RetryPolicy {
  /**
   * Number of retries after the first attempt.
   *
   * @default 2
   */
  retries?: number;
  /**
   * Initial delay between attempts in milliseconds.
   *
   * @default 100
   */
  initialDelayMs?: number;
  /**
   * Maximum backoff delay in milliseconds.
   *
   * @default 1000
   */
  maxDelayMs?: number;
  /**
   * Exponential factor applied between attempts.
   *
   * @default 2
   */
  factor?: number;
  /**
   * When true, randomize the backoff delay to reduce stampedes.
   *
   * @default true
   */
  jitter?: boolean;
}

export interface NormalizedRetryPolicy {
  retries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: NormalizedRetryPolicy = {
  retries: 2,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  factor: 2,
  jitter: true,
};

export function normalizeRetryPolicy(
  policy: RetryPolicy | undefined,
): NormalizedRetryPolicy {
  return {
    retries: policy?.retries ?? DEFAULT_RETRY_POLICY.retries,
    initialDelayMs:
      policy?.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
    maxDelayMs: policy?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
    factor: policy?.factor ?? DEFAULT_RETRY_POLICY.factor,
    jitter: policy?.jitter ?? DEFAULT_RETRY_POLICY.jitter,
  };
}

export async function withRetry<T>(options: {
  policy: RetryPolicy | undefined;
  run: (attempt: number) => Promise<T>;
  shouldRetry: (error: unknown, attempt: number) => boolean;
}): Promise<T> {
  const policy = normalizeRetryPolicy(options.policy);
  let attempt = 0;

  while (true) {
    try {
      return await options.run(attempt);
    } catch (error) {
      const canRetry =
        attempt < policy.retries && options.shouldRetry(error, attempt);

      if (!canRetry) {
        throw error;
      }

      attempt += 1;
      const waitMs = computeDelay(policy, attempt);
      await sleep(waitMs);
    }
  }
}

function computeDelay(policy: NormalizedRetryPolicy, attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  const baseDelay = Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * policy.factor ** exponent,
  );

  if (!policy.jitter) {
    return baseDelay;
  }

  const minDelay = Math.max(0, baseDelay / 2);
  return Math.round(minDelay + Math.random() * (baseDelay - minDelay));
}

export async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
