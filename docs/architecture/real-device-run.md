# Real Device Run

This runbook records the real-device proof boundary for the framework. The
device is selected explicitly and the ADB server port is explicit when another
Android tool owns the default port.

## Command shape

```powershell
$env:IDLE_OUTPOST_DEVICE_SERIAL = "<approved-serial>"
$env:IDLE_OUTPOST_ADB_PORT = "5038"
$env:IDLE_OUTPOST_APKS_PATH = "<approved-test-server-v63-apks>"
.\Tools\Invoke-GameAutoTest.ps1 run `
  --adapter idle-outpost `
  --route .\adapters\idle-outpost\routes\first-upgrade.yaml `
  --artifact $env:IDLE_OUTPOST_APKS_PATH `
  --serial $env:IDLE_OUTPOST_DEVICE_SERIAL `
  --adb-port $env:IDLE_OUTPOST_ADB_PORT
```

The route's `account-ready` precondition is handled by the adapter before its
first player action. The adapter opens the game, detects account mode, skips
the destructive chain for a new account, or performs the in-game delete flow
for an existing account. It must detect a new account again after restart.

## Verified v63 artifact

The approved TestServer artifact is the earlier v63 APKS from the supplied
artifact directory. Its manifest evidence is package
`com.hg.idleweaponshoptycoon.android`, `versionName=2.0.9`,
`versionCode=63`, `minSdk=24`, and `targetSdk=36`. The artifact hash is stored
in the adapter profile, while the large APKS file remains outside this source
repository.

## 2026-09-02 proof notes

- The active real-device target is a Motorola `moto g - 2025` running API 35
  at `720x1604`; all current live checks use the explicit ADB server port
  `5038` and an explicit serial.
- The app launched the Unity Activity successfully and stayed in the
  foreground after startup.
- The run encountered the expected sequence of native/game overlays, which
  were dismissed without claiming rewards.
- The account page visibly contained non-default progress, so it was treated
  as an existing account.
- The exact chain `settings -> account -> delete archive -> confirm -> restart`
  produced the in-game success message. After a manual relaunch, the screen
  showed the first-time tutorial scene, providing evidence of the new-account
  branch.
- Screenshots and logs are written under the local ignored `reports/` tree;
  private device identifiers and account values are intentionally excluded
  from commits.

The Samsung device is outside the current execution scope. It is not selected
or queried by the live run commands; Samsung strings that remain in generic
ADB parser fixtures are offline unit-test data only.

## Current execution boundary

The account branch, target coordinate mapping, ADB port selection, in-game
deletion chain, and PNG screenshot state reader are implemented and tested.
The Idle_Outpost factory can classify the observed new/existing account and
reset-dialog states from normalized template regions. A game may replace this
reader with OCR/OpenCV or an optional Appium/native-dialog backend when its UI
changes or when native selectors provide stronger evidence.

The current Motorola session was manually advanced into the game's `下一场景`
unlock dialog. That tutorial state is intentionally not treated as an account
home screen yet: the reader fails closed instead of guessing an account mode or
sending an unsafe tap. The state is now recognized as `next-scene-unlock` with
`accountMode: new`; its close target is exposed for an explicit route step,
while purchase and scene unlock remain outside automatic preparation.

The Motorola launch check also recognizes `startup-network-error` and retries
through its configured green `重试` action within the bounded startup
transition budget. A persistent network error is reported as a blocked device
state; it is never confused with account deletion success.

The cloud-sync splash is modeled as a transient startup state and is polled
within the same bounded budget before account classification. If it persists,
the run blocks instead of treating the splash as a new account.

After account deletion, the first-time intro story is recognized as
`startup-intro-story` with `accountMode: new`. Preparation leaves that story
visible for an explicit route decision and does not silently use the `点击跳过`
action.

After the story advances, the first equipment tutorial entry is recognized as
`first-equipment-entry`. The separate equipment route opens the sword workshop
build window and records evidence before any purchase decision.

On a zero-state account, that entry opens `equipment-build-window` rather than
an upgrade window. The build button is mapped as
`tutorial.equipment.build`; the separate build route executes it only after the
window state is verified.

The verified Motorola build action transitions to
`equipment-build-complete`; the completion state is recognized from the newly
created yellow workstation box and is used as the route assertion target.

The next tutorial checkpoint opens the configured `terrain-upgrade-first-available`
state. The first configured upgrade is `UpgradeId=1` with a 13-coin cost from
the verified snapshot. The purchase route only taps after this state is
recognized and waits for `terrain-upgrade-owned` afterward.

The route is `adapters/idle-outpost/routes/open-terrain-upgrade.yaml`. If the
game restores an upgrade window from its previous UI stack during launch, the
adapter closes that safe-to-dismiss window before the route reopens it.

The purchase route is
`adapters/idle-outpost/routes/buy-first-terrain-upgrade.yaml`. The Motorola
purchase evidence came from one guarded action using the configured normalized
point for the first item, which resolved to physical `(551,763)` on the
`720x1604` display. The post-action screenshot no longer contained the
`新增顾客 13` row and was classified as `terrain-upgrade-owned`. The route
itself was verified with real Motorola screenshots in an offline driver
fixture; no later upgrade item was clicked during live verification.

The second terrain-upgrade continuation route declares
`accountPolicy: preserve`, so its startup preparation does not delete a
previously verified account. It is guarded by the first-upgrade-owned state;
if the second upgrade is already owned, the route only asserts the terminal
state and captures evidence. The verified configuration fact for this step is
`UpgradeId=2` with a 30-coin cost.

The next Motorola continuation used the cost-ordered visible row rather than
the next numeric ID. The pre-action screenshot showed `利润加成 57`, the
configuration fact was `UpgradeId=4`, and one guarded tap at `(551,763)`
removed that row. The post-action screenshot showed only `加工加速 320`, which
is retained as the next unclicked item and classified as
`terrain-upgrade-third-owned`.

The fourth visible route is prepared for `UpgradeId=3` at 320 coins. No live
tap is included until the user explicitly authorizes that resource-consuming
action; the route requires `terrain-upgrade-third-owned` and will classify the
post-purchase screenshot as a separate terminal state.

The current tutorial route is
`adapters/idle-outpost/routes/dismiss-next-scene.yaml`. On the Motorola
`720x1604` screen it drives the calibrated `1-1` entry, waits for the
`下一场景` dialog, closes it, and verifies the returned `new-account` state.

The next equipment route is
`adapters/idle-outpost/routes/open-equipment-build.yaml`. It advances the
explicit intro story when needed, opens the first equipment entry, waits for
`equipment-build-window`, and records the build window without spending coins.

The sword workshop upgrade window is a separate recognized state. Its upgrade
button is configured but not auto-clicked while the approved Motorola account
is not at zero state; purchase verification is reserved for the next clean
account milestone.
