package chat.vera.messagelist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Rect
import android.graphics.Canvas
import android.os.Build
import android.graphics.drawable.GradientDrawable
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.PathInterpolator
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.views.modal.ReactModalHostView
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

data class LiftRequest(val rowId: String, val part: String?, val index: Int?, val shift: Float, val scale: Float, val origin: String)
data class LiftPieces(val frame: Rect, val views: List<View>, val card: Int?)

/** A screen transition may still own this native child after a viewer closes. */
internal fun removeForLift(home: ViewGroup, view: View) {
  view.clearAnimation()
  home.endViewTransition(view)
  home.removeView(view)
}

internal fun nestedLiftHolders(view: View, cell: View): List<RecyclerView.ViewHolder> {
  val holders = mutableListOf<RecyclerView.ViewHolder>()
  var ancestor = view.parent
  while (ancestor is View && ancestor !== cell) {
    if (ancestor is RecyclerView) {
      ancestor.stopScroll()
      ancestor.findContainingViewHolder(view)?.let { holders.add(it) }
    }
    ancestor = ancestor.parent
  }
  return holders
}

fun decodeLift(map: ReadableMap?): LiftRequest? {
  val id = map?.str("rowId") ?: return null
  fun number(key: String) = map.num(key)?.takeIf { it.isFinite() }?.toFloat()?.takeIf { it.isFinite() }
  return LiftRequest(id, map.str("part"), number("index")?.toInt(),
    number("shift") ?: 0f, (number("scale") ?: 1f).coerceAtLeast(0.01f), map.str("origin") ?: "start")
}

/** The real part moves above the menu's Dialog, then goes back to its parent. No bitmap or copy. */
class Lifter(private val units: Units, private val activityRoot: () -> ViewGroup?) {
  // Android's window overlay clips each child's RenderNode to its bounds.
  // Keep the plain-text card and the tapbacks inside those drawing bounds.
  private val margin = units.px(40f)
  private data class Piece(val view: View, val home: ViewGroup, val index: Int, val params: ViewGroup.LayoutParams,
    val frame: Rect, val x: Float, val y: Float)
  private data class Lifted(val request: LiftRequest, val holder: RowHolder, val cell: MessageCell,
    val pieces: LiftPieces, val moved: List<Piece>, val pinned: List<RecyclerView.ViewHolder>,
    val container: ViewGroup, var host: ViewGroup, val screen: IntArray, val card: View?)
  private var lifted: Lifted? = null
  private var animation: ValueAnimator? = null
  private var frame: Choreographer.FrameCallback? = null
  private var restore: Pair<ViewGroup, ViewTreeObserver.OnPreDrawListener>? = null
  private var handedBack = false
  private var closing = false
  private val completions = mutableListOf<() -> Unit>()

  fun lift(request: LiftRequest, holder: RowHolder, pressedScale: Float? = null) {
    if (lifted?.request == request) return
    finish()
    val cell = holder.itemView as? MessageCell ?: return
    val pieces = cell.liftPieces(request.part, request.index) ?: return
    val root = activityRoot() ?: return
    val host = modalRoot(root)
    val screen = IntArray(2).also { cell.getLocationOnScreen(it) }
    screen[0] += pieces.frame.left
    screen[1] += pieces.frame.top
    val container = object : ViewGroup(cell.context) {
      override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {}
    }.apply {
      clipChildren = false
      clipToPadding = false
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
      pivotX = margin + when (request.origin) { "end" -> pieces.frame.width().toFloat(); "middle" -> pieces.frame.width() / 2f; else -> 0f }
      pivotY = margin.toFloat()
    }
    val card = pieces.card?.let { color ->
      View(cell.context).apply {
        background = GradientDrawable().apply { setColor(color); cornerRadius = units.pxf(16f) }
        alpha = 0f
        container.addView(this)
        layout(margin - units.px(10f), margin - units.px(8f), margin + pieces.frame.width() + units.px(10f), margin + pieces.frame.height() + units.px(8f))
      }
    }
    val moved = pieces.views.mapNotNull { view ->
      val home = view.parent as? ViewGroup ?: return@mapNotNull null
      Piece(view, home, home.indexOfChild(view), view.layoutParams, Rect(view.left, view.top, view.right, view.bottom), view.translationX, view.translationY)
    }
    val pressed = pressedScale ?: pieces.views.firstOrNull()?.scaleX ?: 1f
    cell.beginLift()
    holder.setIsRecyclable(false)
    // A media tile belongs to a second RecyclerView inside the message row.
    // Pin that holder too so its empty card cannot be reused before landing.
    val pinned = moved.flatMap { nestedLiftHolders(it.view, cell) }.distinct()
    pinned.forEach { it.setIsRecyclable(false) }
    for (piece in moved) {
      val view = piece.view
      val position = IntArray(2).also { piece.home.getLocationOnScreen(it) }
      position[0] += piece.frame.left + piece.x.toInt() - piece.home.scrollX
      position[1] += piece.frame.top + piece.y.toInt() - piece.home.scrollY
      view.animate().cancel()
      view.scaleX = 1f
      view.scaleY = 1f
      view.translationX = 0f
      view.translationY = 0f
      removeForLift(piece.home, view)
      container.addView(view)
      val x = position[0] - screen[0] + margin
      val y = position[1] - screen[1] + margin
      view.layout(x, y, x + piece.frame.width(), y + piece.frame.height())
    }
    host.overlay.add(container)
    val current = Lifted(request, holder, cell, pieces, moved, pinned, container, host, screen, card)
    lifted = current
    place(current)
    container.scaleX = pressed
    container.scaleY = pressed
    // JS uses damping 19, mass 0.9, stiffness 230. Evaluate the same spring on each UI frame.
    animate(700, { spring(it * 0.7f) }) { progress ->
      container.scaleX = pressed + (request.scale - pressed) * progress
      container.scaleY = container.scaleX
      container.translationY = units.pxf(request.shift) * progress
      card?.alpha = progress.coerceIn(0f, 1f)
    }
    watchHost(current)
  }

