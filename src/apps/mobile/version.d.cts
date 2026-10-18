export const ABIS: Record<string, number>;
export function parseVersion(version: string): { major: number; minor: number; patch: number };
export function versionCodeOf(version: string, abi?: string): number;
