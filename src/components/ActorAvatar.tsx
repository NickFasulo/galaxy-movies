import { useState } from 'react'
import { Avatar } from '@chakra-ui/react'
import { tmdbImage } from '../utils/site'

export default function ActorAvatar({ profilePath, name }: { profilePath?: string | null; name?: string }) {
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
