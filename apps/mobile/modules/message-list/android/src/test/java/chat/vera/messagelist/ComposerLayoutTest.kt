package chat.vera.messagelist

import org.junit.Assert.*
import org.junit.Test

class ComposerLayoutTest {
  private val tall = Inset(12f, 120f)
  private val short = Inset(12f, 48f)
  private fun binding(release: Long = 0, owner: String = "chat") = ComposerBinding(owner, release, 8f)
  private fun host(sequence: Long = 0, height: Float = 40f, lifetime: Long = 1) = ComposerSample(lifetime, sequence, height)
  private fun layout(release: Long = 0) = ComposerLayout().apply { bind(binding(release)); seal(host(release)) }

  @Test fun evenInitialAndEmptyResultsWaitForTheCompleteMountSeal() {
    val layout = ComposerLayout()
    layout.bind(binding())
    val initial = layout.capture(short)!!
    assertFalse(layout.canApply(initial))
    assertNull(layout.inset(initial))
    layout.seal(host(height = 46.095f))
    assertTrue(layout.canApply(initial))
    assertEquals(54.095f, layout.inset(initial)!!.bottom, .001f)
    assertEquals(12f, layout.inset(initial)!!.top, 0f)
  }

  @Test fun ordinaryGrowthUsesActualHeightAndExplicitGapExactlyOnce() {
    val layout = layout()
    assertEquals(48f, layout.ordinary(false, false)!!.bottom, 0f)
    layout.invalidate()
    assertNull(layout.ordinary(false, false))
    layout.seal(host(height = 86.476f))
    assertEquals(94.476f, layout.ordinary(false, false)!!.bottom, .001f)
  }

  @Test fun mountedClearHoldsBeforeListReleasePropsArrive() {
    val layout = layout()
    layout.seal(host(1, 40f))
    assertTrue(layout.waiting())
    assertNull(layout.ordinary(false, false))
    layout.bind(binding(1))
    val release = layout.capture(short)!!
    layout.seal(host(1, 40f))
    assertEquals(short, layout.inset(release))
    layout.applied(release)
    assertFalse(layout.waiting())
  }

  @Test fun releaseCannotUseOldHeightWhenMatchingHostHasNotMounted() {
    val layout = layout()
    layout.bind(binding(1))
    val release = layout.capture(short)!!
    layout.seal(host(0, 112f))
    assertFalse(layout.canApply(release))
    layout.seal(host(1))
    assertTrue(layout.canApply(release))
  }

  @Test fun rapidSThenTFinishesSWithCapturedInsetWithoutUsingOrUnholdingT() {
    val layout = layout()
    layout.bind(binding(1))
    val s = layout.capture(short)!!
    layout.seal(host(1))
    layout.bind(binding(2))
    val t = layout.capture(tall)!!
    layout.seal(host(2, 152f))
    assertTrue(layout.canApply(s))
    assertEquals(short, layout.inset(s))
    layout.applied(s)
    assertEquals(1L, layout.appliedRelease)
    assertTrue(layout.waiting())
    assertNull(layout.ordinary(false, false))
    assertEquals(Inset(12f, 160f), layout.inset(t))
    layout.applied(t)
    assertEquals(2L, layout.appliedRelease)
    assertFalse(layout.waiting())
  }

  @Test fun acknowledgedScalarDoesNotLockOutANewDraftWithinTheSameSequence() {
    val layout = layout()
    layout.bind(binding(1))
    val release = layout.capture(short)!!
    layout.seal(host(1, 112f))
    assertEquals(tall, layout.inset(release))
    layout.applied(release)
    assertEquals(120f, layout.ordinary(false, false)!!.bottom, 0f)
  }

  @Test fun sameHeightAndCancellationUseAnExplicitResultEvenWithUnchangedRows() {
    val layout = layout()
    layout.seal(host(1))
    layout.bind(binding(1))
    val cancel = layout.capture(short)!!
    layout.seal(host(1))
    assertTrue(layout.waiting())
    layout.applied(cancel)
    assertFalse(layout.waiting())
    assertEquals(1L, layout.appliedRelease)
  }

