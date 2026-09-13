import {
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  Button,
  Icon,
  AspectRatio,
  useDisclosure
} from '@chakra-ui/react'
import { BsCaretRightFill } from 'react-icons/bs'
import dynamic from 'next/dynamic'

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false })

export default function VideoModal({ videoKey }) {
  const { isOpen, onOpen, onClose } = useDisclosure()

  if (!videoKey || videoKey === 'null') return null

  return (
    <>
      <Button size="sm" width="7rem" onClick={onOpen}>
        <Icon as={BsCaretRightFill} boxSize={6} />
      </Button>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="full"
        closeOnEsc={true}
        closeOnOverlayClick={true}
        preserveScrollBarGap
      >
        <ModalOverlay bg="blackAlpha.900" />
        <ModalContent
          backgroundColor="black"
          margin={0}
          padding={0}
          borderRadius={0}
          width="100vw"
          height="100dvh"
          maxWidth="100vw"
          maxHeight="100dvh"
          position="fixed"
          top={0}
          left={0}
          overflow="hidden"
        >
          <ModalCloseButton
            color="white"
            size="lg"
            zIndex={20}
            top={{ base: '12px', md: '20px' }}
            right={{ base: '12px', md: '20px' }}
            bg="blackAlpha.600"
            borderRadius="full"
            _hover={{ bg: 'whiteAlpha.400' }}
          />
          <Flex
            width="100%"
            height="100%"
            justify="center"
            align="center"
            overflow="hidden"
            p={{ base: 2, md: 6 }}
            onClick={onClose}
          >
            <Flex
              width="100%"
              maxWidth={{ base: '100%', md: '90vw' }}
              maxHeight={{ base: '80dvh', md: '90dvh' }}
              align="center"
              justify="center"
              overflow="hidden"
              onClick={e => e.stopPropagation()}
            >
              <AspectRatio ratio={16 / 9} width="100%" maxHeight="100%">
                <ReactPlayer
                  width="100%"
                  height="100%"
                  playing={isOpen}
                  controls
                  url={`https://www.youtube-nocookie.com/watch?v=${videoKey}`}
                />
              </AspectRatio>
            </Flex>
          </Flex>
        </ModalContent>
      </Modal>
    </>
  )
}