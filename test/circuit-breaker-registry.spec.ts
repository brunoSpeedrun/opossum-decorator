import CircuitBreaker from 'opossum';

import { CircuitBreakerRegistry } from '../lib';
import { randomUUID } from 'crypto';

describe('CircuitBreakerRegistry', () => {
  it('should be singleton', () => {
    const registryOne = CircuitBreakerRegistry.getInstance();
    const registryTwo = CircuitBreakerRegistry.getInstance();

    expect(registryOne).toBeDefined();
    expect(registryTwo).toBeDefined();
    expect(registryOne).toBe(registryTwo);
  });

  test.each([
    {
      circuitName: null,
      circuit: new CircuitBreaker(async () => 'operation'),
      label: 'Circuit name is null',
      errorMessage: /Invalid circuit name./,
    },
    {
      circuitName: undefined,
      circuit: new CircuitBreaker(async () => 'operation'),
      label: 'Circuit name is undefined',
      errorMessage: /Invalid circuit name./,
    },
    {
      circuitName: '',
      circuit: new CircuitBreaker(async () => 'operation'),
      label: 'Circuit name is blank',
      errorMessage: /Invalid circuit name./,
    },
    {
      circuitName: 'circuit-invalid',
      circuit: null,
      label: 'Circuit is null',
      errorMessage: /Invalid circuit./,
    },
    {
      circuitName: 'circuit-invalid',
      circuit: undefined,
      label: 'Circuit is undefined',
      errorMessage: /Invalid circuit./,
    },
    {
      circuitName: 'circuit-invalid',
      circuit: { fire() {} },
      label: 'Circuit is not instance of CircuitBreaker',
      errorMessage: /Invalid circuit./,
    },
  ])(
    'should not register circuit - $label',
    ({ circuitName, circuit, errorMessage }) => {
      expect(() =>
        CircuitBreakerRegistry.getInstance().register(
          circuitName as any,
          circuit as any,
        ),
      ).toThrow(errorMessage);
    },
  );

  it('should not register circuit when already exists registered', () => {
    const circuitName = randomUUID();
    const circuitOne = new CircuitBreaker(async () => 'operation:circuit-one');
    const circuitTwo = new CircuitBreaker(async () => 'operation:circuit-two');

    CircuitBreakerRegistry.getInstance().register(circuitName, circuitOne);

    expect(() =>
      CircuitBreakerRegistry.getInstance().register(circuitName, circuitTwo),
    ).toThrow(
      new RegExp(`A circuit with a name ${circuitName} is already registered`),
    );
  });

  it('should register circuit successfully', () => {
    const circuitName = randomUUID();
    const circuit = new CircuitBreaker(async () => 'operation');

    CircuitBreakerRegistry.getInstance().register(circuitName, circuit);

    expect(CircuitBreakerRegistry.getInstance().get(circuitName)).toBe(circuit);
  });

  it('should get all circuits', () => {
    const circuitNames = [randomUUID(), randomUUID()];
    circuitNames.forEach((id) =>
      CircuitBreakerRegistry.getInstance().register(
        id,
        new CircuitBreaker(async () => `circuit:${id}`),
      ),
    );

    const circuits = CircuitBreakerRegistry.getInstance().allCircuits();

    expect(circuits).toBeInstanceOf(Array);
    circuitNames.forEach((id) =>
      expect(circuits.some((c) => c.name === id)).toBe(true),
    );
  });

  it('should add default circuit breaker options', () => {
    const useCircuitBreakerOptions = {
      options: {
        allowWarmUp: true,
        timeout: 5000,
        errorThresholdPercentage: 50,
      },
    };

    CircuitBreakerRegistry.getInstance().addDefaultOptions(
      useCircuitBreakerOptions,
    );

    expect(CircuitBreakerRegistry.getInstance().defaultOptions()).not.toBe(
      useCircuitBreakerOptions,
    );
    expect(CircuitBreakerRegistry.getInstance().defaultOptions()).toStrictEqual(
      useCircuitBreakerOptions,
    );
  });
});
