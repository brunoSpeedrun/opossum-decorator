import { randomUUID } from 'node:crypto';

import CircuitBreaker from 'opossum';

import { UseCircuitBreakerOptions } from './use-circuit-breaker-options';
import { CircuitBreakerRegistry } from './circuit-breaker-registry';
import { getCircuitBreakerOptions, copyMethodMetadata } from './utils';

/**
 * Heavily inspired by NestJS CLS
 * https://github.com/Papooch/nestjs-cls
 */

/**
 * Wraps the decorated method in a CircuitBreaker.
 */
export function UseCircuitBreaker(): (
  target: any,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<(...args: any) => Promise<any>>,
) => void;

/**
 * Wraps the decorated method in a CircuitBreaker.
 *
 * @param options Circuit Breaker Options
 */
export function UseCircuitBreaker<TArgs extends any[]>(
  options: UseCircuitBreakerOptions<TArgs>,
): (
  target: any,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<(...args: TArgs) => Promise<any>>,
) => void;

export function UseCircuitBreaker<TArgs extends any[]>(
  maybeOptions?: UseCircuitBreakerOptions<TArgs>,
) {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: TArgs) => Promise<any>>,
  ) => {
    const original = descriptor.value;
    if (typeof original !== 'function') {
      throw new Error(
        `The @UseCircuitBreaker decorator can be only used on functions, but ${propertyKey.toString()} is not a function.`,
      );
    }

    const registry = CircuitBreakerRegistry.getInstance();

    descriptor.value = new Proxy(original, {
      apply: async function (_, outerThis, args: TArgs[]) {
        const thisCircuitOptions = getCircuitBreakerOptions(
          outerThis,
          maybeOptions,
        );
        const defaultUseCircuitBreakerOptions = registry.defaultOptions();
        const circuitOptions = {
          ...defaultUseCircuitBreakerOptions?.options,
          ...thisCircuitOptions,
        };

        const circuitGroup =
          circuitOptions.group ?? target.constructor?.name ?? randomUUID();
        const circuitName = circuitOptions.name ?? propertyKey.toString();

        const circuitFullName = `${circuitGroup}:${circuitName}`;

        const circuit = registry.get(circuitFullName);

        if (circuit) {
          return circuit.fire(...args);
        }

        circuitOptions.group = circuitOptions.group || circuitGroup;
        circuitOptions.name = circuitOptions.name || circuitName;

        const newCircuit = new CircuitBreaker(
          original.bind(outerThis),
          circuitOptions,
        );

        registry.register(circuitFullName, newCircuit);

        if (defaultUseCircuitBreakerOptions?.setup) {
          await defaultUseCircuitBreakerOptions.setup(newCircuit);
        }

        if (maybeOptions?.setup) {
          await maybeOptions.setup.apply(outerThis, [newCircuit]);
        }

        let fallback;

        if (
          maybeOptions?.fallbackMethod &&
          typeof outerThis[maybeOptions.fallbackMethod] === 'function'
        ) {
          fallback = outerThis[maybeOptions.fallbackMethod].bind(outerThis);
        }

        if (fallback) {
          newCircuit.fallback(fallback);
        }

        return newCircuit.fire.apply(newCircuit, args);
      },
    });
    copyMethodMetadata(original, descriptor.value);
  };
}
