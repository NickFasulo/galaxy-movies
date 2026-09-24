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
import { track } from '@vercel/analytics'

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
        body: JSON.stringify({
          modalData: {
            title: modalData.title,
            overview: modalData.overview,
            genres: Array.isArray(modalData.genres)
              ? modalData.genres
                  .map((genre) => ({ name: genre?.name }))
                  .filter((genre) => genre.name)
                  .slice(0, 5)
              : []
          }
        })
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
        size={{ base: 'md', md: 'sm' }}
        width={{ base: '8rem', md: '7rem' }}
        onClick={() => {
          onOpen()
          if (!movieReview || error) {
            aiReview()
          }
          if (process.env.NODE_ENV === 'production') {
            track('ai_synopsis_click')
          }
        }}
      >
        AI Synopsis
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size='lg' isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Text textAlign='center'>
              Movie Bot's Synopsis
            </Text>
          </ModalHeader>
          <ModalBody>
            {loading
              ? <Text textAlign='center'>
                  'Synopsis loading...'
                </Text>
              : error
                ? <Text textAlign='center'>
                    'The synopsis could not be generated. Please try again.'
                  </Text>
                : movieReview}
          </ModalBody>
          <ModalFooter>
            {error && (
              <Button
                marginRight='auto'
                onClick={() => {
                  aiReview()
                  if (process.env.NODE_ENV === 'production') {
                    track('ai_synopsis_click')
                  }
                }}
                isLoading={loading}
              >
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
