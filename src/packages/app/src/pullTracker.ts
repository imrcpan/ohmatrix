export interface Touch {
  identifier: string | number;
  pageY: number;
}

/**
 * Follows one finger down a pull, and hands over to another when it lifts: the pull is the finger's travel added up, so the next finger
 * continues from where the pull is rather than from where it touched. A finger that lands while another is down is only noticed when
 * the first one lifts.
 */
export function pullTracker() {
  let id: string | number | null = null;
  let last = 0;
  let travel = 0;
  return {
    begin(touches: readonly Touch[], from: number): void {
      const t = touches[0];
      id = t ? t.identifier : null;
      last = t ? t.pageY : 0;
      travel = from;
    },
    move(touches: readonly Touch[]): number {
      const t = touches.find((x) => x.identifier === id);
      if (t) {
        travel += t.pageY - last;
        last = t.pageY;
      } else if (touches[0]) {
        id = touches[0].identifier;
        last = touches[0].pageY;
      }
      return travel;
    },
  };
}
