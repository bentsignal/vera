package chat.vera.messagelist

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.TextPaint
import android.view.View
import android.view.ViewGroup

/**
 * One reaction under a stacked message: a small pill with the emoji and
 * its count, tinted when it includes yours. Tapping toggles it; holding
 * it reports a hold on its reaction.
 */
class ChipView(context: Context, private val units: Units) : View(context) {
  var reaction: Reaction? = null
    private set
  private var theme = Theme.DEFAULT
  private val pill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val emoji = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val count = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.semibold }
  private val rect = RectF()

  init {
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  fun bind(reaction: Reaction, theme: Theme, rowId: String, part: String?, index: Int? = null) {
    val resize = reaction.count != this.reaction?.count || reaction.shown != this.reaction?.shown
    this.reaction = reaction
    this.theme = theme
    emoji.textSize = units.sp(13f)
    count.textSize = units.sp(theme.footnote.size)
    pressTarget = Target("reaction", rowId, part = part, index = index, reactionKey = reaction.key)
    // The part it belongs to (the photo, for an item's chip), so a hold
    // reports that part's frame, with the reaction said separately.
    holdTarget = HoldTarget(rowId, part, index, reactionKey = reaction.key)
    if (resize) requestLayout()
    invalidate()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val r = reaction
    if (r == null) {
      setMeasuredDimension(0, 0)
      return
    }
    val width = units.pxf(8f) * 2 + emoji.measureText(r.shown) + units.pxf(4f) + count.measureText(r.count.toString())
    setMeasuredDimension(Math.ceil(width.toDouble()).toInt(), units.px(26f))
  }

  override fun onDraw(canvas: Canvas) {
    val r = reaction ?: return
    pill.color = if (r.mine) withAlpha(theme.accent, 0.2f) else theme.fill
    rect.set(0f, 0f, width.toFloat(), height.toFloat())
    canvas.drawRoundRect(rect, height / 2f, height / 2f, pill)
    val baselineEmoji = height / 2f - (emoji.descent() + emoji.ascent()) / 2f
    var x = units.pxf(8f)
    canvas.drawText(r.shown, x, baselineEmoji, emoji)
    x += emoji.measureText(r.shown) + units.pxf(4f)
    count.color = if (r.mine) theme.accent else theme.muted
    val baselineCount = height / 2f - (count.descent() + count.ascent()) / 2f
    canvas.drawText(r.count.toString(), x, baselineCount, count)
  }
}

/**
 * A stacked message's reactions: chips in a wrapping row. A reaction that
 * arrives pops in; one taken back shrinks away in the overlay while the
 * rest close up.
 */
class ChipsView(context: Context, private val units: Units) : ViewGroup(context) {
  private val chips = LinkedHashMap<String, ChipView>()
  private val spare = ArrayList<ChipView>()

  init {
    clipChildren = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  val isEmpty: Boolean
    get() = chips.isEmpty()

  fun bind(reactions: List<Reaction>, theme: Theme, rowId: String, part: String?, animate: Boolean, index: Int? = null) {
    val keys = reactions.map { it.key }.toSet()
    // Taken back: out of the row, shrinking away where it was.
    val gone = chips.keys.filter { it !in keys }
    for (key in gone) {
      val chip = chips.remove(key) ?: continue
      if (animate && isAttachedToWindow && chip.width > 0) {
        val left = chip.left
        val top = chip.top
        removeView(chip)
        overlay.add(chip)
        chip.layout(left, top, left + chip.measuredWidth, top + chip.measuredHeight)
        chip.animate().scaleX(0f).scaleY(0f).alpha(0f).setDuration(140).withEndAction {
          overlay.remove(chip)
          chip.scaleX = 1f
          chip.scaleY = 1f
          chip.alpha = 1f
          spare.add(chip)
        }.start()
      } else {
        removeView(chip)
        spare.add(chip)
      }
    }
    var order = 0
    for (reaction in reactions) {
      var chip = chips[reaction.key]
      val added = chip == null
      if (chip == null) {
        chip = spare.removeLastOrNull() ?: ChipView(context, units)
        chip.animate().cancel()
        chip.scaleX = 1f
        chip.scaleY = 1f
        chip.alpha = 1f
        chips[reaction.key] = chip
        addView(chip, order)
      }
      chip.bind(reaction, theme, rowId, part, index)
      if (added && animate) popIn(chip)
      order++
    }
    requestLayout()
  }

  private fun popIn(chip: ChipView) {
    // 0 → 1.06 → 1, about as long as a press's feedback.
    chip.scaleX = 0f
    chip.scaleY = 0f
    chip.animate().scaleX(1.06f).scaleY(1.06f).setDuration(168).setInterpolator(EASE_OUT).withEndAction {
      chip.animate().scaleX(1f).scaleY(1f).setDuration(112).setInterpolator(EASE).start()
    }.start()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val maxWidth = MeasureSpec.getSize(widthMeasureSpec).let { if (it == 0) Int.MAX_VALUE else it }
    if (childCount == 0) {
      setMeasuredDimension(0, 0)
      return
    }
    val gap = units.px(4f)
    val top = units.px(4f)
    var x = 0
    var y = top
    var lineHeight = 0
    var widest = 0
    for (index in 0 until childCount) {
      val chip = getChildAt(index)
      chip.measure(0, 0)
      if (x > 0 && x + chip.measuredWidth > maxWidth) {
        x = 0
        y += lineHeight + gap
        lineHeight = 0
      }
      x += chip.measuredWidth + gap
      widest = maxOf(widest, x - gap)
      lineHeight = maxOf(lineHeight, chip.measuredHeight)
    }
    setMeasuredDimension(widest, y + lineHeight)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val maxWidth = r - l
    val gap = units.px(4f)
    var x = 0
    var y = units.px(4f)
    var lineHeight = 0
    for (index in 0 until childCount) {
      val chip = getChildAt(index)
      if (x > 0 && x + chip.measuredWidth > maxOf(maxWidth, measuredWidth)) {
        x = 0
        y += lineHeight + gap
        lineHeight = 0
      }
      chip.layout(x, y, x + chip.measuredWidth, y + chip.measuredHeight)
      chip.pivotX = chip.measuredWidth / 2f
      chip.pivotY = chip.measuredHeight / 2f
      x += chip.measuredWidth + gap
      lineHeight = maxOf(lineHeight, chip.measuredHeight)
    }
  }
}
