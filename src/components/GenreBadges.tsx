import { Wrap, WrapItem, Badge } from '@chakra-ui/react';

export default function GenreBadges({ genres }: { genres?: { id: number; name: string }[] }) {
  return (
    <Wrap justify='center' gap={{ base: 4, md: 2 }}>
      {genres?.map((genre) => (
        <WrapItem key={genre.id}><Badge>{genre.name}</Badge></WrapItem>
      ))}
    </Wrap>
  );
}
