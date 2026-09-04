# Overall Architecture

The framework is split into a generic execution layer and game-owned adapter
packages. Android real devices remain the primary runtime target. ADB is the
required device backend; Appium is an optional native-UI supplement.

```mermaid
flowchart LR
    Tester[Tester or CI] --> CLI[CLI composition root]

    subgraph Generic[Generic Framework]
        CLI --> Flow[Flow Engine]
        CLI --> Artifact[Artifact Engine]
        CLI --> Device[Device Driver Contract]
        Flow --> Evidence[Step Evidence]
        Artifact --> Evidence
        Device --> Evidence
        Evidence --> Report[JSON and JUnit Reports]
        Device --> ADB[ADB Backend required]
        Device -. optional .-> Appium[Appium UiAutomator2]
    end

    subgraph Game[One Game Adapter]
        Manifest[adapter.yaml]
        Config[Config Reader]
        State[State Reader]
        Locator[Logical Target Resolver]
        Assertions[Business Assertions]
        Routes[Route YAML]
    end

    Flow --> Game
    Manifest --> Config
    Config --> State
    Config --> Locator
    Config --> Assertions
    Config --> Routes
    ADB --> Phone[Android real device]
    Appium -.-> Phone
```

The generic layer must not import a game namespace, read a game Excel file,
assume Unity, or encode a game-specific screen path. The adapter owns those
facts and exposes only the generic `GameAdapter` contract.

Route-level account policy is generic: `reset-existing` is the default for
zero-state runs, while `preserve` is available for a verified continuation
route. The generic runner forwards the value; each adapter owns the safe
states and whether an existing account may continue.
