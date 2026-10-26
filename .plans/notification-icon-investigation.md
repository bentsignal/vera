# Alternate icons in iOS notifications

Issue: [#172](https://github.com/bentsignal/vera/issues/172).
Investigated October 25, 2026, at `a4a98ffe`.

## Result

Reproduced in Vera Dev on the worktree's iPhone 17 Pro simulator running
iOS 27.0. The Home Screen follows the selected icon, but subsequent
notifications keep the first icon Notification Center displayed. No tested
public API operation refreshed it. No product code was changed.

This is consistent with an iOS notification icon cache problem. Alternate
icons are not categorically unsupported in notifications: the first blue
notification displayed correctly. The failure was updating it afterward.

## Reproduction

1. Start this worktree with `scripts/sim.sh up`.
2. Select `vera-blue` through the same native module the picker uses,
   `ExpoAlternateAppIcons.setAlternateAppIcon`, and accept iOS's icon alert.
3. Grant notification authorization. Background or terminate Vera Dev, then
   send a plain test push with `xcrun simctl push <udid> chat.vera.app.dev`.
   Its `aps.alert` needs a title and body. Open Notification Center. The
   notification shows the blue icon.
4. Select `vera-purple`, accept the alert, and verify the module's
   `getAppIconName()` returns `vera-purple`. The Home Screen shows purple.
5. Send another notification. It still shows blue.

These calls were made through `scripts/sim.sh eval` against this worktree's
app, without editing its source. No account or backend changes were needed.

## Checks and attempted remedies

- The installed app's `Info.plist` lists every alternate under both
  `CFBundleIcons` and `CFBundleIcons~ipad`. Each has the expected
  `CFBundleIconName`. The blue and purple icons render correctly in the
  system's icon-change alert and on the Home Screen.
- The dependency calls `UIApplication.shared.setAlternateIconName` on the
  main actor. The config plugin sets
  `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` and includes all icon assets.
- Relaunching Vera Dev did not refresh the notification icon.
- Repeating `UNUserNotificationCenter.requestAuthorization` through
  `ExpoNotificationPermissionsModule.requestPermissionsAsync` resolved with
  permission granted. New notifications still showed blue.
- `ExpoBadgeModule.setBadgeCountAsync(1)` resolved successfully. New
  notifications still showed blue.
- Dismissing every delivered test notification through
  `ExpoNotificationPresenter.dismissAllNotificationsAsync` completed. The
  next notification still showed blue, even without an existing group.
- Switching to the primary icon and then back to purple completed, with
  the system alert for each switch. New notifications still showed blue.
- APNs registration was requested through
  `ExpoPushTokenManager.getDevicePushTokenAsync`, but no token or error
  callback arrived during the test. This does not establish whether
  completed APNs re-registration would help on a phone.

The device was closed in T3 and shut down with `scripts/sim.sh down` after
capturing evidence.

## Evidence

- [First blue notification](https://vera-evidence.b-cdn.net/pr/t3-notification-icon-investigation/20261025-204310-d2928b69/notification-blue-center.png)
- [Purple Home Screen icon](https://vera-evidence.b-cdn.net/pr/t3-notification-icon-investigation/20261025-204310-d2928b69/home-purple.png)
- [New notification after selecting purple, still blue](https://vera-evidence.b-cdn.net/pr/t3-notification-icon-investigation/20261025-204310-d2928b69/notification-purple-center.png)
- [Still blue after authorization, badge update, and clearing notifications](https://vera-evidence.b-cdn.net/pr/t3-notification-icon-investigation/20261025-204310-d2928b69/notification-after-refreshes.png)
- [Still blue after switching to primary and back to purple](https://vera-evidence.b-cdn.net/pr/t3-notification-icon-investigation/20261025-204310-d2928b69/notification-after-icon-reset.png)

## Limits and next steps

The test pushes were injected by `simctl`. They exercise iOS's app icon in
plain notifications and skip Vera's communication notification extension.
The small app icon beside the sender photo on a real communication push
still needs a phone check. No physical device, production build, or device
restart was tested here.

Apple documents no per-notification app icon property or public notification
icon cache invalidation API. Changing sender photos or adding an attachment
would change notification content rather than fix the system's app icon.
There is no verified app change to ship from these experiments.

On an affected phone, compare a fresh notification before and after a
restart, and record the iOS version and icon appearance. If it persists,
file Apple feedback with that reproduction and a sysdiagnose. Keep #172
open until phone evidence supports resolving it.

## Sources

- [Apple's alternate icon configuration](https://developer.apple.com/documentation/xcode/configuring-your-app-to-use-alternate-app-icons)
- [Notification content API](https://developer.apple.com/documentation/usernotifications/unmutablenotificationcontent)
- [Exact alternate icon regression report and Apple DTS response](https://developer.apple.com/forums/thread/780095).
  The developer reports the issue beginning with iOS 18.1 and a restart
  refreshing the icon. Apple DTS asks for a Feedback Assistant report.
- [Related stale icon after an app update](https://developer.apple.com/forums/thread/775787).
  Apple acknowledges that issue as known and under investigation, and
  expects a restart to refresh the icon. This concerns an app update,
  rather than an in-app alternate icon selection.
