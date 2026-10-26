import { Button, Image, Menu } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  contentShape,
  font,
  frame,
  glassEffect,
  menuIndicator,
  menuOrder,
  menuStyle,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { useCSSVariable } from "uniwind";

import type { AttachmentSource } from "~/features/messaging/attachments";
import { NativeHost } from "~/components/native-host";

/** As tall as the composer's other controls, so they line up. */
const BUTTON = 40;

/**
 * The composer's "+": a glass button that opens a native menu anchored to
 * it, like the Inbox's toolbar menus. `attach-menu.android.tsx` is the
 * Material dropdown.
 */
export function AttachMenu({
  onPick,
}: {
  onPick: (source: AttachmentSource) => void;
}) {
  const foreground = useCSSVariable("--color-foreground");
  return (
    // SwiftUI otherwise keeps its content clear of the keyboard and the
    // home indicator. The composer sits over both before it's moved up
    // (the keyboard lifts it with a transform), so the "+" was pushed up
    // out of line with the message field. Its size is set rather than
    // matched to its contents, which SwiftUI reports only after it draws:
    // until then the field spread over the "+" as a conversation opened.
    <NativeHost ignoreSafeArea="all" style={{ height: BUTTON, width: BUTTON }}>
      <Menu
        label={
          <Image
            systemName="plus"
            color={typeof foreground === "string" ? foreground : undefined}
            modifiers={[
              font({ size: 18, weight: "semibold" }),
              frame({ height: BUTTON, width: BUTTON }),
              contentShape(shapes.circle()),
              glassEffect({
                glass: { interactive: true, variant: "regular" },
                shape: "circle",
              }),
            ]}
          />
        }
        modifiers={[
          menuStyle("button"),
          buttonStyle("plain"),
          menuIndicator("hidden"),
          menuOrder("fixed"),
          accessibilityLabel("Add attachment"),
        ]}
      >
        <Button
          label="Camera"
          systemImage="camera"
          onPress={() => onPick("camera")}
        />
        <Button
          label="Photos & Videos"
          systemImage="photo.on.rectangle"
          onPress={() => onPick("library")}
        />
        <Button
          label="Files"
          systemImage="doc"
          onPress={() => onPick("files")}
        />
      </Menu>
    </NativeHost>
  );
}
