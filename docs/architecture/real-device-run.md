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

- A reference Samsung device launched the Unity Activity successfully and
  showed the TestServer splash screen.
- A second authorized Android device was used for UI calibration at
  `720x1604`; the app stayed in the foreground after startup.
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

## Current execution boundary

The account branch, target coordinate mapping, ADB port selection, and
in-game deletion chain are implemented and host-tested. Unity Canvas state
recognition still comes from the adapter's injected state reader. ADB alone
does not expose the game's Canvas text/state as native UI nodes, so a concrete
image/OCR state backend or optional Appium/native-dialog backend is required
before the entire route can run unattended end to end.
