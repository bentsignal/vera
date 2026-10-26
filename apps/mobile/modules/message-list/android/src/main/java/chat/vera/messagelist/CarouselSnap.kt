package chat.vera.messagelist

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sign

// Where a stacked carousel comes to rest, worked out from its cards' known
// widths rather than from whichever views happen to be laid out. Pixels
// throughout; offset 0 has the first card at the column.

/** The cards' starts along the strip, and how wide the strip is in all. */
class CarouselGeometry(widths: IntArray, gap: Int) {
  val starts: IntArray = IntArray(widths.size)
  val contentWidth: Int

  init {
    var x = 0
    for (index in widths.indices) {
      starts[index] = x
      x += widths[index] + gap
    }
    contentWidth = if (widths.isEmpty()) 0 else x - gap
  }

  /** The furthest the strip scrolls in a `viewport` this wide: the last card's end at the viewport's end. */
  fun maxOffset(viewport: Int): Int = max(0, contentWidth - viewport)

  /**
   * Where it can rest: each card's start, and the end. A card whose start
   * is past the end rests at the end, so the last card is always reachable
   * and never pulled back off.
   */
  fun restingOffsets(viewport: Int): IntArray {
    val end = maxOffset(viewport)
    val out = ArrayList<Int>(starts.size + 1)
    for (start in starts) {
      val at = min(start, end)
      if (out.isEmpty() || out.last() != at) out.add(at)
    }
    if (out.isEmpty()) out.add(0)
    return out.toIntArray()
  }

  /** The current offset, from a laid-out card's position and where its left edge is now. */
  fun offsetOf(position: Int, leftFromColumn: Int): Int = starts[position] - leftFromColumn

  /** The card to lay out first, and how far its start sits from the column, to show `offset`. */
  fun anchorFor(offset: Int): Pair<Int, Int> {
    var position = 0
    for (index in starts.indices) if (starts[index] <= offset) position = index
    return position to starts.getOrElse(position) { 0 } - offset
  }
}

/** The resting offset nearest `offset`. */
fun nearestRest(rests: IntArray, offset: Int): Int = rests.minByOrNull { abs(it - offset) } ?: 0

/**
 * Where a fling settles: the resting offset nearest to where the platform's
 * own deceleration would have taken it (`projected`), but at least the next
 * one in the fling's direction, so a flick always moves on. At either end
 * it stays at the end.
 */
fun flingRest(rests: IntArray, offset: Int, projected: Int, velocity: Int): Int {
  if (rests.isEmpty()) return 0
  if (velocity == 0) return nearestRest(rests, offset)
  val ahead = rests.filter { if (velocity > 0) it > offset else it < offset }
  if (ahead.isEmpty()) return if (velocity > 0) rests.last() else rests.first()
  return ahead.minByOrNull { abs(it - projected) }!!
}

/**
 * Android's fling curve (OverScroller's spline), both ways: how far a
 * fling at a velocity travels, and the velocity that travels exactly a
 * distance. A carousel flings at that velocity so it decelerates the way
 * every list on the phone does and comes to rest on a card.
 */
class FlingSpline(density: Float, private val friction: Float = DEFAULT_FRICTION) {
  private val physical = GRAVITY * INCHES_PER_METER * density * 160f * 0.84f

  /** Pixels a fling at `velocity` px/s travels before it stops. */
  fun distance(velocity: Float): Float {
    if (velocity == 0f) return 0f
    val l = ln(INFLEXION * abs(velocity) / (friction * physical))
    return (friction * physical * exp(DECELERATION / (DECELERATION - 1) * l)).toFloat() * sign(velocity)
  }

  /** The velocity (px/s) whose fling travels `distance` pixels. */
  fun velocity(distance: Float): Float {
    if (distance == 0f) return 0f
    val l = ln(abs(distance) / (friction * physical)) * (DECELERATION - 1) / DECELERATION
    return (friction * physical / INFLEXION * exp(l)).toFloat() * sign(distance)
  }

  /** As `velocity`, rounded the way RecyclerView takes it. */
  fun velocityPx(distance: Int): Int = velocity(distance.toFloat()).roundToInt()

  companion object {
    /** ViewConfiguration.getScrollFriction(). */
    const val DEFAULT_FRICTION = 0.015f
    private const val GRAVITY = 9.80665f
    private const val INCHES_PER_METER = 39.37f
    private const val INFLEXION = 0.35
    private val DECELERATION = ln(0.78) / ln(0.9)
  }
}
