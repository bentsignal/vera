package chat.vera.messagelist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.DisplayMetrics
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewTreeObserver
import android.view.animation.DecelerateInterpolator
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSmoothScroller
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.ArrayDeque
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * The native message list (see src/features/native-list/contract.ts): a
 * RecyclerView laid out from the bottom, newest row at position 0.
 *
 * JavaScript sends rows; they're read and diffed off the main thread, then
 * applied in one pass, so a page of older messages costs data, not a burst
 * of view creation. Rows added above the reader (older pages) don't move
 * anything on screen; a message arriving at the bottom animates in; and
 * scrolled away from the bottom, nothing visible moves.
 */
@SuppressLint("ViewConstructor")
class MessageListView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onEvent by EventDispatcher()

  private val units = Units(context)
  private val images = Images(Glide.with(context.applicationContext))
  private val mediaPool = RecyclerView.RecycledViewPool().apply { setMaxRecycledViews(CarouselAdapter.VIEW_TYPE, 24) }
  private val env = CellEnv(units, images, mediaPool)
  private val rows = RowsAdapter(env)
  private val manager = ListLayoutManager(context)
  private val animator = ListItemAnimator(units)
  private val recycler = RecyclerView(context)
  private val lifter = Lifter(units) { appContext.currentActivity?.window?.decorView as? android.view.ViewGroup }
  private var lift: LiftRequest? = null
  private var heldScale: Pair<HoldTarget, Float>? = null

  private val main = Handler(Looper.getMainLooper())
  private val work = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "MessageList").apply { priority = Thread.NORM_PRIORITY - 1 } }

  /** The last rows sent to be read, as the worker thread sees them. */
  @Volatile private var workerRows: List<Row> = emptyList()
  private var pendingRows: ReadableArray? = null
  private var rowsChanged = false
  private var rowsVersion = 0L
  private data class ApplyResult(val next: List<Row>, val diff: DiffUtil.DiffResult?, val inset: Inset?, val version: Long,
    val composer: ComposerApply?, val changed: Boolean)
  private val applies = ArrayDeque<ApplyResult>()
  private val composer = ComposerLayout()
  private var composerBarrier = false
  private var ordinaryInset: Inset? = null
  private var composerOwnerChanged = false
  private var liftChanged = false
  private var mounting = false
  private var draining = false
  private var pendingApplies = 0
  private var composerNeedsReplay = false
  private var composerThawed = false
  private var landing = false
  private var landingGeneration = 0L
  private var pendingLand = false
  private var closePermission: ComposerClose? = null
  private var closeKeyboard: Int? = null
  private val landCompletions = mutableListOf<() -> Unit>()
  private val composerMounts = ComposerMounts(this, {
    mounting = true
    composer.invalidate()
  }, { sample ->
    mounting = false
    composer.seal(sample)
    if (composerNeedsReplay) {
      composerNeedsReplay = false
      if (composer.binding != null) {
        composerBarrier = true
        commit()
      }
    }
    composerTrace(this) { "seal owner=${composer.binding?.owner} release=${composer.binding?.release} sequence=${sample?.sequence} height=${sample?.height} generation=${composer.generation}" }
    drainApplies()
  })
  private val latestScroll = LatestScroll()

  private var behavior = Behavior.DEFAULT
  /** `insets.top` and `insets.bottom`, and when they apply (see `InsetHold`). */
  private val insets = InsetHold()
  private var followKeyboard = false
  private var keyboard = 0

  /** How much of `insets.bottom` the keyboard covers, from JavaScript; null for the navigation bar. */
  private var keyboardOverlap: Int? = null

  /** Holding the keyboard height while a modal over the list takes the keyboard (`keyboardFrozen`). */
  private var keyboardFrozen = false
  private var keyboardEase: ValueAnimator? = null
  private var imeAnimating = false
  private var initialRowId: String? = null

  private var shown = false
  private var placeWhenSized = false
  private var readySent = false
  private var hasBubbles = false

  // What was last reported, so each event is sent once per change.
  private var olderAt = -1
  private var newerAt = -1
  private var nearLatest: Boolean? = null
  private var visibleFirst = -1
  private var visibleLast = -1
  private var visibleSentAt = 0L
  private var visiblePending = false

  /** When recent arrivals came, for the firehose rule. */
  private val arrivalTimes = ArrayDeque<Long>()
  private var firehose = false

  override val shouldUseAndroidLayout = true

  init {
    tracing = (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
    if (tracing) {
      val paint = android.text.TextPaint().apply { textSize = units.sp(17f) }
      val fm = paint.fontMetricsInt
      android.util.Log.i("MessageList", "17sp: font padding ${units.dp((fm.bottom - fm.top).toFloat())} dp, without ${units.dp((fm.descent - fm.ascent).toFloat())} dp, spacing ${units.dp(paint.fontSpacing)} dp")
    }
    clipChildren = false
    clipToPadding = false
    recycler.layoutManager = manager
    recycler.adapter = rows
    recycler.itemAnimator = animator
    recycler.setHasFixedSize(true)
    recycler.clipToPadding = false
    recycler.clipChildren = false
    recycler.overScrollMode = View.OVER_SCROLL_NEVER
    recycler.isVerticalScrollBarEnabled = false
    recycler.setItemViewCacheSize(4)
    recycler.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    manager.initialPrefetchItemCount = 4
    animator.restingAlpha = { holder -> if ((holder as? RowHolder)?.row?.id == rows.liftedRowId && rows.liftedRowId != null) 0f else 1f }
    addView(recycler, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

    rows.onAccessibilityTarget = { target -> send(target.event()) }
    rows.onAccessibilityHold = { holder -> hold(holder, null) }
    env.onDeckChanged = { cell -> cell.deckChanged() }

    recycler.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
        if (newState == RecyclerView.SCROLL_STATE_DRAGGING) latestScroll.cancel()
      }

      override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
        scrolledPx += abs(dy)
        timed({ "onScrolled" }) {
          report(dy)
          preload()
        }
      }
    })
    watchKeyboard()
  }

  // MARK: Props

  fun setRows(array: ReadableArray?) {
    pendingRows = array
    rowsChanged = true
  }

  fun setTheme(map: ReadableMap?) {
    val theme = decodeTheme(map)
    if (theme == env.theme) return
    env.theme = theme
    if (rows.itemCount > 0) {
      animator.animate = false
      rows.notifyItemRangeChanged(0, rows.itemCount)
      layoutNow()
      animator.animate = true
    }
  }

  fun setBehavior(map: ReadableMap?) {
    behavior = decodeBehavior(map)
    animator.moveMs = behavior.moveMs
    animator.fadeMs = behavior.fadeMs
  }

  fun setComposer(map: ReadableMap?) {
    val owner = map?.str("owner")?.takeIf { it.isNotEmpty() }
    val release = map?.num("release")?.takeIf { it.isFinite() && it >= 0 }
    val gap = map?.num("gap")?.takeIf { it.isFinite() && it >= 0 }
    val binding = if (owner != null && release != null && gap != null) ComposerBinding(owner, release.toLong(), gap.toFloat()) else null
    val previous = composer.binding
    val previousGeneration = composer.generation
    val change = composer.bind(binding)
    if (change != ComposerChange.NONE) {
      // A changed gap is ordinary UI geometry, not send authorization.
      if (change == ComposerChange.BARRIER) composerBarrier = true
      if (previous != null && previousGeneration != composer.generation) composerOwnerChanged = true
    }
    composerMounts.owner = binding?.owner
  }

  fun setInsets(map: ReadableMap?) {
    keyboardOverlap = map?.num("keyboardOverlap")?.let { units.px(it.toFloat()) }
    // Applied in `commit`, once the update's other props are in: with the
    // rows of the same update, or at once.
    insets.receive(Inset(map?.num("top")?.toFloat() ?: 0f, map?.num("bottom")?.toFloat() ?: 0f))
  }

  fun setKeyboardFrozen(frozen: Boolean) {
    if (frozen == keyboardFrozen) return
    keyboardFrozen = frozen
    latestScroll.freeze(frozen)
    val easing = keyboardEase
    keyboardEase = null
    easing?.cancel()
    if (frozen) {
      if (latestScroll.active) recycler.stopScroll()
      if (pendingLand || landing) cancelLanding()
      return
    }
    if (composer.binding != null) {
      // The mount seal drains paired rows before sampling final IME geometry.
      composerThawed = true
      return
    }
    // Following again: ease to where the keyboard is now, if it moved meanwhile.
    val target = keyboardLift(ViewCompat.getRootWindowInsets(this))
    if (target == keyboard) {
      retargetLatest()
      return
    }
    keyboardEase = ValueAnimator.ofInt(keyboard, target).apply {
      duration = KEYBOARD_EASE_MS
      interpolator = EASE
      addUpdateListener { setKeyboardLift(it.animatedValue as Int) }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          if (keyboardEase !== animation) return
          keyboardEase = null
          retargetLatest()
        }
      })
    }
    keyboardEase?.start()
  }

  fun setAlignTop(alignTop: Boolean) {
    if (alignTop == manager.alignTop) return
    manager.alignTop = alignTop
    layoutNow()
  }

  fun setKeyboard(enabled: Boolean) {
    followKeyboard = enabled
    if (composer.binding != null && (mounting || !composer.sealed || keyboardFrozen || composer.waiting() || pendingLand || landing)) return
    if (!enabled) keyboard = 0 else keyboard = keyboardLift(ViewCompat.getRootWindowInsets(this))
    padApplied()
  }

  fun setLiftedRowId(id: String?) {
    if (id == rows.liftedRowId) return
    rows.liftedRowId = id
    for (index in 0 until recycler.childCount) {
      val holder = recycler.getChildViewHolder(recycler.getChildAt(index)) as? RowHolder ?: continue
      val lifted = id != null && holder.row?.id == id
      val view = holder.itemView
      view.animate().cancel()
      if (lifted) view.alpha = 0f
      // Back in place once the menu has closed over it.
      else if (view.alpha < 1f) view.animate().alpha(1f).setDuration(120).start()
    }
  }

  fun setInitialRowId(id: String?) {
    if (!shown) initialRowId = id
  }

  fun setLift(request: LiftRequest?) {
    if (request == lift) return
    lift = request
    liftChanged = true
  }

  private fun updateLift(request: LiftRequest?) {
    if (request == null) requestLand()
    else {
      latestScroll.cancel()
      recycler.stopScroll()
      val position = rows.rows.indexOfFirst { it.id == request.rowId }
      val holder = recycler.findViewHolderForAdapterPosition(position) as? RowHolder ?: return
      cancelLanding()
      val pressed = heldScale?.takeIf { it.first == HoldTarget(request.rowId, request.part, request.index) }?.second
      heldScale = null
      lifter.lift(request, holder, pressed)
    }
  }

  fun landLift(promise: expo.modules.kotlin.Promise) {
    lift = null
    requestLand { promise.resolve(null) }
  }

  private fun cancelLanding() {
    landingGeneration++
    landing = false
    pendingLand = false
    closePermission = null
    closeKeyboard = null
    composer.cancelClose()
    // finish resolves active callbacks only after returning the real pieces.
    lifter.finish()
    val canceled = landCompletions.toList()
    landCompletions.clear()
    canceled.forEach { it() }
  }

  private fun requestLand(completion: (() -> Unit)? = null) {
    if (composer.binding == null || landing) {
      // An active landing can acquire another waiter without taking another
      // destination or widening its already captured close authority.
      lifter.land(completion)
      return
    }
    completion?.let { landCompletions.add(it) }
    if (pendingLand) return
    pendingLand = true
    closePermission = composer.close(++landingGeneration)
    closeKeyboard = if (keyboardFrozen) keyboard else null
    // Props can still be mounting. No destination capture before the seal.
    if (!mounting && composer.sealed) drainApplies()
  }

  private fun beginLandIfReady() {
    if (!pendingLand || landing || mounting || !composer.sealed) return
    val permission = closePermission ?: return
    if (!composer.accepts(permission)) {
      cancelLanding()
      return
    }
    if (composer.closeWaiting(permission)) return
    pendingLand = false
    landing = true
    val token = permission.token
    val completions = landCompletions.toList()
    landCompletions.clear()
    composerTrace(this) { "land:begin owner=${permission.owner} release=${permission.release} token=$token keyboardPx=$keyboard" }
    lifter.land {
      composerTrace(this) { "land:restored owner=${permission.owner} token=$token current=${token == landingGeneration}" }
      completions.forEach { it() }
      if (token == landingGeneration && composer.accepts(permission)) {
        landing = false
        closePermission = null
        closeKeyboard = null
        composer.cancelClose()
        drainApplies()
      }
    }
  }

  /** Applies the props that changed together, once they're all in. */
  fun commit() {
    // Owner and lift props can arrive in either order. Cancel the previous
    // owner's restoration before opening this batch's lift, never afterward.
    if (composerOwnerChanged) {
      composerOwnerChanged = false
      cancelLanding()
      if (!liftChanged) lift = null
    }
    if (liftChanged) {
      liftChanged = false
      updateLift(lift)
    }
    val inset = insets.take()
    val changed = rowsChanged
    val bound = composer.binding != null
    val barrier = bound && composerBarrier
    val unbind = composerBarrier && !bound
    composerBarrier = false
    if (!changed && !barrier && !unbind) {
      if (bound) {
        // React bottom reports can trail actual UI growth. Keep current top
        // and an explicit legacy fallback, but never queue a worker for them.
        if (inset != null) ordinaryInset = inset
      } else if (inset != null) applyPadding()
      return
    }
    ordinaryInset = null
    rowsChanged = false
    val array = pendingRows
    val authority = composer.capture(inset ?: insets.latest)
    val version = ++rowsVersion
    pendingApplies++
    val carried = if (unbind) inset ?: insets.latest else inset
    // Even a release-only same-height/cancel result follows every submitted
    // diff. workerRows is the chained diff base and must never be skipped.
    work.execute {
      val next = if (changed) decodeRows(array) else workerRows
      val before = workerRows
      workerRows = next
      val diff = if (!changed || before.isEmpty()) null else DiffUtil.calculateDiff(RowsDiff(before, next), false)
      main.post {
        applies.addLast(ApplyResult(next, diff, carried, version, authority, changed))
        drainApplies()
      }
    }
  }

  private fun drainApplies() {
    if (draining || mounting || landing) return
    if (composer.sealed && !composerMounts.valid(composer.sample)) {
      composer.seal(null)
      composerTrace(this) { "fallback owner=${composer.binding?.owner} staleHostBetweenMounts=true" }
    }
    draining = true
    try {
      while (applies.isNotEmpty()) {
        // With no authorized pair left, normal close wins over ordinary or
        // later-release work. That work remains FIFO behind restoration.
        if (pendingLand && closePermission?.let { !composer.closeWaiting(it) } == true) break
        val result = applies.first()
        val holdingCloseKeyboard = closeKeyboard != null && (pendingLand || landing)
        val frozenCloseFlush = holdingCloseKeyboard && composer.closeFlush(result.composer, closePermission)
        val coordinated = composer.binding != null || result.composer != null
        if (coordinated && !composer.canApply(result.composer, (keyboardFrozen || holdingCloseKeyboard) && !frozenCloseFlush)) break
        applies.removeFirst()
        pendingApplies--
        val padding = when {
          coordinated && (keyboardFrozen || holdingCloseKeyboard) && !frozenCloseFlush -> null
          result.composer != null -> composer.inset(result.composer)
          else -> insets.withRows(result.inset)
        }
        if (holdingCloseKeyboard) keyboard = closeKeyboard!!
        else if (coordinated && !keyboardFrozen) keyboard = keyboardLift(ViewCompat.getRootWindowInsets(this))
        composerTrace(this) { "apply owner=${result.composer?.binding?.owner} release=${result.composer?.binding?.release} sequence=${composer.sample?.sequence} height=${composer.sample?.height} bottom=${padding?.bottom} version=${result.version} generation=${result.composer?.generation} closeFlush=$frozenCloseFlush keyboardPx=$keyboard" }
        timed({ "apply ${result.next.size} rows" }) {
          if (result.changed) apply(result.next, result.diff, padding, result.version, resumeLatest = !pendingLand && !holdingCloseKeyboard)
          else if (padding != null) {
            setPairedPadding(padding)
            layoutNow()
          }
        }
        result.composer?.let { composer.applied(it) }
      }
      refreshComposerGeometry()
      if (composer.binding != null && composer.sealed && !keyboardFrozen && !landing && !pendingLand && pendingApplies == 0 && !composer.waiting()) {
        val target = keyboardLift(ViewCompat.getRootWindowInsets(this))
        if (target != keyboard) {
          keyboard = target
          padApplied()
        }
        if (composerThawed) {
          composerThawed = false
          retargetLatest()
        }
      }
    } finally { draining = false }
    beginLandIfReady()
  }

  private fun refreshComposerGeometry() {
    val actual = composer.ordinary(keyboardFrozen, landing || pendingLand)
    val legacy = if (composer.binding != null && composer.sealed && composer.sample == null && !composer.waiting() &&
      !keyboardFrozen && !landing && !pendingLand && pendingApplies == 0) ordinaryInset else null
    val inset = actual?.copy(top = insets.latest.top) ?: legacy ?: return
    // A valid native sample ignores a chasing React bottom. Once consumed,
    // its old fallback can never replay merely because the host disappears.
    ordinaryInset = null
    if (!keyboardFrozen) keyboard = keyboardLift(ViewCompat.getRootWindowInsets(this))
    if (insets.applied != inset || recycler.paddingBottom != units.px(inset.bottom) + keyboard) {
      setPaddingOnly(inset)
      layoutNow()
      // Passive observations cannot create a navigation request. This only
      // continues an existing, uncanceled generic intent.
      retargetLatest()
    }
  }

  // MARK: Applying rows

  private fun apply(next: List<Row>, diff: DiffUtil.DiffResult?, padding: Inset? = null, version: Long = rowsVersion, resumeLatest: Boolean = true) {
    // Legacy supersession or composer authority was resolved before entering.
    val inset = padding
    val before = rows.rows
    hasBubbles = next.any { it is MessageRow && !it.stacked }
    if (!shown || before.isEmpty()) {
      inset?.let { setPaddingOnly(it) }
      animator.animate = false
      rows.apply(next, null)
      animator.animate = true
      if (next.isNotEmpty()) {
        if (width == 0 || height == 0) placeWhenSized = true else placeInitially(next)
      }
      if (resumeLatest && latestScroll.follows(version)) retargetLatest()
      return
    }
    // Measured before the composer's inset changes.
    val distance = distanceFromLatest()
    val following = latestScroll.tracks(version)
    // A smooth request can be within nearLatestPoints while still moving.
    // It must finish smoothly, rather than snapping its last few points.
    val away = following && (distance == null || distance > 1f)
    val anchor = if (away) manager.captureScrollAnchor(recycler) else null
    if (following) recycler.stopScroll()
    val wasAtBottom = !away && distance?.let { it <= units.pxf(behavior.nearLatestPoints) } == true
    val changes = rowChanges(before, next, wasAtBottom)
    countArrivals(changes.bottomArrivals)
    // A firehose or a big change: everything takes its place at once.
    animator.animate = !firehose && changes.changed <= BIG_CHANGE
    animator.inserted = changes.shownIn
    animator.rising = changes.rising
    animator.handoff = handoff(before, next, changes.arrivals)
    // The composer's change lands in this same layout pass as the rows.
    inset?.let { setPairedPadding(it) }
    rows.apply(next, diff)
    if (anchor != null) manager.restoreScrollAnchor(recycler, anchor)
    else if (wasAtBottom && changes.newestInserted) manager.scrollToPositionWithOffset(0, 0)
    // In this pass, while the animator knows what's new (see `layoutNow`).
    layoutNow()
    animator.inserted = emptySet()
    animator.rising = emptySet()
    animator.handoff = null
    animator.animate = true
    if (resumeLatest && following) retargetLatest()
    recycler.post { report(0) }
  }

  /**
   * A message from someone who was typing, arriving as their indicator
   * goes (bubbles): it grows out of the typing bubble instead of rising in.
   */
  private fun handoff(before: List<Row>, next: List<Row>, arrivals: Set<String>): String? {
    val typing = before.firstOrNull() as? TypingRow ?: return null
    if (typing.stacked || next.any { it.id == typing.id }) return null
    val message = next.firstOrNull() as? MessageRow ?: return null
    if (message.id !in arrivals || message.isOwn || message.stacked) return null
    if (typing.people.none { it.id == message.author.id }) return null
    if (!morphs(message)) return null
    return message.id
  }

  /** Counts arrivals in the firehose window: past `firehoseFrom`, they show at once until it's down to `firehoseUntil`. */
  private fun countArrivals(count: Int) {
    val now = SystemClock.uptimeMillis()
    repeat(count) { arrivalTimes.addLast(now) }
    while (arrivalTimes.isNotEmpty() && now - arrivalTimes.first() > behavior.firehoseWindowMs) arrivalTimes.removeFirst()
    val recent = arrivalTimes.size
    if (!firehose && recent >= behavior.firehoseFrom) firehose = true
    else if (firehose && recent <= behavior.firehoseUntil) firehose = false
  }

  /** Opens on `initialRowId`, centered, or on the newest row. */
  private fun placeInitially(next: List<Row>) {
    val target = initialRowId?.let { id -> next.indexOfFirst { it.id == id } } ?: -1
    if (target > 0) {
      manager.scrollToPositionWithOffset(target, visibleHeight() / 2)
    } else {
      manager.scrollToPositionWithOffset(0, 0)
    }
    layoutNow()
    if (target > 0) centerOn(target)
    shown = true
    recycler.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        recycler.viewTreeObserver.removeOnPreDrawListener(this)
        if (!readySent) {
          readySent = true
          // On the frame after it's drawn placed.
          recycler.postOnAnimation { send(mapOf("type" to "ready")) }
        }
        report(0)
        preload()
        return true
      }
    })
  }

  /** Moves a laid-out row to the middle of what's visible. */
  private fun centerOn(position: Int) {
    val view = manager.findViewByPosition(position) ?: return
    val middle = recycler.paddingTop + visibleHeight() / 2
    val center = (view.top + view.bottom) / 2
    val delta = center - middle
    if (abs(delta) > 1) {
      recycler.scrollBy(0, delta)
    }
  }

  private fun visibleHeight() = recycler.height - recycler.paddingTop - recycler.paddingBottom

  /**
   * Measures and lays out the list now, rather than on a later frame (React
   * Native doesn't lay out native children itself), so a change and its
   * animation start in the same frame.
   */
  private fun layoutNow() {
    if (width == 0 || height == 0) return
    recycler.layoutInPlace(width, height)
  }

  // MARK: Insets and the keyboard

  private fun applyPadding() {
    if (composer.binding != null) {
      refreshComposerGeometry()
      return
    }
    val inset = insets.latest
    insets.markApplied(inset)
    val top = units.px(inset.top)
    val bottom = units.px(inset.bottom) + keyboard
    if (recycler.paddingTop == top && recycler.paddingBottom == bottom) return
    recycler.setPadding(0, top, 0, bottom)
    layoutNow()
    retargetLatest()
  }

  /** Sets the insets without laying out: the rows' apply that follows lays out once, with both. */
  private fun setPaddingOnly(inset: Inset) {
    insets.markApplied(inset)
    recycler.setPadding(0, units.px(inset.top), 0, units.px(inset.bottom) + keyboard)
  }

  private fun setPairedPadding(inset: Inset) {
    manager.pinLatestForPadding(recycler, units.px(inset.bottom) + keyboard)
    setPaddingOnly(inset)
  }

  /** How far the keyboard lifts the list: its height, less the inset JavaScript already leaves under the composer. */
  private fun keyboardLift(insets: WindowInsetsCompat?): Int {
    if (insets == null || !followKeyboard) return 0
    val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val covered = keyboardOverlap ?: insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
    return maxOf(0, ime - covered)
  }

  /** The keyboard moved: followed unless it's frozen. */
  private fun followKeyboard(lift: Int) {
    if (keyboardFrozen) return
    val easing = keyboardEase
    keyboardEase = null
    easing?.cancel()
    setKeyboardLift(lift)
  }

  private fun setKeyboardLift(lift: Int) {
    if (lift == keyboard) return
    if (composer.binding != null && (mounting || !composer.sealed || composer.waiting() || landing || pendingLand)) return
    keyboard = lift
    padApplied()
  }

  /** The keyboard on top of the insets the list has, not ones still waiting for their rows. */
  private fun padApplied() {
    val top = units.px(insets.applied.top)
    val bottom = units.px(insets.applied.bottom) + keyboard
    if (recycler.paddingTop == top && recycler.paddingBottom == bottom) return
    recycler.setPadding(0, top, 0, bottom)
    layoutNow()
    if (!imeAnimating && keyboardEase?.isRunning != true) retargetLatest()
  }

  /** Follows the keyboard frame by frame as it opens, closes, or is dragged down. */
  private fun watchKeyboard() {
    ViewCompat.setWindowInsetsAnimationCallback(
      this,
      object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
        override fun onPrepare(animation: WindowInsetsAnimationCompat) {
          if (animation.typeMask and WindowInsetsCompat.Type.ime() != 0) imeAnimating = true
        }

        override fun onProgress(insets: WindowInsetsCompat, running: MutableList<WindowInsetsAnimationCompat>): WindowInsetsCompat {
          if (running.any { it.typeMask and WindowInsetsCompat.Type.ime() != 0 }) followKeyboard(keyboardLift(insets))
          return insets
        }

        override fun onEnd(animation: WindowInsetsAnimationCompat) {
          if (animation.typeMask and WindowInsetsCompat.Type.ime() == 0) return
          imeAnimating = false
          followKeyboard(keyboardLift(ViewCompat.getRootWindowInsets(this@MessageListView)))
        }
      },
    )
    ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
      if (!imeAnimating) followKeyboard(keyboardLift(insets))
      insets
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    composerMounts.attach(appContext.reactContext as? com.facebook.react.bridge.ReactContext)
    // Frozen under the menu, the list keeps the keyboard it had.
    if (!keyboardFrozen) setKeyboardLift(keyboardLift(ViewCompat.getRootWindowInsets(this)))
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (w != oldw && oldw != 0 && rows.itemCount > 0) {
      // Widths come from the row's width: rebind for the new one.
      animator.animate = false
      rows.notifyItemRangeChanged(0, rows.itemCount)
      post { animator.animate = true }
    }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    if (placeWhenSized && width > 0 && height > 0) {
      placeWhenSized = false
      post { placeInitially(rows.rows) }
    }
  }

  override fun onDetachedFromWindow() {
    composerMounts.detach()
    composer.detach()
    composerNeedsReplay = composer.binding != null
    composerThawed = false
    ordinaryInset = null
    cancelLanding()
    latestScroll.cancel()
    recycler.stopScroll()
    super.onDetachedFromWindow()
    revealAnimator?.cancel()
  }

  /**
   * Closes the keyboard, as dragging down at the newest message does
   * (#165). RecyclerView has no dismiss mode. The screen also wraps this
   * list in KeyboardGestureArea on Android 30+, which can request its own
   * interactive IME control before forwarding MOVE to this list. The list
   * then follows the keyboard down through its insets and stays at the
   * bottom. The composer keeps focus, as with the system's back gesture.
   */
  private fun hideKeyboard(trace: KeyboardDragTrace) {
    val window = appContext.currentActivity?.window
    if (window == null) {
      trace.event("hide:skipped") { "noActivityWindow ${keyboardTraceState()}" }
      return
    }
    trace.event("hide:request") { keyboardTraceState() }
    WindowCompat.getInsetsController(window, this).hide(WindowInsetsCompat.Type.ime())
    // Returning from hide() is not an acknowledgement of IME dismissal.
    trace.event("hide:returned") { keyboardTraceState() }
  }

  private fun keyboardTraceState(): String {
    val root = ViewCompat.getRootWindowInsets(this)
    val windowRoot = appContext.currentActivity?.window?.decorView?.let { ViewCompat.getRootWindowInsets(it) }
    return "uptime=${SystemClock.uptimeMillis()} keyboardPx=$keyboard keyboardFrozen=$keyboardFrozen " +
      "rootIme=${root?.isVisible(WindowInsetsCompat.Type.ime())} rootImePx=${root?.getInsets(WindowInsetsCompat.Type.ime())?.bottom} " +
      "windowIme=${windowRoot?.isVisible(WindowInsetsCompat.Type.ime())} rvState=${recycler.scrollState} " +
      "distancePx=${distanceFromLatest()} nearPx=${units.pxf(behavior.nearLatestPoints)} " +
      "rvHeight=${recycler.height} bottomPadding=${recycler.paddingBottom} rows=${rows.itemCount}"
  }

  // MARK: Where the reader is

  /** How far the newest row's bottom is below the visible bottom, or null when it's off screen. */
  private fun distanceFromLatest(): Float? {
    if (rows.itemCount == 0) return 0f
    val view = manager.findViewByPosition(0) ?: return null
    return (view.bottom - (recycler.height - recycler.paddingBottom)).toFloat().coerceAtLeast(0f)
  }

  private fun report(dy: Int) {
    if (!shown || rows.itemCount == 0) return
    val first = manager.findFirstVisibleItemPosition()
    val last = manager.findLastVisibleItemPosition()
    if (first == RecyclerView.NO_POSITION) return
    val near = distanceFromLatest()?.let { it <= units.pxf(behavior.nearLatestPoints) } == true
    if (near != nearLatest) {
      nearLatest = near
      send(mapOf("type" to "nearLatest", "near" to near))
    }
    if (first != visibleFirst || last != visibleLast) {
      val now = SystemClock.uptimeMillis()
      if (now - visibleSentAt >= VISIBLE_MS) sendVisible()
      else if (!visiblePending) {
        visiblePending = true
        main.postDelayed({
          visiblePending = false
          sendVisible()
        }, VISIBLE_MS - (now - visibleSentAt))
      }
    }
    // Asks for older rows well before the top, so a fling never reaches it.
    val count = rows.itemCount
    val average = averageRowHeight()
    val ahead = behavior.loadAheadScreens * maxOf(1, visibleHeight())
    if (olderAt != count && olderRowsWithin(rows.rows, last, units.dp(ahead), env.theme, units.fontScale, units.dp(recycler.width.toFloat()))) {
      olderAt = count
      send(mapOf("type" to "reachedOlder"))
    }
    if (dy > 0 && first * average < ahead && newerAt != count) {
      newerAt = count
      send(mapOf("type" to "reachedNewer"))
    }
  }

  /** The rows on screen now, if they changed since last sent. */
  private fun sendVisible() {
    val first = manager.findFirstVisibleItemPosition()
    val last = manager.findLastVisibleItemPosition()
    if (first == RecyclerView.NO_POSITION || (first == visibleFirst && last == visibleLast)) return
    visibleFirst = first
    visibleLast = last
    visibleSentAt = SystemClock.uptimeMillis()
    val ids = ArrayList<String>()
    for (position in first..last) rows.rows.getOrNull(position)?.let { ids.add(it.id) }
    send(mapOf("type" to "visible", "rowIds" to ids))
  }

  private fun averageRowHeight(): Float {
    val n = recycler.childCount
    if (n == 0) return units.pxf(60f)
    var total = 0
    for (index in 0 until n) total += recycler.getChildAt(index).height
    return maxOf(units.pxf(20f), total.toFloat() / n)
  }

  /** Starts loading the photos of the rows just past the screen, at the size they'll be drawn. */
  private fun preload() = timed({ "preload" }) { preloadNow() }

  private fun preloadNow() {
    val last = manager.findLastVisibleItemPosition()
    val first = manager.findFirstVisibleItemPosition()
    if (last == RecyclerView.NO_POSITION) return
    val range = (last + 1..minOf(rows.itemCount - 1, last + PRELOAD_AHEAD)) + (maxOf(0, first - 3) until first)
    // A few at a time: each request costs main-thread time, and a fling
    // brings new rows into range every frame.
    var started = 0
    for (position in range) {
      if (started >= PRELOADS_PER_FRAME) break
      val row = rows.rows.getOrNull(position) as? MessageRow ?: continue
      for (block in row.blocks) {
        when (block) {
          is MediaBlock -> for ((index, item) in block.items.withIndex()) {
            val key = "${item.shownUrl}#${row.stacked}"
            if (!preloaded.add(key)) continue
            started++
            if (block.items.size == 1) {
              val max = if (row.stacked) recycler.width else (recycler.width * env.theme.bubbleMaxWidthFraction).toInt()
              val w = minOf(units.px(240f), max)
              val h = if (item.width > 0 && item.height > 0) minOf(units.px(300f), w * item.height / item.width) else w
              images.preload(item.shownUrl, w, h)
            } else if (row.stacked) {
              images.preload(item.shownUrl, units.px(CarouselSizes.cardWidth(item)), units.px(CarouselSizes.CARD_HEIGHT))
            } else if (index < 2) {
              val w = units.px(DeckSizes.CARD_WIDTH)
              images.preload(item.shownUrl, w, units.px(block.items.maxOf { DeckSizes.cardHeight(it) }))
            }
          }
          else -> Unit
        }
      }
    }
    if (preloaded.size > 2000) preloaded.clear()
  }

  private val preloaded = HashSet<String>()

  // MARK: Events

  private fun send(event: Map<String, Any>) {
    onEvent(event)
  }

  private fun press(target: Target) = send(target.event())

  /** A rectangle in `cell`, in window coordinates (points), as events report frames. */
  private fun windowFrame(cell: MessageCell, rect: android.graphics.Rect): Map<String, Double> {
    val origin = IntArray(2)
    cell.getLocationInWindow(origin)
    return mapOf(
      "x" to units.dp((origin[0] + rect.left).toFloat()).toDouble(),
      "y" to units.dp((origin[1] + rect.top).toFloat()).toDouble(),
      "width" to units.dp(rect.width().toFloat()).toDouble(),
      "height" to units.dp(rect.height().toFloat()).toDouble(),
    )
  }

  /**
   * A long hold on a row: its part's frame in window coordinates,
   * for the menu. On a reaction it says so (`element`, `reactionKey`) and
   * still reports the part the reaction belongs to, so JavaScript shows who
   * reacted, and JavaScript without that opens the menu on the part.
   */
  private fun hold(holder: RowHolder, hit: Hit?) {
    val row = holder.row as? MessageRow ?: return
    val cell = holder.itemView as? MessageCell ?: return
    val target = hit?.hold ?: HoldTarget(row.id, row.blocks.firstOrNull { it is TextBlock }?.part ?: row.blocks.firstOrNull()?.part)
    val pieces = cell.liftPieces(target.part, target.index)
    val rect = pieces?.frame ?: cell.holdRect(hit?.holdView)
    heldScale = HoldTarget(target.rowId, target.part, target.index) to (pieces?.views?.firstOrNull()?.scaleX ?: 1f)
    val event = HashMap<String, Any>()
    event["type"] = "hold"
    event["rowId"] = target.rowId
    target.part?.let { event["part"] = it }
    target.index?.let { event["index"] = it }
    target.reactionKey?.let {
      event["element"] = "reaction"
      event["reactionKey"] = it
    }
    event["frame"] = windowFrame(cell, rect)
    // A hold on a reaction buzzes in JavaScript (`impact()`); a message hold here.
    if (target.reactionKey == null) cell.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    send(event)
  }

  /**
   * A tap on a reaction: a tick now, on the touch, and the press with the
   * frame of the part it belongs to (bubbles show who reacted there).
   */
  private fun reactionTapped(holder: RowHolder, hit: Hit, target: Target) {
    val cell = holder.itemView as? MessageCell
    (hit.pressView ?: cell)?.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    val event = HashMap(target.event())
    if (cell != null) {
      val rect = cell.liftPieces(target.part, target.index)?.frame ?: cell.holdRect(hit.pressView)
      event["frame"] = windowFrame(cell, rect)
    }
    send(event)
  }

  // MARK: Benchmarks

  /** Pixels the list scrolled through, as its scroll listener reports them (for `benchFling`). */
  private var scrolledPx = 0L
  private var bench: android.view.Choreographer.FrameCallback? = null

  /**
   * For benchmarks: scrolls toward older rows at a constant `speed` (dp a
   * second) for `ms`, by `scrollBy` each frame on from wherever the list
   * is, with no fling physics, so the list's own older-page path runs as in
   * a real fling. At the oldest row it waits there, counting the time,
   * until older rows arrive. Resolves with how far it went (dp) and how
   * long it was stuck at the oldest row (`edgeMs`), as the React Native
   * list's benchmark (Reanimated's `scrollTo` in a frame callback) does.
   */
  fun benchFling(speed: Double, ms: Double, promise: expo.modules.kotlin.Promise) {
    latestScroll.cancel()
    bench?.let { android.view.Choreographer.getInstance().removeFrameCallback(it) }
    recycler.stopScroll()
    val pxPerMs = units.pxf(speed.toFloat()) / 1000.0
    var last = 0L
    var elapsed = 0.0
    var edge = 0.0
    var owed = 0.0
    val start = scrolledPx
    val callback = object : android.view.Choreographer.FrameCallback {
      override fun doFrame(frameTimeNanos: Long) {
        if (last != 0L) {
          val dt = (frameTimeNanos - last) / 1e6
          elapsed += dt
          owed += pxPerMs * dt
          val step = owed.toInt()
          if (step > 0) {
            val before = scrolledPx
            // Toward older rows: up, in the list laid out from the bottom.
            recycler.scrollBy(0, -step)
            val moved = abs(scrolledPx - before)
            owed -= step
            if (moved == 0L) {
              // At the oldest row: waiting there for an older page.
              edge += dt
              owed = 0.0
            }
          }
        }
        last = frameTimeNanos
        if (elapsed >= ms) {
          bench = null
          promise.resolve(mapOf("travelled" to units.dp((scrolledPx - start).toFloat()).toDouble(), "edgeMs" to edge))
          return
        }
        android.view.Choreographer.getInstance().postFrameCallback(this)
      }
    }
    bench = callback
    android.view.Choreographer.getInstance().postFrameCallback(callback)
  }

  // MARK: Scrolling from JavaScript

  fun scrollToLatest(animated: Boolean) {
    if (!animated) {
      latestScroll.cancel()
      recycler.stopScroll()
      manager.scrollToPositionWithOffset(0, 0)
      return
    }
    latestScroll.request(rowsVersion)
    if (keyboardFrozen || rows.itemCount == 0) return
    // From far away, jump close first so the scroll is short.
    if (manager.findFirstVisibleItemPosition() > JUMP_FROM) manager.scrollToPositionWithOffset(JUMP_FROM, 0)
    retargetLatest()
  }

  /** Recomputed after rows AND their inset laid out; never jumps to latest. */
  private fun retargetLatest() {
    if (!latestScroll.active || keyboardFrozen || keyboardEase?.isRunning == true) return
    val ticket = latestScroll.ticket()
    recycler.post {
      if (!latestScroll.accepts(ticket) || rows.itemCount == 0) return@post
      recycler.stopScroll()
      if (distanceFromLatest()?.let { it <= 1f } == true) return@post
      val scroller = object : LinearSmoothScroller(context) {
        override fun getVerticalSnapPreference() = SNAP_TO_END
        override fun calculateSpeedPerPixel(displayMetrics: DisplayMetrics) = 40f / displayMetrics.densityDpi
      }
      scroller.targetPosition = 0
      manager.startSmoothScroll(scroller)
    }
  }

  fun scrollToRow(id: String, animated: Boolean) {
    latestScroll.cancel()
    recycler.stopScroll()
    val position = rows.rows.indexOfFirst { it.id == id }
    if (position < 0) return
    if (!animated || abs(position - manager.findFirstVisibleItemPosition()) > JUMP_FROM) {
      recycler.stopScroll()
      manager.scrollToPositionWithOffset(position, visibleHeight() / 2)
      layoutNow()
      centerOn(position)
      return
    }
    val scroller = object : LinearSmoothScroller(context) {
      override fun calculateDtToFit(viewStart: Int, viewEnd: Int, boxStart: Int, boxEnd: Int, snapPreference: Int) =
        (boxStart + (boxEnd - boxStart) / 2) - (viewStart + (viewEnd - viewStart) / 2)
    }
    scroller.targetPosition = position
    manager.startSmoothScroll(scroller)
  }

  // MARK: Touch: taps, holds, and dragging times in

  private var revealAnimator: ValueAnimator? = null

  private fun setReveal(px: Float) {
    env.reveal = px
    for (index in 0 until recycler.childCount) (recycler.getChildAt(index) as? MessageCell)?.applyReveal()
  }

  private val touch = Touch()

  init {
    recycler.addOnItemTouchListener(touch)
  }

  /**
   * Every tap fires on its first release. A long press (320 ms) holds the
   * part for its menu and real-view lift. Successive taps never become a
   * hold. Dragging left still reveals times in bubbles.
   */
  private inner class Touch : RecyclerView.OnItemTouchListener {
    private val keyboardTrace = KeyboardDragTrace(
      enabled = {
        context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0 &&
          android.util.Log.isLoggable("VeraKeyboardDrag", android.util.Log.DEBUG)
      },
      write = { android.util.Log.d("VeraKeyboardDrag", it) },
    )
    private val shrink = PressShrink(main)
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private var downX = 0f
    private var downY = 0f
    private var horizontalTaken = false
    private var revealing = false

    private val taps = Taps()

    /**
     * Began with the keyboard up and the list at its newest row: dragging
     * down closes the keyboard (`hideKeyboard`) and doesn't also scroll the
     * list, which rides down with the keyboard and stays at the bottom (#165).
     */
    private var closingKeyboard = false
    private var keyboardDrag = false

    private val holdRunnable = Runnable {
      if (!taps.takeHold()) return@Runnable
      val (holder, hit) = under(downX, downY) ?: return@Runnable
      hold(holder, hit)
      shrink.release()
    }

    private fun under(x: Float, y: Float): Pair<RowHolder, Hit>? {
      val child = recycler.findChildViewUnder(x, y) ?: return null
      val holder = recycler.getChildViewHolder(child) as? RowHolder ?: return null
      var hit = hitTest(child, x - child.left - child.translationX, y - child.top - child.translationY)
      // Stacked text can be narrower than its column; holding beside a line still holds that part.
      if (child is MessageCell && (hit.holdView == null || hit.holdView === child)) {
        child.heldPart(y - child.top - child.translationY)?.let { part ->
          hit = Hit(hit.press ?: part.pressTarget, hit.pressView ?: part, part.holdTarget, part, hit.horizontal)
        }
      }
      return holder to hit
    }

    private fun cancelTap() {
      shrink.release()
      taps.cancel()
      main.removeCallbacks(holdRunnable)
    }

    override fun onInterceptTouchEvent(rv: RecyclerView, e: MotionEvent): Boolean {
      when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          // Direct manipulation also cancels a restart posted just before
          // the touch, even if the previous smooth scroll has already ended.
          latestScroll.cancel()
          downX = e.x
          downY = e.y
          revealing = false
          keyboardDrag = keyboard > 0 && rv.scrollState == RecyclerView.SCROLL_STATE_IDLE &&
            distanceFromLatest()?.let { it <= units.pxf(behavior.nearLatestPoints) } == true
          closingKeyboard = false
          keyboardTrace.down(e.downTime) {
            "eventTime=${e.eventTime} x=${e.x} y=${e.y} keyboardDrag=$keyboardDrag slop=$slop ${keyboardTraceState()}"
          }
          revealAnimator?.cancel()
          val stoppedScroll = rv.scrollState != RecyclerView.SCROLL_STATE_IDLE
          taps.begin(stoppedScroll)
          val hit = under(e.x, e.y)
          horizontalTaken = hit?.second?.horizontal == true
          // A touch that stops a moving carousel only stops it.
          if (hit != null && inMovingScroller(hit.second.pressView ?: hit.second.holdView, hit.first.itemView)) taps.cancel()
          if (taps.isTap && hit?.first?.row is MessageRow) {
            main.postDelayed(holdRunnable, LONG_PRESS_MS)
            // A reaction fires on the tap: it shows the press at once.
            if (hit.second.press?.type == "reaction") hit.second.pressView?.let { shrink.pressNow(it) }
            else hit.second.holdView?.let { shrink.begin(it) }
          }
        }
        MotionEvent.ACTION_MOVE -> {
          if (keyboardTrace.active) keyboardTrace.firstMove {
            "eventTime=${e.eventTime} dx=${e.x - downX} dy=${e.y - downY} keyboardDrag=$keyboardDrag ${keyboardTraceState()}"
          }
          if (taps.isTap && (abs(e.x - downX) > slop || abs(e.y - downY) > slop)) cancelTap()
          if (closingKeyboard) return true
          if (keyboardDrag && e.y - downY > slop && abs(e.y - downY) > abs(e.x - downX)) {
            keyboardTrace.event("MOVE:recognized") {
              "eventTime=${e.eventTime} dx=${e.x - downX} dy=${e.y - downY} ${keyboardTraceState()}"
            }
            closingKeyboard = true
            cancelTap()
            rv.stopScroll()
            hideKeyboard(keyboardTrace)
            return true
          }
          if (revealing || horizontalTaken || !hasBubbles || rv.scrollState == RecyclerView.SCROLL_STATE_DRAGGING) return revealing
          val dx = e.x - downX
          val dy = e.y - downY
          if (dx < -slop && abs(dx) > abs(dy) * 1.2f) {
            revealing = true
            downX = e.x
            cancelTap()
            rv.parent?.requestDisallowInterceptTouchEvent(true)
            return true
          }
        }
        MotionEvent.ACTION_UP -> {
          keyboardTrace.end("UP:intercept") {
            "eventTime=${e.eventTime} keyboardDrag=$keyboardDrag closingKeyboard=$closingKeyboard ${keyboardTraceState()}"
          }
          shrink.release()
          main.removeCallbacks(holdRunnable)
          if (taps.isTap) tapped(e)
          taps.cancel()
        }
        MotionEvent.ACTION_CANCEL -> {
          keyboardTrace.end("CANCEL:intercept") {
            "eventTime=${e.eventTime} keyboardDrag=$keyboardDrag closingKeyboard=$closingKeyboard ${keyboardTraceState()}"
          }
          cancelTap()
        }
      }
      return false
    }

    private fun tapped(e: MotionEvent) {
      val found = under(e.x, e.y) ?: return
      val (holder, hit) = found
      val target = taps.release(hit.press) ?: return
      if (target.type == "reaction") reactionTapped(holder, hit, target) else press(target)
    }

    override fun onTouchEvent(rv: RecyclerView, e: MotionEvent) {
      // Taken to close the keyboard: the list itself stays where it is.
      if (closingKeyboard) {
        if (e.actionMasked == MotionEvent.ACTION_UP || e.actionMasked == MotionEvent.ACTION_CANCEL) {
          keyboardTrace.end(if (e.actionMasked == MotionEvent.ACTION_UP) "UP:consumed" else "CANCEL:consumed") {
            "eventTime=${e.eventTime} keyboardDrag=$keyboardDrag closingKeyboard=$closingKeyboard ${keyboardTraceState()}"
          }
          closingKeyboard = false
        }
        return
      }
      if (!revealing) return
      when (e.actionMasked) {
        MotionEvent.ACTION_MOVE -> setReveal((downX - e.x).coerceIn(0f, units.pxf(MessageCell.REVEAL_WIDTH)))
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          revealing = false
          val from = env.reveal
          // Settles back with one small overshoot, not a long wobble.
          revealAnimator = ValueAnimator.ofFloat(from, 0f).apply {
            duration = 360
            interpolator = android.view.animation.OvershootInterpolator(0.8f)
            addUpdateListener { setReveal(it.animatedValue as Float) }
            start()
          }
        }
      }
    }

    override fun onRequestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
      if (keyboardTrace.active) keyboardTrace.event("disallowIntercept") {
        "value=$disallowIntercept keyboardDrag=$keyboardDrag ${keyboardTraceState()}"
      }
      if (disallowIntercept) cancelTap()
    }
  }

  companion object {
    /** More rows than this changing at once take their places without animating. */
    private const val BIG_CHANGE = 30
    private const val PRELOAD_AHEAD = 10
    private const val PRELOADS_PER_FRAME = 3
    private const val JUMP_FROM = 20

    /** The existing long-press threshold, with no double-tap arbitration. */
    private const val LONG_PRESS_MS = 320L

    /** `visible` at most this often. */
    private const val VISIBLE_MS = 100L

    /** About the keyboard's own duration, for easing to it after `keyboardFrozen`. */
    private const val KEYBOARD_EASE_MS = 250L
  }
}
