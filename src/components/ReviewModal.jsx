import { useEffect, useState } from 'react'
import {
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  Button,
  useDisclosure
} from '@chakra-ui/react'
import { Configuration, OpenAIApi } from 'openai'

export default function ReviewModal({ movieTitle }) {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [movieReview, setMovieReview] = useState()
  const [isLoading, setLoading] = useState(true)

  const configuration = new Configuration({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY
  })

  const openai = new OpenAIApi(configuration)

  const aiReview = async () => {
    try {
      const review = await openai.createCompletion({
        model: 'text-davinci-003',
        prompt: `Write a movie review for ${movieTitle}.`,
        temperature: 0.6,
        max_tokens: 120
      })
      setMovieReview(review.data.choices[0].text)
    } catch (e) {
      throw new Error(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    aiReview()
  }, [])

  return (
    <>
      <Flex height='100%' justify='center'>
        <Button
          size='sm'
          width='8rem'
          margin={{ base: '1rem 0 2rem', md: '2rem 0 1rem' }}
          onClick={onOpen}
          isLoading={isLoading}
        >
          See Review
        </Button>
      </Flex>

      <Modal isOpen={isOpen} onClose={onClose} size='lg'>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader textAlign='center'>
            🤖&nbsp; Movie Bot's Review &nbsp;🍿
          </ModalHeader>
          <ModalBody>{movieReview}</ModalBody>
          {/* <ModalBody>
            Lorem ipsum dolor sit amet consectetur, adipisicing elit. Eum ipsam
            explicabo, dicta cupiditate similique perferendis, minima velit amet
            asperiores iusto laboriosam facilis sunt? Voluptatem, quo magni illo
            aspernatur inventore minus? Lorem ipsum, dolor sit amet consectetur
            adipisicing elit. Laboriosam tenetur soluta quos. Assumenda
            doloremque accusantium, fugiat similique inventore optio! Nesciunt,
            id laudantium molestias expedita iste iure aliquid magnam
            consequatur vel. Lorem ipsum dolor sit amet consectetur adipisicing
            elit. Eos repudiandae aut tenetur repellendus, earum illo aspernatur
            quae laborum laboriosam quis provident placeat aliquam nostrum
            perspiciatis, dignissimos possimus dolorem? Cum, unde.
          </ModalBody> */}
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
