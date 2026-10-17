// A small, consistent icon set: 16px grid, 1.6 stroke, round caps.
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 3.5v9M3.5 8h9" /></Svg>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" /></Svg>
);
export const ArrowUpRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5.5 10.5l5-5M6 5.5h4.5V10" /></Svg>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" /></Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="m3.5 8.5 3 3 6-7" /></Svg>
);
export const UploadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 10.5V3M5 6l3-3 3 3M3 10.5v1.5A1.5 1.5 0 0 0 4.5 13.5h7A1.5 1.5 0 0 0 13 12v-1.5" /></Svg>
);
export const SparkIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 2.5v2.5M8 11v2.5M2.5 8H5M11 8h2.5M4.3 4.3l1.5 1.5M10.2 10.2l1.5 1.5M4.3 11.7l1.5-1.5M10.2 5.8l1.5-1.5" /></Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></Svg>
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.6.6M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.6-.6" /></Svg>
);
export const XIcon = (p: IconProps) => (
  <Svg {...p}><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></Svg>
);
export const InfoIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 7.25V11M8 5.25v.01" /></Svg>
);
export const DocIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 2.5H5A1.5 1.5 0 0 0 3.5 4v8A1.5 1.5 0 0 0 5 13.5h6a1.5 1.5 0 0 0 1.5-1.5V6L9 2.5Z" /><path d="M9 2.5V6h3.5M6 9h4M6 11h2.5" /></Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3 3" /></Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2.75" y="3.5" width="10.5" height="10" rx="1.5" /><path d="M2.75 6.75h10.5M5.5 2.25v2.5M10.5 2.25v2.5" /></Svg>
);
export const BoardIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="2.75" width="3.25" height="10.5" rx="1" /><rect x="7.25" y="2.75" width="3.25" height="7" rx="1" /><path d="M12.5 2.75v5" /></Svg>
);
export const ListIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5.75 4.5h7.5M5.75 8h7.5M5.75 11.5h7.5M2.75 4.5h.01M2.75 8h.01M2.75 11.5h.01" /></Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9.5 4 5.5 8l4 4" /></Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="m6.5 4 4 4-4 4" /></Svg>
);

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6.5" fill="var(--accent)" />
      <path
        d="M7 16.5V7.5M7 12h5.5a2.25 2.25 0 0 0 0-4.5H11M12.5 12l4.5 4.5"
        stroke="var(--on-accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
