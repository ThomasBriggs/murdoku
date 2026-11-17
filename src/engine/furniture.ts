import type { FurnitureType, RoomType } from './types';

export interface FurnitureDef {
  id: FurnitureType;
  label: string;
  /** Indefinite article for clue text. */
  article: 'a' | 'an';
  occupiable: boolean;
  /** Room types it may appear in, or 'any'. */
  rooms: readonly RoomType[] | 'any';
  /** Verb phrase for "on" clues; null for blocking furniture. */
  verb: string | null;
}

export const FURNITURE: Record<FurnitureType, FurnitureDef> = {
  chair: {
    id: 'chair',
    label: 'Chair',
    article: 'a',
    occupiable: true,
    rooms: ['kitchen', 'dining', 'study', 'library', 'living'],
    verb: 'sitting on',
  },
  armchair: {
    id: 'armchair',
    label: 'Armchair',
    article: 'an',
    occupiable: true,
    rooms: ['living', 'library', 'study'],
    verb: 'sitting on',
  },
  sofa: {
    id: 'sofa',
    label: 'Sofa',
    article: 'a',
    occupiable: true,
    rooms: ['living'],
    verb: 'sitting on',
  },
  bed: {
    id: 'bed',
    label: 'Bed',
    article: 'a',
    occupiable: true,
    rooms: ['bedroom'],
    verb: 'lying on',
  },
  rug: {
    id: 'rug',
    label: 'Rug',
    article: 'a',
    occupiable: true,
    rooms: 'any',
    verb: 'standing on',
  },
  table: {
    id: 'table',
    label: 'Table',
    article: 'a',
    occupiable: false,
    rooms: ['kitchen', 'dining', 'study', 'living'],
    verb: null,
  },
  plant: { id: 'plant', label: 'Plant', article: 'a', occupiable: false, rooms: 'any', verb: null },
  bookshelf: {
    id: 'bookshelf',
    label: 'Bookshelf',
    article: 'a',
    occupiable: false,
    rooms: ['library', 'study', 'living'],
    verb: null,
  },
  wardrobe: {
    id: 'wardrobe',
    label: 'Wardrobe',
    article: 'a',
    occupiable: false,
    rooms: ['bedroom'],
    verb: null,
  },
  tv: {
    id: 'tv',
    label: 'Television',
    article: 'a',
    occupiable: false,
    rooms: ['living', 'bedroom'],
    verb: null,
  },
  stove: {
    id: 'stove',
    label: 'Stove',
    article: 'a',
    occupiable: false,
    rooms: ['kitchen'],
    verb: null,
  },
  bathtub: {
    id: 'bathtub',
    label: 'Bathtub',
    article: 'a',
    occupiable: false,
    rooms: ['bathroom'],
    verb: null,
  },
  piano: {
    id: 'piano',
    label: 'Piano',
    article: 'a',
    occupiable: false,
    rooms: ['living', 'conservatory'],
    verb: null,
  },
  car: { id: 'car', label: 'Car', article: 'a', occupiable: false, rooms: ['garage'], verb: null },
};

export const FURNITURE_TYPES = Object.keys(FURNITURE) as FurnitureType[];

export function isOccupiable(type: FurnitureType): boolean {
  return FURNITURE[type].occupiable;
}

export function canPlaceIn(type: FurnitureType, room: RoomType): boolean {
  const rooms = FURNITURE[type].rooms;
  return rooms === 'any' || rooms.includes(room);
}
