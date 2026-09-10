# Comity Coding Standards — Lifecycle, Events & Commands

> **Provenance:**
> - Originally: `comity-community/docs/standards/lifecycle.md`, `events.md`, `commands.md`
> - Consolidated into: `comity-development/docs/standards/lifecycle-events.md`
> - Migration: Phase 10
> - Original semantic owner: Comity-wide
> - Canonical owner: comity-development

---

This document defines the **Lifecycle model**, **Event model**, and **Command Pattern** used across Comity packages. It clarifies the relationship between lifecycle, events, hooks, and commands, and when to use each.

---

# 1. Lifecycle Model

Lifecycle represents **well-defined phases** in the existence of a system or module.

Examples:

- Kernel boot → running → stopped
- HTTP pipeline open → sealed → running
- Module registration → setup → active

Lifecycle is about **state transitions**, not data flow.

---

## 1.1 Lifecycle States

Lifecycle states are:

- Explicit
- Finite
- Monotonic (no implicit rollback)

Example:

```ts
export type KernelState = "open" | "sealed" | "running" | "stopped";
```

Rules:

- States MUST be enumerable
- Transitions MUST be explicit
- Invalid transitions MUST fail fast

---

## 1.2 Lifecycle Controller

Lifecycle state is managed by a **single owner**, usually:

- Kernel
- Facade
- Runtime

Lifecycle MUST NOT be:

- Distributed
- Mutable by external consumers

---

# 2. Hooks vs Events — Core Distinction

This is **critical**.

## 2.1 Events

Events describe **something that already happened**.

- Fire-and-forget
- Non-blocking
- Side-effect free
- Optional

Events are **observational**.

Example:

```ts
kernelStarted(...)
requestCompleted(...)
```

If no one listens, nothing breaks.

## 2.2 Hooks

Hooks allow **controlled extension of behavior**.

- Executed synchronously or asynchronously
- Ordered
- Allowed to influence execution
- Part of the lifecycle contract

Hooks are **participatory**.

Example:

```ts
onKernelSetup;
onRequest;
beforeResponse;
```

If hooks are not executed, behavior is incomplete.

---

## 2.3 Events vs Hooks — Decision Table

| Use Case          | Events | Hooks |
| ----------------- | ------ | ----- |
| Logging           | ✅     | ❌    |
| Metrics           | ✅     | ❌    |
| Tracing           | ✅     | ❌    |
| Middleware        | ❌     | ✅    |
| Authorization     | ❌     | ✅    |
| Observability     | ✅     | ❌    |
| Control flow      | ❌     | ✅    |
| Optional behavior | ✅     | ❌    |
| Required behavior | ❌     | ✅    |

---

## 2.4 Interaction Rules

- Hooks MAY emit events
- Events MUST NOT trigger hooks
- Hooks MUST NOT depend on events

Correct:

```ts
hook() {
  doWork();
  emitEvent();
}
```

Incorrect:

```ts
onEvent(() => {
  changeBehavior();
});
```

---

## 2.5 When to Use Events

Use **Events** when:

- You want to observe behavior
- You want logging, metrics, tracing
- You want external modules to react
- You do NOT want control flow changes

Examples:

- Request completed
- Module registered
- Kernel stopped

---

## 2.6 When to Use Hooks

Use **Hooks** when:

- You want to allow extension
- Order matters
- Execution can be modified
- A module participates in execution

Examples:

- Middleware pipelines
- Module setup
- Authorization checks
- Request interception

---

# 3. Event Model

Events are a first-class concept in Comity and enable:

- Observability
- Extension
- Decoupled coordination between modules

Events are **signals**, not commands.

---

## 3.1 Event Philosophy

Comity events are:

- **Fire-and-forget**
- **Side-effect free**
- **Non-blocking**
- **Domain-relevant**

Events MUST NOT:

- Control execution flow
- Replace function calls
- Be required for correctness

If the system breaks without a listener, the event is wrong.

---

## 3.2 Event Ownership

Each module defines **its own events**.

Examples:

- `KernelEvents`
- `HttpEvents`
- `AuthEvents`

A module:

- Emits its own events
- Never emits events owned by another module

---

## 3.3 Event Shape

### Strongly Typed Interfaces (Preferred)

Events MUST be defined as interfaces with explicit methods:

```ts
export interface HttpEvents {
  requestStarted(payload: { id: string; method: string; path: string }): void;

  requestCompleted(payload: { id: string; status: number; duration: number }): void;

  requestFailed(payload: { id: string; errorCode: string; duration: number }): void;
}
```

