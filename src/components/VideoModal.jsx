import {
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  Button,
  useDisclosure
} from '@chakra-ui/react'
import { Icon } from '@chakra-ui/react'
import { BsCaretRightFill } from 'react-icons/bs'
import dynamic from 'next/dynamic'
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false })

export default function VideoModal({ videoKey }) {
  const { isOpen, onOpen, onClose } = useDisclosure()

  return (
    <>
      <Button
        size='sm'
        width='8rem'
        margin={{ base: '1.5rem', md: '1.5rem 0 2rem' }}
        onClick={onOpen}
      >
        <Icon as={BsCaretRightFill} boxSize={6} />
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size='full' trapFocus={false}>
        <ModalOverlay />
        <ModalContent backgroundColor='black'>
          <Flex
            height='100vh'
            width='100vw'
            flexDirection='column'
            justify={{ base: 'center', md: 'space-evenly' }}
            align='center'
          >
            <Flex width='100%' height={{ base: '30%', md: '90%' }}>
              <ReactPlayer
                width='100%'
                height='100%'
                url={`https://www.youtube-nocookie.com/watch?v=${videoKey}`}
              />
            </Flex>
            <Flex height={{ base: '10rem', md: '10%' }} align='center'>
              <Button width='15rem' onClick={onClose}>
                Close
              </Button>
            </Flex>
          </Flex>
        </ModalContent>
      </Modal>
    </>
  )
}
