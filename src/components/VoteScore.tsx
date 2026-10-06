import { Flex, Icon, Text } from '@chakra-ui/react';
import { LuStar } from 'react-icons/lu';

export default function VoteScore({ voteAverage }: { voteAverage?: number }) {
  return (
    <Flex align='center'>
      <Icon boxSize={5} color='gold' asChild><LuStar fill='currentColor' /></Icon>
      <Text
        fontSize='lg'
        ml={2}
        color='white'
        textShadow='2px 0 4px black'
        textAlign='center'
      >
        {voteAverage ? Math.round(voteAverage * 10) / 10 : 'TBD'}
      </Text>
    </Flex>
  );
}
