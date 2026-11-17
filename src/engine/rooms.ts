import type { FurnitureType, RoomType } from './types';

export interface RoomTypeDef {
  id: RoomType;
  name: string;
  /** Size the type is happiest at; see sizeWeight(). */
  preferredSize: number;
  /** Pastel fill: light and dark theme variants. */
  color: { light: string; dark: string };
  palette: { blocking: readonly FurnitureType[]; occupiable: readonly FurnitureType[] };
}

const pastel = (hue: number) => ({
  light: `hsl(${hue} 60% 86%)`,
  dark: `hsl(${hue} 28% 26%)`,
});

export const ROOM_TYPES: Record<RoomType, RoomTypeDef> = {
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    preferredSize: 10,
    color: pastel(40),
    palette: { blocking: ['stove', 'table', 'plant'], occupiable: ['chair', 'rug'] },
  },
  living: {
    id: 'living',
    name: 'Living Room',
    preferredSize: 15,
    color: pastel(15),
    palette: {
      blocking: ['table', 'tv', 'bookshelf', 'piano', 'plant'],
      occupiable: ['sofa', 'armchair', 'chair', 'rug'],
    },
  },
  dining: {
    id: 'dining',
    name: 'Dining Room',
    preferredSize: 11,
    color: pastel(350),
    palette: { blocking: ['table', 'plant'], occupiable: ['chair', 'rug'] },
  },
  bedroom: {
    id: 'bedroom',
    name: 'Bedroom',
    preferredSize: 10,
    color: pastel(280),
    palette: { blocking: ['wardrobe', 'tv', 'plant'], occupiable: ['bed', 'rug'] },
  },
  bathroom: {
    id: 'bathroom',
    name: 'Bathroom',
    preferredSize: 5,
    color: pastel(195),
    palette: { blocking: ['bathtub', 'plant'], occupiable: ['rug'] },
  },
  study: {
    id: 'study',
    name: 'Study',
    preferredSize: 9,
    color: pastel(220),
    palette: {
      blocking: ['table', 'bookshelf', 'plant'],
      occupiable: ['chair', 'armchair', 'rug'],
    },
  },
  library: {
    id: 'library',
    name: 'Library',
    preferredSize: 14,
    color: pastel(30),
    palette: { blocking: ['bookshelf', 'plant'], occupiable: ['chair', 'armchair', 'rug'] },
  },
  hallway: {
    id: 'hallway',
    name: 'Hallway',
    preferredSize: 5,
    color: pastel(60),
    palette: { blocking: ['plant'], occupiable: ['rug'] },
  },
  conservatory: {
    id: 'conservatory',
    name: 'Conservatory',
    preferredSize: 9,
    color: pastel(130),
    palette: { blocking: ['plant', 'piano'], occupiable: ['rug'] },
  },
  garage: {
    id: 'garage',
    name: 'Garage',
    preferredSize: 12,
    color: pastel(170),
    palette: { blocking: ['car', 'plant'], occupiable: ['rug'] },
  },
};

export const ROOM_TYPE_IDS = Object.keys(ROOM_TYPES) as RoomType[];

/** Relative likelihood (> 0) that a room of `size` cells gets this type. */
export function sizeWeight(type: RoomType, size: number): number {
  const d = (size - ROOM_TYPES[type].preferredSize) / 4;
  return 0.05 + Math.exp(-d * d);
}
