package chat.vera.messagelist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.text.TextPaint
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.view.animation.LinearInterpolator
import androidx.recyclerview.widget.RecyclerView
import kotlin.math.abs
import kotlin.math.sign

// Several photos and videos in one message. Stacked rows: an edge-to-edge
// carousel that settles card by card, each card with its own reactions
// under it. Bubbles: a pile of photos swiped left and right. The
// React Native design is on the branch `t3/stacked-media-carousel`
// (carousel-layout.ts, bubble-layout.ts, bubble-deck.tsx).

object CarouselSizes {
  const val CARD_HEIGHT = 200f
  const val MIN_CARD_WIDTH = 130f
  const val MAX_CARD_WIDTH = 250f
  const val CARD_GAP = 6f

  fun cardWidth(item: MediaItem): Float {
    if (item.width <= 0 || item.height <= 0) return CARD_HEIGHT
    return (CARD_HEIGHT * item.width / item.height).coerceIn(MIN_CARD_WIDTH, MAX_CARD_WIDTH)
  }
}

object DeckSizes {
  const val CARD_WIDTH = 220f
  const val MIN_HEIGHT = 160f
  const val MAX_HEIGHT = 280f

  /** Room above the cards, for the corner of a card behind. */
  const val PEEK = 10f
  const val DOTS = 6f
  const val DOTS_GAP = 6f

  /** A card behind: tilted toward its side, nudged out and up, a little smaller. */
  const val REAR_ANGLE = 3f
  const val REAR_SHIFT = 4f
  const val REAR_LIFT = 10f
  const val REAR_SCALE = 0.96f

  /**
   * A card coming forward: its blur (dp) and dim (of the page color), step
   * by step from the React Native design's 4 blur and 15% dim behind.
   */
  val BLUR_STEPS = floatArrayOf(4f, 8f / 3f, 4f / 3f, 0f)
  val DIM_STEPS = floatArrayOf(0.15f, 0.10f, 0.05f, 0f)

  fun cardHeight(item: MediaItem): Float {
    if (item.width <= 0 || item.height <= 0) return CARD_WIDTH
    return (CARD_WIDTH * item.height / item.width).coerceIn(MIN_HEIGHT, MAX_HEIGHT)
  }
}

/** How tall a row of chips is in `width`, laid out as `ChipsView` lays them out. */
object ChipMetrics {
  private val emoji = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val count = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.semibold }

  fun height(reactions: List<Reaction>, widthPx: Int, theme: Theme, units: Units): Int {
    if (reactions.isEmpty()) return 0
    emoji.textSize = units.sp(13f)
    count.textSize = units.sp(theme.footnote.size)
    val gap = units.px(4f)
    val chip = units.px(26f)
    var x = 0
    var lines = 1
    for (reaction in reactions) {
      val w = Math.ceil((units.pxf(16f) + emoji.measureText(reaction.shown) + units.pxf(4f) + count.measureText(reaction.count.toString())).toDouble()).toInt()
      if (x > 0 && x + w > widthPx) {
        lines++
        x = 0
      }
      x += w + gap
    }
    return units.px(4f) + lines * chip + (lines - 1) * gap
  }
}

/** One card of a carousel: the photo, and its chips under it. */
class CarouselCard(context: Context, private val units: Units, private val images: Images) : ViewGroup(context) {
  val media = MediaView(context, units)
  private val chips = ChipsView(context, units)
  private var cardWidth = 0
  private var laneHeight = 0

  init {
    clipChildren = false
    addView(media)
    addView(chips)
  }

