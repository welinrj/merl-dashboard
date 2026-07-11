// Ported from the Efferd registry block dependency "@efferd/decor-icon"
// (efferd.com). Decorative "+" marker pinned to a cell corner so it sits
// exactly on the grid-line intersection of a bordered logo grid. Adapted from
// the shadcn/ui original: cva/cn replaced with a plain position map, and
// stroke-muted-foreground mapped to the portal's gray scale.
const POSITION = {
  'top-left':     'top-0 left-0 -translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)]',
  'top-right':    'top-0 right-0 translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)]',
  'bottom-right': 'right-0 bottom-0 translate-x-[calc(50%+0.5px)] translate-y-[calc(50%+0.5px)]',
  'bottom-left':  'bottom-0 left-0 -translate-x-[calc(50%+0.5px)] translate-y-[calc(50%+0.5px)]',
};

export default function DecorIcon({ position = 'top-left', className = '', ...props }) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute z-[1] w-5 h-5 shrink-0 stroke-1 text-gray-300 ${POSITION[position]} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
