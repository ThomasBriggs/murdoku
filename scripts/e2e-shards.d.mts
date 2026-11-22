export const WEIGHTS: Record<string, number>;
export const DEFAULT_WEIGHT: number;
export const EXCLUDED: string[];
export function listSpecs(): string[];
export function splitSpecs(specs: string[], total: number): { specs: string[]; weight: number }[];
