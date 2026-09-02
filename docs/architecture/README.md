# Architecture Documentation

This directory is the repository-visible explanation of the framework. The
documents describe the decisions and intermediate boundaries that are needed
to add another Android game without changing the generic core.

The diagrams are written as Mermaid in Markdown so GitHub can render them
directly. The editable diagram sources are also kept in `docs/diagrams/`.

## Documents

- [Overall architecture](overall.md): device, flow, artifact, adapter, and report boundaries.
- [Project structure](project-structure.md): current packages, adapter layout, and planned extension points.
- [Configuration parsing strategy](config-parsing-strategy.md): source tables to normalized adapter facts and routes.
- [Game adapter contract](game-adapter.md): what every game owns and what remains generic.
- [Idle_Outpost first route](idle-outpost-first-route.md): the real configuration-backed route used for the first proof.
- [Account state reset](account-state-reset.md): new/existing account detection and the destructive reset guard.
- [Real device run](real-device-run.md): device selection, artifact, evidence, and current proof boundary.
- [Screen recognition](screen-recognition.md): normalized PNG templates, thresholds, and fail-closed state detection.

## Synchronization rule

Every implementation milestone that changes an architectural boundary must
commit its source diagram, explanatory document, and README index together
with the code. A milestone is not considered repository-visible until the
documentation is committed and pushed with the implementation after user
confirmation.
