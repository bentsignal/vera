export function SettingsWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex max-h-fit w-full flex-col gap-4 overflow-y-auto mask-b-from-90% pr-4 pb-32">
      {children}
    </div>
  );
}
