import ExpoModulesCore
import UIKit

// The escape hatch: a row kind native can't draw yet (a poll, a custom
// card) drawn by React inside a native cell. JavaScript renders the row's
// component inside a `MessageListRow` (this view) as a child of the list,
// one for each custom row it can draw. The list keeps each in its row's
// cell, and React's layout gives the row its height. Slower than a native
// row, so it's for rare kinds; until a row's view arrives (and on binaries
// without the `customRows` feature) the row shows its `fallbackText`.

/// A custom row's React content, mounted by JavaScript as a child of the
/// list (`MessageListRow`).
final class CustomRowView: ExpoView {
  /// The row it draws.
  var rowId = "" {
    didSet {
      if rowId != oldValue { owner?.customRowChanged(self, from: oldValue) }
    }
  }
  /// The list it's mounted in.
  weak var owner: MessageListView?
  private var reportedHeight: CGFloat = -1

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
  }

  /// React lays it out: its height is the row's.
  override func layoutSubviews() {
    super.layoutSubviews()
    reportHeight()
  }

  override var bounds: CGRect {
    didSet { reportHeight() }
  }

  private func reportHeight() {
    let height = ceil(bounds.height)
    guard height != reportedHeight else { return }
    reportedHeight = height
    owner?.customRowResized(self)
  }
}

/// The cell a custom row is drawn in: its React view, or its fallback text
/// until that's mounted and laid out.
final class CustomRowCell: RowCell {
  private weak var hosted: CustomRowView?
  private let fallback = TextView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.addSubview(fallback)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func configure(_ row: Row, _ layout: RowLayout, state: ListState, animated: Bool) {
    super.configure(row, layout, state: state, animated: animated)
    if case let .fallback(box, _) = layout {
      fallback.isHidden = false
      fallback.text = box.string
      fallback.frame = box.frame
      accessibilityLabel = box.string.string
    } else {
      fallback.isHidden = true
    }
    let view: CustomRowView? = {
      guard case .custom = layout else { return nil }
      return state.customRows[row.id]
    }()
    if let hosted, hosted !== view, hosted.superview === contentView {
      hosted.removeFromSuperview()
    }
    hosted = view
    isAccessibilityElement = view == nil
    guard let view else { return }
    if view.superview !== contentView {
      contentView.addSubview(view)
    }
    // React places it at the top left; the cell is its row.
    UIView.performWithoutAnimation {
      view.frame.origin = .zero
    }
    accessibilityElements = [view]
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    if let hosted, hosted.superview === contentView { hosted.removeFromSuperview() }
    hosted = nil
  }
}
