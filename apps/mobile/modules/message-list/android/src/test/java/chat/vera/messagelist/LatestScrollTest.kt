package chat.vera.messagelist

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LatestScrollTest {
  @Test fun reachingTheOldBottomDoesNotConsumeTheRequestBeforeTheSendApplies() {
    val latest = LatestScroll()
    latest.request(3)
    assertTrue(latest.accepts(latest.ticket()))
    // Initial motion finishes against old rows. The released send applies later.
    assertTrue(latest.follows(4))
    assertTrue(latest.accepts(latest.ticket()))
    // Ordinary later applies still follow. This is generic navigation, not an ACK.
    assertTrue(latest.follows(5))
  }

  @Test fun cancellingASendAfterArmingDoesNotRevokeGenericNavigation() {
    val latest = LatestScroll()
    latest.request(1)
    // A rollback/restage is another rows update, with no native send identity.
    assertTrue(latest.follows(2))
  }

  @Test fun aReaderStoppingTheScrollInvalidatesItsPostedRestart() {
    val latest = LatestScroll()
    latest.request(2)
    val posted = latest.ticket()
    latest.cancel()
    assertFalse(latest.accepts(posted))
    assertFalse(latest.follows(3))
  }

  @Test fun navigationOrDetachCannotBeUndoneByAnOldWorkerCompletion() {
    val latest = LatestScroll()
    latest.request(2)
    latest.cancel()
    assertFalse(latest.follows(2))
    assertFalse(latest.accepts(latest.ticket()))
  }

  @Test fun aNewCommandSupersedesBothOldCallbacksAndOlderFifoApplies() {
    val latest = LatestScroll()
    latest.request(2)
    val old = latest.ticket()
    latest.request(5)
    assertFalse(latest.accepts(old))
    assertFalse(latest.follows(4))
    assertTrue(latest.follows(5))
  }

  @Test fun theLastLayoutWinsWhenTwoRestartsArePosted() {
    val latest = LatestScroll()
    latest.request(1)
    val oldGeometry = latest.ticket()
    val newGeometry = latest.ticket()
    assertFalse(latest.accepts(oldGeometry))
    assertTrue(latest.accepts(newGeometry))
  }

  @Test fun freezeRetainsTheAnchorIntentButRejectsStartsUntilThaw() {
    val latest = LatestScroll()
    latest.request(1)
    val beforeFreeze = latest.ticket()
    latest.freeze(true)
    assertFalse(latest.accepts(beforeFreeze))
    assertFalse(latest.follows(2))
    assertTrue(latest.tracks(2))
    latest.freeze(false)
    assertTrue(latest.follows(2))
    assertTrue(latest.accepts(latest.ticket()))
  }

  @Test fun refreezeAndUserInterruptionDoNotResurrectOnThaw() {
    val latest = LatestScroll()
    latest.request(1)
    latest.freeze(true)
    latest.freeze(false)
    val thawed = latest.ticket()
    latest.freeze(true)
    assertFalse(latest.accepts(thawed))
    latest.cancel()
    latest.freeze(false)
    assertFalse(latest.follows(2))
  }
}
