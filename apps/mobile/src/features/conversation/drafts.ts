import type { Mention } from "@decentralized-convex/messages";
import { Directory, File, Paths } from "expo-file-system";

import type { ReplyTarget } from "./types";
import type { StagedFile } from "~/features/messaging/attachments";
import {
  KINDS,
  mentionsFrom,
  numberIn,
  replyToFrom,
  stringIn,
} from "./saved-draft-parts";

/**
 * Unsent messages, one per conversation and account, kept on this device
 * only (never synced): the text, who it @mentions, and the attachments
 * picked or pasted for it, and the message it replies to, so leaving a
 * conversation and coming back finds the message as it was left.
 */
export interface Draft {
  readonly text: string;
  readonly files: readonly StagedFile[];
  readonly mentions: readonly Mention[];
  readonly replyTo?: ReplyTarget;
}

type LocalFile = NonNullable<StagedFile["poster"]>;

const EMPTY = {
  files: [],
  mentions: [],
  replyTo: undefined,
  text: "",
} satisfies Draft;
/** How long typing pauses before the drafts are written to disk. */
const SAVE_DELAY_MS = 400;

let drafts: Map<string, Draft> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function draftsFile() {
  return new File(Paths.document, "message-drafts.json");
}

/** Where a draft's attachments live until it's sent or discarded. */
function folder() {
  return new Directory(Paths.document, "message-drafts");
}

/**
 * Only a file's name in the folder is saved: on iOS the app's folders can
 * move between launches.
 */
