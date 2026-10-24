import ExpoModulesCore

/// The native message list: the module `MessageList` and its view. See
/// src/features/native-list/contract.ts and native.ts.
public class MessageListModule: Module {
  /// Bump with `CONTRACT_VERSION` in contract.ts.
  static let contractVersion = 1
  static let rowKinds = ["message", "header", "notice", "typing", "custom"]
  static let blockTypes = ["text", "media", "file", "linkCard", "quote", "deleted"]
  /// What this binary does beyond version 1's basics (contract.ts,
  /// `NativeSupport.features`).
  static let features = ["lift", "customRows", "benchFling"]

  public func definition() -> ModuleDefinition {
    Name("MessageList")

    Constant("support") { () -> [String: Any] in
      [
        "contractVersion": Self.contractVersion,
        "rowKinds": Self.rowKinds,
        "blockTypes": Self.blockTypes,
        "features": Self.features,
      ]
    }

    View(MessageListView.self) {
      Events("onEvent")

      Prop("rows") { (view: MessageListView, rows: [[String: Any]]?) in
        view.setRows(rows ?? [])
      }
      Prop("theme") { (view: MessageListView, theme: [String: Any]?) in
        view.setTheme(theme)
      }
      Prop("behavior") { (view: MessageListView, behavior: [String: Any]?) in
        view.setBehavior(behavior)
      }
      Prop("insets") { (view: MessageListView, insets: [String: Any]?) in
        view.setInsets(insets)
      }
      Prop("keyboard") { (view: MessageListView, keyboard: Bool?) in
        view.setKeyboard(keyboard ?? true)
      }
      Prop("liftedRowId") { (view: MessageListView, id: String?) in
        view.setLiftedRowId(id)
      }
      Prop("keyboardFrozen") { (view: MessageListView, frozen: Bool?) in
        view.setKeyboardFrozen(frozen ?? false)
      }
      Prop("alignTop") { (view: MessageListView, top: Bool?) in
        view.setAlignTop(top ?? false)
      }
      Prop("lift") { (view: MessageListView, lift: [String: Any]?) in
        view.setLift(lift)
      }
      Prop("initialRowId") { (view: MessageListView, id: String?) in
        view.setInitialRowId(id)
      }
      Prop("contractVersion") { (_: MessageListView, _: Int?) in
        // JavaScript checks `support` before sending anything; nothing to do.
      }

      OnViewDidUpdateProps { view in
        view.propsDidUpdate()
      }

      AsyncFunction("scrollToLatest") { (view: MessageListView, animated: Bool?) in
        view.scrollToLatest(animated: animated ?? true)
      }.runOnQueue(.main)

      AsyncFunction("scrollToRow") { (view: MessageListView, rowId: String, animated: Bool?) in
        view.scrollToRow(rowId, animated: animated ?? true)
      }.runOnQueue(.main)

      AsyncFunction("benchFling") { (view: MessageListView, speed: Double, ms: Double, promise: Promise) in
        view.benchFling(speed: speed, ms: ms) { result in promise.resolve(result) }
      }.runOnQueue(.main)
    }

    // A custom row's React content, as a child of the list (CustomRows.swift).
    View(CustomRowView.self) {
      ViewName("MessageListRow")
      Prop("rowId") { (view: CustomRowView, rowId: String?) in
        view.rowId = rowId ?? ""
      }
    }
  }
}