  private fun place(current: Lifted) {
    val origin = IntArray(2).also { current.host.getLocationOnScreen(it) }
    val x = current.screen[0] - origin[0] - margin
    val y = current.screen[1] - origin[1] - margin
    current.container.layout(x, y, x + current.pieces.frame.width() + margin * 2, y + current.pieces.frame.height() + margin * 2)
  }

  /** RN Modal has its own window. Its public host exposes the Dialog on every supported Android version. */
  private fun modalRoot(root: ViewGroup): ViewGroup {
    fun find(view: View): ViewGroup? {
      if (view is ReactModalHostView && view.dialog?.isShowing == true) {
        return (view.dialog?.window?.decorView as? ViewGroup)?.let { find(it) ?: it }
      }
      if (view is ViewGroup) for (i in view.childCount - 1 downTo 0) find(view.getChildAt(i))?.let { return it }
      return null
    }
    return find(root) ?: root
  }

  private fun watchHost(current: Lifted) {
    val callback = object : Choreographer.FrameCallback {
      override fun doFrame(time: Long) {
        if (lifted !== current) return
        val host = activityRoot()?.let(::modalRoot)
        if (host != null && host !== current.host) {
          current.host.overlay.remove(current.container)
          current.host = host
          host.overlay.add(current.container)
          place(current)
        }
        Choreographer.getInstance().postFrameCallback(this)
      }
    }
    frame = callback
    Choreographer.getInstance().postFrameCallback(callback)
  }

  fun land(onComplete: (() -> Unit)? = null) {
    onComplete?.let { completions.add(it) }
    val current = lifted ?: run { finish(); return }
    if (closing) return
    closing = true
    val view = current.container
    val fromScale = view.scaleX
    val fromY = view.translationY
    val fromCard = current.card?.alpha ?: 0f
    val destination = IntArray(2).also { current.cell.getLocationOnScreen(it) }
    val dx = destination[0] + current.pieces.frame.left - current.screen[0]
    val dy = destination[1] + current.pieces.frame.top - current.screen[1]
    val easing = PathInterpolator(0.215f, 0.61f, 0.355f, 1f)
    animate(240, { easing.getInterpolation(it) }, onEnd = { restoreOnDraw() }) { progress ->
      view.scaleX = fromScale + (1f - fromScale) * progress
      view.scaleY = view.scaleX
      view.translationX = dx * progress
      view.translationY = fromY + (dy - fromY) * progress
      current.card?.alpha = fromCard * (1f - progress)
      if (!current.cell.isAttachedToWindow) view.alpha = 1f - progress
    }
  }

