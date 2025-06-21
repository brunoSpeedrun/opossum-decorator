import CircuitBreaker from 'opossum';

export type UseCircuitBreakerOptions<T extends any[]> = {
  options?: CircuitBreaker.Options<T> | (() => CircuitBreaker.Options<T>);
  fallbackMethod?: string;
  returnFallbackWhenErrorIsFiltered?: boolean;
  setup?: (circuit: CircuitBreaker) => Promise<void>;
};
