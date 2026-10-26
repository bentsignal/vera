import { useState } from "react";
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

const SOURCES = [
  { icon: PhotoCamera, label: "Camera", source: "camera" },
  { icon: PhotoLibrary, label: "Photos & Videos", source: "library" },
  { icon: AttachFile, label: "Files", source: "files" },
] as const;

/**
 * Android `AttachMenu`: a tonal "+" icon button with a Material dropdown
 * anchored to it. Tapping outside or pressing back closes it. See
 * `attach-menu.tsx`.
 */
export function AttachMenu({
  onPick,
}: {
  onPick: (source: AttachmentSource) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = useMaterialColors();
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
            onClick={() => setExpanded(true)}
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