  /** The Dialog can draw before the activity. Return the real part only
   * when the conversation is about to draw it, never into a cached hole. */
  private fun restoreOnDraw() {
    val root = activityRoot()
    if (root == null || !root.isAttachedToWindow) { finish(); return }
    val current = lifted ?: return
    val listener = object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        root.viewTreeObserver.removeOnPreDrawListener(this)
        restore = null
        if (lifted !== current) return true
        // The two windows submit independent buffers. Keep a landing-only
        // drawing at the identical resting frame until the source buffer
        // commits. It draws the same native views, without a bitmap or a
        // second message view, and never moves independently of them.
        val frames = current.moved.map { piece -> piece to Rect(piece.view.left, piece.view.top, piece.view.right, piece.view.bottom) }
        val cover = object : View(current.cell.context) {
          override fun onDraw(canvas: Canvas) {
            for ((index, entry) in frames.withIndex()) {
              val (piece, bounds) = entry
              val saved = canvas.save()
              canvas.translate(bounds.left.toFloat(), bounds.top.toFloat())
              canvas.clipRect(0, 0, bounds.width(), bounds.height())
              if (index == 0) canvas.drawColor(current.cell.landingBackground)
              if (piece.view.clipToOutline) {
                val outline = android.graphics.Outline()
                piece.view.outlineProvider?.getOutline(piece.view, outline)
                val rect = Rect()
                if (outline.getRect(rect)) {
                  val path = android.graphics.Path()
                  path.addRoundRect(android.graphics.RectF(rect), outline.radius, outline.radius, android.graphics.Path.Direction.CW)
                  canvas.clipPath(path)
                }
              }
              val layer = canvas.saveLayerAlpha(0f, 0f, bounds.width().toFloat(), bounds.height().toFloat(), (piece.view.alpha * 255).toInt())
              piece.view.draw(canvas)
              canvas.restoreToCount(layer)
              canvas.restoreToCount(saved)
            }
          }
        }
        current.container.addView(cover)
        cover.layout(0, 0, current.container.width, current.container.height)
        returnPieces(current)
        handedBack = true
        val complete = Runnable { if (lifted === current) finish() }
        if (Build.VERSION.SDK_INT >= 29 && root.isHardwareAccelerated) {
          root.viewTreeObserver.registerFrameCommitCallback {
            root.post {
              if (lifted === current) {
                root.viewTreeObserver.registerFrameCommitCallback { root.post(complete) }
                root.invalidate()
              }
            }
          }
        } else {
          root.postOnAnimation { root.postOnAnimation(complete) }
        }
        root.invalidate()
        return true
      }
    }
    restore = root to listener
    root.viewTreeObserver.addOnPreDrawListener(listener)
    root.postInvalidateOnAnimation()
  }

  fun finish() {
    restore?.let { (root, listener) ->
      if (root.viewTreeObserver.isAlive) root.viewTreeObserver.removeOnPreDrawListener(listener)
    }
    restore = null
    animation?.removeAllListeners()
    animation?.cancel()
    animation = null
    frame?.let { Choreographer.getInstance().removeFrameCallback(it) }
    frame = null
    val current = lifted ?: run { completeLanding(); return }
    lifted = null
    if (!handedBack) returnPieces(current)
    handedBack = false
    current.host.overlay.remove(current.container)
    current.cell.endLift()
    current.cell.invalidate()
    current.holder.setIsRecyclable(true)
    current.pinned.forEach { it.setIsRecyclable(true) }
    completeLanding()
  }

  private fun completeLanding() {
    closing = false
    val ready = completions.toList()
    completions.clear()
    ready.forEach { it() }
  }

  private fun returnPieces(current: Lifted) {
    for (piece in current.moved.sortedBy { it.index }) {
      current.container.removeView(piece.view)
      piece.home.addView(piece.view, piece.index.coerceAtMost(piece.home.childCount), piece.params)
      piece.view.layout(piece.frame.left, piece.frame.top, piece.frame.right, piece.frame.bottom)
      piece.view.translationX = piece.x
      piece.view.translationY = piece.y
      piece.home.invalidate()
    }
    current.cell.invalidate()
  }

  private fun animate(ms: Long, easing: (Float) -> Float, onEnd: (() -> Unit)? = null, update: (Float) -> Unit) {
    animation?.removeAllListeners()
    animation?.cancel()
    animation = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = ms
      interpolator = android.view.animation.LinearInterpolator()
      addUpdateListener { update(easing(it.animatedValue as Float)) }
      onEnd?.let { addListener(object : AnimatorListenerAdapter() { override fun onAnimationEnd(animation: Animator) { it() } }) }
      start()
    }
  }

  private fun spring(seconds: Float): Float {
    val decay = 19.0 / (2 * 0.9)
    val frequency = sqrt(230 / 0.9 - decay * decay)
    return (1 - exp(-decay * seconds) * (cos(frequency * seconds) + decay / frequency * sin(frequency * seconds))).toFloat()
  }
}