function nameOf(uri: string) {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

/** A saved file, if it's still in the folder. */
function localFrom(stored: unknown) {
  if (typeof stored !== "object" || stored === null) return undefined;
  const mimeType = stringIn(stored, "mimeType");
  const name = stringIn(stored, "name");
  const size = numberIn(stored, "size");
  const uri = stringIn(stored, "uri");
  if (
    mimeType === undefined ||
    name === undefined ||
    size === undefined ||
    uri === undefined
  ) {
    return undefined;
  }
  const file = new File(folder(), nameOf(uri));
  if (!file.exists) return undefined;
  return { mimeType, name, size, uri: file.uri } satisfies LocalFile;
}

function stagedFrom(stored: unknown) {
  const local = localFrom(stored);
  if (local === undefined || typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const id = stringIn(stored, "id");
  const kind = KINDS.find(
    (candidate) => candidate === Reflect.get(stored, "kind"),
  );
  if (id === undefined || kind === undefined) return undefined;
  const poster = localFrom(Reflect.get(stored, "poster"));
  const durationMs = numberIn(stored, "durationMs");
  const height = numberIn(stored, "height");
  const width = numberIn(stored, "width");
  return {
    ...local,
    id,
    kind,
    ...(durationMs !== undefined && { durationMs }),
    ...(height !== undefined && { height }),
    ...(poster !== undefined && { poster }),
    ...(width !== undefined && { width }),
  } satisfies StagedFile;
}

function filesFrom(stored: unknown) {
  return Array.isArray(stored)
    ? stored.flatMap((file) => stagedFrom(file) ?? [])
    : [];
}

/** A draft with nothing in it, which isn't kept. */
function isEmpty(draft: Draft) {
  return (
    draft.text === "" && draft.files.length === 0 && draft.replyTo === undefined
  );
}

function draftFrom(stored: unknown) {
  // Drafts saved before attachments were kept are only their text.
  if (typeof stored === "string") return { ...EMPTY, text: stored };
  if (typeof stored !== "object" || stored === null) return EMPTY;
  const replyTo = replyToFrom(Reflect.get(stored, "replyTo"));
  return {
    files: filesFrom(Reflect.get(stored, "files")),
    mentions: mentionsFrom(Reflect.get(stored, "mentions")),
    text: stringIn(stored, "text") ?? "",
    ...(replyTo !== undefined && { replyTo }),
  } satisfies Draft;
}

/** What marks the draft of a message being edited (see `editDraftKey`). */
const EDIT_SUFFIX = " edit";

function fromStored(stored: unknown) {
  const loaded = new Map<string, Draft>();
  if (typeof stored !== "object" || stored === null) return loaded;
  for (const [key, value] of Object.entries(stored)) {
    // An edit lasts only while its conversation is open.
    if (key.endsWith(EDIT_SUFFIX)) continue;
    const draft = draftFrom(value);
    if (!isEmpty(draft)) loaded.set(key, draft);
  }
  return loaded;
}

function fileNames(draft: Draft) {
  return draft.files.flatMap((file) =>
    [file.uri, file.poster?.uri].flatMap((uri) =>
      uri === undefined ? [] : [nameOf(uri)],
    ),
  );
}

/**
 * Deletes the folder's files no draft holds: ones sent or removed during
 * an earlier launch. Nothing else uses them once the app restarts.
 */
function removeUnused(loaded: Map<string, Draft>) {
  const used = new Set([...loaded.values()].flatMap(fileNames));
  try {
    if (!folder().exists) return;
    for (const entry of folder().list()) {
      if (!used.has(entry.name)) entry.delete();
    }
  } catch {
    // Tried again next launch.
  }
}

function load() {
  if (drafts !== undefined) return drafts;
  try {
    drafts = draftsFile().exists
      ? fromStored(JSON.parse(draftsFile().textSync()))
      : new Map<string, Draft>();
  } catch {
    // An unreadable file loses the drafts, not the conversation.
    drafts = new Map<string, Draft>();
  }
  removeUnused(drafts);
  return drafts;
}

function save() {
  saveTimer = undefined;
  try {
    draftsFile().write(JSON.stringify(Object.fromEntries(load())));
  } catch {
    // The drafts stay in memory for this launch.
  }
}

function scheduleSave() {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

/** Writes a save still waiting on a pause in typing, before the app restarts. */
export function saveDraftsNow() {
  if (saveTimer === undefined) return;
  clearTimeout(saveTimer);
  save();
}

function update(key: string, change: Partial<Draft>) {
  const all = load();
  const next = { ...(all.get(key) ?? EMPTY), ...change };
  if (isEmpty(next)) all.delete(key);
  else all.set(key, next);
  scheduleSave();
}

function deleteFile(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // Already gone, or removed next launch.
  }
}

function moveIn(id: string, uri: string) {
  try {
    folder().create({ idempotent: true, intermediates: true });
    const source = new File(uri);
    const extension = /\.\w+$/.exec(source.name)?.[0] ?? "";
    source.moveSync(new File(folder(), `${id}${extension}`));
    return source.uri;
  } catch {
    return uri;
  }
}

export function draftKey(account: string, conversationId: string) {
  return `${account}:${conversationId}`;
}

/**
 * The field's text while it edits a message you sent, apart from the
 * draft (`key`), which comes back once the edit is saved or cancelled.
 */
export function editDraftKey(key: string) {
  return `${key}${EDIT_SUFFIX}`;
}

export function readDraft(key: string) {
  return load().get(key) ?? EMPTY;
}

/** Saves the field's text. */
export function saveDraftText(key: string, text: string) {
  if (readDraft(key).text === text) return;
  update(key, { text });
}

/** Saves who the text @mentions. */
export function saveDraftMentions(key: string, mentions: readonly Mention[]) {
  update(key, { mentions });
}

/** Saves the message the draft replies to, or that it no longer does. */
export function saveDraftReply(key: string, replyTo: ReplyTarget | undefined) {
  update(key, { replyTo });
}

/** Saves the attachments staged for the message. */
export function saveDraftFiles(key: string, files: readonly StagedFile[]) {
  update(key, { files });
}

/**
 * Moves picked or pasted files into the drafts folder, so they last as
 * long as the draft instead of the cache they were handed over in. A move
 * on the same disk is a rename, so even a long video is instant. A file
 * that can't be moved stays where it is, for this launch only.
 */
export function keepForDraft(files: readonly StagedFile[]) {
  return files.map((file) => ({
    ...file,
    uri: moveIn(file.id, file.uri),
    ...(file.poster !== undefined && {
      poster: {
        ...file.poster,
        uri: moveIn(`${file.id}-poster`, file.poster.uri),
      },
    }),
  }));
}

/** Deletes an attachment removed from a draft before it was sent. */
export function discardStaged(file: StagedFile) {
  deleteFile(file.uri);
  if (file.poster !== undefined) deleteFile(file.poster.uri);
}

/** Deletes every draft of an account signed out on this device. */
export function forgetDrafts(account: string) {
  const all = load();
  for (const [key, draft] of all) {
    if (!key.startsWith(`${account}:`)) continue;
    for (const file of draft.files) discardStaged(file);
    all.delete(key);
  }
  scheduleSave();
}
