import { useEffect, useState } from 'react'
import Image from 'next/image'
import NextLink from 'next/link'
import { Avatar, Box } from '@chakra-ui/react'
import { tmdbImage } from '../../../lib/site'
import type { ProductionCompany } from '../../../types/tmdb'

export function ActorAvatar({ profilePath, name }: { profilePath?: string | null; name?: string }) {
  const [hasError, setHasError] = useState(false)

  const imageSrc = !hasError && tmdbImage(profilePath, 'w185') || '/profile_fallback.webp'

  return (
    <Avatar.Root
      size='xs'
      onError={() => setHasError(true)}
      bg='gray.600'
      color='white'
      fontSize='10px'>
      <Avatar.Fallback name={name} />
      <Avatar.Image src={imageSrc} />
    </Avatar.Root>
  );
}

type LogoCompany = Pick<ProductionCompany, 'name' | 'logo_path'>

export function ProductionLogo({ company }: { company: LogoCompany }) {
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

export function CompanyLogoLink({
  href,
  company
}: {
  href: string
  company: LogoCompany
}) {
  return (
    <NextLink href={href} passHref>
      <Box
        as='span'
        cursor='pointer'
        transition='all 0.2s ease-in-out'
        _hover={{ transform: 'scale(1.05)', opacity: 0.9 }}
      >
        <ProductionLogo company={company} />
      </Box>
    </NextLink>
  );
}
