import { skeletonHeight } from "./ChatSkeleton.js";

/** How many skeleton bubbles stand above the oldest message while older history is fetched, and how tall they are together. */
export const OLDER_SKELETON = 4;
export const OLDER_SKELETON_HEIGHT = skeletonHeight(OLDER_SKELETON);
