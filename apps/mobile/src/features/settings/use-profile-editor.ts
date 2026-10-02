import { useRef, useState } from "react";
import { Alert } from "react-native";

import { useAccount } from "~/features/messaging/account";
import { useAttachmentUploader } from "~/features/messaging/attachments";
import { useMyProfile } from "~/features/messaging/directory";

const SAVE_DELAY_MS = 800;

/** The signed-in profile, saving name edits after typing pauses. */
export function useProfileEditor() {
  const { username } = useAccount();
  const { profile, update } = useMyProfile();
  const uploadAttachments = useAttachmentUploader();
  const [draftName, setDraftName] = useState<string>();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedName = profile?.displayName ?? username;
  const avatarUrl = profile?.avatarUrl ?? null;

  function changeName(value: string) {
    setDraftName(value);
    clearTimeout(saveTimer.current);
    const name = value.trim();
    if (name.length === 0 || name === savedName) return;
    saveTimer.current = setTimeout(() => {
      void update({ avatarUrl, displayName: name });
    }, SAVE_DELAY_MS);
  }

  async function changePhoto(source: "camera" | "library") {
    const [photo] = await uploadAttachments(source, { imagesOnly: true }).catch(
      () => [],
    );
    if (photo?.kind !== "image") return;
    await update({ avatarUrl: photo.url, displayName: savedName }).catch(() =>
      Alert.alert("Couldn't Update Photo", "Try again in a moment."),
    );
  }

  return {
    avatarUrl,
    /** False until the PDS answers; the name field remounts when it does. */
    isLoaded: profile !== undefined,
    changeName,
    changePhoto,
    displayName: draftName?.trim() ? draftName.trim() : savedName,
    removePhoto: () => update({ avatarUrl: null, displayName: savedName }),
    savedName,
  };
}
