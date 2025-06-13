import CircuitBreaker from 'opossum';

export type UseCircuitBreakerOptions<T extends any[]> = {
  options?: CircuitBreaker.Options<T> | (() => CircuitBreaker.Options<T>);
  setup?: (circuit: CircuitBreaker, ...args: T) => Promise<void>;
};
