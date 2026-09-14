import { useState } from 'react'
import {
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
  const [movieReview, setMovieReview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const aiReview = async () => {
    if (loading) return

    setLoading(true)
    setError(false)

    try {
      const res = await fetch('/api/generateReview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modalData })
      })
      if (!res.ok) {
        throw new Error('Failed to generate review')
      }

      const data = await res.json()
      setMovieReview(data.review)
    } catch (error) {
      setError(true)
      setMovieReview(null)
      console.error('Error fetching review:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size='sm'
        width={{ base: '5.5rem', md: '7rem' }}
        onClick={() => {
          onOpen()
          if (!movieReview || error) {
            aiReview()
          }
        }}
      >
        See Review
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size='lg' isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Text textAlign='center' fontFamily='Halftone'>
              🤖&nbsp; Movie Bot's Review &nbsp;🍿
            </Text>
          </ModalHeader>
          <ModalBody>
            {loading
              ? 'Generating a review...'
              : error
                ? 'The review could not be generated. Please try again.'
                : movieReview}
          </ModalBody>
          <ModalFooter>
            {error && (
              <Button marginRight='auto' onClick={aiReview} isLoading={loading}>
                Try again
              </Button>
            )}
            <Button margin='0 auto' onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
