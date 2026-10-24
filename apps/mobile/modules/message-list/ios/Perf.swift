import os

// Signposts for profiling the list in any build, release included: open
// Instruments' Points of Interest (or `xctrace record --template
// "Time Profiler"` with the os_signpost instrument) and filter on the
// "chat.vera.message-list" subsystem. Each interval is a piece of main
// thread work the list does: measuring the first rows, applying a batch,
// placing the first rows, and making a cell. With no recording running,
// a signpost costs about a branch.

enum Perf {
  private static let signposter = OSSignposter(subsystem: "chat.vera.message-list", category: .pointsOfInterest)

  /// Whether a recording wants signposts: work done only to describe one
  /// (a hit test) can be skipped otherwise.
  static var isEnabled: Bool { signposter.isEnabled }

  struct Interval {
    fileprivate let name: StaticString
    fileprivate let state: OSSignpostIntervalState
  }

  static func begin(_ name: StaticString, _ detail: @autoclosure () -> String = "") -> Interval {
    let id = signposter.makeSignpostID()
    guard signposter.isEnabled else {
      return Interval(name: name, state: signposter.beginInterval(name, id: id))
    }
    let text = detail()
    return Interval(name: name, state: signposter.beginInterval(name, id: id, "\(text, privacy: .public)"))
  }

  /// A moment, with what happened.
  static func event(_ name: StaticString, _ detail: @autoclosure () -> String) {
    guard signposter.isEnabled else { return }
    let text = detail()
    signposter.emitEvent(name, "\(text, privacy: .public)")
  }

  static func end(_ interval: Interval) {
    signposter.endInterval(interval.name, interval.state)
  }
}
