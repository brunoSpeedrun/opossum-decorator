import CircuitBreaker from 'opossum';

export type DefaultUseCircuitBreakerOptions<T extends any[]> = {
  options?: Omit<CircuitBreaker.Options<T>, 'group' | 'name'>;
  setup?: (circuit: CircuitBreaker) => Promise<void>;
  returnFallbackWhenErrorIsFiltered?: boolean;
};

const INSTANCE = Symbol('INSTANCE');
const REGISTRY = Symbol('REGISTRY');
const DEFAULT_OPTIONS = Symbol('DEFAULT_OPTIONS');

export class CircuitBreakerRegistry {
  private readonly [REGISTRY]: Map<string, CircuitBreaker>;
  private [DEFAULT_OPTIONS]?: DefaultUseCircuitBreakerOptions<any>;

  constructor() {
    this[REGISTRY] = new Map();
    this[DEFAULT_OPTIONS] = {};
  }

  register(name: string, circuit: CircuitBreaker) {
    if (!name) {
      throw new Error(
        "Invalid circuit name. Circuit's name must be a string and cannot be null, undefined or blank",
      );
    }

    if (!(circuit instanceof CircuitBreaker)) {
      throw new Error(
        'Invalid circuit. Circuit cannot be null or undefined and must be instance of CircuitBreaker',
      );
    }

    if (this[REGISTRY].has(name)) {
      throw new Error(
        `Invalid circuit name. A circuit with a name ${name} is already registered`,
      );
    }

    this[REGISTRY].set(name, circuit);
  }

  get(name: string) {
    return this[REGISTRY].get(name);
  }

  allCircuits(): Array<{ name: string; circuit: CircuitBreaker }> {
    return Array.from(this[REGISTRY].entries()).map(([name, circuit]) => ({
      name,
      circuit,
    }));
  }

  addDefaultOptions(options: DefaultUseCircuitBreakerOptions<any>) {
    this[DEFAULT_OPTIONS] = { ...options };
  }

  defaultOptions() {
    return { ...this[DEFAULT_OPTIONS] };
  }

  private static [INSTANCE]: CircuitBreakerRegistry;

  static getInstance() {
    if (!this[INSTANCE]) {
      this[INSTANCE] = new CircuitBreakerRegistry();
    }

    return this[INSTANCE];
  }
}
