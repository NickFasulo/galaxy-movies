import { chakra, shouldForwardProp } from '@chakra-ui/react'
import { motion, isValidMotionProp } from 'framer-motion'

export const ChakraBox = chakra(motion.div, {
  shouldForwardProp: prop => isValidMotionProp(prop) || shouldForwardProp(prop)
})
