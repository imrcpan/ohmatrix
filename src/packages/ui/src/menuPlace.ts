/** The least of a menu that is shown when it has to scroll: a few rows, so that it is still a menu. */
const MIN_VISIBLE = 120;

/**
 * Where a menu goes, and how tall it is shown. It opens below the anchor (or above it with `up`); where that side has not room for all
 * of it, the other side is used if that has; where neither has, the roomier one is used and the menu is cut to the room and scrolls.
 * It never goes past `minTop` (below the status bar) or `bottomLimit` (above the gesture bar). `above` is the side it went to.
 */
export function placeMenu(o: {
  /** The anchor's top and height, and the height all the rows come to. */
  y: number;
  height: number;
  contentHeight: number;
  up: boolean;
  minTop: number;
  bottomLimit: number;
  gap?: number;
}): { top: number; height: number; scrolls: boolean; above: boolean } {
  const gap = o.gap ?? 6;
  const spaceBelow = o.bottomLimit - (o.y + o.height + gap);
  const spaceAbove = o.y - gap - o.minTop;
  const fits = (space: number) => o.contentHeight <= space;
  let above = o.up;
  if (above ? !fits(spaceAbove) : !fits(spaceBelow)) {
    if (above ? fits(spaceBelow) : fits(spaceAbove)) above = !above;
    else above = spaceAbove > spaceBelow;
  }
  const room = above ? spaceAbove : spaceBelow;
  const height = Math.min(o.contentHeight, Math.max(room, MIN_VISIBLE));
  const wanted = above ? o.y - gap - height : o.y + o.height + gap;
  const top = Math.max(o.minTop, Math.min(wanted, o.bottomLimit - height));
  return { top, height, scrolls: height < o.contentHeight, above };
}
