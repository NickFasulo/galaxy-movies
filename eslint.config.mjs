import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'scripts/**', 'lighthouserc.cjs'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // @vercel/og renders raw HTML to an image — next/image and alt text don't apply.
    files: ['src/pages/api/og.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off'
    }
  }
]

export default eslintConfig
