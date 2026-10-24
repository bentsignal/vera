import UIKit

/// How one list of rows becomes the next, by row ID: what the batch update
/// deletes, inserts, reloads, and updates in place, and what's new at the
/// bottom (arrivals). Pure, so Tests/ checks it.
struct ListDiff {
  /// Old indices of rows gone.
  var removed: [Int] = []
  /// New indices of rows new.
  var inserted: [Int] = []
  /// Old indices of rows that need another kind of cell.
  var reloaded: [Int] = []
  /// Rows (by ID) still there whose content or height changed.
  var changed: Set<String> = []
  /// Rows that stayed but changed order (rare): the list reloads.
  var reordered = false
  /// New indices of rows new below every row that was already there (the
  /// typing indicator, always last, doesn't count).
  var atBottom: [Int] = []
  /// Those that are messages that arrived while the list was open.
  var arrived: [Int] = []
  var newIndex: [String: Int] = [:]

  var isEmpty: Bool {
    removed.isEmpty && inserted.isEmpty && reloaded.isEmpty && changed.isEmpty && !reordered
  }

  /// `redraw` marks every surviving row changed (a new theme or width).
  init(old: [Row], oldHeights: [CGFloat], new: [Row], newHeights: [CGFloat], redraw: Bool = false) {
    var oldIndex: [String: Int] = [:]
    oldIndex.reserveCapacity(old.count)
    for (index, row) in old.enumerated() { oldIndex[row.id] = index }
    newIndex.reserveCapacity(new.count)
    for (index, row) in new.enumerated() { newIndex[row.id] = index }

    removed = old.indices.filter { newIndex[old[$0].id] == nil }
    inserted = new.indices.filter { oldIndex[new[$0].id] == nil }
    let survivorsOld = old.map(\.id).filter { newIndex[$0] != nil }
    let survivorsNew = new.map(\.id).filter { oldIndex[$0] != nil }
    reordered = survivorsOld != survivorsNew
    for (index, row) in new.enumerated() {
      guard let at = oldIndex[row.id] else { continue }
      if Self.cellKind(old[at]) != Self.cellKind(row) {
        reloaded.append(at)
      } else if redraw || old[at] != row || oldHeights[at] != newHeights[index] {
        changed.insert(row.id)
      }
    }
    let newIndex = self.newIndex
    let firstSurvivor = survivorsNew.first { id in newIndex[id].map { !new[$0].isTyping } ?? false }
      .flatMap { newIndex[$0] } ?? new.count
    atBottom = inserted.filter { $0 < firstSurvivor }
    arrived = atBottom.filter { new[$0].message?.arrived == true }
  }

  /// Which kind of cell draws a row (the reuse identifier).
  static func cellKind(_ row: Row) -> String {
    switch row.content {
    case .message: return "message"
    case .typing: return "typing"
    case .custom: return "custom"
    default: return "text"
    }
  }

  /// The IDs after this diff's deletes and inserts, as a batch update
  /// applies them to `old`: they must come out as the new list.
  func applied(to old: [String], new: [String]) -> [String] {
    var ids = old
    for index in removed.sorted(by: >) { ids.remove(at: index) }
    for index in inserted.sorted() { ids.insert(new[index], at: index) }
    return ids
  }
}