  @Test fun freezeAndLandingBufferOrdinaryObservations() {
    val layout = layout()
    layout.seal(host(height = 112f))
    assertNull(layout.ordinary(true, false))
    assertNull(layout.ordinary(false, true))
    assertEquals(120f, layout.ordinary(false, false)!!.bottom, 0f)
  }

  @Test fun missingOrAmbiguousHostAfterCompleteMountUsesCapturedLegacyRelease() {
    val layout = layout()
    layout.bind(binding(1))
    val release = layout.capture(short)!!
    layout.seal(null)
    assertTrue(layout.canApply(release))
    assertEquals(short, layout.inset(release))
    layout.applied(release)
    assertFalse(layout.waiting())
    assertNull(layout.ordinary(false, false))
  }

  @Test fun rebindNeverLetsOldResultsBorrowTheNewHostsGeometry() {
    val layout = layout()
    layout.bind(binding(1))
    val release = layout.capture(short)!!
    layout.seal(null)
    layout.seal(host(1, 152f, lifetime = 2))
    assertEquals(short, layout.inset(release))
    layout.applied(release)
    assertEquals(160f, layout.ordinary(false, false)!!.bottom, 0f)
  }

  @Test fun liveHostReplacementAlsoInvalidatesTheCapturedGeometryLifetime() {
    val layout = layout()
    val old = layout.capture(short)!!
    layout.seal(host(0, 152f, lifetime = 2))
    assertEquals(short, layout.inset(old))
  }

  @Test fun detachOrOwnerChangeRejectsOldAuthorityWithoutResettingANewSend() {
    val layout = layout()
    layout.bind(binding(1))
    val old = layout.capture(short)!!
    layout.detach()
    layout.bind(binding(1, "other"))
    layout.seal(host(1, 152f, 2))
    assertNull(layout.inset(old))
    layout.applied(old)
    assertEquals(0L, layout.appliedRelease)
    assertTrue(layout.waiting())
  }

  @Test fun persistentPublishedReleaseReplaysOnANewNativeList() {
    val layout = ComposerLayout()
    layout.bind(binding(7))
    val replay = layout.capture(short)!!
    layout.seal(host(7))
    assertTrue(layout.waiting())
    layout.applied(replay)
    assertEquals(7L, layout.appliedRelease)
    assertFalse(layout.waiting())
    layout.seal(host(8))
    assertTrue(layout.waiting()) // Unpublished eighth send still waits.
  }

  @Test fun sequenceRegressionCannotResetAppliedReleaseOrReuseHeight() {
    val layout = layout(4)
    layout.applied(layout.capture(short)!!)
    layout.bind(binding(2))
    val regressed = layout.capture(tall)!!
    layout.seal(host(2, 152f))
    assertEquals(4L, layout.appliedRelease)
    assertNull(layout.sample)
    assertEquals(tall, layout.inset(regressed))
    layout.applied(regressed)
    assertEquals(4L, layout.appliedRelease)
  }

  @Test fun bindingNilExplicitlyReturnsOwnershipWithoutRetainingCachedHeight() {
    val layout = layout()
    val old = layout.capture(short)!!
    layout.bind(null)
    layout.seal(null)
    assertNull(layout.inset(old))
    assertNull(layout.ordinary(false, false))
    assertFalse(layout.waiting())
  }

  @Test fun reattachedListNeedsAFreshReleaseBarrierBehindOldFifoWork() {
    val layout = layout()
    layout.bind(binding(1))
    val beforeDetach = layout.capture(short)!!
    layout.detach()
    layout.seal(host(1, 112f, 2))
    // Old rows can finish in order, but their old lifetime cannot authorize
    // geometry or consume the reattached host's pending clear.
    assertTrue(layout.canApply(beforeDetach))
    assertNull(layout.inset(beforeDetach))
    layout.applied(beforeDetach)
    assertTrue(layout.waiting())
    val replay = layout.capture(short)!!
    assertEquals(tall, layout.inset(replay))
    layout.applied(replay)
    assertFalse(layout.waiting())
  }

