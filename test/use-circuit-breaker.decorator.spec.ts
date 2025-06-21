import { randomUUID } from 'node:crypto';
import { CircuitBreakerRegistry, UseCircuitBreaker } from '../lib';
import CircuitBreaker from 'opossum';

describe('UseCircuitBreaker', () => {
  const registry = CircuitBreakerRegistry.getInstance();

  beforeEach(() => registry.addDefaultOptions({}));

  it('should copy all property metadata', () => {
    function Decorator1() {
      return (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
      ) => {
        Reflect.defineMetadata('decorator-1', 'decorator:1', descriptor.value);
      };
    }
    function Decorator2() {
      return (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
      ) => {
        Reflect.defineMetadata('decorator-2', 'decorator:2', descriptor.value);
      };
    }

    class CopyDecoratorMetadataTest {
      @UseCircuitBreaker()
      @Decorator1()
      @Decorator2()
      async action() {}
    }

    const metadataTest = new CopyDecoratorMetadataTest();
    const metadataKeys = Reflect.getMetadataKeys(metadataTest.action);

    expect(metadataKeys).toContain('decorator-1');
    expect(metadataKeys).toContain('decorator-2');
  });

  it('should throw an error when trying to use the decorator on a property that is not a function', () => {
    expect.assertions(1);

    class Service {
      call = '';
    }

    const service = new Service();

    try {
      UseCircuitBreaker()(
        Service,
        'call',
        Object.getOwnPropertyDescriptor(service, 'call') as any,
      );
    } catch (error: any) {
      expect(error.message).toContain(
        'The @UseCircuitBreaker decorator can be only used on functions',
      );
    }
  });

  describe('group and name', () => {
    it('should use method and class names as circuit breaker name and group', async () => {
      let fired = false;

      const circuit = new CircuitBreaker(async () => {});
      circuit.on('fire', () => (fired = true));

      registry.register('UseClassNameAsGroup:methodNameAsDefaultName', circuit);

      class UseClassNameAsGroup {
        @UseCircuitBreaker()
        async methodNameAsDefaultName() {}
      }

      await new UseClassNameAsGroup().methodNameAsDefaultName();

      expect(fired).toBe(true);
    });

    it('should use group from options as circuit breaker group', async () => {
      let fired = false;

      const circuit = new CircuitBreaker(async () => {}, {
        group: 'CircuitGroupFromOptions',
      });
      circuit.on('fire', () => (fired = true));

      registry.register(
        'CircuitGroupFromOptions:methodNameAsDefaultName',
        circuit,
      );

      class GroupFromOptions {
        @UseCircuitBreaker({
          options: {
            group: 'CircuitGroupFromOptions',
          },
        })
        async methodNameAsDefaultName() {}
      }

      await new GroupFromOptions().methodNameAsDefaultName();

      expect(fired).toBe(true);
    });

    it('should use name from options as circuit breaker name', async () => {
      let fired = false;

      const circuit = new CircuitBreaker(async () => {}, {
        name: 'nameFromOptions',
      });
      circuit.on('fire', () => (fired = true));

      registry.register('GroupFromClassName:nameFromOptions', circuit);

      class GroupFromClassName {
        @UseCircuitBreaker({
          options: {
            name: 'nameFromOptions',
          },
        })
        async action() {}
      }

      await new GroupFromClassName().action();

      expect(fired).toBe(true);
    });
  });

  describe('register circuit breaker', () => {
    it('should create new circuit breaker', async () => {
      const name = randomUUID();

      class Service {
        @UseCircuitBreaker({ options: { name } })
        async call() {
          return 'from-class-method';
        }
      }

      await new Service().call();

      const circuitRef = registry.get(`Service:${name}`);

      expect(circuitRef).toBeDefined();
    });

    it('should get circuit breaker options from function', async () => {
      class Service {
        readonly circuitGroup = 'ServiceGroup';
        readonly circuitName = 'ServiceCall';

        @UseCircuitBreaker({
          options: function (this: Service) {
            return {
              group: this.circuitGroup,
              name: this.circuitName,
            };
          },
        })
        async call() {
          return 'from-class-method';
        }
      }

      const service = new Service();

      await service.call();

      const circuitRef = registry.get(
        `${service.circuitGroup}:${service.circuitName}`,
      );

      expect(circuitRef).toBeDefined();
    });

    it('should call setup hook', async () => {
      const name = randomUUID();
      let fired = false;

      class Service {
        circuitRef?: CircuitBreaker;

        @UseCircuitBreaker({
          options: { name },
          setup: async function (this: Service, circuit: CircuitBreaker) {
            this.circuitRef = circuit;

            circuit.on('fire', () => (fired = true));
          },
        })
        async call() {
          return 'from-class-method';
        }
      }

      const service = new Service();

      await service.call();

      expect(fired).toBe(true);
      expect(service.circuitRef).toBeDefined();
      expect(service.circuitRef).toBe(registry.get(`Service:${name}`));
    });
  });

  describe('default options', () => {
    it('should call setup hook from default options', async () => {
      let fired = false;
      let setupCount = 0;
      const name = randomUUID();

      registry.addDefaultOptions({
        setup: async (circuit) => {
          setupCount++;
          circuit.on('fire', () => (fired = true));
        },
      });

      class Service {
        @UseCircuitBreaker({ options: { name } })
        async call() {
          return 'from-class-method';
        }
      }

      const service = new Service();

      await service.call();
      await service.call();

      expect(fired).toBe(true);
      expect(setupCount).toBe(1);
    });

    it('should override default options', async () => {
      expect.assertions(2);

      registry.addDefaultOptions({
        options: {
          timeout: 1000,
        },
      });

      const group = randomUUID();
      let timeoutReached = false;

      class Service {
        @UseCircuitBreaker({
          options: { group, timeout: 500 },
          setup: async function (circuit) {
            circuit.on('timeout', () => (timeoutReached = true));
          },
        })
        call() {
          return new Promise((resolve) => setTimeout(resolve, 800));
        }
      }

      const service = new Service();

      try {
        await service.call();
      } catch (error: any) {
        expect(error.message).toContain('Timed out after');
        expect(timeoutReached).toBe(true);
      }
    });
  });

  describe('CircuitBreaker', () => {
    it('should use cache from default options', async () => {
      const inMemoryCache = {
        data: new Map<string, any>(),
        flush() {
          this.data.clear();
        },
        get(key: string) {
          return this.data.get(key);
        },
        set(key, value) {
          this.data.set(key, value);
        },
      };

      registry.addDefaultOptions({
        options: {
          cache: true,
          cacheTransport: inMemoryCache,
        },
        setup: async (circuit) => {
          circuit.on('cacheMiss', () => (cacheMiss = true));
          circuit.on('cacheHit', () => (cacheHit = true));
        },
      });

      const id = randomUUID();
      let cacheMiss = false;
      let cacheHit = false;

      class Service {
        @UseCircuitBreaker({
          options: { name: id, cacheGetKey: (id) => `service:${id}` },
        })
        async call(id: number) {
          return {
            id,
            name: `User ${id}`,
          };
        }
      }

      const service = new Service();

      await service.call(1);
      await service.call(1);
      await service.call(2);

      expect(cacheHit).toBe(true);
      expect(cacheMiss).toBe(true);
      expect(inMemoryCache.data.size).toBe(2);
      expect(inMemoryCache.data.get(`service:1`)).toBeDefined();
      expect(inMemoryCache.data.get(`service:2`)).toBeDefined();
    });

    it('should return from fallback', async () => {
      const name = randomUUID();
      let fallbackCalled = false;

      class Service {
        readonly fallbackValue = 'fallback-value';

        @UseCircuitBreaker({
          options: { name },
          setup: async function (this: Service, circuit: CircuitBreaker) {
            circuit.fallback(this.fallback.bind(this));
            circuit.on('fallback', () => (fallbackCalled = true));
          },
        })
        async call(): Promise<string> {
          throw new Error('Service Unavailable');
        }

        fallback() {
          return this.fallbackValue;
        }
      }

      const service = new Service();

      const value = await service.call();

      expect(value).toBe(service.fallbackValue);
      expect(fallbackCalled).toBe(true);
    });

    it('should use fallbackMethod option', async () => {
      const name = randomUUID();
      let fallbackCalled = false;

      class Service {
        readonly fallbackValue = 'fallback-value';

        @UseCircuitBreaker({
          options: { name },
          fallbackMethod: 'fallback',
          setup: async function (this: Service, circuit: CircuitBreaker) {
            circuit.on('fallback', () => (fallbackCalled = true));
          },
        })
        async call(): Promise<string> {
          throw new Error('Service Unavailable');
        }

        fallback() {
          return this.fallbackValue;
        }
      }

      const service = new Service();

      const value = await service.call();

      expect(value).toBe(service.fallbackValue);
      expect(fallbackCalled).toBe(true);
    });

    it('should return fallback when error is filtered using default options', async () => {
      const name = randomUUID();

      registry.addDefaultOptions({ returnFallbackWhenErrorIsFiltered: true });

      class Service {
        readonly fallbackValue = 'fallback-value';

        @UseCircuitBreaker({
          options: {
            name,
            errorFilter: (error) => error.message === 'Not Found',
          },
          fallbackMethod: 'fallback',
        })
        async call(): Promise<string> {
          throw new Error('Not Found');
        }

        fallback() {
          return this.fallbackValue;
        }
      }

      const service = new Service();

      const value = await service.call();

      expect(value).toBe(service.fallbackValue);
    });

    it('should return fallback when error is filtered using UseCircuitBreakerOptions', async () => {
      const name = randomUUID();

      registry.addDefaultOptions({ returnFallbackWhenErrorIsFiltered: false });

      class Service {
        readonly fallbackValue = 'fallback-value';

        @UseCircuitBreaker({
          options: {
            name,
            errorFilter: (error) => error.message === 'Not Found',
          },
          fallbackMethod: 'fallback',
          returnFallbackWhenErrorIsFiltered: true,
        })
        async call(): Promise<string> {
          throw new Error('Not Found');
        }

        fallback() {
          return this.fallbackValue;
        }
      }

      const service = new Service();

      const value = await service.call();

      expect(value).toBe(service.fallbackValue);
    });
  });
});
