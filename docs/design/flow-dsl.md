# Generic Flow DSL Design

## Purpose

Represent real user flows without embedding game-specific logic in the
generic runner. A route is data; an adapter resolves its logical targets and
business assertions.

## Route Shape

```yaml
schemaVersion: 1
id: first-upgrade
adapter: idle-outpost
profile: test-server
accountPolicy: reset-existing
preconditions:
  - context: clean-data
steps:
  - id: wait-main
    wait:
      state: main-screen
      timeoutMs: 120000
  - id: open-upgrade
    tap:
      target: terrain.upgrade.entry
  - id: wait-upgrade-window
    wait:
      state: terrain-upgrade-window
      timeoutMs: 30000
  - id: upgrade-first-item
    tap:
      target: terrain.upgrade.first
  - id: verify-upgrade
    assert:
      state: terrain.upgrade.owned
      equals: true
  - id: capture-result
    screenshot:
      name: after-first-upgrade
```

## Generic Step Types

```text
install
clearData
launch
tap
swipe
input
wait
assert
screenshot
collectLogcat
collectPerformance
repeat
branch
```

## Logical Targets

Routes refer to stable logical IDs such as:

```text
system.privacy.continue
main.terrain.upgrade.entry
terrain.upgrade.first
main.order.entry
battle.chapter1.level1.enter
```

The Adapter resolves these IDs. A route must not directly depend on a raw
screen coordinate unless the adapter explicitly declares that coordinate as
the current fallback strategy.

`accountPolicy` is optional and defaults to `reset-existing`. A route that is a
continuation of an already prepared gameplay session may set
`accountPolicy: preserve`; the generic runner passes that policy to the
adapter, while the adapter decides which account and startup states are safe
to preserve. This keeps account lifecycle behavior generic without allowing a
route to bypass adapter-owned safety checks implicitly.

Routes should name the observed logical row state rather than infer UI order
from an ID sequence. An adapter can reuse a normalized target after list
reflow, but it must require a distinct pre-state and post-state around each
purchase.

## Conditions and State

Adapters provide state names and state payloads. The generic engine only
understands the contract:

```text
wait(state, timeout)
assert(state.field, operator, expected)
branch(condition)
```

For Idle_Outpost, state can include current scene, current terrain, guide ID,
open window, order state, and device level. Another game can expose an
entirely different state model without changing the engine.

## Evidence Per Step

Each step records:

```text
step id
start/end timestamp
resolved locator kind
resolved screen rectangle or selector when available
input command
state before
state after
screenshot path
log offset
result
```

## Safety Rules

- Destructive device operations require an explicit route precondition.
- Production profiles cannot execute destructive test-data commands by
  default.
- A user-consent dialog is never auto-accepted unless the route explicitly
  declares a test-only consent fixture.
- The runner stops after the first hard failure unless the route declares a
  bounded diagnostic retry.

## Idempotent continuation pattern

Continuation routes should protect their terminal checkpoint before spending
resources or changing gameplay state:

```yaml
- id: handle-checkpoint
  branch:
    condition:
      state: terrain-1-2-main
    then:
      - id: assert-checkpoint
        assert:
          state: terrain-1-2-main
          equals: terrain-1-2-main
    else:
      - id: continue-from-verified-state
        # game adapter steps follow here
```

`reach-terrain-1-2.yaml` uses this pattern and keeps the final screenshot
outside the branch, so both a fresh continuation and an already-completed
rerun produce the same terminal evidence artifact.
