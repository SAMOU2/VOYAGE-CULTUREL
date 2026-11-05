import type { SVGProps } from 'react'

export type IconName =
  | 'globe'
  | 'arrow'
  | 'expand'
  | 'shrink'
  | 'pin'
  | 'check'
  | 'close'
  | 'trophy'
  | 'spark'
  | 'bulb'
  | 'next'
  | 'user'
  | 'reset'
  | 'plus'
  | 'minus'
  | 'sound'
  | 'link'
  | 'clock'
  | 'settings'
  | 'play'
  | 'pause'
  | 'keyboard'
  | 'backspace'
  | 'back'
  | 'info'
  | 'chevron'
  | 'swap'
const paths: Record<IconName, string> = {
  globe:
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  shrink: 'M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  trophy: 'M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v7m-4 2h8',
  spark: 'm12 3 2.6 5.4 6 .9-4.3 4.2 1 6-5.3-2.9-5.3 2.9 1-6L2.4 9.3l6-.9L12 3Z',
  bulb: 'M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z',
  next: 'm5 4 11 8L5 20V4Zm14 0v16',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  reset: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sound: 'm11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  play: 'm8 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  keyboard: 'M3 5h18v14H3V5Zm3 4h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10',
  backspace: 'm9 5-7 7 7 7h12V5H9Zm3 4 6 6m-6 0 6-6',
  back: 'M19 12H5m6-6-6 6 6 6',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6m0-10v1',
  chevron: 'm6 9 6 6 6-6',
  swap: 'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4',
}
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  )
}
