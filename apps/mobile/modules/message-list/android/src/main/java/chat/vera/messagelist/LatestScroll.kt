package chat.vera.messagelist

/**
 * A generic go-to-latest intent, not a send acknowledgement. It survives
 * reaching the old bottom while new rows are still being decoded. Only
 * reader interaction, navigation or a newer command ends/replaces it.
 */
internal class LatestScroll {
  var active = false
    private set
  private var frozen = false
  private var floor = 0L
  private var generation = 0L

  fun request(submittedRows: Long) {
    active = true
    floor = submittedRows
    generation++
  }

  fun cancel() {
    active = false
    generation++
  }

  fun freeze(value: Boolean) {
    frozen = value
    generation++
  }

  /** Older FIFO diffs still apply, but cannot restart this request. */
  fun tracks(rowsVersion: Long) = active && rowsVersion >= floor

  fun follows(rowsVersion: Long) = tracks(rowsVersion) && !frozen

  /** A later layout, freeze or command makes an already posted start stale. */
  fun ticket(): Long = ++generation

  fun accepts(ticket: Long) = active && !frozen && ticket == generation
}
