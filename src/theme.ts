export const theme = {
  colors: {
    bg: '#0d0f12',
    card: '#171a1f',
    cardAlt: '#1f242b',
    line: '#2a3038',
    text: '#f2f4f7',
    textDim: '#98a2b3',
    ambient: '#ff8a4c',
    meat: '#4cc2ff',
    target: '#7dd67d',
    danger: '#ff5c5c',
    warn: '#ffcc4d',
    accent: '#ff8a4c',
  },
  radius: 16,
  space: (n: number) => n * 4,
  font: {
    h1: 28,
    h2: 22,
    big: 46,
    body: 15,
    small: 13,
  },
} as const;

export type Theme = typeof theme;
