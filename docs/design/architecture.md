# Generic Android Game Test Framework Architecture

## Goal

Build one reusable Android real-device automation framework. A game-specific
adapter supplies business knowledge; the framework supplies execution,
device control, evidence, and reporting.

## Boundary

```mermaid
flowchart TB
    subgraph Generic[Generic Framework]
        CLI[CLI]
        Flow[Flow Engine]
        Device[Device Core]
        Artifact[Artifact Engine]
        Evidence[Evidence Collector]
        Report[Report Engine]
        ADB[ADB Backend]
        Appium[Optional Appium Backend]
    end

    subgraph Adapter[Game Adapter Package]
        Identity[Package Identity]
        Profile[Server and Build Profile]
        Config[Config Reader]
        Locator[Game Locator]
        State[State Reader]
        Assertions[Business Assertions]
        Routes[Route Definitions]
    end

    CLI --> Flow
    CLI --> Artifact
    Flow --> Device
    Flow --> Adapter
    Device --> ADB
    Device --> Appium
    Flow --> Evidence
    Artifact --> Evidence
    Device --> Evidence
    Evidence --> Report
    Adapter --> Identity
    Adapter --> Profile
    Adapter --> Config
    Adapter --> Locator
    Adapter --> State
    Adapter --> Assertions
    Adapter --> Routes
```

The generic layer must not import a game namespace, read a game Excel file,
know a game UI path, or assume that the game is built with Unity.

Route-level account policy is generic: `reset-existing` is the default for
zero-state runs, while `preserve` is available for a verified continuation
route. The generic runner forwards the value; each adapter owns the safe
states and whether an existing account may continue.

## Runtime Sequence

```mermaid
sequenceDiagram
    participant T as Test CLI
    participant F as Flow Engine
    participant A as Game Adapter
    participant D as Device Core
    participant G as Android Device
    participant R as Report Engine

    T->>A: load adapter and route
    T->>D: inspect selected device
    D->>G: query model, API, ABI, display
    T->>D: verify and install artifact
    D->>G: install selected APK set
    T->>F: execute route and account policy
    F->>A: resolve precondition and account policy
    A-->>F: required state and locator
    F->>D: tap/swipe/input/wait
    D->>G: inject real user input
    F->>A: read state and assert result
    F->>R: write step evidence
    R-->>T: PASS, FAIL, or BLOCKED
```

## Core Contracts

### Device Driver

The device driver exposes only platform operations:

```text
listDevices()
inspectDevice(serial)
installArtifact(serial, artifact)
clearData(serial, packageId)
launch(serial, packageId, activity)
tap(serial, x, y)
swipe(serial, start, end, duration)
inputText(serial, text)
captureScreenshot(serial)
captureLogcat(serial)
collectPerformance(serial, packageId)
```

ADB is the required implementation. Appium is an optional implementation of
the same capability boundary and is not required for the first smoke loop.

### Game Adapter

The adapter supplies:

```text
identity()
profiles()
prepareContext(context)
waitReady(context)
resolveTarget(targetId, context)
readState(context)
assertState(assertion, context)
cleanupContext(context)
```

`resolveTarget` may return an Android selector, a Unity runtime rectangle, a
normalized coordinate, or a controlled fallback. The framework does not know
which locator type a game uses.

## Locator Policy

```mermaid
flowchart LR
    Target[Logical Target ID] --> AdapterResolver[Adapter Resolver]
    AdapterResolver -->|Native selector| Appium[Appium UiAutomator2]
    AdapterResolver -->|Runtime rectangle| ADBTap[ADB tap]
    AdapterResolver -->|Normalized point| ADBCoord[ADB coordinate tap]
    AdapterResolver -->|Image/OCR fallback| Diagnose[Diagnostic fallback]
```

The preferred result is still a real ADB input. A Unity-specific bridge may
report the current screen rectangle without directly invoking the game action;
the framework then taps that rectangle through ADB.

## Artifact Policy

Artifact classification is adapter-owned. File timestamps must never be a
generic TestServer/formal-server rule. The Idle_Outpost adapter may use the
currently agreed timestamp convention, while another game can use manifest
metadata, filename conventions, or an external release manifest.

## Failure Model

Every failure maps to one category:

```text
HOST_TOOL
DEVICE_CONNECTION
DEVICE_STATE
ARTIFACT_METADATA
INSTALLATION
APPLICATION_STARTUP
NATIVE_UI_LOCATOR
GAME_LOCATOR
WAIT_TIMEOUT
NETWORK
CRASH
ANR
BUSINESS_ASSERTION
```

Failure handling must capture evidence before retrying. Retries are limited
and must never hide a deterministic business assertion failure.

## Versioning

- Core packages use semantic versioning.
- Game adapters have independent versions and declare the compatible core
  range.
- Route schemas are versioned and validated before execution.
- Reports include core version, adapter version, route version, artifact hash,
  device serial, and tool versions.
