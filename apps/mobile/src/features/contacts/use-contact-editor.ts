import type { Contact } from "@decentralized-convex/messages";
import { useRef, useState } from "react";
import { Alert } from "react-native";

import { useProfile } from "~/features/messaging/profiles";
import { usePhotoChange } from "~/features/settings/use-photo-change";
import { useContactActions } from "./contacts";

const SAVE_DELAY_MS = 800;

function couldNotSave() {
  Alert.alert("Couldn't Update Contact", "Try again in a moment.");
}

/**
 * Your name and photo for a contact, saving name edits after typing
 * pauses. Clearing the name, or going back to their photo, shows theirs
 * again.
 */
export function useContactEditor(contact: Contact) {
  const { accountId } = contact;
  const profile = useProfile(accountId);
  const { remove, save } = useContactActions();
  const [draftName, setDraftName] = useState<string>();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const photo = usePhotoChange({
    avatarUrl: profile.avatarUrl,
    save: (url) => save.mutateAsync({ accountId, avatarUrl: url }),
  });

  function changeName(value: string) {
    setDraftName(value);
    clearTimeout(saveTimer.current);
    const name = value.trim();
    if (name === (contact.name ?? "")) return;
    saveTimer.current = setTimeout(() => {
      save
        .mutateAsync({ accountId, name: name.length > 0 ? name : null })
        .catch(couldNotSave);
    }, SAVE_DELAY_MS);
  }

  const typed = draftName?.trim();
  return {
    avatarUrl: photo.avatarUrl,
    changeName,
    changePhoto: photo.change,
    /** The name shown: as typed, or else yours for them, or theirs. */
    displayName:
      typed === undefined || typed.length === 0 ? profile.displayName : typed,
    /** Whether you gave them a photo of your own. */
    hasOwnPhoto: contact.avatarUrl !== undefined,
    /** Their own name, which shows when you haven't given one. */
    ownName: profile.ownName,
    remove: () => {
      clearTimeout(saveTimer.current);
      remove
        .mutateAsync({ accountId })
        .catch(() =>
          Alert.alert("Couldn't Remove Contact", "Try again in a moment."),
        );
    },
    savedName: contact.name ?? "",
    /** True while a new photo uploads, which dims it under a spinner. */
    uploading: photo.uploading,
    restoreTheirPhoto: () => {
      photo.forget();
      save.mutateAsync({ accountId, avatarUrl: null }).catch(couldNotSave);
    },
  };
}
