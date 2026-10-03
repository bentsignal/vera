import { useRef, useState } from "react";
import { Alert } from "react-native";

import { useAccount } from "~/features/messaging/account";
import { useAttachmentUploader } from "~/features/messaging/attachments";
import { useMyProfile } from "~/features/messaging/directory";

const SAVE_DELAY_MS = 800;

/** The signed-in profile, saving name and bio edits after typing pauses. */
export function useProfileEditor() {
  const { username } = useAccount();
  const { profile, update } = useMyProfile();
  const uploadAttachments = useAttachmentUploader();
  const [draftName, setDraftName] = useState<string>();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bioTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedName = profile?.displayName ?? username;
  const savedBio = profile?.bio ?? "";
  const avatarUrl = profile?.avatarUrl ?? null;
  // The name as typed, so a bio save doesn't revert a name still waiting
  // to save. Name and photo saves omit the bio, which keeps it.
  const currentName = draftName?.trim() ? draftName.trim() : savedName;

  function changeName(value: string) {
    setDraftName(value);
    clearTimeout(saveTimer.current);
    const name = value.trim();
    if (name.length === 0 || name === savedName) return;
    saveTimer.current = setTimeout(() => {
      void update({ avatarUrl, displayName: name });
    }, SAVE_DELAY_MS);
  }

  function changeBio(value: string) {
    clearTimeout(bioTimer.current);
    const bio = value.trim();
    if (bio === savedBio) return;
    bioTimer.current = setTimeout(() => {
      void update({ avatarUrl, bio, displayName: currentName }).catch(() =>
        Alert.alert("Couldn't Save Bio", "Try again in a moment."),
      );
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
    /** False until the PDS answers; the text fields remount when it does. */
    isLoaded: profile !== undefined,
    changeBio,
    changeName,
    changePhoto,
    displayName: currentName,
    removePhoto: () => update({ avatarUrl: null, displayName: savedName }),
    savedBio,
    savedName,
  };
}
