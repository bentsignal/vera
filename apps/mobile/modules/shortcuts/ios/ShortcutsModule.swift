import ExpoModulesCore
import Foundation

/// Where the app's App Intents (`plugins/app-intents/VeraIntents.swift`,
/// in the app target) read the chats to offer and leave the one to open.
/// They can't call into this module, so they share `UserDefaults` and a
/// notification. The same names are in that file.
private let chatsKey = "chat.vera.shortcut.chats"
private let pendingKey = "chat.vera.shortcut.pending"
private let pendingAtKey = "chat.vera.shortcut.pendingAt"
private let ranNotification = Notification.Name("chat.vera.shortcut.ran")
/// A shortcut left longer ago than this (the app was killed before
/// JavaScript took it) isn't run.
private let freshFor: TimeInterval = 60

/// Connects Vera's App Shortcuts to JavaScript: `setChats` lists the chats
/// the Shortcuts app offers, `takePending()` returns a shortcut waiting to
/// run (once), and `onShortcut` says one just arrived.
public class ShortcutsModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("VeraShortcuts")

    Events("onShortcut")

    Function("setChats") { (chats: [[String: String]]) in
      let defaults = UserDefaults.standard
      if let listed = defaults.array(forKey: chatsKey) as? [[String: String]], listed == chats {
        return
      }
      defaults.set(chats, forKey: chatsKey)
      // The "Open <chat> in Vera" shortcuts, in the app target.
      if let refresh = NSClassFromString("VeraAppShortcutsRefresh") {
        _ = (refresh as AnyObject).perform(NSSelectorFromString("refresh"))
      }
    }

    Function("takePending") { () -> [String: String]? in
      let defaults = UserDefaults.standard
      let pending = defaults.dictionary(forKey: pendingKey) as? [String: String]
      let at = defaults.double(forKey: pendingAtKey)
      defaults.removeObject(forKey: pendingKey)
      defaults.removeObject(forKey: pendingAtKey)
      guard let pending, Date().timeIntervalSince1970 - at < freshFor else { return nil }
      return pending
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: ranNotification, object: nil, queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onShortcut", [:])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }
  }
}