  fun bind(rowId: String, index: Int, item: MediaItem, theme: Theme, lane: Int, animate: Boolean) {
    cardWidth = units.px(CarouselSizes.cardWidth(item))
    laneHeight = lane
    media.setSize(cardWidth, units.px(CarouselSizes.CARD_HEIGHT))
    media.bind(item, theme, images)
    media.pressTarget = Target("media", rowId, part = item.part, index = index)
    media.holdTarget = HoldTarget(rowId, item.part, index)
    chips.bind(item.reactions, theme, rowId, item.part, animate, index)
    requestLayout()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    media.measure(0, 0)
    chips.measure(MeasureSpec.makeMeasureSpec(cardWidth, MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
    setMeasuredDimension(cardWidth, media.measuredHeight + laneHeight)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    media.layout(0, 0, media.measuredWidth, media.measuredHeight)
    chips.layout(0, media.measuredHeight, chips.measuredWidth, media.measuredHeight + chips.measuredHeight)
  }
}

/** A carousel's cards. */
class CarouselAdapter(private val units: Units, private val images: Images) :
  RecyclerView.Adapter<CarouselAdapter.Holder>() {
  class Holder(val card: CarouselCard) : RecyclerView.ViewHolder(card)

  var rowId = ""
  var items: List<MediaItem> = emptyList()
  var theme = Theme.DEFAULT
  var lane = 0

  init {
    setHasStableIds(true)
  }

  override fun getItemId(position: Int): Long = items[position].id.hashCode().toLong()

  override fun getItemViewType(position: Int): Int = VIEW_TYPE

  override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = Holder(CarouselCard(parent.context, units, images))

  override fun getItemCount() = items.size

  override fun onBindViewHolder(holder: Holder, position: Int) {
    holder.card.bind(rowId, position, items[position], theme, lane, animate = false)
  }

  override fun onBindViewHolder(holder: Holder, position: Int, payloads: MutableList<Any>) {
    holder.card.bind(rowId, position, items[position], theme, lane, animate = payloads.isNotEmpty())
  }

  companion object {
    /** Shared by every carousel's pool, apart from the list's own types. */
    const val VIEW_TYPE = 0x7ca0
  }
}

/**
 * A stacked row's photos and videos, two or more, across the whole row:
 * each card as tall as the others and as wide as its photo's shape,
 * resting with the first at the text column and the last at the right
 * margin. Cards draw and stay laid out out to the screen's edges (see
 * `CarouselLayoutManager`). A swipe moves with the platform's own fling
 * and comes to rest on a card's start, or the end (see `CarouselGeometry`).
 *
 * `offsets` keeps where each row was left, so a row scrolled away and
 * back is where the reader left it.
 */
@SuppressLint("ViewConstructor")
class CarouselView(
  context: Context,
  private val units: Units,
  images: Images,
  pool: RecyclerView.RecycledViewPool,
  private val offsets: MutableMap<String, Int>,
) : RecyclerView(context) {
  private val cards = CarouselAdapter(units, images)
  private val manager = carouselLayoutManager(context)
  private val spline = FlingSpline(units.density)
  private var heightPx = 0
  private var geometry = CarouselGeometry(IntArray(0), 0)
  private var key = ""

  /** A drag since the strip last came to rest: settle once it stops. */
  private var dragged = false

  /** Flinging from inside `onFling`, which RecyclerView calls back. */
  private var reflinging = false

  /** Told where the strip is (pixels from resting at the column), as it moves. */
  var onOffset: ((Int) -> Unit)? = null

  init {
    layoutManager = manager
    setRecycledViewPool(pool)
    adapter = cards
    itemAnimator = null
    clipToPadding = false
    clipChildren = false
    overScrollMode = OVER_SCROLL_NEVER
    isHorizontalScrollBarEnabled = false
    takesHorizontal = true
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    addItemDecoration(object : ItemDecoration() {
      override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: RecyclerView, state: State) {
        val position = parent.getChildAdapterPosition(view)
        outRect.right = if (position == state.itemCount - 1) 0 else units.px(CarouselSizes.CARD_GAP)
      }
    })
    onFlingListener = object : OnFlingListener() {
      override fun onFling(velocityX: Int, velocityY: Int): Boolean = flingToRest(velocityX)
    }
    addOnScrollListener(object : OnScrollListener() {
      override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
        if (newState == SCROLL_STATE_DRAGGING) dragged = true
        if (newState == SCROLL_STATE_IDLE && dragged) {
          dragged = false
          settle()
        }
      }

      override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
        val offset = offset() ?: return
        offsets[key] = offset
        onOffset?.invoke(offset)
      }
    })
  }

  /** Where the strip is: 0 with the first card at the column. */
  fun offset(): Int? {
    val child = getChildAt(0) ?: return null
    val position = getChildAdapterPosition(child)
    if (position == NO_POSITION || position >= geometry.starts.size) return null
    return geometry.offsetOf(position, child.left - paddingLeft)
  }

  /** Where this row's strip was left (0 if never moved). */
  val restoredOffset: Int
    get() = offsets[key] ?: 0

  private fun viewport() = width - paddingLeft - paddingRight

  /**
   * Picks where a fling comes to rest and flings at the velocity whose own
   * deceleration ends exactly there, so it moves like any list on the
   * phone. Below RecyclerView's least fling velocity, eases there instead.
   */
  private fun flingToRest(velocity: Int): Boolean {
    if (reflinging) return false
    val current = offset() ?: return false
    val rests = geometry.restingOffsets(viewport())
    val projected = current + spline.distance(velocity.toFloat()).toInt()
    val needed = flingRest(rests, current, projected, velocity) - current
    if (needed == 0) return true
    if (sign(needed.toFloat()) == sign(velocity.toFloat())) {
      reflinging = true
      val flung = fling(spline.velocityPx(needed), 0)
      reflinging = false
      if (flung) return true
    }
    smoothScrollBy(needed, 0, EASE_OUT)
    return true
  }

  /** Comes to rest on the nearest card's start (or the end) after a drag. */
  private fun settle() {
    val current = offset() ?: return
    val target = nearestRest(geometry.restingOffsets(viewport()), current)
    if (target != current) smoothScrollBy(target - current, 0, EASE_OUT)
  }

  /** The held tile, by its part or index. */
  fun heldMedia(part: String?, index: Int?): View? {
    for (at in 0 until childCount) {
      val card = getChildAt(at) as? CarouselCard ?: continue
      if (card.media.holdTarget?.part == part || getChildAdapterPosition(card) == index) return card.media
    }
    return null
  }

  /** Whether a card is at (x, y), in this view's coordinates: the insets beside them pass touches through. */
  fun hasCardAt(x: Float, y: Float): Boolean {
    for (at in 0 until childCount) {
      val card = getChildAt(at)
      val left = card.left + card.translationX
      val top = card.top + card.translationY
      if (x >= left && x <= left + card.width && y >= top && y <= top + card.height) return true
    }
    return false
  }

  /** The tallest of the cards' chip rows, which every card leaves room for. */
  fun laneHeight(items: List<MediaItem>, theme: Theme): Int =
    items.maxOf { ChipMetrics.height(it.reactions, units.px(CarouselSizes.cardWidth(it)), theme, units) }

  /**
   * `key` names this strip among the list's (its row and block), for
   * `offsets`. `column` is where the first card rests (the text column),
   * `margin` where the last one ends.
   */
  fun bind(rowId: String, key: String, items: List<MediaItem>, theme: Theme, column: Int, margin: Int, animate: Boolean) {
    if (key != this.key) {
      // Another row. Stop the last one's fling first, while its own state
      // is still here: stopping goes idle, and a settle or a saved offset
      // must not land on this row.
      dragged = false
      stopScroll()
    }
    val lane = laneHeight(items, theme)
    heightPx = units.px(CarouselSizes.CARD_HEIGHT) + lane
    setPadding(column, 0, margin, 0)
    geometry = CarouselGeometry(IntArray(items.size) { units.px(CarouselSizes.cardWidth(items[it])) }, units.px(CarouselSizes.CARD_GAP))
    val sameRow = this.key == key
    val sameItems = sameRow && cards.items.map { it.id } == items.map { it.id }
    this.key = key
    cards.rowId = rowId
    cards.theme = theme
    cards.lane = lane
    val before = cards.items
    cards.items = items
    if (sameItems) {
      for (index in items.indices) {
        if (before[index] != items[index] || animate) cards.notifyItemChanged(index, if (animate) PAYLOAD else null)
      }
    } else {
      @SuppressLint("NotifyDataSetChanged")
      cards.notifyDataSetChanged()
      if (!sameRow) {
        // Show this row where it was left.
        val (position, start) = geometry.anchorFor(restoredOffset)
        manager.scrollToPositionWithOffset(position, start)
      }
    }
    requestLayout()
  }

  override fun onMeasure(widthSpec: Int, heightSpec: Int) {
    super.onMeasure(widthSpec, MeasureSpec.makeMeasureSpec(heightPx, MeasureSpec.EXACTLY))
  }

  companion object {
    val PAYLOAD = Any()
  }
}

