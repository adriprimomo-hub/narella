export const designTokens = {
  colors: {
    background: 'var(--background)',
    surface: 'var(--card)',
    primary: 'var(--primary)',
    primaryForeground: 'var(--primary-foreground)',
    secondary: 'var(--secondary)',
    secondaryForeground: 'var(--secondary-foreground)',
    danger: 'var(--destructive)',
    dangerForeground: 'var(--destructive-foreground)',
    muted: 'var(--muted)',
    mutedForeground: 'var(--muted-foreground)',
    border: 'var(--border)',
    ring: 'var(--ring)',
  },
  typography: {
    fontFamily: 'var(--font-sans)',
    headingWeight: 600,
    bodySize: '15px',
    headingScale: {
      h1: '1.875rem',
      h2: '1.5rem',
      h3: '1.25rem',
    },
  },
  layout: {
    radius: 'var(--radius)',
    controlHeight: 'var(--control-height)',
    cardPadding: 'var(--card-padding)',
    gap: 'var(--gap)',
  },
} as const
