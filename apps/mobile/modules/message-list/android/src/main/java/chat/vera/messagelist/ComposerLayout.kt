package chat.vera.messagelist

/** Authority travels with the FIFO rows result, never with the latest mutable props. */
internal data class ComposerBinding(val owner: String, val release: Long, val gap: Float)
internal data class ComposerSample(val lifetime: Long, val sequence: Long, val height: Float)
internal data class ComposerClose(val generation: Long, val owner: String, val release: Long, val token: Long)
internal data class ComposerApply(val generation: Long, val hostGeneration: Long, val binding: ComposerBinding, val inset: Inset)

internal enum class ComposerChange { NONE, GEOMETRY, BARRIER }

/** Mount ordering and send ordering are separate. This class owns no views or timers. */
internal class ComposerLayout {
  var binding: ComposerBinding? = null
    private set
  var generation = 0L
    private set
  var appliedRelease = 0L
    private set
  var sealed = false
    private set
  var sample: ComposerSample? = null
    private set
  private var activeClose: ComposerClose? = null
  private var hostGeneration = 0L
  private var hadHost = false
  private var invalidHost = false

  fun bind(next: ComposerBinding?): ComposerChange {
    if (next == binding) return ComposerChange.NONE
    val before = binding
    val barrier = next?.owner != before?.owner || next?.release != before?.release
    if (next?.owner != before?.owner || (next != null && before != null && next.release < before.release)) {
      generation++
      // A new owner has its own local sequence. Same-owner regression cannot
      // reset the release already applied by this native lifetime.
      if (next?.owner != before?.owner) appliedRelease = 0L
      sample = null
      hadHost = false
      invalidHost = false
    }
    binding = next
    sealed = false
    return if (barrier) ComposerChange.BARRIER else ComposerChange.GEOMETRY
  }

  fun invalidate() { sealed = false }

  /** Called only after every mutation in the Fabric mount batch has executed. */
  fun seal(next: ComposerSample?) {
    val previous = sample
    val valid = next?.takeIf { it.sequence >= appliedRelease && it.height.isFinite() && it.height >= 0f }
    val replaced = previous != null && valid != null &&
      (previous.lifetime != valid.lifetime || valid.sequence < previous.sequence)
    if (replaced || (valid == null && hadHost && !invalidHost) || (valid != null && invalidHost)) {
      hostGeneration++
    }
    sample = valid
    if (valid != null) hadHost = true
    invalidHost = valid == null
    sealed = true
  }

  fun capture(inset: Inset): ComposerApply? = binding?.let { ComposerApply(generation, hostGeneration, it, inset) }

  /** A pending newer host holds ordinary geometry even before list props catch up. */
  fun waiting(): Boolean = binding != null &&
    (!sealed || binding!!.release > appliedRelease || (sample?.sequence ?: appliedRelease) > appliedRelease)

  fun ordinary(frozen: Boolean, landing: Boolean): Inset? {
    val current = binding ?: return null
    if (!sealed || frozen || landing || waiting()) return null
    val mounted = sample ?: return null
    if (mounted.sequence != appliedRelease) return null
    return Inset(0f, mounted.height + current.gap)
  }

  fun canApply(result: ComposerApply?, frozen: Boolean = false): Boolean {
    if (!sealed) return false
    if (result == null || result.generation != generation) return true
    if (frozen && result.binding.release > appliedRelease) return false
    return sample?.sequence?.let { it >= result.binding.release } ?: true
  }

  fun close(token: Long): ComposerClose? = binding?.let { ComposerClose(generation, it.owner, it.release, token) }.also { activeClose = it }

  fun cancelClose() { activeClose = null }

  fun accepts(close: ComposerClose): Boolean = activeClose == close && close.generation == generation && close.owner == binding?.owner

  /** A newer UNRELEASED mounted host is deliberately not a close barrier. */
  fun closeWaiting(close: ComposerClose): Boolean = accepts(close) && close.release > appliedRelease

  fun closeFlush(result: ComposerApply?, close: ComposerClose?): Boolean {
    if (result == null || close == null || !sealed || !accepts(close)) return false
    return result.generation == close.generation && result.binding.owner == close.owner &&
      result.binding.release > appliedRelease && result.binding.release <= close.release && canApply(result)
  }

  /** Null means this old binding may apply rows, but may not change current geometry. */
  fun inset(result: ComposerApply): Inset? {
    if (!sealed || result.generation != generation || result.binding.owner != binding?.owner) return null
    val mounted = sample
    return if (mounted != null && result.hostGeneration == hostGeneration && mounted.sequence == result.binding.release) {
      result.inset.copy(bottom = mounted.height + result.binding.gap)
    } else result.inset // Missing host, or newer T: finish S without borrowing T.
  }

  fun applied(result: ComposerApply) {
    if (result.generation == generation && result.binding.owner == binding?.owner) {
      appliedRelease = maxOf(appliedRelease, result.binding.release)
    }
  }

  fun detach() {
    activeClose = null
    generation++
    sample = null
    sealed = false
    hadHost = false
    invalidHost = false
  }
}
