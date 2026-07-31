// import { useNavigate } from "@tanstack/react-router";
// import { useThreadStore } from "@acme/features/thread";
// import type { Thread } from "@acme/features/thread";
// import { shortcuts } from "~/features/shortcuts";
// import useShortcut from "~/features/shortcuts/hooks/use-shortcut";

// interface SwitchThread extends Omit<Thread, "active" | "status" | "pinned"> {
//   id: string;
// }

// export default function useThreadSwitch({
//   threads,
// }: {
//   threads: SwitchThread[];
// }) {
//   const router = useRouter();

//   const switchThreads = (offset: number) => {
//     const activeThread = useThreadStore.getState().activeThread;
//     if (activeThread) {
//       const activeThreadIndex = threads.findIndex(
//         (thread) => thread.id === activeThread,
//       );
//       if (activeThreadIndex !== -1) {
//         const newIndex = (activeThreadIndex + offset) % threads.length;
//         const nextThread = threads[newIndex];
//         router.push(`/chat/${nextThread.id}`);
//       } else {
//         const firstThread = threads[0];
//         router.push(`/chat/${firstThread.id}`);
//       }
//     } else {
//       const firstThread = threads[0];
//       router.push(`/chat/${firstThread.id}`);
//     }
//   };

//   useShortcut({
//     hotkey: shortcuts["next-thread"].hotkey,
//     callback: () => {
//       switchThreads(1);
//     },
//   });

//   useShortcut({
//     hotkey: shortcuts["previous-thread"].hotkey,
//     callback: () => {
//       switchThreads(-1);
//     },
//   });
// }
