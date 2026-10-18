import type { ReactNode } from 'react'
import { Flex, Icon, Text } from '@chakra-ui/react';

export default function DetailMetaItem({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Flex align='center'>
      {icon && <Icon color='white' asChild>{icon}</Icon>}
      <Text color='white' textShadow='0 0 4px black' ml={icon ? 1.5 : 0}>{children}</Text>
    </Flex>
  );
}
