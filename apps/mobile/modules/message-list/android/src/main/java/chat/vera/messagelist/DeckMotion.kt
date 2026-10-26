package chat.vera.messagelist

import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

// The bubbles deck as a pile of photos: which photo each card shows, and
// how the cards move. Kept apart from the view so it can be tested.

/** The photos the pile shows: the front one, the one after it and the one before (none with two photos). */
data class DeckSlots(val front: Int, val next: Int, val previous: Int?)

fun deckSlots(current: Int, count: Int): DeckSlots =
  DeckSlots(
    front = current,
    next = (current + 1) % count,
    previous = if (count > 2) (current - 1 + count) % count else null,
  )

/** The photo in front after one is thrown: left brings the next, right the one before. */
fun deckAfterThrow(current: Int, count: Int, toNext: Boolean): Int =
  if (toNext) (current + 1) % count else (current - 1 + count) % count

/**
 * How a card behind the front one sits: tilted toward its side, nudged
 * out and up so a corner shows, and a little smaller. `side` is +1 for
 * the right (the next photo), -1 for the left (the one before).
 */
data class CardPose(val x: Float, val y: Float, val rotation: Float, val scale: Float) {
  fun toward(other: CardPose, t: Float) =
    CardPose(
      x + (other.x - x) * t,
      y + (other.y - y) * t,
      rotation + (other.rotation - rotation) * t,
      scale + (other.scale - scale) * t,
    )

  companion object {
    val FRONT = CardPose(0f, 0f, 0f, 1f)

    /** Behind, on `side`, in pixels from `density`. */
    fun behind(side: Int, density: Float) =
      CardPose(side * DeckSizes.REAR_SHIFT * density, -DeckSizes.REAR_LIFT * density, side * DeckSizes.REAR_ANGLE, DeckSizes.REAR_SCALE)
  }
}

/**
 * The blur on a card coming forward, in four steps rather than every
 * frame: a `RenderEffect` that changes redraws the card's blur, so this
 * keeps it to at most four times a swipe on a slower phone.
 */
fun blurStep(progress: Float): Int = (progress.coerceIn(0f, 1f) * (DeckSizes.BLUR_STEPS.size - 1)).toInt()

/**
 * A spring from 1 back to 0 after `seconds`, starting with `velocity`
 * (fractions of the distance a second, positive away from rest): slightly
 * underdamped, so a card let go mid-drag settles back with the finger's
 * momentum and one small give, rather than on a fixed curve.
 */
fun springBack(seconds: Float, velocity: Float): Float {
  val omega = 18.0
  val zeta = 0.82
  val damped = omega * sqrt(1 - zeta * zeta)
  val t = seconds.toDouble()
  val decay = exp(-zeta * omega * t)
  return (decay * (cos(damped * t) + (velocity + zeta * omega) / damped * sin(damped * t))).toFloat()
}
