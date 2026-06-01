import {h} from 'preact';

function Svg({size = 14, sw = 2, fill, children}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill || 'none'}
      stroke="currentColor"
      stroke-width={sw}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconX({size}) {
  return <Svg size={size}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
}
export function IconPlus({size}) {
  return <Svg size={size}><path d="M12 5v14M5 12h14" /></Svg>;
}
export function IconRefreshCw({size}) {
  return <Svg size={size}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></Svg>;
}
export function IconSearch({size}) {
  return <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
}
export function IconPlay({size}) {
  return <Svg size={size} fill="currentColor" sw={0}><path d="M6 4.5v15l13-7.5z" /></Svg>;
}
export function IconSquare({size}) {
  return <Svg size={size} fill="currentColor" sw={0}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>;
}
export function IconTerminal({size}) {
  return <Svg size={size}><path d="m6 9 3 3-3 3M13 15h5" /><rect x="3" y="4" width="18" height="16" rx="2" /></Svg>;
}
export function IconDatabase({size}) {
  return <Svg size={size}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Svg>;
}
export function IconMoreHorizontal({size = 14}) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
export function IconCopy({size}) {
  return <Svg size={size}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Svg>;
}
export function IconCheck({size}) {
  return <Svg size={size}><path d="M20 6 9 17l-5-5" /></Svg>;
}
export function IconTrash2({size}) {
  return <Svg size={size}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></Svg>;
}
export function IconPackage({size}) {
  return <Svg size={size}><path d="m12 2 8 4.6v9.2L12 22l-8-4.6V6.6z" /><path d="m4 7 8 4.6 8-4.6M12 22v-9.6" /></Svg>;
}
export function IconKey({size}) {
  return <Svg size={size}><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2M16 6l2 2M14 8l2 2" /></Svg>;
}
export function IconRotateCcw({size}) {
  return <Svg size={size}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></Svg>;
}
export function IconBarChart2({size}) {
  return <Svg size={size}><path d="M18 20V10M12 20V4M6 20v-6" /></Svg>;
}
export function IconFolder({size}) {
  return <Svg size={size}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>;
}
export function IconBranch({size}) {
  return <Svg size={size}><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="8" r="2.4" /><path d="M6 8.4v7.2M18 10.4c0 3-3 4-6 4.6" /></Svg>;
}
export function IconSun({size}) {
  return <Svg size={size}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
}
export function IconMoon({size}) {
  return <Svg size={size}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>;
}
export function IconActivity({size}) {
  return <Svg size={size}><path d="M3 12h4l3 8 4-16 3 8h4" /></Svg>;
}
export function IconChevronDown({size}) {
  return <Svg size={size}><path d="m6 9 6 6 6-6" /></Svg>;
}
export function IconAlertTriangle({size}) {
  return <Svg size={size}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Svg>;
}
export function IconGitCommit({size}) {
  return <Svg size={size}><circle cx="12" cy="12" r="3.2" /><path d="M3 12h5.8M15.2 12H21" /></Svg>;
}
export function IconFile({size}) {
  return <Svg size={size}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>;
}
export function IconStethoscope({size}) {
  return <Svg size={size}><path d="M4 3v6a4 4 0 0 0 8 0V3M5 3H3M13 3h-2M8 17a5 5 0 0 0 10 0v-1" /><circle cx="19" cy="13" r="2" /></Svg>;
}
