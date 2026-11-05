// FICHIER GÉNÉRÉ par scripts/icons/build-icons.mjs, ne pas éditer à la main.
// Icônes Hugeicons (trait arrondi 1,5, licence MIT), la bibliothèque de Boosteats.
import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function make(viewBox: string, body: string, name: string) {
  function Icon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={viewBox}
        aria-hidden={rest["aria-label"] ? undefined : true}
        focusable="false"
        dangerouslySetInnerHTML={{ __html: body }}
        {...rest}
      />
    );
  }
  Icon.displayName = name;
  return Icon;
}

/** hugeicons:arrow-down-01 */
export const ArrowDown = make("0 0 24 24", "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M18 9s-4.419 6-6 6s-6-6-6-6\"/>", "ArrowDown");
/** hugeicons:arrow-right-02 */
export const ArrowRight = make("0 0 24 24", "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M18.5 12H5m8 6s6-4.419 6-6s-6-6-6-6\"/>", "ArrowRight");
/** hugeicons:calculator-01 */
export const Calculator = make("0 0 24 24", "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linejoin=\"round\" d=\"M3 10h18\"/><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15 6h2\"/><path d=\"M21 13v-2c0-4.243 0-6.364-1.318-7.682S16.242 2 12 2S5.636 2 4.318 3.318S3 6.758 3 11v2c0 4.243 0 6.364 1.318 7.682S7.758 22 12 22s6.364 0 7.682-1.318S21 17.242 21 13Z\"/><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M7 14h.526m4.21 0h.527m4.21 0H17M7 18h.526m4.21 0h.527m4.21 0H17\"/></g>", "Calculator");
/** hugeicons:chart-column */
export const ChartColumn = make("0 0 24 24", "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M8 9v8m5-12v12m5-4v4M3 3v10c0 3.771 0 5.657 1.172 6.828S7.229 21 11 21h10\"/>", "ChartColumn");
/** hugeicons:tick-02 */
export const Check = make("0 0 24 24", "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"m5 14l3.5 3.5L19 6.5\"/>", "Check");
/** hugeicons:cancel-01 */
export const Close = make("0 0 24 24", "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M18 6L6 18m12 0L6 6\"/>", "Close");
/** hugeicons:dashboard-speed-01 */
export const Gauge = make("0 0 24 24", "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" d=\"M13.5 13L17 9m-3 6a2 2 0 1 1-4 0a2 2 0 0 1 4 0Zm-8-3a6 6 0 0 1 9-5.197\"/><path d=\"M2.5 12c0-4.478 0-6.717 1.391-8.109c1.392-1.39 3.63-1.39 8.11-1.39c4.477 0 6.717 0 8.108 1.39c1.391 1.392 1.391 3.63 1.391 8.11c0 4.477 0 6.717-1.391 8.108S16.479 21.5 12 21.5c-4.478 0-6.717 0-8.109-1.391c-1.39-1.391-1.39-3.63-1.39-8.109Z\"/></g>", "Gauge");
/** hugeicons:location-01 */
export const Location = make("0 0 24 24", "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M13.618 21.367A2.37 2.37 0 0 1 12 22a2.37 2.37 0 0 1-1.617-.633C6.412 17.626 1.09 13.447 3.685 7.38C5.09 4.1 8.458 2 12.001 2s6.912 2.1 8.315 5.38c2.592 6.06-2.717 10.259-6.698 13.987Z\"/><path d=\"M15.5 11a3.5 3.5 0 1 1-7 0a3.5 3.5 0 0 1 7 0Z\"/></g>", "Location");
/** hugeicons:search-01 */
export const Search = make("0 0 24 24", "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"m17 17l4 4m-2-10a8 8 0 1 0-16 0a8 8 0 0 0 16 0\"/>", "Search");
/** hugeicons:smartphone */
export const Smartphone = make("0 0 24 24", "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M13.493 2h-3c-2.357 0-3.536 0-4.268.733c-.732.732-.732 1.91-.732 4.267v10c0 2.358 0 3.536.732 4.268s1.91.732 4.268.732h3c2.357 0 3.536 0 4.268-.732s.732-1.91.732-4.268V7c0-2.357 0-3.535-.732-4.267S15.85 2 13.493 2\"/><path d=\"M13.993 2h-4l.223.448a1 1 0 0 0 .895.552h1.764a1 1 0 0 0 .894-.552z\"/></g>", "Smartphone");
/** hugeicons:star */
export const Star = make("0 0 24 24", "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"m13.728 3.444l1.76 3.549c.24.494.88.968 1.42 1.058l3.189.535c2.04.343 2.52 1.835 1.05 3.307l-2.48 2.5c-.42.423-.65 1.24-.52 1.825l.71 3.095c.56 2.45-.73 3.397-2.88 2.117l-2.99-1.785c-.54-.322-1.43-.322-1.98 0L8.019 21.43c-2.14 1.28-3.44.322-2.88-2.117l.71-3.095c.13-.585-.1-1.402-.52-1.825l-2.48-2.5C1.39 10.42 1.86 8.929 3.899 8.586l3.19-.535c.53-.09 1.17-.564 1.41-1.058l1.76-3.549c.96-1.925 2.52-1.925 3.47 0\"/>", "Star");
