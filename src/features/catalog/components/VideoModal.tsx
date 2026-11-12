import { Box, Button, CloseButton, Icon, useDisclosure, Dialog, Portal, chakra } from '@chakra-ui/react';
import { BsCaretRightFill } from 'react-icons/bs'
import Head from 'next/head'
import { useState } from 'react'

const Img = chakra('img')
const Iframe = chakra('iframe')

export default function VideoModal({ videoKey }: { videoKey?: string | null }) {
  const { open, onOpen, onClose } = useDisclosure()
  const [loaded, setLoaded] = useState(false)

  if (!videoKey || videoKey === 'null') return null

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://www.youtube-nocookie.com" />
        <link rel="preconnect" href="https://i.ytimg.com" />
      </Head>
      <Button
        size={{ base: 'md', md: 'sm' }}
        width={{ base: '8rem', md: '7rem' }}
        onClick={onOpen}
        aria-label="Watch trailer"
        data-umami-event='trailer-open'
        bg='blackAlpha.600' color='white' border='1px solid var(--chakra-colors-border-subtle)' _hover={{ bg: 'blackAlpha.800' }}
      >
        <Icon boxSize={{ base: 6, md: 5 }} asChild><BsCaretRightFill /></Icon>
      </Button>
      <Dialog.Root
        open={open}
        size='full'
        closeOnEscape={true}
        closeOnInteractOutside={true}
        onOpenChange={e => {
          if (!e.open) {
            onClose();
            setLoaded(false)
          }
        }}>
        <Portal>

          <Dialog.Backdrop bg="black" />
          <Dialog.Positioner>
            <Dialog.Content
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
              overflow="hidden">
              <Dialog.CloseTrigger asChild>
                <CloseButton
                  aria-label="Close trailer"
                  size="md"
                  color="white"
                  zIndex={20}
                  position="absolute"
                  top={{ base: '12px', md: '20px' }}
                  right={{ base: '12px', md: '20px' }}
                  bg="blackAlpha.600"
                  borderRadius="full"
                  _hover={{ bg: 'whiteAlpha.400' }}
                />
              </Dialog.CloseTrigger>
              {/* Landscape/desktop cover-fit fills the viewport edge-to-edge;
                  portrait keeps the full-width 16:9 box with black above/below
                  since a cover crop would lose most of the frame. */}
              <Box
                position="absolute"
                inset={0}
                margin="auto"
                width={{ _portrait: '100vw', _landscape: 'max(100vw, 177.78dvh)' }}
                aspectRatio={16 / 9}
                overflow="hidden">
                {!loaded && (
                  <Img
                    src={`https://i.ytimg.com/vi/${videoKey}/hqdefault.jpg`}
                    alt=""
                    position="absolute"
                    inset={0}
                    width="100%"
                    height="100%"
                    objectFit="cover"
                  />
                )}
                <Iframe
                  src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  title="Trailer"
                  onLoad={() => setLoaded(true)}
                  position="absolute"
                  inset={0}
                  width="100%"
                  height="100%"
                  border={0}
                />
              </Box>
            </Dialog.Content>
          </Dialog.Positioner>

        </Portal>
      </Dialog.Root>
    </>
  );
}
