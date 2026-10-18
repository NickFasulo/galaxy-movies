import Link from 'next/link'
import { Box, Flex, Text, Wrap, WrapItem } from '@chakra-ui/react'
import ActorAvatar from './ActorAvatar'
import type { CastMember } from '../../../types/tmdb'

type CastEntry = Pick<CastMember, 'id' | 'name' | 'profile_path'>

export default function CastSection({ cast }: { cast?: CastEntry[] }) {
  if (!cast || cast.length === 0) return null

  return (
    <Box mb={4}>
      <Text
        color='gray.400'
        fontSize='xs'
        fontWeight='bold'
        textTransform='uppercase'
        textShadow='0 0 4px black'
        textAlign='center'
        position='relative'
        display='flex'
        alignItems='center'
        gap={3}
        mb={2}
        _before={{ content: '""', flex: 1, borderTop: '1px solid var(--chakra-colors-white-alpha-400)' }}
        _after={{ content: '""', flex: 1, borderTop: '1px solid var(--chakra-colors-white-alpha-400)' }}
      >
        Cast
      </Text>
      <Wrap gap={{ base: 2, md: 3 }} justify='center'>
        {cast.map((actor) => (
          // ~9.5rem cap + clamped name keeps two pills per row on mobile
          <WrapItem key={actor.id} maxW={{ base: '9.5rem', md: 'none' }}>
            <Link href={`/person/${actor.id}`} passHref>
              <Flex
                align='center'
                bg='rgba(255, 255, 255, 0.1)'
                px={{ base: 2, md: 2.5 }}
                py={{ base: 1, md: 1.5 }}
                borderRadius='full'
                gap={{ base: 1.5, md: 2.5 }}
                minW={0}
                cursor='pointer'
                transition='all 0.2s ease-in-out'
                _hover={{
                  bg: 'rgba(255, 255, 255, 0.2)',
                  transform: 'translateY(-2px)'
                }}
              >
                <Box flexShrink={0}>
                  <ActorAvatar profilePath={actor.profile_path} name={actor.name} />
                </Box>
                <Text fontSize={{ base: 'xs', md: 'sm' }} color='white' fontWeight='medium' textShadow='0 0 4px black' lineClamp={1} minW={0}>
                  {actor.name}
                </Text>
              </Flex>
            </Link>
          </WrapItem>
        ))}
      </Wrap>
    </Box>
  );
}
