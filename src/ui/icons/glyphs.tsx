import type { SVGProps } from 'react';

type P = Omit<SVGProps<SVGSVGElement>, 'children'>;
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export const DaggerIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 2l2.5 12h-5zM7 14h10M12 14v8" />
  </svg>
);
export const WarningIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l10 18H2zM12 10v5M12 18v.5" />
  </svg>
);
export const UndoIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);
export const RedoIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
  </svg>
);
export const ResetIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5" />
  </svg>
);
export const GearIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </svg>
);
export const WrongIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/* Tool palette icons (24x24, stroke = currentColor). */
export const PlaceIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </svg>
);
export const PencilIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4" strokeDasharray="0" />
  </svg>
);
export const CrossIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" strokeWidth={2.6} />
  </svg>
);
export const DotIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
  </svg>
);
export const QuestionIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 9a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.2-1.6 2.5M12 18v.5" strokeWidth={2.4} />
  </svg>
);
export const NotesIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" strokeWidth={1.4} />
  </svg>
);
export const EliminateIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M6.3 17.7L17.7 6.3" />
  </svg>
);
export const HighlightIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 4l6 6-8 8H8l-4-4v-3zM12 6l6 6M4 21h8" />
  </svg>
);
export const EraseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 5H9l-6 7 6 7h12zM12 9l6 6M18 9l-6 6" />
  </svg>
);
export const SelectIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" strokeDasharray="3 3" />
  </svg>
);
export const DrawIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 17c3-8 5 2 8-4s3-6 5-4M14 21l7-7-3-3-7 7v3z" />
  </svg>
);
export const HintIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);
export const FlagIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);
export const StrikeIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h10M4 17h14M3 12h18" />
  </svg>
);

export const PlusIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const ShareIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);
export const StatsIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 20V11M12 20V4M19 20v-6" />
  </svg>
);

export const NotepadIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M15 3v4h4M8.5 12h7M8.5 16h5" strokeWidth={1.7} />
  </svg>
);
