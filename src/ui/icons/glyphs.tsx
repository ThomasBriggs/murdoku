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
