# Reach Terrain 1-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the verified Motorola flow from completed terrain upgrades through device level 25 into a repeatable route that reaches and confirms terrain `1-2`.

**Architecture:** Keep the generic FlowRunner and device contract unchanged. The Idle_Outpost adapter owns logical targets and screenshot states for device upgrade, the next-terrain window, the transition skip, the new-position dialog, the reward overlay, and the final `1-2` scene. The route uses the existing `accountPolicy: preserve` continuation mode and ends after the real player reaches `1-2`; it does not include later `1-2` gameplay tasks.

**Tech Stack:** TypeScript, Node test runner, YAML route DSL, adapter-owned PNG templates, ADB screenshot/tap backend, CodeGraph, JSON/JUnit evidence.

---

### Task 1: Confirm the observed 1-2 flow

**Files:**

- Read: `reports/t8-real-device-live/through-1-2-5038/device-upgrade-1-level25.png`
- Read: `reports/t8-real-device-live/through-1-2-5038/after-map-entry-ready.png`
- Read: `reports/t8-real-device-live/through-1-2-5037/after-skip-1-2-story.png`
- Read: `reports/t8-real-device-live/through-1-2-5037/after-confirm-1-2.png`
- Read: `reports/t8-real-device-live/through-1-2-5037/final-1-2.png`
- Read: `D:/Project/Idle_Outpost/Assets/Scripts_Hotfix/Game/UI/MainWindow/UIMainMapItem.cs`
- Read: `D:/Project/Idle_Outpost/Assets/Scripts_Hotfix/Game/UI/UIGoNextTerrainWindow/UIGoNextTerrainWindow.cs`

- [x] **Step 1: Confirm route order and costs**

The observed order is: device reaches level 25, open `1-1` map entry, pay 800 coins, wait/skip the transition, confirm “森林小道”, close the 5-diamond reward overlay, and stop in `1-2`. No later `1-2` task is executed.

- [x] **Step 2: Confirm real evidence**

Motorola `ZT4229J5ZR` was the only operated device. The route run consumed the already authorized device upgrade costs and 800-coin terrain unlock; no Samsung action was sent.

### Task 2: Add failing end-to-end route tests

**Files:**

- Create: `tests/idle-outpost-reach-terrain-1-2.test.ts`
- Create: `adapters/idle-outpost/routes/reach-terrain-1-2.yaml`

- [x] **Step 1: Write the failing tests**

Require `accountPolicy: preserve`, a terminal checkpoint branch, the route
sequence under its continuation branch, logical targets for each action, and a
fixture driver that records exactly the ten device upgrade taps, the 1-1 map
tap, the 800-coin unlock tap, the skip tap, the new-position confirm tap, and
the reward dismiss tap.

- [x] **Step 2: Run the focused tests and verify the expected red**

```powershell
node --import=tsx --test tests/idle-outpost-reach-terrain-1-2.test.ts
```

Expected red was first observed for the missing route contract; the later
checkpoint test also produced the expected red until the route branch was
implemented.

### Task 3: Add adapter states, targets, and route

**Files:**

- Modify: `adapters/idle-outpost/adapter.yaml`
- Modify: `adapters/idle-outpost/src/idle-outpost-adapter.ts`
- Create: `adapters/idle-outpost/routes/reach-terrain-1-2.yaml`
- Create: `adapters/idle-outpost/locators/state-terrain-upgrade-all-owned.png`
- Create: `adapters/idle-outpost/locators/state-device-upgrade-level25.png`
- Create: `adapters/idle-outpost/locators/state-next-terrain-window.png`
- Create: `adapters/idle-outpost/locators/state-terrain-transition-loading.png`
- Create: `adapters/idle-outpost/locators/state-terrain-1-2-new-position.png`
- Create: `adapters/idle-outpost/locators/state-terrain-1-2-reward.png`
- Create: `adapters/idle-outpost/locators/state-terrain-1-2-main.png`

- [x] **Step 1: Register screenshot states and normalized targets**

Use the real Motorola screenshots to crop adapter-owned templates. Keep state regions narrow and assign specific states higher priority than generic `new-account`; register all tap points as normalized logical targets.

- [x] **Step 2: Implement the route and startup mappings**

The route uses `accountPolicy: preserve`, waits for the generic equipment window while repeating the 10 upgrades from the observed level-15 baseline, waits for level 25, closes the device window, opens the next-terrain window, pays 800 coins, skips the transition, confirms the new position, closes the reward, and waits for the `1-2` main state. Startup preparation must preserve recognized continuation windows and must never delete the account.

- [x] **Step 3: Run focused tests and verify green**

The focused route tests pass 4/4, including screenshot classification, route
loading, first continuation execution, and zero-tap terminal rerun.

### Task 4: Document and verify the completed 1-2 checkpoint

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/idle-outpost-first-route.md`
- Modify: `docs/architecture/real-device-run.md`
- Modify: `docs/architecture/account-state-reset.md`
- Modify: `docs/architecture/game-adapter.md`
- Modify: `docs/architecture/overall.md`
- Modify: `docs/design/architecture.md`
- Modify: `docs/design/flow-dsl.md`
- Modify: `docs/diagrams/idle-outpost-first-route.mmd`
- Modify: this plan file

- [x] **Step 1: Record the 1-2 route and evidence**

Documented device level 25, the 800-coin unlock, the `1-2` new-position
confirmation, the 5-diamond reward overlay, the final stop boundary, the
Motorola-only evidence directories, and the idempotent rerun branch.

- [x] **Step 2: Run release gates**

```powershell
codegraph sync
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
git diff --check
```

CodeGraph sync completed. The final local gates passed: `npm test` 95/95,
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
and `git diff --check`.

- [x] **Step 3: Commit once after the 1-2 checkpoint**

```powershell
git add README.md adapters docs packages schemas tests
git commit -m "feat(idle-outpost): automate reach to terrain 1-2"
```

Completed as the single local commit `97650f3`.

- [x] **Step 4: Stop for user confirmation before pushing**

Report the single consolidated commit. Push and merge only after explicit confirmation.

Handoff is complete; this run intentionally stops before any remote push.
