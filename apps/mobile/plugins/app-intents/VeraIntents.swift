import AppIntents
import Foundation

// Vera's App Shortcuts, in the Shortcuts app, Siri, Spotlight, and the
// Action button. Each one opens the app and leaves its name for
// JavaScript, which runs it (`modules/shortcuts`, with the same keys, and
// `src/features/shortcuts`). Copied into the app target by
// `plugins/with-app-intents.cjs`.

private func leaveForApp(_ shortcut: String) {
  let defaults = UserDefaults.standard
  defaults.set(shortcut, forKey: "chat.vera.shortcut.pending")
  defaults.set(Date().timeIntervalSince1970, forKey: "chat.vera.shortcut.pendingAt")
  NotificationCenter.default.post(name: Notification.Name("chat.vera.shortcut.ran"), object: nil)
}

/// Opens the conversation with Vera and starts dictating a message.
@available(iOS 16.0, *)
struct TalkToVeraIntent: AppIntent {
  static var title: LocalizedStringResource = "Talk to Vera"
  static var description = IntentDescription(
    "Opens your conversation with Vera and starts dictating a message.")
  static var openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    leaveForApp("talkToVera")
    return .result()
  }
}

@available(iOS 16.0, *)
struct VeraShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TalkToVeraIntent(),
      phrases: [
        "Talk to Vera in \(.applicationName)",
        "Dictate to Vera in \(.applicationName)",
        "Message Vera in \(.applicationName)",
      ],
      shortTitle: "Talk to Vera",
      systemImageName: "waveform")
  }
}
