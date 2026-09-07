# Game Adapter Contract

Each game is an independently owned package. The adapter translates game
knowledge into the generic contracts while keeping business-specific names,
configuration, and locator strategy out of the framework core.

```mermaid
flowchart TB
    Adapter[GameAdapter]
    Adapter --> Identity[identity()\npackage + launch activity]
    Adapter --> Profiles[profiles()\nserver/build/test data]
    Adapter --> Prepare[prepareContext()\nprecondition checks]
    Adapter --> Ready[waitReady()\napp state boundary]
    Adapter --> Target[resolveTarget()\nlogical target -> locator]
    Adapter --> State[readState()\nruntime snapshot]
    Adapter --> Assert[assertState()\nbusiness oracle]
    Adapter --> Cleanup[cleanupContext()\nrelease adapter state]

    subgraph Package[adapters/<game-name>/]
        Yaml[adapter.yaml]
        Config[config/]
        Source[src/]
        Routes[routes/]
        Docs[docs/]
    end

    Yaml --> Adapter
    Config --> Prepare
    Config --> Profiles
    Source --> Ready
    Source --> Target
    Source --> State
    Source --> Assert
    Routes --> Target
    Docs --> Package
```

The adapter can use a native selector, normalized point, runtime rectangle,
or image template. The route only names a logical target such as
`main.terrain.upgrade.entry`; it never embeds a raw coordinate or a Unity
hierarchy path.

`prepareContext(context, driver, options?)` receives the route's optional
account policy. `reset-existing` is the default; a verified continuation
route may request `preserve`, while the adapter remains responsible for
deciding which account and startup states are safe.

An adapter may expose several logical continuation routes over the same
normalized target when the game reflows a list after purchase. Each route must
still bind its precondition and terminal screenshot state to the observed UI;
numeric configuration order alone is not a locator contract.

## Per-game package shape

```text
GameAdapter
|-- package identity
|-- launch activity
|-- server/build profile
|-- test data preparation
|-- state reader
|-- locator provider
|-- business assertions
|-- route definitions
`-- optional configuration reader
```

The text tree is a compact fallback for readers whose Markdown renderer does
not display Mermaid; the Mermaid diagram above is the authoritative visual
boundary.
