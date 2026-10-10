import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  { ignores: ['.next/**', '.vercel/**', 'node_modules/**', 'next-env.d.ts', 'scripts/**', 'lighthouserc.cjs'] },
  ...coreWebVitals,
  ...typescript,
  {
    // next/og renders raw HTML to an image — next/image and alt text don't apply.
    files: ['src/pages/api/og.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off'
    }
  }
]

export default eslintConfig
