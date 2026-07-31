import type React from "react";
import * as simpleIcons from "simple-icons";

interface SimpleIconProps extends React.SVGProps<SVGSVGElement> {
  icon: keyof typeof simpleIcons;
  color?: string;
  size?: number | string;
}

export function SimpleIcon({
  icon,
  color,
  size = "1em",
  ...rest
}: SimpleIconProps) {
  const iconData = simpleIcons[icon];

  const iconColor = color ?? `#${iconData.hex}`;

  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill={iconColor}
      width={size}
      height={size}
      {...rest}
    >
      <title>{iconData.title}</title>
      <path d={iconData.path} />
    </svg>
  );
}
