import { mutationOptions } from "@tanstack/react-query";

import { useDeleteFiles } from "../hooks/use-delete-files";
import { useRenameFile } from "../hooks/use-rename-file";

export function useFileMutations() {
  return {
    deleteFiles: mutationOptions({
      mutationKey: ["library-delete-files"],
      mutationFn: useDeleteFiles(),
    }),
    renameFile: mutationOptions({
      mutationKey: ["library-rename-file"],
      mutationFn: useRenameFile(),
    }),
  };
}
