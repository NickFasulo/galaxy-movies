import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Box } from '@chakra-ui/react'

const DEFAULT_BG = 'rgba(20, 24, 28, 0.9)'

function analyzeLogo(src) {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 1
      const width = Math.min(120, Math.max(64, Math.round(40 * aspect) + 8))
      const canvas = document.createElement('canvas')
      canvas.width = 32; canvas.height = 24
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (!ctx) return resolve({ width, bg: DEFAULT_BG })
      ctx.drawImage(img, 0, 0, 32, 24)

      const pixels = ctx.getImageData(0, 0, 32, 24).data
      let luminanceTotal = 0, visiblePixels = 0

      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 32) continue
        luminanceTotal += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
        visiblePixels++
      }

      const isDark = visiblePixels > 0 && (luminanceTotal / visiblePixels) < 145
      resolve({ width, bg: isDark ? 'white' : DEFAULT_BG })
    }
    img.onerror = () => resolve({ width: 64, bg: DEFAULT_BG })
    img.src = src
  })
}

export default function ProductionLogo({ company }) {
  const logoUrl = `https://image.tmdb.org/t/p/w185${company.logo_path}`
  const [{ width, bg }, setStyle] = useState({ width: 64, bg: DEFAULT_BG })

  useEffect(() => {
    let active = true
    analyzeLogo(logoUrl).then((res) => active && setStyle(res))
    return () => { active = false }
  }, [logoUrl])

  return (
    <Box position='relative' w={`${width}px`} h='48px' bg={bg} borderRadius='lg'>
      <Image
        alt={company.name}
        src={logoUrl}
        fill
        sizes={`${width - 8}px`}
        style={{ objectFit: 'contain', objectPosition: 'center', padding: '4px' }}
      />
    </Box>
  )
}