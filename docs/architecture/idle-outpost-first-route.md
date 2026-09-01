# Idle_Outpost First Route

This route is intentionally a real player-flow simulation rather than a
coordinate macro. It starts from an existing, logged-in account because the
first-run system consent and account setup are explicit preconditions for the
real-device task; they are not silently auto-accepted by the route.

```mermaid
sequenceDiagram
    participant R as Route YAML
    participant A as Idle_Outpost Adapter
    participant F as Flow Engine
    participant D as ADB/Appium Driver
    participant P as Android device

    R->>F: wait app-ready
    F->>A: readState()
    A-->>F: app-ready
    R->>F: wait main-screen
    F->>A: readState()
    A-->>F: main-screen
    R->>A: tap main.terrain.upgrade.entry
    A-->>F: locator template from TerrainUpgeade1
    F->>D: input tap
    D->>P: real touch event
    R->>F: wait terrain-upgrade-window
    R->>F: wait first-upgrade-affordable
    Note over A,F: UpgradeId=1 requires 13 coins
    R->>A: tap terrain.upgrade.first
    A-->>F: locator template from TerrainUpgeade3
    F->>D: input tap
    D->>P: real touch event
    R->>A: assert terrain-upgrade-owned
    A-->>F: upgradeOwned=true
    F->>D: capture screenshot
```

The route is stored at
`adapters/idle-outpost/routes/first-upgrade.yaml`. Its facts are sourced from
the versioned snapshot at
`adapters/idle-outpost/config/idle-outpost-config.snapshot.json`.

The image-template locator files are an adapter-owned runtime dependency. The
first host-side proof validates their logical mapping; the real-device proof
will provide and calibrate the templates or a runtime rectangle resolver.
