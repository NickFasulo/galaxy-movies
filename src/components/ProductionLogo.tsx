import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Box } from '@chakra-ui/react'
import { tmdbImage } from '../utils/site'
import type { ProductionCompany } from '../types/tmdb'

export default function ProductionLogo({ company }: { company: Pick<ProductionCompany, 'name' | 'logo_path'> }) {
  const logoPath = company.logo_path
  const logoUrl = tmdbImage(logoPath, 'w185') ?? null
  const [width, setWidth] = useState(64)

  // TMDB serves no CORS headers, so canvas-based luminance detection can't
  // work — logo chips are white (matching the org page) since TMDB logos are
  // almost always dark-on-transparent.
  useEffect(() => {
    if (!logoUrl) return
    let active = true
    const img = new window.Image()
    img.onload = () => {
      if (!active) return
      const aspect = img.naturalWidth / img.naturalHeight || 1
      setWidth(Math.min(96, Math.max(52, Math.round(30 * aspect) + 8)))
    }
    img.src = logoUrl
    return () => { active = false }
  }, [logoUrl])

  return (
    <Box position='relative' w={`${width}px`} h='36px' bg='white' borderRadius='sm'>
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
