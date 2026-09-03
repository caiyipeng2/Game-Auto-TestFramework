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

The current tutorial route is
`adapters/idle-outpost/routes/dismiss-next-scene.yaml`. On the Motorola
`720x1604` screen it drives the calibrated `1-1` entry, waits for the
`下一场景` dialog, closes it, and verifies the returned `new-account` state.

The sword workshop upgrade window is a separate recognized state. Its upgrade
button is configured but not auto-clicked while the approved Motorola account
is not at zero state; purchase verification is reserved for the next clean
account milestone.
