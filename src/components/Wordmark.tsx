import { Text, type TextProps } from '@chakra-ui/react'

export default function Wordmark(props: TextProps) {
  return (
    <Text
      as='span'
      fontFamily='display'
      color='white'
      lineHeight={1}
      textShadow='0 0 14px rgba(125, 175, 255, 0.28)'
      {...props}
    >
      Galaxy Movies
    </Text>
  );
}
