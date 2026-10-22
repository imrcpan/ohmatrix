import { useEffect, useRef, useState } from "react";
import { Image, PanResponder, Platform, View } from "react-native";
import type { Sticker } from "@ohmatrix/core";
import { useTheme } from "@ohmatrix/ui";
import { dropIndex } from "./dropIndex.js";
import { STICKER_GAP, STICKER_PAD, STICKER_TILE } from "./stickerGrid.js";
import { useMediaUrl } from "../useMedia.js";

const PITCH = STICKER_TILE + STICKER_GAP;

/** Where the cell `index` is: its left and top, in a grid of `cols` columns. */
const cellAt = (index: number, cols: number) => ({ x: STICKER_PAD + (index % cols) * PITCH, y: STICKER_PAD + Math.floor(index / cols) * PITCH });

interface PointerLike {
  type: string;
  clientX: number;
  clientY: number;
  button: number;
  preventDefault(): void;
}

function Cell(props: {
  sticker: Sticker;
  index: number;
  cols: number;
  count: number;
  dragging: boolean;
  offset: { dx: number; dy: number };
  onStart: () => void;
  onMove: (dx: number, dy: number, to: number) => void;
  onDrop: (to: number) => void;
}) {
  const animated = props.sticker.mimeType === "image/gif" || props.sticker.mimeType === "image/webp";
  const uri = useMediaUrl(props.sticker.url, animated ? {} : { width: STICKER_TILE * 2, height: STICKER_TILE * 2, fit: "scale" });
  const latest = useRef(props);
  latest.current = props;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => latest.current.onStart(),
      onPanResponderMove: (_e, g) => {
        const p = latest.current;
        const at = cellAt(p.index, p.cols);
        p.onMove(g.dx, g.dy, dropIndex(at.x + g.dx, at.y + g.dy, p.cols, p.count));
      },
      onPanResponderRelease: (_e, g) => {
        const p = latest.current;
        const at = cellAt(p.index, p.cols);
        p.onDrop(dropIndex(at.x + g.dx, at.y + g.dy, p.cols, p.count));
      },
      onPanResponderTerminate: () => latest.current.onDrop(latest.current.index),
    }),
  ).current;
  const at = cellAt(props.index, props.cols);
  // On the web the mouse is followed with pointer events (the responder system does not take a mouse drag here), and the page's own text
  // selection is switched off for the cell; the phone has the pan responder.
  const node = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = node.current as unknown as {
      addEventListener(t: string, f: (e: PointerLike) => void): void;
      removeEventListener(t: string, f: (e: PointerLike) => void): void;
    } | null;
    if (!el) return;
    const win = globalThis as unknown as {
      addEventListener(t: string, f: (e: PointerLike) => void): void;
      removeEventListener(t: string, f: (e: PointerLike) => void): void;
    };
    const down = (e: PointerLike) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const start = cellAt(latest.current.index, latest.current.cols);
      latest.current.onStart();
      const to = (ev: PointerLike) => {
        const p = latest.current;
        return { dx: ev.clientX - x0, dy: ev.clientY - y0, to: dropIndex(start.x + ev.clientX - x0, start.y + ev.clientY - y0, p.cols, p.count) };
      };
      const move = (ev: PointerLike) => {
        const m = to(ev);
        latest.current.onMove(m.dx, m.dy, m.to);
      };
      const end = (ev: PointerLike) => {
        win.removeEventListener("pointermove", move);
        win.removeEventListener("pointerup", end);
        win.removeEventListener("pointercancel", end);
        latest.current.onDrop(ev.type === "pointercancel" ? latest.current.index : to(ev).to);
      };
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", end);
      win.addEventListener("pointercancel", end);
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, []);
  return (
    <View
      ref={node}
      {...(Platform.OS === "web" ? {} : pan.panHandlers)}
      accessibilityLabel={props.sticker.shortcode}
      {...({ dataSet: { reorderCell: "1" } } as object)}
      style={[
        {
          position: "absolute",
          left: at.x,
          top: at.y,
          width: STICKER_TILE,
          height: STICKER_TILE,
          borderRadius: 10,
          cursor: props.dragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
          zIndex: props.dragging ? 2 : 1,
          opacity: props.dragging ? 0.85 : 1,
          transform: props.dragging ? [{ translateX: props.offset.dx }, { translateY: props.offset.dy }, { scale: 1.06 }] : [],
        } as object,
      ]}
    >
      {uri ? <Image source={{ uri }} resizeMode="contain" style={{ flex: 1, margin: 4 }} {...({ draggable: false } as object)} /> : null}
    </View>
  );
}

/**
 * The stickers of a group laid out for reordering: each is dragged (a press and a move, with a mouse or a finger) to where it should go,
 * and dropped. The cell it would take is shaded while it is over it. `onMove(from, to)` is called once, on the drop.
 */
export function StickerReorder(props: { stickers: readonly Sticker[]; width: number; onMove: (from: number, to: number) => void }) {
  const cols = Math.max(1, Math.floor((props.width - 2 * STICKER_PAD + STICKER_GAP) / PITCH));
  const [drag, setDrag] = useState<{ from: number; dx: number; dy: number; to: number } | null>(null);
  const rows = Math.max(1, Math.ceil(props.stickers.length / cols));
  const { colors } = useTheme();
  // Where the dragged tile would land, drawn as a bar in the accent colour: before the tile it would take the place of when it goes back,
  // after it when it goes forward (the same as `moveItem`).
  const line =
    drag && drag.to !== drag.from
      ? (() => {
          const at = cellAt(drag.to, cols);
          return { x: (drag.to > drag.from ? at.x + STICKER_TILE + STICKER_GAP / 2 : at.x - STICKER_GAP / 2) - 1.5, y: at.y };
        })()
      : null;
  return (
    <View style={{ height: STICKER_PAD * 2 + rows * PITCH - STICKER_GAP, width: "100%" }}>
      {line && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: line.x,
            top: line.y,
            width: 3,
            height: STICKER_TILE,
            borderRadius: 1.5,
            backgroundColor: colors.accent,
            zIndex: 3,
          }}
        />
      )}
      {props.stickers.map((s, i) => (
        <Cell
          key={s.shortcode}
          sticker={s}
          index={i}
          cols={cols}
          count={props.stickers.length}
          dragging={drag?.from === i}
          offset={drag?.from === i ? drag : { dx: 0, dy: 0 }}
          onStart={() => setDrag({ from: i, dx: 0, dy: 0, to: i })}
          onMove={(dx, dy, to) => setDrag({ from: i, dx, dy, to })}
          onDrop={(to) => {
            setDrag(null);
            if (to !== i) props.onMove(i, to);
          }}
        />
      ))}
    </View>
  );
}
