import UIKit

/// The list's collection view, read by VoiceOver top to bottom (oldest
/// first) like any conversation, even though it's flipped and its rows are
/// numbered from the bottom. Three-finger swipes page through it.
final class ListCollectionView: UICollectionView {
  /// Pages back (older) or forward (newer); the list sends its events.
  var onAccessibilityScroll: ((UIAccessibilityScrollDirection) -> Bool)?

  override var accessibilityElements: [Any]? {
    get {
      // The rows on screen, in reading order: top of the screen first.
      visibleCells
        .filter { !$0.isHidden && $0.alpha > 0 && ($0 as? RowCell)?.contentView.alpha != 0 }
        .sorted { convert($0.frame, to: nil).minY < convert($1.frame, to: nil).minY }
    }
    set {}
  }

  override func accessibilityScroll(_ direction: UIAccessibilityScrollDirection) -> Bool {
    onAccessibilityScroll?(direction) ?? false
  }
}
