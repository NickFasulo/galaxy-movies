import { useCallback, useState } from 'react'
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

import type { Movie } from '../types/movie'

type ReviewModalProps = {
  modalData: Movie
}

export default function ReviewModal({ modalData }: ReviewModalProps): JSX.Element {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [movieReview, setMovieReview] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<boolean>(false)
  const [hasRequestedReview, setHasRequestedReview] = useState<boolean>(false)

  const aiReview = useCallback(async (): Promise<void> => {
    if (hasRequestedReview) return

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

      if (res.status === 500) {
        setError(true)
        setMovieReview(null)
      } else {
        const data = (await res.json()) as { review?: string }
        setMovieReview(data.review ?? null)
      }
    } catch (fetchError) {
      setError(true)
      console.error('Error fetching review:', fetchError)
    } finally {
      setLoading(false)
      setHasRequestedReview(true)
    }
  }, [hasRequestedReview, modalData])

  const handleOpen = async (): Promise<void> => {
    onOpen()
    await aiReview()
  }

  return (
    <>
      <Button
        size='sm'
        width='7rem'
        onClick={() => void handleOpen()}
        isLoading={loading}
        isDisabled={error}
      >
        {error ? 'Unavailable' : 'See Review'}
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size='lg' isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Text textAlign='center' fontFamily='Halftone'>
              🤖&nbsp; Movie Bot&apos;s Review &nbsp;🍿
            </Text>
          </ModalHeader>
          <ModalBody>{movieReview ?? 'Review unavailable.'}</ModalBody>
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
