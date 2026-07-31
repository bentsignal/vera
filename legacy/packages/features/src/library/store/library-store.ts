import { create } from "zustand";

import type { LibraryFile, LibraryMode } from "../types/library-types";

interface LibraryStore {
  libraryOpen: boolean;
  setLibraryOpen: (open: boolean) => void;
  libraryDeleteModalOpen: boolean;
  setLibraryDeleteModalOpen: (open: boolean) => void;
  libraryRenameModalOpen: boolean;
  setLibraryRenameModalOpen: (open: boolean) => void;
  photoViewerOpen: boolean;
  setPhotoViewerOpen: (open: boolean) => void;
  selectedFile: LibraryFile | null;
  setSelectedFile: (file: LibraryFile | null) => void;
  libraryMode: LibraryMode;
  setLibraryMode: (mode: LibraryMode) => void;
  selectedFiles: LibraryFile[];
  setSelectedFiles: (files: LibraryFile[]) => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  libraryOpen: false,
  setLibraryOpen: (open) => set({ libraryOpen: open }),
  libraryDeleteModalOpen: false,
  setLibraryDeleteModalOpen: (open) => set({ libraryDeleteModalOpen: open }),
  libraryRenameModalOpen: false,
  setLibraryRenameModalOpen: (open) => set({ libraryRenameModalOpen: open }),
  photoViewerOpen: false,
  setPhotoViewerOpen: (open) => set({ photoViewerOpen: open }),
  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),
  libraryMode: "default",
  setLibraryMode: (mode) => set({ libraryMode: mode }),
  selectedFiles: [],
  setSelectedFiles: (files) => set({ selectedFiles: files }),
}));
