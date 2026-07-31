import type * as simpleIcons from "simple-icons";

import { SimpleIcon } from "./simple-icon";

const socials = [
  {
    label: "X",
    icon: "siX",
    href: "https://x.com/bsx_sh",
    size: 16,
  },
  {
    label: "Instagram",
    icon: "siInstagram",
    href: "https://www.instagram.com/bsx.sh/",
    size: 16,
  },
  {
    label: "Discord",
    icon: "siDiscord",
    href: "https://discord.gg/KwC24St29g",
    size: 20,
  },
] as const satisfies {
  label: string;
  icon: keyof typeof simpleIcons;
  href: string;
  size: number;
}[];

export function Socials() {
  return socials.map((social) => (
    <a
      key={social.label}
      href={social.href}
      rel="noopener noreferrer"
      target="_blank"
      className="p-1"
    >
      <SimpleIcon
        icon={social.icon}
        color="var(--color-foreground)"
        size={social.size}
      />
    </a>
  ));
}
