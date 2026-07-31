import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useThreadMutations, useThreadStore } from "@acme/features/thread";

import { CustomAlert } from "~/components/alert";

export function ThreadDeleteModal() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mutations = useThreadMutations();
  const { mutate: deleteThread } = useMutation({
    ...mutations.delete,
    onError: (error) => {
      console.error(error);
      toast.error("Failed to delete thread");
    },
  });
  const setHoveredThread = useThreadStore((state) => state.setHoveredThread);
  const deleteModalOpen = useThreadStore((state) => state.deleteModalOpen);
  const setDeleteModalOpen = useThreadStore(
    (state) => state.setDeleteModalOpen,
  );
  return (
    <CustomAlert
      open={deleteModalOpen}
      setOpen={setDeleteModalOpen}
      onCancel={() => {
        setHoveredThread(null);
      }}
      onConfirm={() => {
        const selectedThread = useThreadStore.getState().hoveredThread;
        if (!selectedThread) return;
        if (pathname.includes(selectedThread.id)) {
          void navigate({ to: "/home" });
        }
        deleteThread({ threadId: selectedThread.id });
        setHoveredThread(null);
      }}
      title="Delete Thread"
      message="Are you sure you want to delete this thread?"
      destructive={true}
    />
  );
}
