import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Box } from '@chakra-ui/react'
import { tmdbImage } from '../utils/site'
import type { ProductionCompany } from '../types/tmdb'

const DEFAULT_BG = 'rgba(20, 24, 28, 0.9)'

interface LogoStyle {
  width: number
  bg: string
}

function analyzeLogo(src: string | null): Promise<LogoStyle> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 1
      const width = Math.min(96, Math.max(52, Math.round(30 * aspect) + 8))
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
    img.src = String(src)
  })
}

export default function ProductionLogo({ company }: { company: Pick<ProductionCompany, 'name' | 'logo_path'> }) {
  const logoPath = company.logo_path
  const logoUrl = tmdbImage(logoPath, 'w185') ?? null
  const [{ width, bg }, setStyle] = useState({ width: 64, bg: DEFAULT_BG })

  useEffect(() => {
    let active = true
    analyzeLogo(logoUrl).then((res) => active && setStyle(res))
    return () => { active = false }
  }, [logoUrl])

  return (
    <Box position='relative' w={`${width}px`} h='36px' bg={bg} borderRadius='sm'>
      <Image
        alt={company.name}
        src={logoPath ?? ''}
        fill
        sizes={`${width - 8}px`}
        style={{ objectFit: 'contain', objectPosition: 'center', padding: '4px' }}
      />
    </Box>
  )
}