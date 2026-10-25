import ExpoModulesCore
import UIKit

/// A normal Yoga container. The existing inner bar still owns all styling.
final class MessageListComposerView: ExpoView, VeraComposerMountObserver {
  var owner = "" {
    didSet { if owner != oldValue { ComposerMounts.lifetimeChanged() } }
  }
  var sequence = 0
  private(set) var composerSurface = -1

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isAccessibilityElement = false
    ComposerMounts.register(host: self)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    composerSurface = VeraComposerSurfaceForView(self)
    ComposerMounts.lifetimeChanged()
  }

  @objc func composerSurfaceDidMount(_ surface: Int, transaction: Int) {
    ComposerMounts.seal(surface: surface, transaction: transaction)
  }

  var mountedSample: ComposerLayout.Sample? {
    // This host wraps ONLY the existing measured bar. A changed layout
    // contract fails to legacy rather than silently adding padding twice.
    guard subviews.count == 1, let bar = subviews.first else { return nil }
    let tolerance = 1 / (window?.screen.scale ?? 1)
    guard abs(bar.frame.minX) <= tolerance, abs(bar.frame.minY) <= tolerance,
          abs(bar.bounds.width - bounds.width) <= tolerance,
          abs(bar.bounds.height - bounds.height) <= tolerance else { return nil }
    return ComposerLayout.Sample(host: ObjectIdentifier(self), sequence: sequence, height: bounds.height)
  }
}

/// Weak membership only. Bindings are matched within an attached surface/window,
/// never by a window-wide view search or a shared owner from another surface.
enum ComposerMounts {
  private final class WeakHost {
    weak var value: MessageListComposerView?
    init(_ value: MessageListComposerView) { self.value = value }
  }
  private final class WeakList {
    weak var value: MessageListView?
    init(_ value: MessageListView) { self.value = value }
  }
  private static let hosts = NSHashTable<MessageListComposerView>.weakObjects()
  private static let lists = NSHashTable<MessageListView>.weakObjects()
  private static var revision = 0
  private static var indexedRevision = -1
  private static var indexedHosts: [Int: [String: [WeakHost]]] = [:]
  private static var indexedLists: [Int: [WeakList]] = [:]
  private static var transactions: [Int: (number: Int, revision: Int)] = [:]

  static func register(host: MessageListComposerView) {
    hosts.add(host)
    lifetimeChanged()
  }

  static func register(list: MessageListView) {
    lists.add(list)
    lifetimeChanged()
  }

  static func lifetimeChanged() { revision += 1 }

  static func prepare(context: AppContext?) -> Bool {
    guard let context else { return false }
    let suffix = context.appIdentifier.map { "_\($0)" } ?? ""
    // Expo 57's default-view key and ViewModuleWrapper adapter naming.
    let adapters = [("MessageList", "DEFAULT_MODULE_VIEW"),
                    ("MessageList_MessageListComposer", "MessageListComposer")]
    guard VeraPrepareComposerMountClass(MessageListView.self),
          VeraPrepareComposerMountClass(MessageListComposerView.self) else { return false }
    for (name, view) in adapters {
      guard let adapter = ExpoFabricView.makeViewClass(
        forAppContext: context, moduleName: "MessageList", viewName: view,
        className: "ViewManagerAdapter_\(name)\(suffix)"
      ), VeraPrepareComposerMountClass(adapter) else { return false }
    }
    return true
  }

  static func seal(surface: Int, transaction: Int) {
    if let last = transactions[surface], last.number == transaction, last.revision == revision { return }
    if transactions.count > 32 { transactions.removeAll(keepingCapacity: true) }
    transactions[surface] = (transaction, revision)
    // Height-only mounts reuse weak membership. Surface ancestry is resolved
    // once on attachment, never in this hot seal callback.
    if indexedRevision != revision {
      indexedHosts.removeAll(keepingCapacity: true)
      indexedLists.removeAll(keepingCapacity: true)
      for host in hosts.allObjects where host.composerSurface >= 0 {
        indexedHosts[host.composerSurface, default: [:]][host.owner, default: []].append(WeakHost(host))
      }
      for list in lists.allObjects where list.composerSurface >= 0 {
        indexedLists[list.composerSurface, default: []].append(WeakList(list))
      }
      indexedRevision = revision
    }
    // All props/bounds are mounted already, so callback order is irrelevant.
    for entry in indexedLists[surface] ?? [] {
      guard let list = entry.value, let owner = list.composerOwner else { continue }
      let matching = (indexedHosts[surface]?[owner] ?? []).compactMap(\.value)
      let host = matching.count == 1 ? matching.first : nil
      list.composerDidMount(host: host, surface: surface, transaction: transaction)
    }
  }
}
