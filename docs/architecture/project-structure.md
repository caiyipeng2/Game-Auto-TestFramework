# Project Structure

The repository keeps framework code, game adapters, schemas, evidence, and
documentation in separate ownership areas. Solid nodes are implemented in
the current bootstrap; dashed nodes are planned extension points.

```mermaid
flowchart TB
    Root[Game-Auto-TestFramework]

    Root --> Packages[packages/]
    Packages --> Core[core\ncontracts + flow engine]
    Packages --> ADB[adb-driver\nADB device backend]
    Packages --> Artifact[artifact-engine\nAPK/AAB/APKS verification]
    Packages --> Report[report-engine\nJSON/JUnit output]
    Packages -.-> Appium[appium-driver\noptional native UI backend]

    Root --> Adapters[adapters/]
    Adapters --> Idle[ idle-outpost/ ]
    Idle --> Manifest[adapter.yaml]
    Idle --> AdapterSource[src/\nidentity + state + locator]
    Idle --> AdapterConfig[config/\nverified config snapshot]
    Idle --> AdapterRoutes[routes/\nlogical player flows]
    Idle --> AdapterDocs[docs/\nroute evidence]
    Adapters -.-> Other[<game-name>/\nindependent adapter]

    Root --> Schemas[schemas/\nversioned route schemas]
    Root --> Tests[tests/\nhost-side contract tests]
    Root --> CLI[cli/\ncomposition and commands]
    Root --> Tools[Tools/\nWindows and CI launchers]
    Root --> Docs[docs/]
    Docs --> Architecture[architecture/\nrendered diagrams + explanations]
    Docs --> DiagramSource[diagrams/\neditable Mermaid sources]
```

An adapter may add files under its own directory, but it must not modify
`packages/core` to encode game-specific behavior. The CLI may compose adapters
at the application boundary; the execution contracts remain game-neutral.
