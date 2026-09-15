import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Box } from '@chakra-ui/react'

const DEFAULT_BACKGROUND = 'rgba(20, 24, 28, 0.9)'
const LOGO_HEIGHT = 48
const LOGO_PADDING = 4
const MIN_LOGO_WIDTH = 64
const MAX_LOGO_WIDTH = 240

export default function ProductionLogo({ company }) {
  const logoUrl = `https://image.tmdb.org/t/p/w185${company.logo_path}`
  const [background, setBackground] = useState(DEFAULT_BACKGROUND)
  const [width, setWidth] = useState(MIN_LOGO_WIDTH)

  useEffect(() => {
    const logoImage = new window.Image()
    logoImage.crossOrigin = 'anonymous'
    logoImage.onload = () => {
      const aspectRatio = logoImage.naturalWidth / logoImage.naturalHeight
      if (aspectRatio > 0) {
        setWidth(Math.min(
          MAX_LOGO_WIDTH,
          Math.max(MIN_LOGO_WIDTH, Math.round((LOGO_HEIGHT - (LOGO_PADDING * 2)) * aspectRatio) + (LOGO_PADDING * 2))
        ))
      }

      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 24
      const context = canvas.getContext('2d')
      if (!context) return

      try {
        context.drawImage(logoImage, 0, 0, canvas.width, canvas.height)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let luminanceTotal = 0
        let visiblePixels = 0

        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] < 32) continue

          luminanceTotal += (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114)
          visiblePixels += 1
        }

        if (visiblePixels > 0) {
          setBackground(luminanceTotal / visiblePixels < 145 ? 'white' : DEFAULT_BACKGROUND)
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error
      }
    }
    logoImage.src = logoUrl

    return () => {
      logoImage.onload = null
    }
  }, [logoUrl])

  return (
    <Box position='relative' w={`${width}px`} h={`${LOGO_HEIGHT}px`} bg={background} borderRadius='lg'>
      <Image
        alt={company.name}
        src={logoUrl}
        fill
        sizes={`${width - (LOGO_PADDING * 2)}px`}
        style={{
          objectFit: 'contain',
          objectPosition: 'center',
          padding: `${LOGO_PADDING}px`
        }}
      />
    </Box>
  )
}
