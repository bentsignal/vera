import AppIntents
import Foundation

// Vera's App Shortcuts, in the Shortcuts app, Siri, Spotlight, and the
// Action button. "Open Chat" opens a chat you pick, ready to type. The
// chats to pick from are the ones JavaScript last listed
// (`modules/shortcuts`, with the same keys). Running it opens the app and
// leaves the chat for JavaScript, which opens it with the keyboard up
// (`src/features/shortcuts`). Copied into the app target by
// `plugins/with-app-intents.cjs`.

private let chatsKey = "chat.vera.shortcut.chats"
private let pendingKey = "chat.vera.shortcut.pending"
private let pendingAtKey = "chat.vera.shortcut.pendingAt"
private let ranNotification = Notification.Name("chat.vera.shortcut.ran")

/// A chat to open: a conversation, as one of the signed-in accounts.
@available(iOS 16.0, *)
struct ChatEntity: AppEntity {
  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Chat")
  static var defaultQuery = ChatQuery()

  /// The account and conversation, so a saved shortcut still opens its
  /// chat after it drops out of the recent ones listed.
  let id: String
  let name: String
  let detail: String

  var account: String { String(id.prefix(while: { $0 != "\n" })) }
  var conversationId: String { String(id.drop(while: { $0 != "\n" }).dropFirst()) }

  var displayRepresentation: DisplayRepresentation {
    detail.isEmpty
      ? DisplayRepresentation(title: "\(name)")
      : DisplayRepresentation(title: "\(name)", subtitle: "\(detail)")
  }

  /// The chats JavaScript last listed, most recent first.
  static func listed() -> [ChatEntity] {
    let stored = UserDefaults.standard.array(forKey: chatsKey) as? [[String: String]] ?? []
    return stored.compactMap { chat in
      guard let account = chat["account"], let conversationId = chat["conversationId"],
        let name = chat["name"]
      else { return nil }
      return ChatEntity(
        id: "\(account)\n\(conversationId)", name: name, detail: chat["detail"] ?? "")
    }
  }
}

@available(iOS 16.0, *)
struct ChatQuery: EntityStringQuery {
  func entities(for identifiers: [ChatEntity.ID]) async throws -> [ChatEntity] {
    let listed = ChatEntity.listed()
    return identifiers.map { id in
      listed.first { $0.id == id } ?? ChatEntity(id: id, name: "Chat", detail: "")
    }
  }

  func entities(matching string: String) async throws -> [ChatEntity] {
    ChatEntity.listed().filter { $0.name.localizedCaseInsensitiveContains(string) }
  }

  func suggestedEntities() async throws -> [ChatEntity] {
    ChatEntity.listed()
  }
}

/// Opens a chat with the keyboard up, ready to type or dictate.
@available(iOS 16.0, *)
struct OpenChatIntent: AppIntent {
  static var title: LocalizedStringResource = "Open Chat"
  static var description = IntentDescription("Opens a chat in Vera, ready to type.")
  static var openAppWhenRun = true

  @Parameter(title: "Chat")
  var chat: ChatEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Open \(\.$chat)")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    let defaults = UserDefaults.standard
    defaults.set(
      ["action": "openChat", "account": chat.account, "conversationId": chat.conversationId],
      forKey: pendingKey)
    defaults.set(Date().timeIntervalSince1970, forKey: pendingAtKey)
    NotificationCenter.default.post(name: ranNotification, object: nil)
    return .result()
  }
}

@available(iOS 16.0, *)
struct VeraShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenChatIntent(),
      phrases: [
        "Open \(\.$chat) in \(.applicationName)",
        "Message \(\.$chat) in \(.applicationName)",
        "Open a chat in \(.applicationName)",
      ],
      shortTitle: "Open Chat",
      systemImageName: "bubble.left.and.text.bubble.right")
  }
}

/// Lets `modules/shortcuts`, which can't see this target, ask iOS to list
/// the "Open <chat> in Vera" shortcuts again when the chats change.
@objc(VeraAppShortcutsRefresh)
final class VeraAppShortcutsRefresh: NSObject {
  @objc static func refresh() {
    if #available(iOS 16.0, *) {
      VeraShortcuts.updateAppShortcutParameters()
    }
  }
}
