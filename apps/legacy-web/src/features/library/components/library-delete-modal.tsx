import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useFileMutations, useLibraryStore } from "@acme/features/library";

import { CustomAlert } from "~/components/alert";

export function LibraryDeleteModal() {
  const libraryDeleteModalOpen = useLibraryStore(
    (state) => state.libraryDeleteModalOpen,
  );
  const setLibraryDeleteModalOpen = useLibraryStore(
    (state) => state.setLibraryDeleteModalOpen,
  );

  const title = useLibraryStore((state) =>
    state.libraryMode === "select" && state.selectedFiles.length > 1
      ? "Delete files"
      : "Delete file",
  );
  const message = useLibraryStore((state) =>
    state.libraryMode === "select" && state.selectedFiles.length > 1
      ? `Are you sure you want to delete these ${state.selectedFiles.length} files?`
      : "Are you sure you want to delete this file?",
  );

  const setSelectedFile = useLibraryStore((state) => state.setSelectedFile);
  const setSelectedFiles = useLibraryStore((state) => state.setSelectedFiles);

  const mutations = useFileMutations();
  const { mutate: deleteFiles } = useMutation({
    ...mutations.deleteFiles,
    onError: (error) => {
      console.error(error);
      toast.error("Failed to delete file");
    },
  });

  return (
    <CustomAlert
      open={libraryDeleteModalOpen}
      setOpen={setLibraryDeleteModalOpen}
      onCancel={() => {
        setSelectedFile(null);
      }}
      onConfirm={() => {
        const libraryMode = useLibraryStore.getState().libraryMode;
        if (libraryMode === "select") {
          const selectedFiles = useLibraryStore.getState().selectedFiles;
          if (selectedFiles.length > 0) {
            deleteFiles({ ids: selectedFiles.map((f) => f.id) });
            setSelectedFiles([]);
            setLibraryDeleteModalOpen(false);
          }
        } else {
          const selectedFile = useLibraryStore.getState().selectedFile;
          if (selectedFile) {
            deleteFiles({ ids: [selectedFile.id] });
            setSelectedFile(null);
            setLibraryDeleteModalOpen(false);
          }
        }
      }}
      title={title}
      message={message}
      destructive={true}
    />
  );
}
