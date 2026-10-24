/**
 * The phone's SVG renderer draws `feDropShadow` wrongly (a blurred dark silhouette beside the white shapes), so there the shadow is left out;
 * the browser draws the logo as it is.
 */
export function withoutFilters(xml: string): string {
  return xml.replace(/\sfilter="[^"]*"/g, "");
}
