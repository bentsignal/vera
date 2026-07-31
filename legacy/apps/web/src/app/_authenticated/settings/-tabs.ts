import { Mail, SlidersHorizontal, User } from "lucide-react";

export const settingsTabs = [
  [
    {
      label: "Preferences",
      href: "/settings/preferences",
      icon: SlidersHorizontal,
    },
    {
      label: "Account",
      href: "/settings/account",
      icon: User,
    },
  ],
  [
    {
      label: "Contact",
      href: "/settings/contact",
      icon: Mail,
    },
  ],
];