/** Whether `view` is inside a scroller (up to `root`) that's moving: a touch there stops it, and isn't a tap. */
fun inMovingScroller(view: View?, root: View): Boolean {
  var at: View? = view
  while (at != null && at !== root) {
    if (at is RecyclerView && at.scrollState != RecyclerView.SCROLL_STATE_IDLE) return true
    at = at.parent as? View
  }
  return false
}

/**
 * Bubbles' photos and videos, two or more: a pile you flick through where
 * it is (see DeckMotion.kt). The front card follows the finger, tilting as
 * it goes; left brings the next photo forward, right the one before. Past
 * a short swipe the front card leaves at the finger's speed and tucks in
 * behind the pile on its own side, while the one revealed comes forward,
 * its blur clearing. The cards behind show a tilted corner each. Dots under
 * the pile say which photo is in front.
 *
 * Three image views take turns as the front and the two behind, so the
 * photo that comes forward is already loaded; drawing order changes, and
 * nothing is laid out again as they move. `fronts` keeps each row's front
 * photo across recycling.
 */
@SuppressLint("ViewConstructor")
class DeckView(
  context: Context,
  private val units: Units,
  private val images: Images,
  private val fronts: MutableMap<String, Int>,
) : ViewGroup(context) {
  private val cards = List(3) { MediaView(context, units) }
  private var front = cards[0]
  private var next = cards[1]
  private var previous = cards[2]

  /** Back to front. */
  private val order = arrayListOf(previous, next, front)
  private val shown = HashMap<MediaView, Int>()
  private val steps = HashMap<MediaView, Int>()
  private val dots = Paint(Paint.ANTI_ALIAS_FLAG)
  private var items: List<MediaItem> = emptyList()
  private var theme = Theme.DEFAULT
  private var rowId = ""
  private var key = ""
  private var cardWidth = 0
  private var cardHeight = 0

  /** With two photos, the one behind sits on the side the last one went: right at first. */
  private var soloSide = 1

  /** Which photo is in front. */
  var current = 0
    private set

  /** Told when another photo comes to the front (its reactions show then). */
  var onCurrent: ((Int) -> Unit)? = null

  private val slop = ViewConfiguration.get(context).scaledTouchSlop
  private var downX = 0f
  private var downY = 0f
  private var dragging = false
  private var drag = 0f
  private var animation: ValueAnimator? = null
  private val tracker = android.view.VelocityTracker.obtain()
  /**
   * The blur steps' effects, made once. Typed `Any` so this class loads on
   * binaries below API 31, where `RenderEffect` doesn't exist.
   */
  private val blurs = arrayOfNulls<Any>(DeckSizes.BLUR_STEPS.size)

  init {
    setWillNotDraw(false)
    clipChildren = false
    isChildrenDrawingOrderEnabled = true
    cards.forEach {
      it.smoothEdges()
      addView(it)
    }
    takesHorizontal = true
  }

  /** The card in front, which a hold lifts on its own. */
  val frontCard: View
    get() = front

  val currentItem: MediaItem?
    get() = items.getOrNull(current)

  override fun getChildDrawingOrder(childCount: Int, drawingPosition: Int): Int {
    // While the front card is lifted out, only the cards still here are drawn.
    val here = if (childCount == order.size) order else order.filter { it.parent === this }
    val index = here.getOrNull(drawingPosition)?.let { indexOfChild(it) } ?: -1
    return if (index in 0 until childCount) index else drawingPosition
  }

  /** `key` names this pile among the list's (its row and block), for `fronts`. */
  fun bind(rowId: String, key: String, items: List<MediaItem>, theme: Theme, maxWidth: Int) {
    val same = key == this.key && items.map { it.id } == this.items.map { it.id }
    if (!same) {
      finishMotion()
      current = fronts[key]?.takeIf { it in items.indices } ?: 0
      soloSide = 1
    }
    // The dim is the page's color: a new theme redoes it.
    if (theme != this.theme) steps.clear()
    this.rowId = rowId
    this.key = key
    this.items = items
    this.theme = theme
    cardWidth = minOf(units.px(DeckSizes.CARD_WIDTH), maxWidth)
    // The pile is as tall as the tallest photo of all, so its height never
    // changes as they cycle; each card is its own photo's shape, centered in it.
    cardHeight = units.px(items.maxOf { DeckSizes.cardHeight(it) })
    if (same && (dragging || animation != null)) {
      // Mid-swipe, the same pile keeps moving: only what's on the cards updates.
      for ((card, index) in shown) items.getOrNull(index)?.let { card.bind(it, theme, images) }
      targets()
      return
    }
    arrange()
    requestLayout()
  }

  // MARK: The pile at rest

  private val count get() = items.size

  /** Each card on its photo and in its place: the front one, the next behind right, the one before behind left. */
  private fun arrange() {
    if (count == 0) return
    val slots = deckSlots(current, count)
    show(front, slots.front)
    show(next, slots.next)
    slots.previous?.let { show(previous, it) }
    previous.visibility = if (slots.previous == null) INVISIBLE else VISIBLE
    pose(front, CardPose.FRONT, DeckSizes.BLUR_STEPS.size - 1)
    pose(next, behind(next), 0)
    if (slots.previous != null) pose(previous, behind(previous), 0)
    order.clear()
    order.addAll(listOf(previous, next, front))
    drag = 0f
    targets()
    invalidate()
  }

  private fun show(card: MediaView, index: Int) {
    val item = items[index]
    // Placed here (`place`), so a new shape doesn't relayout the list.
    card.setSize(cardWidth, heightOf(item), relayout = false)
    if (shown[card] != index || card.item != item) card.bind(item, theme, images)
    shown[card] = index
    if (card.isLaidOut) place(card)
  }

  private fun heightOf(item: MediaItem) = minOf(cardHeight, units.px(DeckSizes.cardHeight(item)))

  /** Where a card this tall starts in the pile: centered in the tallest photo's height. */
  private fun topFor(height: Int) = units.px(DeckSizes.PEEK) + (cardHeight - height) / 2

  /**
   * Where the front photo's top is in the pile, from its photo's shape, so
   * it holds while the card is lifted out: its tapbacks sit on this corner.
   */
  val frontTop: Int
    get() = topFor(currentItem?.let { heightOf(it) } ?: cardHeight)

  /** A card centered in the pile's height, turned about its own bottom middle. */
  private fun place(card: MediaView) {
    val height = card.item?.let { heightOf(it) } ?: cardHeight
    val top = topFor(height)
    card.measure(0, 0)
    card.layout(0, top, cardWidth, top + height)
    card.pivotX = cardWidth / 2f
    card.pivotY = height.toFloat()
  }

  /** The side a card behind sits on. */
  private fun sideOf(card: MediaView): Int = if (count == 2) soloSide else if (card === next) 1 else -1

  private fun behind(card: MediaView) = CardPose.behind(sideOf(card), units.density)

  /** The card behind that a drag `dx` brings forward: left, the next; right, the one before. */
  private fun rising(dx: Float): MediaView = if (count == 2 || dx < 0) next else previous

  private fun pose(card: MediaView, pose: CardPose, step: Int) {
    card.pivotX = cardWidth / 2f
    card.pivotY = card.height.takeIf { it > 0 }?.toFloat() ?: cardHeight.toFloat()
    card.translationX = pose.x
    card.translationY = pose.y
    card.rotation = pose.rotation
    card.scaleX = pose.scale
    card.scaleY = pose.scale
    blur(card, step)
    edgeLayer(card)
  }

  /**
   * A turned card is drawn from a layer, so its edges, with the clear pixel
   * around the photo (`MediaView.smoothEdges`), are filtered rather than
   * aliased. Only while turned, and not while blurred on API 31+, where the
   * blur already draws it offscreen: the front card at rest has no layer.
   */
  private fun edgeLayer(card: MediaView) {
    val blurred = android.os.Build.VERSION.SDK_INT >= 31 && (steps[card] ?: 0) < DeckSizes.BLUR_STEPS.size - 1
    val wanted = if (card.rotation != 0f && !blurred) LAYER_TYPE_HARDWARE else LAYER_TYPE_NONE
    if (card.layerType != wanted) card.setLayerType(wanted, null)
  }

  private fun poseOf(card: MediaView) = CardPose(card.translationX, card.translationY, card.rotation, card.scaleX)

  /** Blur and dim for a step (0 most, last none), changed only when the step does. */
  private fun blur(card: MediaView, step: Int) {
    if (steps[card] == step) return
    steps[card] = step
    val dim = DeckSizes.DIM_STEPS[step]
    if (dim > 0f) card.setColorFilter(withAlpha(theme.background, dim)) else card.clearColorFilter()
    if (android.os.Build.VERSION.SDK_INT >= 31) {
      val radius = units.pxf(DeckSizes.BLUR_STEPS[step])
      card.setRenderEffect(
        if (radius <= 0f) null
        else blurs[step] as? android.graphics.RenderEffect
          ?: android.graphics.RenderEffect.createBlurEffect(radius, radius, android.graphics.Shader.TileMode.CLAMP).also { blurs[step] = it },
      )
    }
  }

  /** The press and hold go to the front photo, whichever card shows it. */
  private fun targets() {
    val item = items.getOrNull(current) ?: return
    val press = Target("media", rowId, part = item.part, index = current)
    val hold = HoldTarget(rowId, item.part, current)
    pressTarget = press
    holdTarget = hold
    for (card in cards) {
      card.pressTarget = if (card === front) press else null
      card.holdTarget = if (card === front) hold else null
    }
  }

  // MARK: Dragging

  private fun setDrag(dx: Float) {
    drag = dx
    front.translationX = dx
    front.rotation = (dx / units.pxf(200f) * 12f).coerceIn(-12f, 12f)
    edgeLayer(front)
    if (count < 2) return
    val rising = rising(dx)
    val resting = if (count > 2) (if (rising === next) previous else next) else null
    val progress = minOf(1f, abs(dx) / (cardWidth * 0.6f))
    pose(rising, behind(rising).toward(CardPose.FRONT, EASE.getInterpolation(progress)), blurStep(progress))
    resting?.let { pose(it, behind(it), 0) }
    order.clear()
    order.addAll(listOfNotNull(resting ?: previous.takeIf { count == 2 }, rising, front))
    invalidate()
  }

  /** Ends any motion at once, as if it had finished, so a new touch starts from rest. */
  private fun finishMotion() {
    var guard = 0
    while (animation != null && guard++ < 4) animation?.end()
    animation = null
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean = handle(event, intercepting = true)

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean = handle(event, intercepting = false)

  private fun handle(event: MotionEvent, intercepting: Boolean): Boolean {
    if (count < 2) return false
    tracker.addMovement(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        finishMotion()
        downX = event.rawX
        downY = event.rawY
        dragging = false
        tracker.clear()
        tracker.addMovement(event)
        return !intercepting
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - downX
        val dy = event.rawY - downY
        if (!dragging) {
          if (abs(dy) > slop && abs(dy) > abs(dx)) return false
          if (abs(dx) > slop) {
            dragging = true
            parent?.requestDisallowInterceptTouchEvent(true)
            downX = event.rawX
          }
        }
        if (dragging) setDrag(event.rawX - downX)
        return dragging
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (!dragging) return false
        dragging = false
        tracker.computeCurrentVelocity(1000)
        val velocity = tracker.xVelocity
        val flung = abs(velocity) > units.pxf(600f) && sign(velocity) == sign(drag)
        if (event.actionMasked == MotionEvent.ACTION_UP && drag != 0f && (abs(drag) > units.pxf(70f) || flung)) throwFront(velocity)
        else settleBack(velocity)
        return true
      }
    }
    return false
  }

  // MARK: Letting go

  private fun play(ms: Long, interpolator: android.animation.TimeInterpolator, update: (Float) -> Unit, end: () -> Unit) {
    val animator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = ms
      this.interpolator = interpolator
      addUpdateListener { update(it.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        private var done = false

        override fun onAnimationEnd(animation: Animator) {
          if (done) return
          done = true
          if (this@DeckView.animation === animation) this@DeckView.animation = null
          end()
        }
      })
    }
    // Set before starting: with animations off it ends inside `start()`,
    // and its end may already have started the next one.
    animation = animator
    animator.start()
  }

  /** Not far enough: back to rest, carrying the finger's velocity, with one small give. */
  private fun settleBack(velocity: Float) {
    val from = drag
    if (from == 0f) {
      setDrag(0f)
      return
    }
    // Fractions of the drag a second, positive away from rest.
    val v = velocity / from
    play(SPRING_MS, LinearInterpolator(), { t -> setDrag(from * springBack(t * SPRING_MS / 1000f, v)) }) { setDrag(0f) }
  }

  /**
   * Past the threshold: the front card leaves at the finger's speed,
   * decelerating, to just clear of the pile, as the card behind on that
   * side comes forward. Then the revealed photo is in front, and the thrown
   * card, now drawn behind, tucks in on its own side while the other card
   * behind changes sides.
   */
  private fun throwFront(velocity: Float) {
    val direction = sign(drag)
    val toNext = direction < 0
    val thrown = front
    val rising = rising(drag)
    val other = if (count > 2) (if (rising === next) previous else next) else null
    val from = drag
    val fromRotation = thrown.rotation
    // Just clear of the pile, so it changes sides behind it where nothing overlaps.
    val out = direction * (cardWidth + units.pxf(12f))
    val outRotation = direction * 12f
    val risingFrom = poseOf(rising)
    val risingStep = steps[rising] ?: 0
    val distance = abs(out - from)
    // DecelerateInterpolator(1) starts at twice the average speed: match the finger.
    val ms = (2000f * distance / maxOf(abs(velocity), units.pxf(1200f))).toLong().coerceIn(THROW_MIN_MS, THROW_MAX_MS)
    play(ms, DecelerateInterpolator(), { t ->
      thrown.translationX = from + (out - from) * t
      thrown.rotation = fromRotation + (outRotation - fromRotation) * t
      pose(rising, risingFrom.toward(CardPose.FRONT, t), maxOf(risingStep, blurStep(t)))
    }) {
      current = deckAfterThrow(current, count, toNext)
      fronts[key] = current
      if (count == 2) {
        soloSide = direction.toInt()
        front = rising
        next = thrown
      } else if (toNext) {
        front = rising
        previous = thrown
        next = other!!
      } else {
        front = rising
        next = thrown
        previous = other!!
      }
      pose(front, CardPose.FRONT, DeckSizes.BLUR_STEPS.size - 1)
      // Fully beside the pile: it goes behind now, and comes back under it.
      order.clear()
      order.addAll(listOfNotNull(thrown, other ?: previous.takeIf { it !== thrown && it !== front }, front))
      // A new drawing order needs this view redrawn: moving the cards alone
      // only moves their layers, and the old order would show until the tuck ends.
      invalidate()
      targets()
      performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
      onCurrent?.invoke(current)
      val slots = deckSlots(current, count)
      other?.let { show(it, if (it === next) slots.next else slots.previous!!) }
      tuck(thrown, other)
    }
  }

  /** The thrown card goes behind the pile on its side; the other card behind moves to its new side. */
  private fun tuck(thrown: MediaView, other: MediaView?) {
    val thrownFrom = poseOf(thrown)
    val thrownTo = behind(thrown)
    val otherFrom = other?.let { poseOf(it) }
    val otherTo = other?.let { behind(it) }
    blur(thrown, 0)
    play(TUCK_MS, EASE, { t ->
      pose(thrown, thrownFrom.toward(thrownTo, t), 0)
      if (other != null) pose(other, otherFrom!!.toward(otherTo!!, t), 0)
    }) {
      drag = 0f
      arrange()
    }
  }

  // MARK: Layout

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    cards.forEach { it.measure(0, 0) }
    val height = units.px(DeckSizes.PEEK) + cardHeight + units.px(DeckSizes.DOTS_GAP + DeckSizes.DOTS)
    setMeasuredDimension(cardWidth, height)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    for (card in cards) if (card.parent === this) place(card)
  }

  override fun onDraw(canvas: Canvas) {
    val n = count
    if (n < 2) return
    val size = units.pxf(DeckSizes.DOTS)
    val gap = units.pxf(4f)
    val total = n * size + (n - 1) * gap
    var x = (width - total) / 2f
    val cy = height - size / 2f
    for (index in 0 until n) {
      dots.color = if (index == current) theme.foreground else withAlpha(theme.muted, 0.4f)
      canvas.drawCircle(x + size / 2f, cy, size / 2f, dots)
      x += size + gap
    }
  }

  override fun onDetachedFromWindow() {
    finishMotion()
    super.onDetachedFromWindow()
  }

  companion object {
    private const val SPRING_MS = 500L
    // Out to the side about 120 ms, back under the pile 160 ms: quick flicks
    // chain (a touch finishes the last one at once). Agreed with iOS.
    private const val THROW_MIN_MS = 90L
    private const val THROW_MAX_MS = 140L
    private const val TUCK_MS = 160L
  }
}
