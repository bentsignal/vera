import { create } from "zustand";

import type { Thread } from "../types/thread-types";

interface ThreadStore {
  /** thread being hovered over in thread list */
  hoveredThread: Thread | null;
  setHoveredThread: (thread: Thread | null) => void;
  /** thread currently open */
  activeThread: string | null;
  setActiveThread: (thread: string | null) => void;
  /** modal open for deleting a thread */
  deleteModalOpen: boolean;
  setDeleteModalOpen: (open: boolean) => void;
  triggerDeleteModal: () => void;
  /** modal open for renaming a thread */
  renameModalOpen: boolean;
  setRenameModalOpen: (open: boolean) => void;
  triggerRenameModal: () => void;
  /** threads open in xr */
  xrThreads: Thread[];
  addXrThread: (thread: Thread) => void;
  removeXrThread: (threadId: string) => void;
  /** main thread in xr, shows up to the right of the thread list */
  mainThread: Thread | null;
  setMainThread: (thread: Thread | null) => void;
}

export const useThreadStore = create<ThreadStore>((set, get) => ({
  hoveredThread: null,
  setHoveredThread: (thread) => set({ hoveredThread: thread }),
  activeThread: null,
  setActiveThread: (thread) => set({ activeThread: thread }),
  deleteModalOpen: false,
  setDeleteModalOpen: (open) => set({ deleteModalOpen: open }),
  triggerDeleteModal: () => set({ deleteModalOpen: true }),
  renameModalOpen: false,
  setRenameModalOpen: (open) => set({ renameModalOpen: open }),
  triggerRenameModal: () => set({ renameModalOpen: true }),
  xrThreads: [],
  addXrThread: (thread: Thread) => {
    const xrThreads = get().xrThreads;
    if (xrThreads.find((t) => t.id === thread.id)) return;
    set((state) => ({
      xrThreads: [...state.xrThreads, thread],
    }));
  },
  removeXrThread: (threadId: string) => {
    set((state) => ({
      xrThreads: state.xrThreads.filter((t) => t.id !== threadId),
    }));
  },
  mainThread: null,
  setMainThread: (thread) => set({ mainThread: thread }),
}));