  @Test fun anAuthorizedCancellationMustStillPassTheFreshSealAndActualApply() {
    val layout = layout()
    layout.seal(host(1))
    layout.bind(binding(1))
    val cancel = layout.capture(short)!!
    // Receiving authority alone must not unhold a same-height clear.
    assertTrue(layout.waiting())
    assertFalse(layout.canApply(cancel))
    layout.seal(host(1))
    assertTrue(layout.waiting())
    assertTrue(layout.canApply(cancel))
    layout.applied(cancel)
    assertFalse(layout.waiting())
  }

  @Test fun anUnpublishedNewerHostCannotBorrowARepeatedOlderRelease() {
    val layout = layout()
    val initial = layout.capture(short)!!
    layout.applied(initial)
    layout.seal(host(2, 152f))
    val ordinaryRows = layout.capture(tall)!! // Published release is still zero.
    assertEquals(tall, layout.inset(ordinaryRows))
    layout.applied(ordinaryRows)
    assertEquals(0L, layout.appliedRelease)
    assertTrue(layout.waiting())
    assertNull(layout.ordinary(false, false))
  }

  @Test fun frozenOrdinaryRowsKeepTheirGeometryWhileANewSendPairWaits() {
    val layout = layout()
    val ordinaryRows = layout.capture(short)!!
    assertTrue(layout.canApply(ordinaryRows, frozen = true))
    assertNull(layout.ordinary(true, false))
    layout.bind(binding(1))
    val pair = layout.capture(short)!!
    layout.seal(host(1))
    assertFalse(layout.canApply(pair, frozen = true))
    assertTrue(layout.canApply(pair, frozen = false))
    assertTrue(layout.waiting())
    layout.applied(pair)
    assertFalse(layout.waiting())
  }

  @Test fun ordinaryGapChangeSealsOnUiWithoutANewReleaseBarrier() {
    val layout = layout()
    assertEquals(ComposerChange.NONE, layout.bind(binding()))
    assertEquals(ComposerChange.GEOMETRY, layout.bind(ComposerBinding("chat", 0, 12f)))
    layout.seal(host(height = 80f))
    assertFalse(layout.waiting())
    assertEquals(92f, layout.ordinary(false, false)!!.bottom, 0f)
    assertEquals(ComposerChange.BARRIER, layout.bind(binding(1)))
  }

  @Test fun aCloseCanFlushOnlyItsAlreadyAuthorizedPairWhileFrozen() {
    val layout = layout()
    layout.bind(binding(1))
    val pair = layout.capture(short)!!
    val close = layout.close(10)!!
    layout.seal(host(1))
    assertFalse(layout.canApply(pair, frozen = true))
    assertTrue(layout.closeFlush(pair, close))
    assertTrue(layout.closeWaiting(close))
    assertEquals(short, layout.inset(pair))
    layout.applied(pair)
    assertFalse(layout.closeWaiting(close))
    assertFalse(layout.closeFlush(pair, close))
    assertNull(layout.ordinary(true, true))
  }

  @Test fun closeBeforeWorkerFinishRetainsPermissionUntilTheResultAndSealExist() {
    val layout = layout()
    layout.bind(binding(1))
    val pair = layout.capture(short)!!
    val close = layout.close(1)!!
    assertTrue(layout.closeWaiting(close))
    assertFalse(layout.closeFlush(pair, close))
    layout.seal(host(1))
    assertTrue(layout.closeWaiting(close))
    assertTrue(layout.closeFlush(pair, close))
    layout.applied(pair)
    assertFalse(layout.closeWaiting(close))
  }

