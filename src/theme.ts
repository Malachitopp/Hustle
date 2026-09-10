/** The black 8-bit look shared by every screen. */
export const colors = {
  background: '#000000',
  text: '#FFFFFF',
  muted: '#8A8A8A',
  /** The Home header and the main button. */
  yellow: '#FFE94A',
  /** Ending a session. */
  red: '#FF5A5A',
} as const;

export const fonts = {
  /** Headings, buttons and the Home header. Loaded in the root layout. */
  pixel: 'PressStart2P_400Regular',
  /** Small, readable text. */
  body: 'VT323_400Regular',
} as const;
