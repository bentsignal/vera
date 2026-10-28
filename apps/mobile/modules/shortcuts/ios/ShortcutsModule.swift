import ExpoModulesCore
import Foundation

/// Where the app's App Intents (`plugins/app-intents/VeraIntents.swift`,
/// in the app target) leave a shortcut to run. They can't call into this
/// module, so they write it to `UserDefaults` and post a notification.
/// The same names are in that file.
private let pendingKey = "chat.vera.shortcut.pending"
private let pendingAtKey = "chat.vera.shortcut.pendingAt"
private let ranNotification = Notification.Name("chat.vera.shortcut.ran")
/// A shortcut left longer ago than this (the app was killed before
/// JavaScript took it) isn't run.
private let freshFor: TimeInterval = 60

/// Hands shortcuts run from the Shortcuts app, Siri, or the Action button
/// to JavaScript: `takePending()` returns one waiting (once), and
/// `onShortcut` says one just arrived.
public class ShortcutsModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("VeraShortcuts")

    Events("onShortcut")

    Function("takePending") { () -> String? in
      let defaults = UserDefaults.standard
      let shortcut = defaults.string(forKey: pendingKey)
      let at = defaults.double(forKey: pendingAtKey)
      defaults.removeObject(forKey: pendingKey)
      defaults.removeObject(forKey: pendingAtKey)
      guard let shortcut, Date().timeIntervalSince1970 - at < freshFor else { return nil }
      return shortcut
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
