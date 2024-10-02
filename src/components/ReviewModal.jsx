import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Flex,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  Button,
  useDisclosure
} from '@chakra-ui/react'

export default function ReviewModal({ modalData }) {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [movieReview, setMovieReview] = useState()
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const aiReview = async () => {
    try {
      const res = await fetch('/api/generateReview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modalData })
      })
      const data = await res.json()
      setMovieReview(data.review)
    } catch (error) {
      console.error('Error fetching review:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    aiReview()
  }, [])

  return (
    <>
      <Flex justify='space-evenly' align='flex-end'>
        <Button
          size='sm'
          width='8rem'
          margin={{ base: '1rem 0 3rem', md: '1.5rem 0 2rem' }}
          onClick={onOpen}
          isLoading={loading}
        >
          See Review
        </Button>
        <Button
          size='sm'
          width='8rem'
          margin={{ base: '1rem 0 3rem', md: '1.5rem 0 2rem' }}
          onClick={() => router.back()}
        >
          Go Back
        </Button>
      </Flex>

      <Modal isOpen={isOpen} onClose={onClose} size='lg' isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Text textAlign='center' fontFamily='Halftone'>
              🤖&nbsp; Movie Bot's Review &nbsp;🍿
            </Text>
          </ModalHeader>
          <ModalBody>{movieReview}</ModalBody>
          <ModalFooter>
            <Button margin='0 auto' onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
