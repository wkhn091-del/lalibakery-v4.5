// אייקונים בקו אחיד, צבע לפי currentColor
type P = { size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const PhoneIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
);
export const MailIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>
);
export const PinIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
);
export const InstagramIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" /></svg>
);
export const FacebookIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M14.5 8H17V4.5h-2.5a4 4 0 0 0-4 4V11H8v3.5h2.5V21H14v-6.5h2.6L17 11h-3V8.9c0-.5.2-.9.5-.9Z" /></svg>
);
export const TikTokIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8" /><path d="M14 3.5c.4 2.6 2.2 4.4 5 4.6" /></svg>
);
export const ArrowUpIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const PauseIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}><path d="M9 5v14M15 5v14" /></svg>
);
export const PlayIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}><path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" /></svg>
);
