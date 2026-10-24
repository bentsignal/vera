import ExpoModulesCore
import UIKit

// The native message list (src/features/native-list/contract.ts). JavaScript
// sends rows; this draws, scrolls, and animates them.
//
// - Rows are decoded and measured on a background queue, cached by row and
//   width, then applied on the main thread as one batch update, diffed by
//   row ID.
// - The collection view is flipped: row 0 (the newest) is at the bottom,
//   and older pages are appended past the top, so loading them never moves
//   what's on screen.
// - Arrivals at the bottom animate in one UIKit transaction (the rows above
//   make room, the new one rises and fades in). Scrolled up, or in a
//   firehose, rows go in without animation and the reader's place is kept.

final class MessageListView: ExpoView, UICollectionViewDataSource, UICollectionViewDelegate,
  UICollectionViewDataSourcePrefetching, UIGestureRecognizerDelegate {
  let onEvent = EventDispatcher()

  private let listLayout = ListLayout()
  private lazy var collectionView = ListCollectionView(frame: .zero, collectionViewLayout: listLayout)
  private let state = ListState()

  // What's on screen.
  private var rows: [Row] = []
  private var layouts: [RowLayout] = []

  // Props, as JavaScript last sent them.
  private var rawRows: [JSON] = []
  private var rowsChanged = false
  private var themeJSON: JSON?
  private var themeChanged = false
  private var followsKeyboard = true
  private var initialRowId: String?
  private var keyboardHeight: CGFloat = 0
  /// How much of `insets.bottom` the keyboard covers (contract:
  /// `insets.keyboardOverlap`); the bottom safe area without it.
  private var keyboardOverlap: CGFloat?
  /// The menu's modal has the keyboard down: hold still (`keyboardFrozen`).
  private var keyboardFrozen = false
  private var keyboardThawed = false
  /// A thread: short, the rows sit at the top (`alignTop`).
  private var alignTop = false
  /// When JavaScript's insets go in (Insets.swift).
  private var insetsGate = InsetsGate()
  /// The insets the list is laid out with.
  private var insets: UIEdgeInsets { insetsGate.applied }
  /// Bumped with every `rows` prop, so a measurement knows whose it is.
  private var rowsVersion = 0
  /// This drag closed the keyboard: it doesn't scroll (#165).
  private var keyboardSwipe = false

  // Measuring, off the main thread.
  private let measurer = MeasureQueue()
  private var measuring = false
  private var measureAgain = false
  private var measuredWidth: CGFloat = 0
  /// The theme the rows on screen were drawn with.
  private var drawnTheme = -1

  // Events.
  private var placed = false
  private var olderRequestedFor: String?
  private var newerRequestedFor: String?
  private var nearLatest: Bool?
  private var lastVisible: [String] = []
  private var visibleScheduled = false
  private var prefetched: Set<String> = []

  // The firehose: arrival times in the window.
  private var arrivals: [CFTimeInterval] = []
  private var firehose = false

  // Dragging left to reveal times.
  private lazy var revealPan = UIPanGestureRecognizer(target: self, action: #selector(revealDragged(_:)))
  private let keyboardTracker = UIView()
  // A held part shrinks a little as the hold builds.
  private let pressTracker = PressTracker(target: nil, action: nil)
  private let shrink = PressShrink()
  // A held message lifted into the menu (Lift.swift).
  private let lifter = Lifter()
  private var liftRequest: LiftRequest?
  private var liftChanged = false
  // Reactions answer a tap at once: their own recognizer, which doesn't
  // wait for a double tap, a light haptic, and the chip drawn toggled.
  private lazy var reactionTap = UITapGestureRecognizer(target: self, action: #selector(reactionTapped(_:)))
  private var messageTaps: [UIGestureRecognizer] = []
  private let reactionHaptic = UIImpactFeedbackGenerator(style: .light)
  /// Chips toggled by a tap, by row and reaction key: whether they're now
  /// yours, until JavaScript's rows agree or the time passes.
  private var reactionOverrides: [String: [String: (mine: Bool, until: CFTimeInterval)]] = [:]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    collectionView.backgroundColor = .clear
    collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)
    collectionView.contentInsetAdjustmentBehavior = .never
    collectionView.keyboardDismissMode = .interactive
    collectionView.alwaysBounceVertical = true
    collectionView.showsHorizontalScrollIndicator = false
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.prefetchDataSource = self
    collectionView.isPrefetchingEnabled = true
    collectionView.scrollsToTop = false
    collectionView.register(MessageCell.self, forCellWithReuseIdentifier: "message")
    collectionView.register(TextRowCell.self, forCellWithReuseIdentifier: "text")
    collectionView.register(TypingCell.self, forCellWithReuseIdentifier: "typing")
    collectionView.register(CustomRowCell.self, forCellWithReuseIdentifier: "custom")
    collectionView.onAccessibilityScroll = { [weak self] direction in self?.accessibilityPage(direction) ?? false }
    addSubview(collectionView)

    let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(held(_:)))
    doubleTap.numberOfTapsRequired = 2
    tap.require(toFail: doubleTap)
    let hold = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
    hold.minimumPressDuration = 0.32
    messageTaps = [tap, doubleTap]
    for gesture in [tap, doubleTap, hold, reactionTap] {
      gesture.cancelsTouchesInView = false
      gesture.delegate = self
      collectionView.addGestureRecognizer(gesture)
    }
    revealPan.delegate = self
    collectionView.addGestureRecognizer(revealPan)
    pressTracker.delegate = self
    pressTracker.onBegan = { [weak self] point in
      self?.shrink.begin { [weak self] in self?.pressedView(at: point) }
    }
    pressTracker.onEnded = { [weak self] in self?.shrink.release() }
    pressTracker.onLifted = { [weak self] in
      if self?.mediaTap != nil { Perf.event("media finger up", "") }
    }
    collectionView.addGestureRecognizer(pressTracker)

    // Follows the keyboard frame by frame, interactive dismissal included.
    keyboardTracker.isHidden = true
    keyboardTracker.isUserInteractionEnabled = false
    keyboardTracker.translatesAutoresizingMaskIntoConstraints = false
    addSubview(keyboardTracker)
    if #available(iOS 17.0, *) { keyboardLayoutGuide.usesBottomSafeArea = false }
    NSLayoutConstraint.activate([
      keyboardTracker.leadingAnchor.constraint(equalTo: leadingAnchor),
      keyboardTracker.widthAnchor.constraint(equalToConstant: 1),
      keyboardTracker.heightAnchor.constraint(equalToConstant: 1),
      keyboardTracker.topAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
    ])
  }

  // MARK: Props

  func setRows(_ rows: [JSON]) {
    rawRows = rows
    rowsChanged = true
    rowsVersion += 1
  }

  /// JavaScript's rows with the chips toggled since then drawn as toggled.
  /// A toggle stops overriding once JavaScript's row agrees, or after 3 s
  /// (JavaScript decided otherwise, or the row is gone).
  private func rowsToMeasure() -> [JSON] {
    guard !reactionOverrides.isEmpty else { return rawRows }
    let now = CACurrentMediaTime()
    var seen: Set<String> = []
    let rows = rawRows.map { row -> JSON in
      let id = row.str("id")
      guard var toggles = reactionOverrides[id] else { return row }
      seen.insert(id)
      var row = row
      for (key, toggle) in toggles {
        if now > toggle.until || ReactionToggle.mine(row, key: key) == toggle.mine {
          toggles[key] = nil
        } else {
          row = ReactionToggle.setting(row, key: key, mine: toggle.mine)
        }
      }
      reactionOverrides[id] = toggles.isEmpty ? nil : toggles
      return row
    }
    for id in reactionOverrides.keys where !seen.contains(id) { reactionOverrides[id] = nil }
    return rows
  }

  /// Draws a tapped chip toggled now, ahead of JavaScript's rows.
  private func preview(_ reaction: ReactionHit, rowId: String) {
    var toggles = reactionOverrides[rowId] ?? [:]
    toggles[reaction.key] = (!reaction.mine, CACurrentMediaTime() + 3)
    reactionOverrides[rowId] = toggles
    measure()
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.05) { [weak self] in
      guard let self, self.reactionOverrides[rowId]?[reaction.key] != nil else { return }
      self.measure()
    }
  }

  func setTheme(_ theme: JSON?) {
    themeJSON = theme
    themeChanged = true
  }

  func setBehavior(_ behavior: JSON?) {
    state.behavior = behavior.map(Behavior.init) ?? Behavior()
  }

  /// Insets wait for the end of the props batch (`propsDidUpdate`):
  /// they go with the rows that came with them, or wait out a freeze.
  func setInsets(_ json: JSON?) {
    let json = json ?? [:]
    let next = UIEdgeInsets(top: json.cg("top", 0), left: 0, bottom: json.cg("bottom", 0), right: 0)
    let overlap = json["keyboardOverlap"] == nil ? nil : json.cg("keyboardOverlap", 0)
    if overlap != keyboardOverlap {
      keyboardOverlap = overlap
      setNeedsLayout()
    }
    insetsGate.received(next)
  }

  func setKeyboardFrozen(_ frozen: Bool) {
    guard frozen != keyboardFrozen else { return }
    keyboardFrozen = frozen
    if !frozen {
      keyboardThawed = true
      insetsGate.thawed()
      setNeedsLayout()
    }
  }

  func setAlignTop(_ top: Bool) {
    guard top != alignTop else { return }
    alignTop = top
    applyInsets(keepDistance: true)
  }

  func setKeyboard(_ follows: Bool) {
    followsKeyboard = follows
    setNeedsLayout()
  }

  func setLiftedRowId(_ id: String?) {
    guard id != state.liftedRowId else { return }
    state.liftedRowId = id
    for cell in collectionView.visibleCells {
      guard let cell = cell as? RowCell else { continue }
      cell.contentView.alpha = cell.rowId != nil && cell.rowId == id ? 0 : 1
    }
  }

  func setLift(_ json: JSON?) {
    let request = LiftRequest(json)
    guard request != liftRequest else { return }
    liftRequest = request
    liftChanged = true
  }

  /// Lifts the held part into the menu, or plays it back into place.
  private func applyLift() {
    if let request = liftRequest, let window {
      guard let cell = cell(for: request.rowId) as? MessageCell else { return }
      lifter.lift(request, cell: cell, in: window)
    } else if let rowId = lifter.rowId {
      lifter.land(into: cell(for: rowId) as? MessageCell)
    }
    // Lifter captures the press's presentation scale before resetting it.
    shrink.reset()
  }

  func setInitialRowId(_ id: String?) {
    initialRowId = id
  }

  /// After a batch of props: measure and apply what changed.
  ///
  /// New insets in the same batch as new rows go in with those rows, in
  /// their one move (`apply`): a send's shorter composer (contract
  /// `insets.bottom`, send-inset.ts) and the message sent then make room
  /// together, instead of the list dropping by the composer's height and
  /// rising again. While `keyboardFrozen`, insets wait, and go in at the
  /// thaw. Otherwise they go in now.
  func propsDidUpdate() {
    if themeChanged {
      themeChanged = false
      var theme = themeJSON.map(Theme.init) ?? Theme()
      theme.version = state.theme.version + 1
      state.theme = theme
      backgroundColor = .clear
      rowsChanged = true
    }
    switch insetsGate.batchEnded(rowsChanged: rowsChanged, placed: placed, frozen: keyboardFrozen, rowsVersion: rowsVersion) {
    case .none:
      break
    case let .now(_, eased):
      applyNewInsets(eased: eased)
    case .withRows:
      // `apply` takes them with those rows: every rows prop is measured
      // and applied, nothing changed on screen included.
      break
    }
    if rowsChanged {
      rowsChanged = false
      measure()
    }
    if liftChanged {
      liftChanged = false
      applyLift()
    }
  }

  /// Lays the list out with insets just applied: at once, or, back from
  /// the menu, over the keyboard's own duration and curve, as the
  /// keyboard's thaw does.
  private func applyNewInsets(eased: Bool) {
    guard eased, placed else { return applyInsets(keepDistance: true) }
    UIView.animate(withDuration: 0.25, delay: 0, options: [UIView.AnimationOptions(rawValue: 7 << 16), .beginFromCurrentState]) {
      self.applyInsets(keepDistance: true)
      // The keyboard thawed in this batch too: its height (and any
      // `keyboardOverlap` held through the freeze) goes in in the same
      // move, not a separate one.
      self.layoutIfNeeded()
      self.collectionView.layoutIfNeeded()
    }
  }

  // MARK: Layout

  override func layoutSubviews() {
    super.layoutSubviews()
    fitCollectionView()
    if bounds.width > 0, bounds.width != measuredWidth {
      measure()
    }
    // The keyboard covers part of `insets.bottom` (the composer's own
    // bottom inset, `keyboardOverlap`): the list adds the rest, which is
    // how far the composer rises. Before iOS 17 the guide stops at the safe
    // area when the keyboard is down.
    var raw = followsKeyboard ? max(0, bounds.height - keyboardTracker.frame.minY) : 0
    if raw <= safeAreaInsets.bottom + 0.5 { raw = 0 }
    let keyboard = max(0, raw - (keyboardOverlap ?? safeAreaInsets.bottom))
    // While the menu's modal has the keyboard down, nothing moves.
    if keyboardFrozen { return }
    if abs(keyboard - keyboardHeight) > 0.5 {
      keyboardHeight = keyboard
      if keyboardThawed {
        // Back from the menu with the keyboard elsewhere: ease there over
        // the keyboard's own duration and curve.
        UIView.animate(withDuration: 0.25, delay: 0, options: [UIView.AnimationOptions(rawValue: 7 << 16), .beginFromCurrentState]) {
          self.applyInsets(keepDistance: true)
          self.collectionView.layoutIfNeeded()
        }
      } else {
        // Under a finger the list stays put, except a swipe closing the
        // keyboard, which keeps it on the newest message (#165).
        applyInsets(keepDistance: !collectionView.isTracking || keyboardSwipe)
      }
    }
    keyboardThawed = false
  }

  /// Sizes the list to the view. Props can arrive before the first layout,
  /// so placing the first rows does this too.
  private func fitCollectionView() {
    guard collectionView.bounds.size != bounds.size else { return }
    // bounds/center: the collection view is flipped.
    collectionView.bounds = CGRect(origin: collectionView.bounds.origin, size: bounds.size)
    collectionView.center = CGPoint(x: bounds.midX, y: bounds.midY)
  }

  /// The flipped list's insets: its top is the screen's bottom.
  private func applyInsets(keepDistance: Bool) {
    let over = insets.bottom + keyboardHeight
    // A thread too short to fill the list sits at the top: the space below
    // it is part of the bottom inset, and the keyboard opens into it.
    let bottom = alignTop ? max(over, collectionView.bounds.height - insets.top - listLayout.contentHeight) : over
    let current = collectionView.contentInset
    guard current.top != bottom || current.bottom != insets.top else { return }
    let distance = collectionView.contentOffset.y + current.top
    collectionView.contentInset = UIEdgeInsets(top: bottom, left: 0, bottom: insets.top, right: 0)
    collectionView.verticalScrollIndicatorInsets = UIEdgeInsets(top: over, left: 0, bottom: insets.top, right: 0)
    if keepDistance || !placed {
      // Keep the same distance from the newest message, so the list rides
      // up and down with the keyboard.
      collectionView.contentOffset.y = (placed ? max(0, distance) : 0) - bottom
    }
  }

  /// How far the newest message is scrolled from its place at the bottom.
  private var distanceFromLatest: CGFloat {
    collectionView.contentOffset.y + collectionView.adjustedContentInset.top
  }

  private var latestOffset: CGFloat { -collectionView.adjustedContentInset.top }

  private var maxOffset: CGFloat {
    max(latestOffset, collectionView.contentSize.height + collectionView.adjustedContentInset.bottom - collectionView.bounds.height)
  }

  // MARK: Measuring and applying rows

  private func measure() {
    let width = bounds.width
    guard width > 0 else { return }
    if measuring {
      measureAgain = true
      return
    }
    measuring = true
    measureAgain = false
    let input = MeasureQueue.Input(rows: rowsToMeasure(), theme: state.theme, width: width, customHeights: customHeights)
    let version = rowsVersion
    if !placed {
      // The first rows: measured right away, so the list never shows empty.
      let interval = Perf.begin("measure now", "\(input.rows.count) rows")
      let result = measurer.measureNow(input)
      Perf.end(interval)
      finish(result, version: version)
      return
    }
    measurer.measure(input) { [weak self] result in
      self?.finish(result, version: version)
    }
  }

  private func finish(_ result: MeasureQueue.Output, version: Int) {
    measuring = false
    if result.width != measuredWidth { drawnTheme = -1 }
    measuredWidth = result.width
    let interval = Perf.begin("apply", "\(result.rows.count) rows")
    apply(result.rows, result.layouts, themeVersion: result.themeVersion, version: version)
    Perf.end(interval)
    if measureAgain || result.width != bounds.width {
      measure()
    }
  }

  private func apply(_ newRows: [Row], _ newLayouts: [RowLayout], themeVersion: Int, version: Int) {
    let started = CACurrentMediaTime()
    defer { Slow.check("apply \(newRows.count) rows", since: started) }
    // Insets that came with these rows go in with them, below.
    // (`take` applies them to `insets` already.)
    let nextInsets = insetsGate.take(forRows: version, frozen: keyboardFrozen)
    guard placed, !rows.isEmpty else {
      drawnTheme = themeVersion
      rows = newRows
      layouts = newLayouts
      listLayout.update(ids: newRows.map(\.id), heights: newLayouts.map(\.height))
      collectionView.reloadData()
      if !newRows.isEmpty { place() }
      return
    }

    // A new theme or width redraws every row, without animation. The
    // version is the one these layouts were measured with, not the latest.
    let redraw = drawnTheme != themeVersion
    drawnTheme = themeVersion
    let oldRows = rows
    let oldIds = oldRows.map(\.id)
    let newIds = newRows.map(\.id)
    let diff = ListDiff(old: oldRows, oldHeights: layouts.map(\.height), new: newRows, newHeights: newLayouts.map(\.height), redraw: redraw)
    if diff.isEmpty {
      rows = newRows
      layouts = newLayouts
      if nextInsets != nil { applyInsets(keepDistance: true) }
      return
    }
    let removed = diff.removed
    let inserted = diff.inserted
    let reordered = diff.reordered
    let reloaded = diff.reloaded
    let newIndex = diff.newIndex
    let atBottom = diff.atBottom
    let arrived = diff.arrived
    // (A message lifted into the menu holds its update until it's back:
    // MessageCell.isLifted.)
    let changed = diff.changed
    noteArrivals(arrived.count)

    let visible = Set(collectionView.indexPathsForVisibleItems.compactMap { $0.item < oldIds.count ? oldIds[$0.item] : nil })
    let pinned = distanceFromLatest <= 2 || !collectionView.isDragging && distanceFromLatest <= min(24, state.behavior.nearLatestPoints)
    let typingChanged = atBottom.contains { newRows[$0].isTyping } || removed.contains { oldRows[$0].isTyping }
    let visibleChange = !changed.isDisjoint(with: visible) || removed.contains { visible.contains(oldIds[$0]) }
    let animated = window != nil && !firehose && !reordered && !redraw
      && (pinned ? (!atBottom.isEmpty || typingChanged || visibleChange) : visibleChange && atBottom.isEmpty)

    // Keep the reader's place when scrolled up: the lowest row on screen
    // stays where it is.
    var anchor: (id: String, offset: CGFloat)?
    if !pinned {
      let sorted = collectionView.indexPathsForVisibleItems.map(\.item).sorted()
      let kept = sorted.filter { $0 < oldIds.count && newIndex[oldIds[$0]] != nil }
      if let first = kept.first(where: { !changed.contains(oldIds[$0]) }) ?? kept.first {
        anchor = (oldIds[first], listLayout.frame(at: first).minY - collectionView.contentOffset.y)
      }
    }

    // A message from someone typing grows out of their indicator.
    var grows: (id: String, from: CGRect)?
    if animated, let typingIndex = removed.first(where: { oldRows[$0].isTyping }),
       case let .typing(_, people, _, _) = oldRows[typingIndex].content,
       let message = arrived.first(where: { index in people.contains { $0.id == newRows[index].message?.author.id } }),
       newRows[message].message?.morphsFromTyping == true,
       case let .typing(typingLayout) = layouts[typingIndex], let bubble = typingLayout.bubble {
      grows = (newIds[message], bubble)
    }

    // Only rows that leave the viewport need stand-ins. Snapshotting all
    // visible media rows can itself consume an entire frame on a reaction
    // or typing update, although those snapshots are almost all discarded.
    let oldOffset = collectionView.contentOffset.y
    var leaving: [(id: String, view: UIView, frame: CGRect, removed: Bool)] = []
    if animated {
      var futureFrames: [String: CGRect] = [:]
      var height: CGFloat = 0
      for (index, id) in newIds.enumerated() {
        let rowHeight = newLayouts[index].height
        if visible.contains(id) {
          futureFrames[id] = CGRect(x: 0, y: height, width: bounds.width, height: rowHeight)
        }
        height += rowHeight
      }
      // Where the newest row will rest, with the insets that go in now.
      let futureInsets = insets
      let bottom = alignTop
        ? max(futureInsets.bottom + keyboardHeight, collectionView.bounds.height - futureInsets.top - height)
        : futureInsets.bottom + keyboardHeight
      let futureOffset = pinned ? -bottom : anchor.flatMap { anchor in
        futureFrames[anchor.id].map { $0.minY - anchor.offset }
      } ?? oldOffset
      let viewport = CGRect(x: 0, y: futureOffset, width: bounds.width, height: collectionView.bounds.height).insetBy(dx: 0, dy: 1)
      let removedIds = Set(removed.map { oldIds[$0] })
      for cell in collectionView.visibleCells {
        guard let cell = cell as? RowCell, let id = cell.rowId else { continue }
        if !removedIds.contains(id), let frame = futureFrames[id], frame.intersects(viewport) { continue }
        guard let snapshot = cell.snapshotView(afterScreenUpdates: false) else { continue }
        // Include any move still in flight, so the stand-in starts where
        // the row is drawn now.
        var frame = cell.frame
        frame.origin.y += (cell.layer.presentation()?.value(forKeyPath: "transform.translation.y") as? CGFloat) ?? 0
        leaving.append((id, snapshot, frame, removedIds.contains(id)))
      }
    }

    UIView.performWithoutAnimation {
      if reordered {
        rows = newRows
        layouts = newLayouts
        listLayout.update(ids: newIds, heights: newLayouts.map(\.height))
        collectionView.reloadData()
      } else {
        collectionView.performBatchUpdates {
          rows = newRows
          layouts = newLayouts
          listLayout.update(ids: newIds, heights: newLayouts.map(\.height))
          collectionView.deleteItems(at: removed.map { IndexPath(item: $0, section: 0) })
          collectionView.insertItems(at: inserted.map { IndexPath(item: $0, section: 0) })
          collectionView.reloadItems(at: reloaded.map { IndexPath(item: $0, section: 0) })
        }
      }
      // The new insets after the old positions were taken (`oldOffset`,
      // the anchor): the rows slide from where they were drawn to where
      // the insets and the new rows put them, in one move.
      if nextInsets != nil || alignTop {
        applyInsets(keepDistance: pinned)
      }
      if pinned {
        setOffset(latestOffset)
      } else if let anchor, let frame = listLayout.frame(of: anchor.id) {
        setOffset(frame.minY - anchor.offset)
      }
      collectionView.layoutIfNeeded()
    }

    guard animated else {
      for cell in collectionView.visibleCells {
        guard let cell = cell as? RowCell, let id = cell.rowId, changed.contains(id), let index = newIndex[id] else { continue }
        cell.configure(newRows[index], newLayouts[index], state: state, animated: false)
        setAccessibility(cell)
      }
      finishChange(changed: changed, newIndex: newIndex, reordered: reordered)
      return
    }

    // The move, in one Core Animation transaction: every row on screen
    // slides from where it was drawn to its new place (FLIP), new rows rise
    // in and fade, and rows that changed animate inside.
    let duration = state.behavior.moveMs / 1000
    let curve = CAMediaTimingFunction(controlPoints: 0.25, 0.1, 0.25, 1)
    let newOffset = collectionView.contentOffset.y
    // Everything new at the bottom (an arrival, the time header over it)
    // rises together from below; the typing indicator appears its own way.
    let rising = Set(atBottom.filter { !newRows[$0].isTyping }.map { newIds[$0] })
    let rise = atBottom.filter { !newRows[$0].isTyping }.reduce(CGFloat(0)) { $0 + newLayouts[$1].height }
    let shown = Set(collectionView.visibleCells.compactMap { ($0 as? RowCell)?.rowId })
    CATransaction.begin()
    CATransaction.setAnimationDuration(duration)
    CATransaction.setAnimationTimingFunction(curve)
    for cell in collectionView.visibleCells {
      guard let cell = cell as? RowCell, let id = cell.rowId else { continue }
      let frame = cell.frame
      var from: CGFloat?
      if rising.contains(id) {
        // Rises from just below its place (down is −y in the flipped list).
        from = id == grows?.id ? nil : -rise
        if id != grows?.id { cell.fadeIn(duration: state.behavior.fadeMs / 1000) }
      } else if let old = listLayout.oldFrame(of: id) {
        // The row's top edge (its max y, flipped) stays where it was drawn.
        from = (old.maxY - oldOffset) - (frame.maxY - newOffset)
      }
      if let from, abs(from) > 0.5 { slide(cell.layer, from: from, duration: duration, curve: curve) }
    }
    // Rows that left the screen: stand-ins slide to where the row went, or
    // fade where it was.
    for (id, view, frame, wasRemoved) in leaving where !shown.contains(id) {
      view.frame = frame.offsetBy(dx: 0, dy: newOffset - oldOffset)
      collectionView.addSubview(view)
      if wasRemoved {
        let sinks = grows == nil && oldRows.first(where: { $0.id == id })?.isTyping == true
        UIView.animate(withDuration: sinks ? duration : 0.18, delay: 0, options: [.curveEaseOut]) {
          view.alpha = 0
          if sinks { view.frame.origin.y -= frame.height }
        } completion: { _ in view.removeFromSuperview() }
      } else if let new = listLayout.frame(of: id) {
        let distance = (new.maxY - newOffset) - (frame.maxY - oldOffset)
        UIView.animate(withDuration: duration, delay: 0, options: []) {
          view.frame.origin.y += distance
        } completion: { _ in view.removeFromSuperview() }
      } else {
        view.removeFromSuperview()
      }
    }
    CATransaction.commit()

    let animator = UIViewPropertyAnimator(duration: duration, timingParameters: UICubicTimingParameters(
      controlPoint1: CGPoint(x: 0.25, y: 0.1), controlPoint2: CGPoint(x: 0.25, y: 1)
    ))
    animator.addAnimations {
      for cell in self.collectionView.visibleCells {
        guard let cell = cell as? RowCell, let id = cell.rowId, changed.contains(id), let index = newIndex[id] else { continue }
        cell.configure(newRows[index], newLayouts[index], state: self.state, animated: true)
        self.setAccessibility(cell)
      }
    }
    animator.startAnimation()
    if let grows, let cell = cell(for: grows.id) as? MessageCell {
      cell.grow(from: grows.from, dots: state.theme.muted)
    }
    for index in atBottom where newRows[index].isTyping {
      (cell(for: newIds[index]) as? TypingCell)?.appear()
    }
    finishChange(changed: changed, newIndex: newIndex, reordered: reordered)
  }

  /// An additive move from `from` points away back to the row's place, so
  /// moves that overlap add up instead of jumping.
  private func slide(_ layer: CALayer, from: CGFloat, duration: Double, curve: CAMediaTimingFunction) {
    let move = CABasicAnimation(keyPath: "transform.translation.y")
    move.fromValue = from
    move.toValue = 0
    move.isAdditive = true
    move.duration = duration
    move.timingFunction = curve
    layer.add(move, forKey: nil)
  }

  private func finishChange(changed: Set<String>, newIndex: [String: Int], reordered: Bool) {
    // Changed rows off screen may have cells prepared ahead: update those
    // too, so they never show stale.
    if !reordered {
      let shown = Set(collectionView.visibleCells.compactMap { ($0 as? RowCell)?.rowId })
      let offscreen = changed.subtracting(shown).compactMap { newIndex[$0] }.map { IndexPath(item: $0, section: 0) }
      if !offscreen.isEmpty {
        UIView.performWithoutAnimation { collectionView.reconfigureItems(at: offscreen) }
      }
    }
    afterChange()
  }

  /// Moves the list without stopping a fling, and only if it moved.
  private func setOffset(_ y: CGFloat) {
    guard abs(collectionView.contentOffset.y - y) > 0.01 else { return }
    collectionView.contentOffset.y = y
  }

  private func cell(for id: String) -> RowCell? {
    guard let index = listLayout.indexById()[id] else { return nil }
    return collectionView.cellForItem(at: IndexPath(item: index, section: 0)) as? RowCell
  }

  /// Past `firehoseFrom` arrivals in the window, rows show at once until
  /// it's down to `firehoseUntil`.
  private func noteArrivals(_ count: Int) {
    let behavior = state.behavior
    let now = CACurrentMediaTime()
    arrivals.append(contentsOf: Array(repeating: now, count: count))
    arrivals.removeAll { now - $0 > behavior.firehoseWindowMs / 1000 }
    if !firehose, arrivals.count > behavior.firehoseFrom {
      firehose = true
    } else if firehose, arrivals.count <= behavior.firehoseUntil {
      firehose = false
    }
  }

  /// The first rows: open on `initialRowId` (centered) or the newest.
  private func place() {
    let interval = Perf.begin("place", "\(rows.count) rows")
    defer { Perf.end(interval) }
    fitCollectionView()
    collectionView.layoutIfNeeded()
    applyInsets(keepDistance: false)
    if let initialRowId, let frame = listLayout.frame(of: initialRowId) {
      collectionView.contentOffset.y = centeredOffset(frame)
    } else {
      collectionView.contentOffset.y = latestOffset
    }
    collectionView.layoutIfNeeded()
    placed = true
    DispatchQueue.main.async { [weak self] in
      self?.send(["type": "ready"])
      self?.afterChange()
    }
  }

  private func centeredOffset(_ frame: CGRect) -> CGFloat {
    let inset = collectionView.adjustedContentInset
    let visible = collectionView.bounds.height - inset.top - inset.bottom
    let offset = frame.midY - visible / 2 - inset.top
    return min(max(offset, latestOffset), maxOffset)
  }

  // MARK: Methods

  func scrollToLatest(animated: Bool) {
    collectionView.setContentOffset(CGPoint(x: 0, y: latestOffset), animated: animated)
  }

  private var bench: BenchFling?

  /// For benchmarks (contract: `benchFling`; Bench.swift).
  func benchFling(speed: Double, ms: Double, done: @escaping ([String: Any]) -> Void) {
    bench?.stop()
    let run = BenchFling(speed: CGFloat(speed), ms: ms, list: collectionView, oldest: { [weak self] in
      self?.maxOffset ?? 0
    }, done: done)
    bench = run
    run.run()
  }

  func scrollToRow(_ id: String, animated: Bool) {
    guard let frame = listLayout.frame(of: id) else { return }
    collectionView.setContentOffset(CGPoint(x: 0, y: centeredOffset(frame)), animated: animated)
  }

  // MARK: Data source

  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    rows.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    let started = CACurrentMediaTime()
    let interval = Perf.begin("cell", ListDiff.cellKind(rows[indexPath.item]))
    defer {
      Perf.end(interval)
      Slow.check("cell \(rows[indexPath.item].id)", since: started)
    }
    let row = rows[indexPath.item]
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: Self.reuseIdentifier(row), for: indexPath)
    if let cell = cell as? RowCell {
      if cell.rowId != row.id {
        // A recycled cell drops the last row's moves and fade.
        cell.layer.removeAllAnimations()
        cell.contentView.layer.removeAnimation(forKey: "fadeIn")
      }
      cell.configure(row, layouts[indexPath.item], state: state, animated: false)
      setAccessibility(cell)
    }
    return cell
  }

  static func reuseIdentifier(_ row: Row) -> String {
    ListDiff.cellKind(row)
  }

  private func setAccessibility(_ cell: RowCell) {
    if let cell = cell as? MessageCell, let rowId = cell.rowId {
      cell.onActivate = { [weak self] in self?.send(["type": "press", "rowId": rowId, "element": "message"]) }
      cell.accessibilityCustomActions = cell.accessibilityActions { [weak self] event in self?.send(event) }
    }
  }

  func collectionView(_ collectionView: UICollectionView, willDisplay cell: UICollectionViewCell, forItemAt indexPath: IndexPath) {
    guard let cell = cell as? RowCell else { return }
    cell.setReveal(state.reveal)
    let lifted = cell.rowId != nil && cell.rowId == state.liftedRowId
    if lifted || cell.contentView.alpha == 0 && cell.contentView.layer.animationKeys() == nil {
      cell.contentView.alpha = lifted ? 0 : 1
    }
  }

  func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    prefetch(indexPaths.map(\.item))
  }

  /// Downloads and decodes the images of rows about to show.
  private func prefetch(_ indexes: [Int]) {
    var requests: [(URL, CGSize)] = []
    for index in indexes where index < rows.count {
      let id = rows[index].id
      guard !prefetched.contains(id), case let .message(layout) = layouts[index] else { continue }
      prefetched.insert(id)
      if let (person, frame) = layout.avatar, let url = person.avatarUrl { requests.append((url, frame.size)) }
      for part in layout.parts {
        switch part.content {
        case let .media(item, _):
          if let url = item.displayUrl { requests.append((url, part.frame.size)) }
        case let .carousel(carousel):
          for (item, card) in zip(carousel.items, carousel.cards) {
            if let url = item.displayUrl { requests.append((url, card.size)) }
          }
        case let .deck(deck):
          for (item, size) in zip(deck.items, deck.sizes).prefix(2) {
            if let url = item.displayUrl { requests.append((url, size)) }
          }
        case let .linkCard(card):
          if let url = card.card.imageUrl, let frame = card.image { requests.append((url, frame.size)) }
        default:
          break
        }
      }
    }
    if !requests.isEmpty { Images.prefetch(requests) }
  }

  // MARK: Scrolling

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    guard placed else { return }
    // Closing the keyboard with a swipe down doesn't scroll (#165).
    if keyboardSwipe { setOffset(latestOffset) }
    let started = CACurrentMediaTime()
    defer { Slow.check("scroll", since: started) }
    afterChange()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    shrink.release()
    // #165: at the newest message with the keyboard up, a swipe down is
    // for the keyboard. It goes down, and the list stays on the newest
    // message instead of scrolling with the finger, as it did with
    // interactive dismissal. The next swipe scrolls as any does. Scrolled
    // up, or with no keyboard, nothing changes.
    let down = collectionView.panGestureRecognizer.velocity(in: self).y > 0
      || collectionView.panGestureRecognizer.translation(in: self).y > 0
    if keyboardHeight > 0.5, !keyboardFrozen, distanceFromLatest <= 2, down {
      keyboardSwipe = true
      window?.endEditing(true)
      setOffset(latestOffset)
    }
  }

  /// After dragging the keyboard away, the bottom inset has shrunk under
  /// the finger: settle at the newest row instead of past it.
  func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
    if keyboardSwipe {
      // It ends where it started: on the newest message.
      targetContentOffset.pointee.y = latestOffset
      keyboardSwipe = false
      return
    }
    if targetContentOffset.pointee.y < latestOffset { targetContentOffset.pointee.y = latestOffset }
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate, collectionView.contentOffset.y < latestOffset - 0.5 {
      collectionView.setContentOffset(CGPoint(x: 0, y: latestOffset), animated: true)
    }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    scheduleVisible()
  }

  private func afterChange() {
    guard placed, !rows.isEmpty else { return }
    let height = collectionView.bounds.height
    let ahead = state.behavior.loadAheadScreens * height
    // Older: the top of the list is the end of the flipped content.
    let toOldest = maxOffset - collectionView.contentOffset.y
    if toOldest < ahead, let oldest = rows.last?.id, olderRequestedFor != oldest {
      olderRequestedFor = oldest
      send(["type": "reachedOlder"])
    } else if toOldest > ahead * 1.5 {
      // Asks again after the reader leaves the top and comes back, in case
      // the last request went unanswered.
      olderRequestedFor = nil
    }
    let toLatest = distanceFromLatest
    if toLatest < ahead, collectionView.isDragging || collectionView.isDecelerating,
       let newest = rows.first?.id, newerRequestedFor != newest {
      newerRequestedFor = newest
      send(["type": "reachedNewer"])
    } else if toLatest > ahead * 1.5 {
      newerRequestedFor = nil
    }
    let near = toLatest <= state.behavior.nearLatestPoints
    if near != nearLatest {
      nearLatest = near
      send(["type": "nearLatest", "near": near])
    }
    // Images for the next stretch, in both directions.
    let visible = collectionView.indexPathsForVisibleItems.map(\.item)
    if let low = visible.min(), let high = visible.max() {
      let end = min(rows.count, high + 30)
      prefetch(Array(max(0, low - 8)..<min(low, rows.count)) + (high + 1 < end ? Array((high + 1)..<end) : []))
    }
    scheduleVisible()
  }

  /// `visible`: the rows on screen, newest first, at most every 100 ms.
  private func scheduleVisible() {
    guard !visibleScheduled else { return }
    visibleScheduled = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      guard let self else { return }
      self.visibleScheduled = false
      let inset = self.collectionView.adjustedContentInset
      let top = self.collectionView.contentOffset.y + inset.top
      let bottom = self.collectionView.contentOffset.y + self.collectionView.bounds.height - inset.bottom
      let ids = self.collectionView.indexPathsForVisibleItems.map(\.item).sorted().compactMap { index -> String? in
        guard index < self.rows.count else { return nil }
        let frame = self.listLayout.frame(at: index)
        return frame.maxY > top && frame.minY < bottom ? self.rows[index].id : nil
      }
      if ids != self.lastVisible {
        self.lastVisible = ids
        self.send(["type": "visible", "rowIds": ids])
      }
    }
  }

  /// VoiceOver's three-finger swipes: a page older (down) or newer (up).
  private func accessibilityPage(_ direction: UIAccessibilityScrollDirection) -> Bool {
    let inset = collectionView.adjustedContentInset
    let page = (collectionView.bounds.height - inset.top - inset.bottom) * 0.9
    let older = direction == .down || direction == .previous
    guard older || direction == .up || direction == .next else { return false }
    let current = collectionView.contentOffset.y
    // The list is flipped: older is +y.
    let target = min(max(current + (older ? page : -page), latestOffset), maxOffset)
    guard abs(target - current) > 1 else { return false }
    collectionView.setContentOffset(CGPoint(x: 0, y: target), animated: false)
    collectionView.layoutIfNeeded()
    afterChange()
    UIAccessibility.post(notification: .pageScrolled, argument: older ? "Older messages" : "Newer messages")
    return true
  }

  // MARK: Custom rows (CustomRows.swift)

  /// Custom rows React has laid out, by row ID.
  private var customHeights: [String: CGFloat] = [:]

  /// JavaScript mounts each custom row's React view as a child of the list;
  /// the list keeps it in its row's cell.
  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    guard let row = childComponentView as? CustomRowView else {
      super.mountChildComponentView(childComponentView, index: index)
      return
    }
    row.owner = self
    state.customRows[row.rowId] = row
    customRowResized(row)
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    guard let row = childComponentView as? CustomRowView else {
      super.unmountChildComponentView(childComponentView, index: index)
      return
    }
    row.removeFromSuperview()
    if state.customRows[row.rowId] === row {
      state.customRows[row.rowId] = nil
      customHeights[row.rowId] = nil
      measure()
    }
    row.owner = nil
  }

  func customRowChanged(_ row: CustomRowView, from oldId: String) {
    if state.customRows[oldId] === row {
      state.customRows[oldId] = nil
      customHeights[oldId] = nil
    }
    state.customRows[row.rowId] = row
    customRowResized(row)
  }

  /// React laid the row out at a new height: the list makes room for it.
  func customRowResized(_ row: CustomRowView) {
    guard state.customRows[row.rowId] === row else { return }
    let height = ceil(row.bounds.height)
    guard height > 0, customHeights[row.rowId] != height else { return }
    customHeights[row.rowId] = height
    measure()
  }

  // MARK: Gestures

  private func hit(_ gesture: UIGestureRecognizer, hold: Bool) -> (Hit, RowCell)? {
    let point = gesture.location(in: collectionView)
    guard let indexPath = collectionView.indexPathForItem(at: point),
          let cell = collectionView.cellForItem(at: indexPath) as? RowCell else { return nil }
    let local = gesture.location(in: cell.contentView)
    guard let hit = cell.hit(at: local, hold: hold) else { return nil }
    return (hit, cell)
  }

  @objc private func tapped(_ gesture: UITapGestureRecognizer) {
    guard let (hit, _) = hit(gesture, hold: false) else { return }
    if let interval = mediaTap {
      // The press is going to JavaScript now: the tap's wait ends here.
      mediaTap = nil
      if hit.event["element"] as? String == "media" { Perf.event("media press sent", Self.mediaDetail(hit.event)) }
      Perf.end(interval)
    }
    send(hit.event)
  }

  /// Timing a photo tap (Perf.swift, profiling only): from the touch
  /// reaching the message's single tap (`shouldReceive`) to its press
  /// going to JavaScript (`tapped`), which includes the finger's time down
  /// and the wait for the double tap to fail; "media finger up" marks
  /// where the one ends and the other begins. A tap that becomes a double
  /// tap, a hold, or a scroll is ended at the next touch, marked dropped.
  private var mediaTap: Perf.Interval?

  private func timeMediaTouch(_ touch: UITouch) {
    guard Perf.isEnabled else { return }
    if let open = mediaTap {
      Perf.event("media tap dropped", "")
      Perf.end(open)
      mediaTap = nil
    }
    let point = touch.location(in: collectionView)
    guard let indexPath = collectionView.indexPathForItem(at: point),
          let cell = collectionView.cellForItem(at: indexPath) as? RowCell,
          let hit = cell.hit(at: touch.location(in: cell.contentView), hold: false),
          hit.event["element"] as? String == "media" else { return }
    mediaTap = Perf.begin("media tap", Self.mediaDetail(hit.event))
  }

  /// Which photo, without anything a person wrote or a URL: the row's ID
  /// and the item's index.
  private static func mediaDetail(_ event: [String: Any]) -> String {
    "row \(event["rowId"] as? String ?? "?") index \(event["index"] as? Int ?? -1)"
  }

  /// A reaction tapped: a light haptic and, for a stacked chip, the toggle
  /// drawn at once; then the press, with its part's frame (contract:
  /// `press.frame`), which bubbles' JavaScript shows who reacted over.
  @objc private func reactionTapped(_ gesture: UITapGestureRecognizer) {
    guard gesture.state == .ended, let (hit, cell) = hit(gesture, hold: false),
          hit.event["element"] as? String == "reaction" else { return }
    reactionHaptic.impactOccurred()
    var event = hit.event
    event["frame"] = windowFrame(hit, in: cell)
    if let cell = cell as? MessageCell, let rowId = cell.rowId,
       let reaction = cell.reaction(at: gesture.location(in: cell.contentView)), reaction.kind == .chip {
      preview(reaction, rowId: rowId)
    }
    send(event)
  }

  /// A hit's frame in window coordinates, where the row is drawn mid-move
  /// (the list is flipped, so up is −y).
  private func windowFrame(_ hit: Hit, in cell: RowCell) -> [String: CGFloat] {
    var frame = cell.contentView.convert(hit.frame, to: nil)
    frame.origin.y -= (cell.layer.presentation()?.value(forKeyPath: "transform.translation.y") as? CGFloat) ?? 0
    return ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
  }

  /// Whether a touch is on a reaction: those go to `reactionTap` alone.
  private func onReaction(_ touch: UITouch) -> Bool {
    let point = touch.location(in: collectionView)
    guard let indexPath = collectionView.indexPathForItem(at: point),
          let cell = collectionView.cellForItem(at: indexPath) as? MessageCell else { return false }
    return cell.reaction(at: touch.location(in: cell.contentView)) != nil
  }

  /// The part under a finger, for the press shrink.
  private func pressedView(at point: CGPoint) -> UIView? {
    guard !collectionView.isDragging, !collectionView.isDecelerating,
          let indexPath = collectionView.indexPathForItem(at: point),
          let cell = collectionView.cellForItem(at: indexPath) as? RowCell else { return nil }
    return cell.hit(at: cell.contentView.convert(point, from: collectionView), hold: true)?.view
  }

  @objc private func held(_ gesture: UIGestureRecognizer) {
    if let press = gesture as? UILongPressGestureRecognizer, press.state != .began { return }
    shrink.release()
    if gesture is UITapGestureRecognizer, gesture.state != .ended { return }
    guard let (hit, cell) = hit(gesture, hold: true) else { return }
    var event = hit.event
    event["frame"] = windowFrame(hit, in: cell)
    send(event)
  }

  override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard gesture === revealPan else { return true }
    // Only a leftward drag, and not on a carousel or a deck of cards.
    let velocity = revealPan.velocity(in: collectionView)
    guard velocity.x < 0, abs(velocity.x) > abs(velocity.y) * 1.2 else { return false }
    var view = collectionView.hitTest(revealPan.location(in: collectionView), with: nil)
    while let current = view, current !== collectionView {
      if current is CarouselView || current is DeckView { return false }
      view = current.superview
    }
    return rows.contains { $0.message?.layout == .bubbles }
  }

  /// A tap that stops a fling (the list's or a carousel's) only stops it.
  func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    guard gesture !== revealPan else { return true }
    if collectionView.isDecelerating { return false }
    var view = touch.view
    while let current = view, current !== collectionView {
      if let strip = current as? CarouselView, strip.isDecelerating { return false }
      view = current.superview
    }
    // A reaction's tap is its own: the message's tap waits for the double
    // tap to fail (about 0.3 s), which a reaction mustn't. The hold still
    // sees it (who reacted).
    if gesture === reactionTap || messageTaps.contains(where: { $0 === gesture }) {
      let reaction = onReaction(touch)
      if reaction, gesture === reactionTap { reactionHaptic.prepare() }
      // Once per touch: only the single tap's acceptance is timed.
      if !reaction, gesture === messageTaps.first { timeMediaTouch(touch) }
      return gesture === reactionTap ? reaction : !reaction
    }
    return true
  }

  func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
    // The press tracker only watches. Revealing times doesn't stop the list
    // scrolling under the finger.
    gesture === pressTracker || other === pressTracker
      || gesture === revealPan && other === collectionView.panGestureRecognizer
  }

  @objc private func revealDragged(_ pan: UIPanGestureRecognizer) {
    switch pan.state {
    case .changed:
      setReveal(min(Metrics.revealWidth, max(0, -pan.translation(in: collectionView).x)))
    case .ended, .cancelled, .failed:
      UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.85, initialSpringVelocity: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
        self.setReveal(0)
      }
    default:
      break
    }
  }

  private func setReveal(_ reveal: CGFloat) {
    state.reveal = reveal
    for cell in collectionView.visibleCells {
      (cell as? RowCell)?.setReveal(reveal)
    }
  }

  // MARK: Events

  private func send(_ event: [String: Any]) {
    onEvent(event)
  }
}

