import type { WorldBounds } from '../../shared/world.js';

export interface ArenaMapConfig {
  readonly name: string;
  readonly bounds: WorldBounds;
  readonly gridStep: number;
  readonly backgroundColor: string;
  readonly gridColor: string;
}

export const DEFAULT_ARENA_MAP: ArenaMapConfig = {
  name: 'Deep Space Sector',
  bounds: { width: 800, height: 600 },
  gridStep: 50,
  backgroundColor: '#030712',
  gridColor: 'rgba(30, 41, 59, 0.45)'
};

export function isInsideBounds(x: number, y: number, bounds: WorldBounds, margin = 0): boolean {
  return (
    x >= margin &&
    x <= bounds.width - margin &&
    y >= margin &&
    y <= bounds.height - margin
  );
}