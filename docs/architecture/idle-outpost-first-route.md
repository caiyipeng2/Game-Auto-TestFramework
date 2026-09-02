# Idle_Outpost First Route

This route is intentionally a real player-flow simulation rather than a
coordinate macro. Before the player steps start, the adapter opens the app
and normalizes account state. A new account skips deletion and continues from
the first-time flow; an existing account follows the explicit settings/account
deletion chain and must be re-detected as new after restart.

```mermaid
sequenceDiagram
    participant R as Route YAML
    participant A as Idle_Outpost Adapter
    participant F as Flow Engine
    participant D as ADB/Appium Driver
    participant P as Android device

    F->>D: launch app
    D->>P: start Unity Activity
    F->>A: read account mode
    alt existing account
        A-->>F: existing
        F->>D: tap settings entry
        F->>D: tap account
        F->>D: tap delete archive
        F->>D: tap confirm
        F->>D: tap restart game
        F->>D: launch app again
        F->>A: verify new account
        A-->>F: new
    else new account
        A-->>F: new
    end
    R->>F: wait app-ready
    F->>A: readState()
    A-->>F: app-ready
    R->>F: wait main-screen or first-time state
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
account reset targets are normalized points calibrated against the observed
`720x1604` device and scale through the generic locator contract. A future
image/Appium state backend can replace the state reader without changing the
route or reset sequence.
