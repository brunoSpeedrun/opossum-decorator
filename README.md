# opossum-decorator

A Decorator for opossum circuit breaker.

According to Chris Richardson, the circuit breaker pattern can be defined as:

> An RPI proxy that immediately rejects invocations for a timeout period after the number of consecutive failures exceeds a specified threshold.

RICHARDSON, Chris. Microservices Patterns, 2019, p. 78.

Opossum is a Node.js library that implements the Circuit Breaker pattern, and when using it you have to deal directly with the CircuitBreaker class, which can make it difficult to create tests and reuse code.

# Usage

Consider this code snippet:

```javascript
import axios from 'axios';
import CircuitBreaker from 'opossum';

export class GithubRepositoryService {
  private readonly circuitFindManyByUser: CircuitBreaker;
  private readonly circuitFindOneByUserAndRepositoryName: CircuitBreaker;

  constructor() {
    this.circuitFindManyByUser = new CircuitBreaker(
      (username) => axios.get(`https://api.github.com/users/${username}/repos`),
      {
        group: GithubRepositoryService.name,
        name: 'findManyByUser',
        timeout: 1000,
        errorThresholdPercentage: 50,
      },
    );

    this.circuitFindManyByUser.fallback(() => ({ data: [] }));

    this.circuitFindManyByUser = new CircuitBreaker(
      (username, repositoryName) =>
        axios.get(`https://api.github.com/repos/${username}/${repositoryName},`),
      {
        group: GithubRepositoryService.name,
        name: 'findOneByUserAndRepositoryName',
        timeout: 1000,
        errorThresholdPercentage: 50,
      },
    );

    this.circuitFindManyByUser.fallback(() => ({ data: {} }));
  }

  findManyByUser(username: string) {
    return this.circuitFindManyByUser.fire(username);
  }

  findOneByUserAndRepositoryName(username: string, repositoryName: string) {
    return this.circuitFindOneByUserAndRepositoryName.fire(
      username,
      repositoryName,
    );
  }
}
```
- Creating a unit test is difficult because you will have to mock the `CircuitBreaker` dependency.

- Difficulty in reusing the same config in other places (e.g.: `timeout`, `resetTimeout`, `errorThresholdPercentage`).

- The code starts to grow and a good part of it is just the `CircuitBreaker` configuration.

Now look at the same example using `opossum-decorator`.

First you can configure the default values ​​to be used in each `CircuitBreaker`.

```typescript
CircuitBreakerRegistry.getInstance().addDefaultOptions({
  options: {
    timeout: 1000,
    errorThresholdPercentage: 50,
  },
  async setup(circuit) {
    circuit.on('open', () => console.warn(`Circuit ${circuit.name} is open`));
    circuit.on('close', () =>
      console.warn(`Circuit ${circuit.name} is closed`),
    );
    circuit.on('halfOpen', () =>
      console.warn(`Circuit ${circuit.name} is halfOpen`),
    );
    circuit.on('failure', (error, latencyMs) =>
      console.warn(
        `Circuit ${circuit.name} fail: ${error.message}. LatencyMs: ${latencyMs}`,
      ),
    );
  },
});
```

> The CircuitBreaker's are created in a lazy way, that is, it will be created only when the method decorated with `UseCircuitBreaker` is called. You must call the `addDefaultOptions` method before any call to the method decorated with `UseCircuitBreaker`.

> The `setup` function defined here will be executed every time a new circuit breaker is created.

Now let's look at the `GithubRepositoryService` class.

```typescript
export class GithubRepositoryService {
  private readonly fallbackMessage = 'This is a fallback value';

  @UseCircuitBreaker({
    options: { errorThresholdPercentage: 70 },
    setup: async function (
      this: GithubRepositoryService,
      circuit: CircuitBreaker,
    ) {
      circuit.fallback(this.findManyByUserFallback.bind(this));
    },
  })
  findManyByUser(username: string) {
    return axios.get(`https://api.github.com/users/${username}/repos`);
  }

  @UseCircuitBreaker({
    setup: async function (circuit: CircuitBreaker) {
      circuit.fallback(() => ({ data: {}, isFallback: true }));
    },
  })
  findOneByUserAndRepositoryName(username: string, repositoryName: string) {
    return axios.get(
      `https://api.github.com/repos/${username}/${repositoryName}`,
    );
  }

  private findManyByUserFallback() {
    return { data: [], fallbackMessage: this.fallbackMessage };
  }
}
```

- You can override the default options using the `options` property.

- The `setup` function defined in `@UseCircuitBreaker` is executed every time a new circuit breaker is created, right after the `setup` defined in the global configuration.

> It is important to define the `setup` function as `function`, not arrow functions, so that the this context is properly bound.

- The `class` and `method` names are used by default for the CircuitBreaker `group` and `name` properties.


- You can use `@UseCircuitBreaker` without needing to pass any configuration.


If you need to get all the created circuit breakers, you can use the following method:

```typescript
const circuits = CircuitBreakerRegistry.getInstance().allCircuits()
```
