# SSR and Hydration

## Purpose

Server rendering improves first content, metadata, and progressive behavior. Hydration connects browser behavior to server-rendered markup. The challenge is making the server and browser agree on the first render while keeping identity and cache boundaries safe.

## 1. Rendering modes

### React Server Component

Use for server-only data access and static composition that does not need browser state or event handlers.

### Server-rendered client component

A client component can be rendered on the server and then hydrated. Its initial output must be deterministic.

### Client-only component

Use for APIs that do not exist on the server:

- media element;
- HLS.js;
- fullscreen;
- browser storage;
- network information;
- certain observers.

Client-only does not mean the entire page should wait for JavaScript.

## 2. Hydration mismatch sources

### Time

Server and browser can render different seconds or time zones.

Bad:

```tsx
<span>{new Date().toLocaleString()}</span>
```

Better: pass one serialized value and one explicit locale/time-zone policy, or render the value only after hydration when it is nonessential.

### Randomness

Do not generate random IDs in render. Use stable React IDs or server-provided identifiers.

### Browser storage

Volume or caption preference from local storage should not alter server markup before hydration. Start from a deterministic default, then apply preference in an effect or client-only player boundary.

### Viewport

Do not render structurally different markup from `window.innerWidth` during the first client render. Use CSS for responsive layout or a stable server strategy.

### Authentication drift

The server identity snapshot and browser session can change between response and hydration. Treat the server snapshot as initial state, then revalidate through an explicit transition.

### Data formatting

Server and browser ICU data or locale can differ. Make locale explicit and test deployment runtimes.

## 3. Apollo SSR flow

Conceptual flow:

```text
server request
→ create request-scoped Apollo client
→ execute trusted operations
→ normalize cache
→ render
→ extract filtered cache snapshot
→ serialize safely
→ browser creates Apollo client
→ restore snapshot
→ hydrate
```

Never reuse a server Apollo client across requests.

Filter or avoid server-only fields before serialization.

## 4. Cache identity

Apollo normalization depends on stable type and ID.

Define type policies:

```ts
const cache = new InMemoryCache({
  typePolicies: {
    Title: {
      keyFields: ["id"]
    },
    Query: {
      fields: {
        titles: {
          keyArgs: ["filter", "sort"],
          merge(existing, incoming) {
            return mergeConnection(existing, incoming)
          }
        }
      }
    }
  }
})
```

Profile-scoped fields must include profile identity in cache keys or return viewer-specific wrapper objects.

## 5. Fetch policies

Choose from behavior:

- `cache-first` for stable hydrated title data;
- `cache-and-network` for bounded freshness when visual transitions are acceptable;
- `network-only` for critical current state;
- `no-cache` for data that must not persist in client cache.

A policy is not a substitute for invalidation and versioning.

## 6. Streaming and partial UI

Next.js can stream server-rendered boundaries. Use it to reveal stable shell and public content while slower optional sections resolve.

Do not create a waterfall where:

```text
server waits for profile
→ waits for discovery
→ waits for engagement
→ returns all HTML
```

Parallelize independent operations and place optional sections behind clear boundaries.

## 7. Error handling

Differentiate:

- route not found;
- title not published;
- server GraphQL failure;
- optional rail failure;
- client revalidation failure;
- hydration failure;
- player-only failure.

A route-level error boundary should not erase global navigation unnecessarily.

## 8. Testing

### HTML test

Verify public metadata exists in raw response HTML.

### Hydration test

Fail on console hydration warnings.

### Slow JavaScript

Throttle CPU and network to confirm content is useful before hydration.

### Identity changes

Test session expiry and profile changes between server response and client revalidation.

### Locale

Test supported locales in server and browser runtimes.

### Apollo operation count

Verify hydration does not repeat initial operations without a freshness reason.

## 9. Debugging workflow

1. capture server HTML;
2. capture first client render inputs;
3. compare unstable values;
4. isolate the smallest mismatch;
5. remove environment-dependent render behavior;
6. rerun with strict console failure;
7. test under production build, not only development.

Suppressing hydration warnings hides evidence; it does not fix the mismatch.
