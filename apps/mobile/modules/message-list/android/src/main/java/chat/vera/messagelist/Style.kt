package chat.vera.messagelist

import android.content.Context
import android.graphics.Color
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import android.text.style.UnderlineSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.animation.PathInterpolator
import android.widget.TextView
import androidx.core.widget.TextViewCompat

// Units, type, and shapes shared by the cells. The contract's sizes are
// points (dp); text sizes scale with the system font size, as React
// Native's do.

/** The list's easing: CSS `ease`, as the React Native list's moves use. */
val EASE = PathInterpolator(0.25f, 0.1f, 0.25f, 1f)
val EASE_OUT = PathInterpolator(0.33f, 1f, 0.68f, 1f)

class Units(context: Context) {
  val density = context.resources.displayMetrics.density
  val fontScale = context.resources.configuration.fontScale

  fun px(dp: Float): Int = Math.round(dp * density)

  fun pxf(dp: Float): Float = dp * density

  fun dp(px: Float): Float = px / density

  /** A text size or line height, in pixels, scaled with the font size. */
  fun sp(points: Float): Float = points * density * fontScale
}

object Fonts {
  val regular: Typeface = Typeface.DEFAULT
  val semibold: Typeface = weight(600)
  val bold: Typeface = weight(700)

  private fun weight(weight: Int): Typeface =
    if (Build.VERSION.SDK_INT >= 28) Typeface.create(Typeface.DEFAULT, weight, false)
    else Typeface.DEFAULT_BOLD
}

/** A bold weight that doesn't change the size, so it can sit in one span. */
class WeightSpan(private val typeface: Typeface) : MetricAffectingSpan() {
  override fun updateDrawState(paint: TextPaint) {
    paint.typeface = typeface
  }

  override fun updateMeasureState(paint: TextPaint) {
    paint.typeface = typeface
  }
}

/** What a tap on a range of text reports: a link or a mention. */
class TargetSpan(val target: Target) : android.text.style.CharacterStyle() {
  override fun updateDrawState(paint: TextPaint) = Unit
}

private data class AppliedStyle(val style: TextStyle, val color: Int, val typeface: Typeface)

fun TextView.style(units: Units, style: TextStyle, color: Int, typeface: Typeface = Fonts.regular) {
  // Rebinding a row styles its text the same way again: skip it then.
  val applied = AppliedStyle(style, color, typeface)
  if (getTag(R.id.message_list_style) == applied) return
  setTag(R.id.message_list_style, applied)
  setTextSize(TypedValue.COMPLEX_UNIT_PX, units.sp(style.size))
  if (this is ListText) lineHeightPx = Math.round(units.sp(style.lineHeight))
  else TextViewCompat.setLineHeight(this, Math.round(units.sp(style.lineHeight)))
  setTextColor(color)
  this.typeface = typeface
  includeFontPadding = false
}

/**
 * Each line exactly `height` tall, the text centered in it, as React
 * Native draws `lineHeight` on Android (its `CustomLineHeightSpan`): one
 * line of 17/22 text is 22 tall, not the font's own height.
 */
class ExactLineHeight(private val height: Int) : android.text.style.LineHeightSpan {
  override fun chooseHeight(text: CharSequence, start: Int, end: Int, spanstartv: Int, lineHeight: Int, fm: android.graphics.Paint.FontMetricsInt) {
    val leading = height - (fm.descent - fm.ascent)
    fm.ascent -= Math.ceil(leading / 2.0).toInt()
    fm.descent += Math.floor(leading / 2.0).toInt()
    fm.top = fm.ascent
    fm.bottom = fm.descent
  }
}

/** The list's text views: their text set with the style's exact line height. */
@android.annotation.SuppressLint("AppCompatCustomView")
open class ListText(context: Context) : TextView(context) {
  /** Pixels a line, or 0 for the font's own. */
  var lineHeightPx = 0
    set(value) {
      if (field == value) return
      field = value
      text = text
    }

