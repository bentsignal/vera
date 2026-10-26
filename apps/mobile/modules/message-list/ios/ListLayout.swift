import UIKit

/// A single column of rows whose heights are known from data. The
/// collection view is flipped, so y = 0 is the bottom of the list: row 0
/// (the newest) sits there, and older rows stack upward. Older pages are
/// appended past the top, so they never move what's on screen.
final class ListLayout: UICollectionViewLayout {
  private(set) var ids: [String] = []
  private(set) var heights: [CGFloat] = []
  private var offsets: [CGFloat] = []
  private var total: CGFloat = 0
  private var cache: [Int: UICollectionViewLayoutAttributes] = [:]

  // The layout before the last update, for animating rows from where they were.
  private var oldIds: [String] = []
  private var oldOffsets: [CGFloat] = []
  private var oldHeights: [CGFloat] = []
  private var oldIndexById: [String: Int]?
  private var newIndexById: [String: Int]?

  func update(ids: [String], heights: [CGFloat]) {
    oldIds = self.ids
    oldOffsets = offsets
    oldHeights = self.heights
    oldIndexById = nil
    newIndexById = nil
    self.ids = ids
    self.heights = heights
    offsets = []
    offsets.reserveCapacity(heights.count)
    var y: CGFloat = 0
    for height in heights {
      offsets.append(y)
      y += height
    }
    total = y
    cache.removeAll(keepingCapacity: true)
    invalidateLayout()
  }

  /// All the rows, stacked.
  var contentHeight: CGFloat { total }

  func frame(at index: Int) -> CGRect {
    guard index >= 0, index < offsets.count else { return .zero }
    return CGRect(x: 0, y: offsets[index], width: collectionView?.bounds.width ?? 0, height: heights[index])
  }

  /// Where the row with this ID is, in content coordinates.
  func frame(of id: String) -> CGRect? {
    guard let index = indexById()[id] else { return nil }
    return frame(at: index)
  }

  func indexById() -> [String: Int] {
    if let newIndexById { return newIndexById }
    var map: [String: Int] = [:]
    map.reserveCapacity(ids.count)
    for (index, id) in ids.enumerated() { map[id] = index }
    newIndexById = map
    return map
  }

  /// Where the row with this ID was before the last update.
  func oldFrame(of id: String) -> CGRect? {
    guard let index = oldIndex(of: id), index < oldOffsets.count else { return nil }
    return CGRect(x: 0, y: oldOffsets[index], width: collectionView?.bounds.width ?? 0, height: oldHeights[index])
  }

  private func oldIndex(of id: String) -> Int? {
    if oldIndexById == nil {
      var map: [String: Int] = [:]
      for (index, id) in oldIds.enumerated() { map[id] = index }
      oldIndexById = map
    }
    return oldIndexById?[id]
  }

  override var collectionViewContentSize: CGSize {
    CGSize(width: collectionView?.bounds.width ?? 0, height: total)
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    newBounds.width != collectionView?.bounds.width
  }

  private func attributes(_ index: Int) -> UICollectionViewLayoutAttributes {
    if let cached = cache[index], cached.frame.width == collectionView?.bounds.width { return cached }
    let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 0))
    attributes.frame = frame(at: index)
    cache[index] = attributes
    return attributes
  }

  /// The first row whose bottom edge is past `y`.
  private func firstIndex(after y: CGFloat) -> Int {
    var low = 0
    var high = offsets.count
    while low < high {
      let mid = (low + high) / 2
      if offsets[mid] + heights[mid] <= y { low = mid + 1 } else { high = mid }
    }
    return low
  }

  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    var result: [UICollectionViewLayoutAttributes] = []
    var index = firstIndex(after: rect.minY)
    while index < offsets.count, offsets[index] < rect.maxY {
      result.append(attributes(index))
      index += 1
    }
    return result
  }

  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    guard indexPath.item < offsets.count else { return nil }
    return attributes(indexPath.item)
  }
}
