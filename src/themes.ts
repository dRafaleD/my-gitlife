export type CardThemeName = 'midnight' | 'github' | 'minimal';

export interface CardTheme {
  name: CardThemeName;
  mode: 'dark' | 'light';
  background: string;
  backgroundAlt: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accents: readonly [string, string, string, string];
}

export const CARD_THEMES: Record<CardThemeName, CardTheme> = {
  midnight: {
    name: 'midnight',
    mode: 'dark',
    background: '#0a0c10',
    backgroundAlt: '#11151c',
    surface: '#151a22',
    text: '#f4f1e9',
    muted: '#8a93a2',
    border: '#2a303a',
    accents: ['#72c78d', '#a995ed', '#72c8d5', '#ddb36a'],
  },
  github: {
    name: 'github',
    mode: 'dark',
    background: '#0d1117',
    backgroundAlt: '#111820',
    surface: '#161b22',
    text: '#f0f6fc',
    muted: '#8b949e',
    border: '#30363d',
    accents: ['#3fb950', '#a371f7', '#58a6ff', '#d29922'],
  },
  minimal: {
    name: 'minimal',
    mode: 'light',
    background: '#ffffff',
    backgroundAlt: '#f6f8fa',
    surface: '#f6f8fa',
    text: '#24292f',
    muted: '#57606a',
    border: '#d0d7de',
    accents: ['#1f883d', '#8250df', '#0969da', '#9a6700'],
  },
};

export function isCardThemeName(value: string): value is CardThemeName {
  return value === 'midnight' || value === 'github' || value === 'minimal';
}