  override fun setText(text: CharSequence?, type: BufferType?) {
    if (lineHeightPx <= 0 || text.isNullOrEmpty()) {
      super.setText(text, type)
      return
    }
    val spanned = android.text.SpannableString(text)
    for (old in spanned.getSpans(0, spanned.length, ExactLineHeight::class.java)) spanned.removeSpan(old)
    spanned.setSpan(ExactLineHeight(lineHeightPx), 0, spanned.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    super.setText(spanned, type)
  }
}

fun plainText(context: Context): TextView =
  ListText(context).apply {
    includeFontPadding = false
    isClickable = false
    isFocusable = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    gravity = Gravity.START
  }

/**
 * Links inherit the row's text color and are underlined. Mentions use the
 * accent color, or the bubble's onAccent color on your own. Other spans
 * supply bold, italic, and code. Links and mentions carry their tap targets.
 */
fun styledText(
  spans: List<Span>,
  theme: Theme,
  onAccent: Boolean,
  rowId: String,
  part: String?,
): CharSequence {
  val out = SpannableStringBuilder()
  for (span in spans) {
    val start = out.length
    out.append(span.text)
    val end = out.length
    if (end == start) continue
    fun set(what: Any) = out.setSpan(what, start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    when (span.style) {
      "bold" -> set(WeightSpan(Fonts.bold))
      "italic" -> set(StyleSpan(Typeface.ITALIC))
      "code" -> set(TypefaceSpan("monospace"))
      "link" -> {
        if (onAccent) set(ForegroundColorSpan(theme.onAccent))
        set(UnderlineSpan())
        set(TargetSpan(Target("link", rowId, part = part, url = span.url ?: span.text)))
      }
      "mention" -> {
        set(ForegroundColorSpan(if (onAccent) theme.onAccent else theme.accent))
        set(WeightSpan(Fonts.semibold))
        set(TargetSpan(Target("mention", rowId, part = part, accountId = span.accountId)))
      }
    }
  }
  return out
}

/** A notice's spans: plain, with bold names. */
fun noticeText(spans: List<Span>): CharSequence {
  val out = SpannableStringBuilder()
  for (span in spans) {
    val start = out.length
    out.append(span.text)
    if (span.style == "bold" || span.style == "mention") {
      out.setSpan(WeightSpan(Fonts.semibold), start, out.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
  }
  return out
}

fun withAlpha(color: Int, alpha: Float): Int =
  Color.argb((Color.alpha(color) * alpha).toInt(), Color.red(color), Color.green(color), Color.blue(color))

/**
 * iMessage's bubble: a rounded rectangle, and on the last of a run its
 * tail hanging `TAIL_DROP` below the bottom corner (right for yours, left
 * for theirs). The tail's points are the React Native list's
 * (bubble-shape.tsx), fitted to a trace of iMessage's, in points.
 */
object BubbleShape {
  const val TAIL_DROP = 7f
  private const val TAIL_WIDTH = 22f

  fun path(out: Path, width: Float, height: Float, radius: Float, tail: Boolean, isOwn: Boolean, density: Float) {
    out.reset()
    val r = minOf(radius * density, height / 2f, width / 2f)
    out.addRoundRect(RectF(0f, 0f, width, height), r, r, Path.Direction.CW)
    if (!tail) return
    val tailPath = Path()
    // In the tail's own box: 22 wide, from 20 above the bottom to the tip.
    tailPath.moveTo(TAIL_WIDTH, 0f)
    tailPath.cubicTo(TAIL_WIDTH, 12.35f, 11.48f, 15.7f, 11.48f, 19.93f)
    tailPath.cubicTo(11.48f, 22.54f, 12.49f, 23.61f, 13.58f, 25.21f)
    // The round tip (an arc of radius 1.03), as a curve.
    tailPath.cubicTo(13.98f, 25.8f, 13.4f, 27.1f, 12.33f, 26.73f)
    tailPath.cubicTo(4.58f, 23.49f, 2.61f, 20f, 0.11f, 20f)
    tailPath.lineTo(0f, 20f)
    tailPath.lineTo(0f, 0f)
    tailPath.close()
    val matrix = android.graphics.Matrix()
    matrix.setScale(density, density)
    if (isOwn) {
      matrix.postTranslate(width - TAIL_WIDTH * density, height - 20f * density)
    } else {
      matrix.postScale(-1f, 1f)
      matrix.postTranslate(TAIL_WIDTH * density, height - 20f * density)
    }
    tailPath.transform(matrix)
    out.op(tailPath, Path.Op.UNION)
  }
}
