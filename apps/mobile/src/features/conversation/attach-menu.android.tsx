import { useRef, useState } from "react";
import { KeyboardController } from "react-native-keyboard-controller";
import Add from "@expo/material-symbols/add.xml";
import AttachFile from "@expo/material-symbols/attach_file.xml";
import PhotoCamera from "@expo/material-symbols/photo_camera.xml";
import PhotoLibrary from "@expo/material-symbols/photo_library.xml";
import {
  DropdownMenu,
  DropdownMenuItem,
  Icon,
  IconButton,
  Text,
  useMaterialColors,
} from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";

import type { AttachmentSource } from "~/features/messaging/attachments";
import { NativeHost } from "~/components/native-host";

const BUTTON = 40;

/** Longest the menu waits for the keyboard to report it's down. */
const KEYBOARD_WAIT_MS = 600;

const SOURCES = [
  { icon: PhotoLibrary, label: "Photos & Videos", source: "library" },
  { icon: PhotoCamera, label: "Camera", source: "camera" },
  { icon: AttachFile, label: "Files", source: "files" },
] as const;

/**
 * Android `AttachMenu`: a tonal "+" icon button with a Material dropdown
 * anchored to it. Tapping outside or pressing back closes it. See
 * `attach-menu.tsx`.
 *
 * The dropdown is a popup window that takes focus, which hides the
 * keyboard without react-native-keyboard-controller hearing of it (it only
 * watches `Modal`s), so the composer stayed up where the keyboard had been,
 * over the middle of the chat. With the keyboard up, "+" puts it down
 * first, the composer following it, and opens the menu once it's down.
 */
export function AttachMenu({
  onPick,
}: {
  onPick: (source: AttachmentSource) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // A second tap while the keyboard goes down doesn't open it twice.
  const opening = useRef(false);
  const colors = useMaterialColors();

  function open() {
    if (!KeyboardController.isVisible()) {
      setExpanded(true);
      return;
    }
    if (opening.current) return;
    opening.current = true;
    void Promise.race([
      KeyboardController.dismiss(),
      new Promise((resolve) => setTimeout(resolve, KEYBOARD_WAIT_MS)),
    ]).then(() => {
      opening.current = false;
      setExpanded(true);
    });
  }
  return (
    // Sized up front, not matched to its contents, so the message field
    // doesn't spread over it until Compose reports its size.
    <NativeHost style={{ height: BUTTON, width: BUTTON }}>
      <DropdownMenu
        expanded={expanded}
        onDismissRequest={() => setExpanded(false)}
      >
        <DropdownMenu.Trigger>
          <IconButton
            onClick={open}
            colors={{
              containerColor: colors.surfaceContainerHighest,
              contentColor: colors.onSurface,
            }}
            modifiers={[size(BUTTON, BUTTON)]}
          >
            <Icon source={Add} size={22} contentDescription="Add attachment" />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {SOURCES.map(({ icon, label, source }) => (
            <DropdownMenuItem
              key={source}
              onClick={() => {
                setExpanded(false);
                onPick(source);
              }}
            >
              <DropdownMenuItem.LeadingIcon>
                <Icon source={icon} size={24} />
              </DropdownMenuItem.LeadingIcon>
              <DropdownMenuItem.Text>
                <Text style={{ typography: "bodyLarge" }}>{label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </NativeHost>
  );
}
