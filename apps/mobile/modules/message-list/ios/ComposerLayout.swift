import UIKit

/// A landing owns its destination until every real view has gone home.
struct ComposerLandingTokens {
  private var next = 0
  private var pending = Set<Int>()
  var active: Bool { !pending.isEmpty }

  mutating func begin() -> Int {
    next += 1
    pending.insert(next)
    return next
  }

  mutating func restored(_ token: Int) -> Bool { pending.remove(token) != nil }
}

/// Only the release already authorized when this close began may bypass a
/// frozen pair. Newer work can remeasure that release, never expand it.
struct ComposerClose {
  struct Permission {
    let authority: ComposerLayout.Authority
    let token: Int
    let workFloor: Int
  }

  private(set) var permission: Permission?
  private var token = 0

  mutating func begin(_ authority: ComposerLayout.Authority?, applied: Int, work: Int) {
    cancel()
    guard let authority, authority.release > applied else { return }
    permission = Permission(authority: authority, token: token, workFloor: work)
  }

  @discardableResult
  mutating func cancel() -> Bool {
    let active = permission != nil
    token += 1
    permission = nil
    return active
  }

  func current(in layout: ComposerLayout) -> Bool {
    guard let permission else { return false }
    return permission.token == token && layout.accepts(permission.authority)
      && layout.binding?.release == permission.authority.release
  }

  func permits(_ authority: ComposerLayout.Authority, work: Int, layout: ComposerLayout) -> Bool {
    guard let permission, current(in: layout), work >= permission.workFloor else { return false }
    let captured = permission.authority
    return authority.owner == captured.owner && authority.generation == captured.generation
      && authority.release == captured.release && layout.canApply(authority)
  }
}

/// Revision 3's local geometry authority. No editor text or predicted size.
struct ComposerLayout {
  struct Binding: Equatable {
    let owner: String
    let release: Int
    let gap: CGFloat

    init?(json: JSON?) {
      guard let json, let owner = json["owner"] as? String, !owner.isEmpty,
            let release = json["release"] as? NSNumber,
            let gap = json["gap"] as? NSNumber,
            release.doubleValue.isFinite, release.doubleValue >= 0,
            release.doubleValue.rounded() == release.doubleValue,
            release.doubleValue < Double(Int.max),
            gap.doubleValue.isFinite, gap.doubleValue >= 0 else { return nil }
      self.owner = owner
      self.release = release.intValue
      self.gap = CGFloat(gap.doubleValue)
    }
  }

  struct Sample: Equatable {
    let host: ObjectIdentifier
    let sequence: Int
    let height: CGFloat
  }

  /// Captured with a full rows snapshot, never borrowed from a later release.
  struct Authority: Equatable {
    let owner: String
    let generation: Int
    let release: Int
    let inset: UIEdgeInsets
  }

  private(set) var binding: Binding?
  private(set) var generation = 0
  private(set) var appliedRelease = 0
  private(set) var sealed = false
  private(set) var sample: Sample?
  private(set) var legacy = false
  private var releaseInset = UIEdgeInsets.zero
  private var host: ObjectIdentifier?
  private var hasApplied = false
  private var invalidBinding = false
  private var lastReactInset = UIEdgeInsets.zero
  private var legacyBottom: CGFloat?

  var pending: Bool { binding.map { $0.release > appliedRelease } ?? false }

  /// All prop setters have finished. Even unchanged-height releases need work.
  mutating func configure(_ next: Binding?, inset: UIEdgeInsets) -> Bool {
    sealed = false
    if legacy, inset != lastReactInset { legacyBottom = inset.bottom }
    lastReactInset = inset
    let previous = binding
    guard next?.owner == previous?.owner else {
      generation += 1
      binding = next
      appliedRelease = 0
      sample = nil
      host = nil
      legacy = false
      hasApplied = false
      invalidBinding = false
      legacyBottom = nil
      releaseInset = inset
      return true
    }
    guard let next else { return false }
    if let previous, next.release < previous.release {
      // Preserve the last authorized release in explicit legacy mode.
      if !invalidBinding { generation += 1 }
      invalidBinding = true
      legacy = true
      sample = nil
      host = nil
      return true
    }
    invalidBinding = false
    binding = next
    if previous?.release != next.release {
      releaseInset = inset
      return true
    }
    return false
  }

  /// Called only after every mutation on the surface, including host props.
  /// A mode/host change invalidates results, not the persistent applied release.
  @discardableResult
  mutating func seal(_ next: Sample?) -> Bool {
    sealed = true
    guard binding != nil else { return false }
    let valid = (invalidBinding ? nil : next).flatMap { value -> Sample? in
      guard value.sequence >= appliedRelease, value.height.isFinite, value.height > 0 else { return nil }
      if let sample, sample.host == value.host, value.sequence < sample.sequence { return nil }
      return value
    }
    let changed = legacy != (valid == nil) || (valid != nil && host != valid?.host)
    if changed { generation += 1 }
    legacy = valid == nil
    if changed { legacyBottom = nil }
    sample = valid
    host = valid?.host
    return changed
  }

  func capture(inset: UIEdgeInsets, fallback: UIEdgeInsets) -> Authority? {
    guard let binding else { return nil }
    return Authority(owner: binding.owner, generation: generation,
                     release: binding.release, inset: pending ? releaseInset : (hasApplied ? inset : fallback))
  }

  func accepts(_ authority: Authority) -> Bool {
    binding?.owner == authority.owner && authority.generation == generation
  }

  func canApply(_ authority: Authority) -> Bool {
    guard sealed, accepts(authority) else { return false }
    // Absence after a complete mount explicitly releases through legacy geometry.
    return legacy || (sample?.sequence ?? -1) >= authority.release
  }

  func target(for authority: Authority, current: UIEdgeInsets, top: CGFloat) -> UIEdgeInsets {
    var target = current
    target.top = top
    if let binding, let sample, !legacy, sample.sequence == authority.release {
      target.bottom = sample.height + binding.gap
    } else if authority.release > appliedRelease || legacy || !hasApplied {
      // In particular S cannot consume the mounted height of a newer T.
      target.bottom = authority.inset.bottom
    }
    return target
  }

  mutating func applied(_ authority: Authority) {
    guard accepts(authority) else { return }
    appliedRelease = max(appliedRelease, authority.release)
    hasApplied = true
  }

  func ordinary(current: UIEdgeInsets, react: UIEdgeInsets, blocked: Bool) -> UIEdgeInsets? {
    guard let binding, sealed, !pending, !blocked else { return nil }
    var target = current
    target.top = react.top
    if !legacy {
      guard let sample, sample.sequence == appliedRelease else { return nil }
      target.bottom = sample.height + binding.gap
    } else if let legacyBottom { target.bottom = legacyBottom }
    return target == current ? nil : target
  }

  mutating func detach() {
    generation += 1
    sealed = false
    sample = nil
    host = nil
    legacy = false
  }
}
