// Minimal stroke icon set (24px grid, currentColor) so the UI never relies on emoji for controls.
type P = { size?: number };
const S = ({ size = 22, children }: P & { children: any }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{children}</svg>
);
export const IconHelp = (p: P) => <S {...p}><circle cx="12" cy="12" r="9.5" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8" /><circle cx="12" cy="17.2" r=".6" fill="currentColor" /></S>;
export const IconArchive = (p: P) => <S {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h2M14 13.5h2M8 17h2" /></S>;
export const IconStandings = (p: P) => <S {...p}><path d="M4 20.5h16M6.5 20.5v-6h3.5v6M10 20.5V9.5h4v11M14 20.5v-8h3.5v8" /></S>;
export const IconStats = (p: P) => <S {...p}><path d="M4 19.5h16M7 16v-4M11.5 16V7M16 16v-6.5" /></S>;
export const IconClose = (p: P) => <S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>;
export const IconBack = (p: P) => <S {...p}><path d="M14.5 5.5L8 12l6.5 6.5" /></S>;
export const IconShare = (p: P) => <S {...p}><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8" /><path d="M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5" /></S>;
export const IconCopy = (p: P) => <S {...p}><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" /></S>;
export const IconLock = (p: P) => <S {...p}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></S>;
export const IconArrow = (p: P) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>;
export const IconFlame = (p: P) => <S {...p}><path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.3 2.3-5.2 3.6-7.4.4 1.9 1.4 3 2.4 3.2-.2-3.3 1.4-6 3.6-7.8.2 3 1.7 4.7 2.9 6.4A7 7 0 0 1 18.5 15c0 3.4-2.6 6-6.5 6Z" /></S>;
export const IconWhatsApp = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
);
export const IconUsers = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></S>;
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconBolt = (p: P) => <S {...p}><path d="M13 2.5L4.5 13.5H11l-1 8L19.5 10H13l1-7.5z" /></S>;
export const IconLink = (p: P) => <S {...p}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></S>;
export const IconThumbUp = (p: P) => <S {...p}><path d="M7 10.5v9H4.5v-9zM7 10.5l3.6-7a2 2 0 0 1 2.4 2.2l-.6 3.8h5.3a2 2 0 0 1 2 2.3l-1.2 6.4a2 2 0 0 1-2 1.8H7" /></S>;
export const IconThumbDown = (p: P) => <S {...p}><path d="M7 13.5v-9H4.5v9zM7 13.5l3.6 7a2 2 0 0 0 2.4-2.2l-.6-3.8h5.3a2 2 0 0 0 2-2.3l-1.2-6.4a2 2 0 0 0-2-1.8H7" /></S>;
export const IconCrown = (p: P) => <S {...p}><path d="M3.5 18.5h17M4.5 15.5L3 7l5 3.5L12 4l4 6.5L21 7l-1.5 8.5z" /></S>;
