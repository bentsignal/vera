package chat.vera.deviceproof

import android.annotation.SuppressLint
import android.provider.Settings
import android.util.Base64
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

/**
 * The proof a sign-up sends so the PDS can hold each phone to its number
 * of accounts (services/backend/sign-up-devices.ts): the phone's Android
 * ID, which stays the same for Vera across reinstalls, and a Play
 * Integrity token whose nonce is tied to that ID and the username, which
 * Google decodes for the PDS to say it's Vera from Play on a real phone.
 */
class DeviceProofModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VeraDeviceProof")

    AsyncFunction("signUpProofAsync") { username: String, cloudProjectNumber: String, promise: Promise ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_DEVICE_PROOF", "No context", null)
      @SuppressLint("HardwareIds")
      val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        ?.lowercase()
        ?: throw CodedException("ERR_DEVICE_PROOF", "No Android ID", null)
      // Must match androidNonce in services/backend/sign-up-devices.ts.
      val digest = MessageDigest.getInstance("SHA-256")
        .digest("vera-sign-up\n$androidId\n$username".toByteArray(Charsets.UTF_8))
      val nonce = Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
      IntegrityManagerFactory.create(context)
        .requestIntegrityToken(
          IntegrityTokenRequest.builder()
            .setNonce(nonce)
            .setCloudProjectNumber(cloudProjectNumber.toLong())
            .build()
        )
        .addOnSuccessListener { response ->
          promise.resolve(
            mapOf("platform" to "android", "androidId" to androidId, "token" to response.token())
          )
        }
        .addOnFailureListener { error ->
          promise.reject(CodedException("ERR_DEVICE_PROOF", error.message ?: "Play Integrity failed", error))
        }
    }
  }
}
