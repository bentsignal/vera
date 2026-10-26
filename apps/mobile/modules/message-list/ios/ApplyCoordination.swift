import Foundation

/// Native work identity. Requests may change without a rows prop (width,
/// theme, a custom row, or an optimistic reaction). Only the latest may
/// replace the displayed list or release a pair held through a freeze.
struct RowApplyOrder {
  private(set) var generation = 0
  private(set) var held = false

  mutating func request() -> Int {
    generation += 1
    return generation
  }

  func accepts(_ request: Int) -> Bool { request == generation }
  mutating func hold() { held = true }
  mutating func applied() { held = false }

  mutating func detached() {
    generation += 1
    held = false
  }
}

/// A generic request to follow the latest end, not an acknowledgement of
/// a send. Shared arms it after its own exact-row/height readiness. It
/// survives row applies and scroll completion, until user navigation or
/// another command replaces it. No target is hidden waiting for this.
struct LatestIntent {
  private(set) var generation = 0
  private(set) var floor: Int?

  mutating func begin(rowsVersion: Int) {
    generation += 1
    floor = rowsVersion
  }

  mutating func cancel() {
    generation += 1
    floor = nil
  }

  func follows(rowsVersion: Int, generation request: Int) -> Bool {
    guard request == generation, let floor else { return false }
    return rowsVersion >= floor
  }
}