This is the **canonical Comity pattern**.

---

## 3.4 Naming Rules

- Event names are **verbs in past tense**
- Payload names are **descriptive and minimal**

✅ Good:

- `requestStarted`
- `kernelSealed`
- `moduleRegistered`

❌ Bad:

- `onRequest`
- `handleRequest`
- `requestEvent`

---

## 3.5 Payload Rules (Security-Critical)

Event payloads MUST:

- Be safe to log
- Avoid sensitive data
- Avoid raw objects

### Forbidden in payloads

- Full request/response bodies
- Authentication secrets
- Stack traces
- Arbitrary `unknown` or `any` objects

❌ Forbidden:

```ts
requestCompleted({ result: HttpResult });
```

✅ Required:

```ts
requestCompleted({ status: 200, duration: 12 });
```

If in doubt: **pass identifiers, not objects**.

---

## 3.6 Error Events

When emitting error-related events:

- Emit error **codes**, not error instances
- Never emit raw `Error` objects

✅ Correct:

```ts
requestFailed({
  id: ctx.request.id,
  errorCode: error.code,
  duration,
});
```

❌ Forbidden:

```ts
requestFailed({ error });
```

---

## 3.7 Event Emission Responsibility

Events are emitted by:

- The module runtime
- Facades
- Kernel orchestrators

Events MUST NOT be emitted by:

- Domain entities
- Value objects
- Pure functions

---

## 3.8 Event Bus Integration

- Modules do NOT depend directly on a concrete event bus
- Events are emitted through:
  - Kernel-provided emitter
  - Adapter-provided emitter

Example:

```ts
ctx.emit({ type: "http:requestStarted", ... });
```

or via typed interfaces:

```ts
this.emitter.requestStarted(...)
```

---

## 3.9 Optional by Design

- Events MUST be optional
- No listener MUST be required
- No event MUST affect behavior

If listeners are required for correctness, the logic is misplaced.

---

## 3.10 Versioning & Stability

- Event names and payloads are part of the public API
- Changing an event signature is a **breaking change**
- Adding new events is **non-breaking**

---

# 4. Commands (Imperative Operations Model)

Commands complement Events.

If Events describe something that happened,
Commands describe something that must happen.

---

## 4.1 Purpose of Commands

A Command represents:

- An explicit intention to change state
- A business operation request
- A side-effect-producing action

Examples:

- CreateUser
- RotateSession
- ChargePayment
- PublishArticle

Commands are:

- Imperative
- Explicit
- Single-responsibility
- Deterministic in intent

---

## 4.2 Commands vs Events

| Commands             | Events            |
| -------------------- | ----------------- |
| Imperative           | Descriptive       |
| "Do this"            | "This happened"   |
| May fail             | Already happened  |
| Owned by application | Emitted by domain |

Commands may produce Events.

Events MUST NOT produce Commands.

This directionality preserves architectural clarity.

---

## 4.3 Command Structure

A Command is a simple data object.

It MUST:

- Be immutable
- Contain only serializable data
- Contain no behavior
- Contain no infrastructure references

Example:

```ts
export interface CreateUserCommand {
  readonly email: string;
  readonly password: string;
}
```

Commands are DTOs. They are not services.

---

## 4.4 Command Handlers

Each Command MUST have exactly one handler.

Handlers:

- Live in the Application Layer
- Depend on Core Modules via interfaces
- May use DI
- Return Result<T, E>

Example:

```ts
export interface CommandHandler<C, R> {
  handle(command: C): Promise<R>;
}
```

Handlers:

- MAY emit Events
- MAY use transactions
- MUST NOT leak infrastructure details

---

## 4.5 Command Bus (Optional)

Comity does NOT require a command bus.

A command bus MAY be introduced when:

- Cross-cutting policies are required (logging, tracing)
- Commands must be dispatched dynamically
- Distributed execution is required

The command bus:

- Lives in Extensions
- Must remain optional
- Must not introduce domain logic

Minimal systems may directly invoke handlers.

---

## 4.6 Transaction Boundaries

Commands define natural transaction boundaries.

If a command mutates state:

- The handler is responsible for transaction orchestration
- The command itself must remain unaware of persistence

Transaction control belongs to the Application Layer.

---

## 4.7 Validation Policy

Validation may occur at two levels:

1. Structural validation (DTO validation)
2. Business validation (inside handler)

Commands must not perform validation themselves.

