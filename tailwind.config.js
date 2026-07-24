import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        safety: {
          DEFAULT: 'hsl(var(--safety))',
          foreground: 'hsl(var(--safety-foreground))',
          border: 'hsl(var(--safety-border))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Fluid type scale (Task 1 craft): overrides just these Tailwind default
      // fontSize keys with clamp()-backed CSS vars from src/index.css, so every
      // existing text-sm/base/lg/xl/2xl/3xl usage in the app scales continuously
      // with viewport width instead of jumping only at `lg`. Unlisted sizes
      // (xs, 4xl+) keep Tailwind's static defaults.
      fontSize: {
        sm: ['var(--step-sm)', { lineHeight: '1.4' }],
        base: ['var(--step-base)', { lineHeight: '1.5' }],
        lg: ['var(--step-lg)', { lineHeight: '1.5' }],
        xl: ['var(--step-xl)', { lineHeight: '1.4' }],
        '2xl': ['var(--step-2xl)', { lineHeight: '1.3' }],
        '3xl': ['var(--step-3xl)', { lineHeight: '1.2' }],
      },
      // Fluid spacing tokens for shell/panel chrome (see src/index.css) — a
      // named scale distinct from Tailwind's numeric spacing scale, applied
      // deliberately (padding/gaps on shells and panels), not globally.
      spacing: {
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
        xl: 'var(--space-xl)',
      },
      maxWidth: {
        shell: 'var(--shell-width)',
        standalone: 'var(--shell-width-standalone)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.12)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        breathe: 'breathe 4s ease-in-out infinite',
      },
      minHeight: {
        touch: '3rem',
        'touch-primary': '4rem',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
