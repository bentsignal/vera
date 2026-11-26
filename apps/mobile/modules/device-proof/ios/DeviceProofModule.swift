import DeviceCheck
import ExpoModulesCore

/// The proof a sign-up sends so the PDS can hold each phone to its number
/// of accounts (services/backend/sign-up-devices.ts): a DeviceCheck token,
/// which only Apple can read, and which names the same phone across
/// reinstalls. Resolves null where DeviceCheck isn't available (the
/// Simulator).
public class DeviceProofModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VeraDeviceProof")

    AsyncFunction("signUpProofAsync") { (_: String, _: String, promise: Promise) in
      guard DCDevice.current.isSupported else {
        promise.resolve(nil)
        return
      }
      DCDevice.current.generateToken { token, error in
        if let token {
          promise.resolve(["platform": "ios", "token": token.base64EncodedString()])
        } else {
          promise.reject("ERR_DEVICE_PROOF", error?.localizedDescription ?? "No DeviceCheck token")
        }
      }
    }
  }
}
