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
    fallbackMethod: 'findManyByUserFallback',
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
const circuits = CircuitBreakerRegistry.getInstance().allCircuits();
```

# Return fallback when error is filtered

In some cases when the operation we wrap with CircuitBreaker fails, we don't want that error to count towards the `errorThresholdPercentage`. Opossum's CircuitBreaker supports a function called `errorFilter` that you can use to filter out errors. According to opossum:

```typescript
/**
* An optional function that will be called when the circuit's function fails (returns a rejected Promise).
* If this function returns truthy, the circuit's `failPure` statistics will not be incremented.
* This is useful, for example, when you don't want HTTP 404 to trip the circuit, but still want to handle it as a failure case.
*/
errorFilter?: ((err: any) => boolean) | undefined;
```


For example, consider the code snippet below, if the `findAuthorById` method returns some client error code (404 Not Found, for example), we don't want that error to count towards the `errorThresholdPercentage`, because the service is not unavailable. You can configure this with opossum-decorator like this:

```typescript
@UseCircuitBreaker({
    options: {
        errorFilter: (err: any, ...args) => {
            const statusCode = err.response?.status || 0;
            const isClientError = statusCode.toString().startsWith('4');
            return isClientError;
        },
    },
})
findAuthorById(id: number) {
    return axios.get(`https://example.com/wp-json/wp/v2/users/${id}`, {
        headers: {
            Authorization: 'Bearer <token>',
        },
    });
}
```

By default, when an error is filtered, the fallback is not returned. See opossum's `handleError` function.

```typescript
function handleError (error, circuit, timeout, args, latency, resolve, reject) {
  clearTimeout(timeout);

  if (circuit.options.errorFilter(error, ...args)) {
    // The error was filtered, so emit 'success'
    circuit.emit('success', error, latency);
  } else {
    // Error was not filtered, so emit 'failure'
    fail(circuit, error, args, latency);

    // Only call the fallback function if errorFilter doesn't succeed
    // If the fallback function succeeds, resolve
    const fb = fallback(circuit, error, args);
    if (fb) return resolve(fb);
  }

  // In all other cases, reject
  reject(error);
}
```

If you want to return fallback when an error is filtered, you can configure it as follows:

 ```typescript
 CircuitBreakerRegistry.getInstance().addDefaultOptions({ returnFallbackWhenErrorIsFiltered: true });
 ```
> Setting in `addDefaultOptions` will work for all CircuitBreaker's.

Or, if you prefer, enable this functionality, only in some cases.

```
export class WordpressService {
  async findPostBySlug(slug: string) {
    const { data } = await axios.get(
      `https://example.com/wp-json/wp/v2/posts?${slug}`,
    );

    if (data.length === 0) {
      throw new Error(`Post ${slug} not found.`);
    }

    const post = data[0];

    const author = await this.findAuthorById(post.author);

    return {
      ...post,
      author,
    };
  }

  @UseCircuitBreaker({
    options: {
      errorFilter: (err: any, ...args) => {
        const statusCode = err.response?.status || 0;
        const isClientError = statusCode.toString().startsWith('4');
        return isClientError;
      },
    },
    fallbackMethod: 'unknownAuthorFallback',
    returnFallbackWhenErrorIsFiltered: true,
  })
  findAuthorById(id: number) {
    return axios.get(`https://example.com/wp-json/wp/v2/users/${id}`, {
      headers: {
        Authorization: 'Bearer <token>',
      },
    });
  }

  unknownAuthorFallback() {
    return { name: 'Unknown' };
  }
}
```

> You must specify the fallback in the `fallbackMethod` option for this functionality to work correctly.

## <> with :heart: and [VSCode](https://code.visualstudio.com)
