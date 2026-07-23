/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                background: {
                    deep: "rgb(var(--background-deep) / <alpha-value>)",
                    base: "rgb(var(--background-base) / <alpha-value>)",
                    elevated: "rgb(var(--background-elevated) / <alpha-value>)",
                },
                foreground: {
                    DEFAULT: "rgb(var(--foreground-base) / <alpha-value>)",
                    muted: "rgb(var(--foreground-muted) / <alpha-value>)",
                    subtle: "rgba(var(--foreground-subtle) / 0.6)",
                },
                surface: {
                    DEFAULT: "rgba(var(--surface-base) / 0.05)",
                    hover: "rgba(var(--surface-hover) / 0.08)",
                },
                border: {
                    DEFAULT: "rgba(var(--border-base) / 0.1)",
                    hover: "rgba(var(--border-hover) / 0.2)",
                    accent: "rgba(var(--border-accent) / 0.3)",
                },
                accent: {
                    DEFAULT: "rgb(var(--accent-base) / <alpha-value>)",
                    bright: "rgb(var(--accent-bright) / <alpha-value>)",
                    glow: "rgba(var(--accent-base) / 0.3)",
                }
            },
            fontFamily: {
                sans: ["Inter", "Geist Sans", "system-ui", "sans-serif"],
                mono: ["Geist Mono", "monospace"],
            },
            animation: {
                blob: "blob 10s infinite",
            },
            keyframes: {
                blob: {
                    "0%, 100%": {
                        transform: "translate(0, 0) scale(1)",
                    },
                    "33%": {
                        transform: "translate(30px, -50px) scale(1.1)",
                    },
                    "66%": {
                        transform: "translate(-20px, 20px) scale(0.9)",
                    },
                },
            },
            boxShadow: {
                // Neumorphism Shadows (Light Mode only - variables become 0/0/0 in dark mode)
                'neu': '9px 9px 16px rgba(var(--shadow-dark), 0.6), -9px -9px 16px rgba(var(--shadow-light), 0.5)',
                'neu-hover': '12px 12px 20px rgba(var(--shadow-dark), 0.7), -12px -12px 20px rgba(var(--shadow-light), 0.6)',
                'neu-pressed': 'inset 6px 6px 10px rgba(var(--shadow-dark), 0.6), inset -6px -6px 10px rgba(var(--shadow-light), 0.5)',
                'neu-deep': 'inset 10px 10px 20px rgba(var(--shadow-dark), 0.7), inset -10px -10px 20px rgba(var(--shadow-light), 0.6)',

                // Existing Linear Glows (Dark Mode primarily)
                'glow': '0 0 20px rgba(94, 106, 210, 0.35)',
                'inner-light': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
            }
        },
    },
    plugins: [],
}