Validation is policy, not data.

---

## 4.8 Idempotency

Commands SHOULD support idempotency when:

- They are triggered by external systems
- They may be retried

Idempotency is implemented at the handler or infrastructure level.

It MUST NOT be embedded inside the Command structure.

---

## 4.9 Error Model

Command handlers MUST:

- Return Result
- Throw only for programmer errors
- Use module-specific Error classes

Commands MUST NOT throw.

---

# 5. Lifecycle Model

Lifecycle represents **well-defined phases** in the existence of a system or module.

Examples:

- Kernel boot → running → stopped
- HTTP pipeline open → sealed → running
- Module registration → setup → active

Lifecycle is about **state transitions**, not data flow.

---

## 5.1 Lifecycle States

Lifecycle states are:

- Explicit
- Finite
- Monotonic (no implicit rollback)

Example:

```ts
export type KernelState = "open" | "sealed" | "running" | "stopped";
```

Rules:

- States MUST be enumerable
- Transitions MUST be explicit
- Invalid transitions MUST fail fast

---

## 5.2 Lifecycle Controller

Lifecycle state is managed by a **single owner**, usually:

- Kernel
- Facade
- Runtime

Lifecycle MUST NOT be:

- Distributed
- Mutable by external consumers

---

## 5.3 Kernel Responsibility

The Kernel:

- Owns lifecycle state
- Executes hooks
- Emits lifecycle events

Modules:

- Register hooks
- Listen to events

---

## 5.4 Stability Rules

- Lifecycle phases are public API
- Hook names are public API
- Event payloads are public API

Changing lifecycle semantics is a **breaking change**.

---

# 6. Hooks

Hooks allow **controlled extension of behavior**.

- Executed synchronously or asynchronously
- Ordered
- Allowed to influence execution
- Part of the lifecycle contract

Hooks are **participatory**.

Example:

```ts
onKernelSetup;
onRequest;
beforeResponse;
```

If hooks are not executed, behavior is incomplete.

---

## 6.1 When to Use Hooks

Use **Hooks** when:

- You want to allow extension
- Order matters
- Execution can be modified
- A module participates in execution

Examples:

- Middleware pipelines
- Module setup
- Authorization checks
- Request interception

---

## 6.2 Hooks vs Events — Interaction Rules

- Hooks MAY emit events
- Events MUST NOT trigger hooks
- Hooks MUST NOT depend on events

Correct:

```ts
hook() {
  doWork();
  emitEvent();
}
```

Incorrect:

```ts
onEvent(() => {
  changeBehavior();
});
```

---

## 6.3 When to Use Hooks (Summary)

Use **Hooks** when:

- You want to allow extension
- Order matters
- Execution can be modified
- A module participates in execution

Examples:

- Middleware pipelines
- Module setup
- Authorization checks
- Request interception

---

# 7. Commands vs Events vs Hooks — Relationship Summary

| Aspect          | Commands                    | Events                          | Hooks                     |
| --------------- | --------------------------- | ------------------------------- | ------------------------- |
| **Direction**   | Imperative ("Do this")      | Descriptive ("This happened")   | Participatory             |
| **Ownership**   | Application                 | Domain (emitter)                | Kernel/Module             |
| **Failure**     | May fail (Result)           | Already happened                | May influence execution   |
| **Ordering**    | Single handler              | Multiple listeners (unordered)  | Ordered                   |
| **Behavior**    | May change state            | Observe only                    | May influence execution   |
| **Relationship**| Commands may produce Events | Events observe, never command   | Hooks may emit Events     |

---

# 8. Stability Rules

- Lifecycle phases are public API
- Hook names are public API
- Event names and payloads are public API
- Command structures are public API
- Changing lifecycle semantics is a **breaking change**
- Changing an event signature is a **breaking change**
- Adding new events is **non-breaking**

---

# 9. Final Principles

> Events observe.  
> Hooks participate.  
> Commands change reality.

**Decision guide:**

- **“Should this be allowed to change behavior?”** → If yes → Hook
- **“Should this describe what happened?”** → If yes → Event  
- **“Should this request a state change?”** → If yes → Command

**Directionality:**

```
Commands → (may produce) → Events
    ↑                          ↑
    |                          |
Application               Domain (emitter)
    ↓                          |
Hooks ←────────────────────────┘
    (participate, may emit)
```

---

> Events describe reality.  
> Commands change reality.  
> Hooks participate in reality.

The Application Layer decides when one becomes the other.