import ExpoModulesCore

struct MessageMenuAction: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var systemImage: String?
  @Field var destructive: Bool = false
}

public class MessageMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MessageMenu")

    View(MessageMenuView.self) {
      Events("onReact", "onAction")

      Prop("reactions") { (view: MessageMenuView, reactions: [String]) in
        view.reactions = reactions
      }
      Prop("selectedReactions") { (view: MessageMenuView, selected: [String]) in
        view.selectedReactions = Set(selected)
      }
      Prop("actions") { (view: MessageMenuView, actions: [MessageMenuAction]) in
        view.actions = actions
      }
      Prop("previewCornerRadius") { (view: MessageMenuView, radius: Double?) in
        view.previewCornerRadius = CGFloat(radius ?? 18)
      }
      Prop("previewInset") { (view: MessageMenuView, inset: Double?) in
        view.previewInset = CGFloat(inset ?? 0)
      }
      Prop("previewBackground") { (view: MessageMenuView, opaque: Bool?) in
        view.previewBackground = opaque ?? false
      }
      Prop("enabled") { (view: MessageMenuView, enabled: Bool?) in
        view.menuEnabled = enabled ?? true
      }
    }
  }
}
