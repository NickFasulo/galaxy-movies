import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

const fontStack = "'Inter', 'Inter Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

const config = defineConfig({
  globalCss: {
    body: {
      bg: 'surface.canvas',
      color: 'white'
    }
  },
  theme: {
    tokens: {
      colors: {
        surface: {
          canvas: { value: '#14181c' },
          raised: { value: '#1f252b' },
          overlay: { value: '#2a3138' },
          deep: { value: '#001e2e' }
        },
        brand: {
          accent: { value: '#2b6cb0' },
          accentHover: { value: '#2c5282' }
        }
      },
      fonts: {
        heading: { value: fontStack },
        body: { value: fontStack },
        display: { value: "'SpaceRanger', 'Inter', Arial, sans-serif" }
      }
    },
    semanticTokens: {
      colors: {
        'border.subtle': { value: '{colors.whiteAlpha.200}' }
      }
    }
  }
})

export const system = createSystem(defaultConfig, config)
