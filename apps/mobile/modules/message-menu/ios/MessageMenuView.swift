import ExpoModulesCore
import UIKit

/// A message wrapped in the system context menu: a long press lifts the
/// message (shaped like its bubble), dims the rest, and shows a palette of
/// reactions above the actions, like Messages.
final class MessageMenuView: ExpoView, UIContextMenuInteractionDelegate {
  let onReact = EventDispatcher()
  let onAction = EventDispatcher()

  var reactions: [String] = [] {
    didSet { refreshVisibleMenu() }
  }
  var selectedReactions: Set<String> = [] {
    didSet { refreshVisibleMenu() }
  }
  var actions: [MessageMenuAction] = [] {
    didSet { refreshVisibleMenu() }
  }
  var previewCornerRadius: CGFloat = 18
  /// How far the lifted preview reaches past the message on every side.
  var previewInset: CGFloat = 0
  /// Lifts the message on the page color instead of clipping to its shape.
  var previewBackground = false
  var menuEnabled = true

  private var interaction: UIContextMenuInteraction?
  private static var emojiImages: [String: UIImage] = [:]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    let interaction = UIContextMenuInteraction(delegate: self)
    addInteraction(interaction)
    self.interaction = interaction
  }

  // MARK: - UIContextMenuInteractionDelegate

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard menuEnabled else { return nil }
    cancelReactNativeTouches()
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) {
      [weak self] _ in
      self?.makeMenu()
    }
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    highlightPreviewForItemWithIdentifier identifier: any NSCopying
  ) -> UITargetedPreview? {
    targetedPreview()
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    dismissalPreviewForItemWithIdentifier identifier: any NSCopying
  ) -> UITargetedPreview? {
    targetedPreview()
  }

  // MARK: - Preview

  /// Lifts the message itself, clipped to its bubble (or a card around it).
  private func targetedPreview() -> UITargetedPreview? {
    guard window != nil else { return nil }
    let content = subviews.first ?? self
    let parameters = UIPreviewParameters()
    parameters.backgroundColor = previewBackground ? .systemBackground : .clear
    parameters.visiblePath = UIBezierPath(
      roundedRect: content.bounds.insetBy(dx: -previewInset, dy: -previewInset),
      cornerRadius: previewCornerRadius)
    return UITargetedPreview(view: content, parameters: parameters)
  }

  // MARK: - Menu

  private func makeMenu() -> UIMenu {
    var sections: [UIMenuElement] = []
    if !reactions.isEmpty {
      sections.append(reactionPalette())
    }
    let items = actions.map { item in
      UIAction(
        title: item.title,
        image: item.systemImage.flatMap { UIImage(systemName: $0) },
        attributes: item.destructive ? .destructive : []
      ) { [weak self] _ in
        self?.onAction(["id": item.id])
      }
    }
    if !items.isEmpty {
      sections.append(UIMenu(title: "", options: .displayInline, children: items))
    }
    return UIMenu(title: "", children: sections)
  }

  private func reactionPalette() -> UIMenu {
    let items = reactions.map { emoji in
      let action = UIAction(title: emoji, image: Self.image(for: emoji)) { [weak self] _ in
        self?.onReact(["emoji": emoji])
      }
      action.accessibilityLabel = "React \(emoji)"
      action.state = selectedReactions.contains(emoji) ? .on : .off
      return action
    }
    if #available(iOS 17.0, *) {
      return UIMenu(title: "", options: [.displayInline, .displayAsPalette], children: items)
    }
    return UIMenu(title: "React", children: items)
  }

  private func refreshVisibleMenu() {
    interaction?.updateVisibleMenu { [weak self] menu in
      self?.makeMenu() ?? menu
    }
  }

  /// Emoji drawn as images: palette items show images, not titles.
  private static func image(for emoji: String) -> UIImage {
    if let cached = emojiImages[emoji] { return cached }
    let size = CGSize(width: 34, height: 34)
    let text = NSAttributedString(
      string: emoji, attributes: [.font: UIFont.systemFont(ofSize: 28)])
    let bounds = text.boundingRect(
      with: size, options: [.usesLineFragmentOrigin], context: nil)
    let image = UIGraphicsImageRenderer(size: size).image { _ in
      text.draw(
        at: CGPoint(
          x: (size.width - bounds.width) / 2, y: (size.height - bounds.height) / 2))
    }.withRenderingMode(.alwaysOriginal)
    emojiImages[emoji] = image
    return image
  }

  // A press released before the menu presents still reaches React Native as a
  // tap; cancel in-flight touches on the surface when the menu begins.
  private func cancelReactNativeTouches() {
    guard let handlerClass = NSClassFromString("RCTSurfaceTouchHandler") else { return }
    var view: UIView? = self
    while let current = view {
      if let recognizer = current.gestureRecognizers?.first(where: {
        $0.isKind(of: handlerClass)
      }) {
        if recognizer.isEnabled {
          recognizer.isEnabled = false
          recognizer.isEnabled = true
        }
        return
      }
      view = current.superview
    }
  }
}
