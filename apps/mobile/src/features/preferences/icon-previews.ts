import type { ThemeId } from "./themes";
import blueDark from "../../../assets/icons/previews/blue-dark.png";
import blueLight from "../../../assets/icons/previews/blue-light.png";
import graphiteDark from "../../../assets/icons/previews/graphite-dark.png";
import graphiteLight from "../../../assets/icons/previews/graphite-light.png";
import greenDark from "../../../assets/icons/previews/green-dark.png";
import greenLight from "../../../assets/icons/previews/green-light.png";
import indigoDark from "../../../assets/icons/previews/indigo-dark.png";
import indigoLight from "../../../assets/icons/previews/indigo-light.png";
import orangeDark from "../../../assets/icons/previews/orange-dark.png";
import orangeLight from "../../../assets/icons/previews/orange-light.png";
import pinkDark from "../../../assets/icons/previews/pink-dark.png";
import pinkLight from "../../../assets/icons/previews/pink-light.png";
import purpleDark from "../../../assets/icons/previews/purple-dark.png";
import purpleLight from "../../../assets/icons/previews/purple-light.png";
import tealDark from "../../../assets/icons/previews/teal-dark.png";
import tealLight from "../../../assets/icons/previews/teal-light.png";

/**
 * Pre-masked 180px renders of each app icon's light and dark appearance,
 * made by `assets/icons/build-icons.py`.
 */
export const ICON_PREVIEWS = {
  green: { dark: greenDark, light: greenLight },
  teal: { dark: tealDark, light: tealLight },
  blue: { dark: blueDark, light: blueLight },
  indigo: { dark: indigoDark, light: indigoLight },
  purple: { dark: purpleDark, light: purpleLight },
  pink: { dark: pinkDark, light: pinkLight },
  orange: { dark: orangeDark, light: orangeLight },
  graphite: { dark: graphiteDark, light: graphiteLight },
} satisfies Record<ThemeId, { dark: unknown; light: unknown }>;
