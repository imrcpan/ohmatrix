import Svg, { Path } from "react-native-svg";

const PATHS = {
  back: "M15 5l-7 7 7 7",
  chevronDown: "M5 9l7 7 7-7",
  chevronRight: "M9 5l7 7-7 7",
  send: "M12 19V5M5 12l7-7 7 7",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.5-4.5",
  signOut: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  checks: "M2 12.5l4.5 4.5L16 7.5M10 15.5l1.5 1.5L21 7.5",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  alert: "M12 8v5M12 16.5h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  close: "M6 6l12 12M18 6L6 18",
  reply: "M9 14L4 9l5-5M4 9h10a6 6 0 016 6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  attach: "M21 11.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8",
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5",
  plus: "M12 5v14M5 12h14",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8",
  hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
  lock: "M7 11V7a5 5 0 0110 0v4M5 11h14v10H5z",
  pin: "M9 3h6M10 3v6l-3 4h10l-3-4V3M12 13v8",
  mailUnread: "M4 6h16v12H4zM4 7l8 6 8-6",
  info: "M12 16v-4M12 8h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  device: "M4 6h16v10H4zM2 20h20M9 16v4M15 16v4",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  bellOff: "M13.7 21a2 2 0 01-3.4 0M18.6 13A17.9 17.9 0 0118 8a6 6 0 00-9.3-5M6.3 6.3A6 6 0 006 8c0 7-3 9-3 9h14M1 1l22 22",
  userPlus: "M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6",
  image: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21",
  trash: "M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6",
  zoomIn: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35M11 8v6M8 11h6",
  zoomOut: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35M8 11h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  chat: "M20 12a8 8 0 01-11.7 7.1L4 20l.9-4.3A8 8 0 1120 12z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const s = props.size ?? 22;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d={PATHS[props.name]} stroke={props.color} strokeWidth={props.strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
