import UIKit

/// When the insets JavaScript sends go in (contract `insets`). Pure, so
/// Tests/ checks it.
///
/// - Insets that come in the same props batch as new rows go in with those
///   rows (or later ones), in their one move: a send's shorter composer
///   (send-inset.ts) and the message sent make room together. Every rows
///   batch is measured and applied. Shared supplies a send's exact row
///   and acknowledged composer height together.
/// - While `keyboardFrozen` (menu-keyboard-hold.ts), insets wait, and go
///   in at the thaw, eased as the keyboard is.
/// - Otherwise they go in at the end of the batch.
///
/// There's one intent: the latest insets JavaScript sent. A newer one
/// replaces whatever waits, and insets back to what the list already has
/// cancel it, so an older value can never go in after a newer one.
/// Props come one setter at a time, in any order, then `batchEnded`.
struct InsetsGate {
  enum Step: Equatable {
    /// Nothing changes now.
    case none
    /// Apply these now, eased if back from a freeze.
    case now(UIEdgeInsets, eased: Bool)
    /// Wait for the rows of this version (`take`).
    case withRows(version: Int)
  }

  /// The insets the list is laid out with.
  private(set) var applied = UIEdgeInsets.zero
  /// The latest insets sent, if they aren't `applied` yet.
  private var waiting: UIEdgeInsets?
  /// `waiting` goes in with the rows of this version, or later ones.
  private var rowsVersion: Int?
  private var sentThisBatch = false
  private var thawedThisBatch = false

  init(applied: UIEdgeInsets = .zero) {
    self.applied = applied
  }

  mutating func received(_ insets: UIEdgeInsets) {
    sentThisBatch = true
    guard insets != applied else {
      // Back to what's laid out: whatever waited is cancelled.
      waiting = nil
      rowsVersion = nil
      return
    }
    waiting = insets
  }

  /// `keyboardFrozen` went false in this batch.
  mutating func thawed() {
    thawedThisBatch = true
  }

  /// The batch's props are all set. `rowsChanged` with `placed`: the rows
  /// will be measured and applied, and `rowsVersion` is theirs. Insets
  /// already waiting for earlier rows keep waiting for them, unless this
  /// batch sent insets or ended a freeze.
  mutating func batchEnded(rowsChanged: Bool, placed: Bool, frozen: Bool, rowsVersion version: Int, holdingRows: Bool = false) -> Step {
    let sent = sentThisBatch
    let thawed = thawedThisBatch
    sentThisBatch = false
    thawedThisBatch = false
    guard let next = waiting else { return .none }
    // Record pairing even if this batch is already frozen. A thaw of a
    // held row apply must not commit its inset as a standalone update.
    if placed, holdingRows || rowsChanged && (sent || thawed) {
      rowsVersion = version
      guard !frozen else { return .none }
      return .withRows(version: version)
    }
    guard !frozen, sent || thawed else { return .none }
    commit(next)
    return .now(next, eased: thawed)
  }

  /// Whether these rows carry the pending inset. The view holds the
  /// entire measured result when frozen, not just its inset.
  func carriesInsets(forRows version: Int) -> Bool {
    guard waiting != nil, let wanted = rowsVersion else { return false }
    return version >= wanted
  }

  /// The rows of `version` are going in: the latest insets, if they were
  /// sent with these rows or earlier ones, and no freeze holds them. Rows
  /// measured before the insets came don't take them.
  mutating func take(forRows version: Int, frozen: Bool) -> UIEdgeInsets? {
    guard let next = waiting, let wanted = rowsVersion, version >= wanted, !frozen else { return nil }
    commit(next)
    return next
  }

  private mutating func commit(_ next: UIEdgeInsets) {
    waiting = nil
    rowsVersion = nil
    applied = next
  }
}
