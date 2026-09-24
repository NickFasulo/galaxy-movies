import { useState } from 'react'
import { Avatar } from '@chakra-ui/react'

export default function ActorAvatar({ profilePath, name }) {
  const [hasError, setHasError] = useState(false)

  const getCleanInitials = (str) => {
    if (!str) return ''
    const parts = str.trim().split(' ')
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
  }

  const imageSrc = profilePath && !hasError 
    ? `https://image.tmdb.org/t/p/w185${profilePath}` 
    : '/profile_fallback.webp'

  return (
    <Avatar
      size='xs'
      name={name}
      src={imageSrc}
      getInitials={getCleanInitials}
      onError={() => setHasError(true)}
      bg='gray.600'
      color='white'
      fontSize='10px'
    />
  )
}