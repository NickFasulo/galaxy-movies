import { useState } from 'react'
import { Avatar } from '@chakra-ui/react'

export default function ActorAvatar({ profilePath, name }: { profilePath?: string | null; name?: string }) {
  const [hasError, setHasError] = useState(false)

  const imageSrc = profilePath && !hasError
    ? `https://image.tmdb.org/t/p/w185${profilePath}`
    : '/profile_fallback.webp'

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
