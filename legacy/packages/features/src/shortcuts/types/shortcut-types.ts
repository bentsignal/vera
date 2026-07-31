export interface Hotkey {
  key: string;
  shift?: boolean;
  ctrlCmd?: boolean;
  alt?: boolean;
}

export interface Shortcut {
  name: string;
  hotkey: Hotkey;
}