/// Decodes and measures rows on a serial background queue, reusing each
/// row's layout while its data, the width, and the theme stay the same.
final class MeasureQueue {
  struct Input {
    let rows: [JSON]
    let theme: Theme
    let width: CGFloat
    var customHeights: [String: CGFloat] = [:]
  }

  struct Output {
    let rows: [Row]
    let layouts: [RowLayout]
    let width: CGFloat
    let themeVersion: Int
  }

  private struct Entry {
    let row: Row
    let layout: RowLayout
  }

  private let queue = DispatchQueue(label: "chat.vera.message-list.measure", qos: .userInteractive)
  // Only touched on `queue`.
  private var cache: [String: Entry] = [:]
  private var cacheWidth: CGFloat = 0
  private var cacheTheme = -1

  func measure(_ input: Input, done: @escaping (Output) -> Void) {
    queue.async {
      let output = self.run(input)
      DispatchQueue.main.async { done(output) }
    }
  }

  func measureNow(_ input: Input) -> Output {
    queue.sync { run(input) }
  }

  private func run(_ input: Input) -> Output {
    if input.width != cacheWidth || input.theme.version != cacheTheme {
      cache.removeAll()
      cacheWidth = input.width
      cacheTheme = input.theme.version
    }
    let measurer = Measurer(theme: input.theme, width: input.width, customHeights: input.customHeights)
    // Decoding and measuring, off the main thread except for the first
    // rows (`measureNow`): how many were measured, not taken from the cache.
    var measured = 0
    let interval = Perf.begin("measure rows", "\(input.rows.count) rows")
    defer { Perf.end(interval) }
    var rows: [Row] = []
    var layouts: [RowLayout] = []
    var seen: Set<String> = []
    var next: [String: Entry] = [:]
    rows.reserveCapacity(input.rows.count)
    layouts.reserveCapacity(input.rows.count)
    // IDs are unique; a repeat would break the diff, so it's dropped.
    for json in input.rows {
      let row = Row(json)
      guard seen.insert(row.id).inserted else { continue }
      let layout: RowLayout
      // A custom row's height comes from React, so it's never cached.
      if case .custom = row.content {
        layout = measurer.layout(row)
      } else if let entry = cache[row.id], entry.row == row {
        layout = entry.layout
      } else {
        layout = measurer.layout(row)
        measured += 1
      }
      rows.append(row)
      layouts.append(layout)
      next[row.id] = Entry(row: row, layout: layout)
    }
    cache = next
    Perf.event("measured", "\(measured) of \(rows.count) rows new")
    return Output(rows: rows, layouts: layouts, width: input.width, themeVersion: input.theme.version)
  }
}

/// Debug builds: logs main-thread work that takes long enough to risk a frame.
enum Slow {
  static func check(_ what: @autoclosure () -> String, since started: CFTimeInterval) {
    #if DEBUG
    let ms = (CACurrentMediaTime() - started) * 1000
    if ms > 4 { NSLog("[MessageList] slow %.1f ms: %@", ms, what()) }
    #endif
  }
}