  @Test fun closeAfterWorkerApplyNeedsNoAdditionalBarrier() {
    val layout = layout(1)
    val pair = layout.capture(short)!!
    layout.applied(pair)
    val close = layout.close(1)!!
    assertFalse(layout.closeWaiting(close))
    assertFalse(layout.closeFlush(pair, close))
  }

  @Test fun closeSAfterNewerUnreleasedTUsesCapturedSAndDoesNotWaitForT() {
    val layout = layout()
    layout.bind(binding(1))
    val s = layout.capture(short)!!
    val close = layout.close(1)!!
    layout.seal(host(2, 152f))
    assertTrue(layout.closeFlush(s, close))
    assertEquals(short, layout.inset(s))
    layout.applied(s)
    assertFalse(layout.closeWaiting(close))
    assertTrue(layout.waiting())
    assertEquals(1L, layout.appliedRelease)
    assertNull(layout.ordinary(true, true))
  }

  @Test fun anUnreleasedHostDoesNotDelayAnUnpairedClose() {
    val layout = layout()
    layout.seal(host(1, 112f))
    val close = layout.close(1)!!
    assertTrue(layout.waiting())
    assertFalse(layout.closeWaiting(close))
    assertFalse(layout.closeFlush(layout.capture(short), close))
  }

  @Test fun laterReleaseCannotExpandTheCloseCeiling() {
    val layout = layout()
    layout.bind(binding(1))
    val s = layout.capture(short)!!
    val close = layout.close(1)!!
    layout.bind(binding(2))
    val t = layout.capture(tall)!!
    layout.seal(host(2, 152f))
    assertTrue(layout.closeFlush(s, close))
    assertFalse(layout.closeFlush(t, close))
    layout.applied(s)
    assertFalse(layout.closeWaiting(close))
    assertTrue(layout.waiting())
  }

  @Test fun refreezeOrNewLiftCancellationInvalidatesTheOldCloseWithoutReleasingItsPair() {
    val layout = layout(1)
    val pair = layout.capture(short)!!
    val close = layout.close(1)!!
    layout.cancelClose()
    assertFalse(layout.accepts(close))
    assertFalse(layout.closeFlush(pair, close))
    assertEquals(0L, layout.appliedRelease)
    assertTrue(layout.waiting())
  }

  @Test fun aNewCloseAndDetachRejectObsoleteCallbacks() {
    val layout = layout(1)
    val old = layout.close(1)!!
    val current = layout.close(2)!!
    assertFalse(layout.accepts(old))
    assertTrue(layout.accepts(current))
    layout.detach()
    layout.seal(host(1, 112f, 2))
    assertFalse(layout.accepts(current))
  }

  @Test fun anOwnerChangeOrRegressionCannotReuseClosePermission() {
    val layout = layout(2)
    val pair = layout.capture(short)!!
    val close = layout.close(1)!!
    layout.bind(binding(1))
    layout.seal(host(1))
    assertFalse(layout.closeFlush(pair, close))
    assertFalse(layout.accepts(close))
    val regressedClose = layout.close(2)!!
    layout.bind(binding(1, "other"))
    layout.seal(host(1, 40f, 2))
    assertFalse(layout.accepts(regressedClose))
  }

  @Test fun ordinaryGrowthDoesNotWaitForAnUnrelatedRowsWorker() {
    val layout = layout()
    val rowsInFlight = layout.capture(short)!!
    layout.seal(host(height = 112f))
    assertEquals(120f, layout.ordinary(false, false)!!.bottom, 0f)
    // That FIFO result later sees the same current geometry. It cannot put
    // the old React bottom back or require a new observer worker barrier.
    assertEquals(tall, layout.inset(rowsInFlight))
  }

  @Test fun repeatedSealsAndInterruptionDoNotCreateGenericNavigation() {
    val layout = layout()
    val latest = LatestScroll()
    latest.request(1)
    latest.cancel()
    repeat(3) {
      layout.invalidate()
      layout.seal(host(height = 60f + it))
      assertNotNull(layout.ordinary(false, false))
      assertFalse(latest.follows(2))
    }
  }
}
