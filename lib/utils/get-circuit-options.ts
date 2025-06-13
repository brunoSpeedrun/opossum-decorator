import { UseCircuitBreakerOptions } from '../use-circuit-breaker-options';

export function getCircuitBreakerOptions<TArgs extends any[]>(
  thisArg: any,
  maybeOptions?: UseCircuitBreakerOptions<TArgs>,
) {
  if (typeof maybeOptions?.options === 'function') {
    const circuitOptions = maybeOptions.options.apply(thisArg);

    return { ...circuitOptions };
  }

  const circuitOptions = { ...maybeOptions?.options };

  return circuitOptions;
}
