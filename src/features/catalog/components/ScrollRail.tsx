import { useCallback, useEffect, useRef, useState } from 'react'
import { Flex, type FlexProps } from '@chakra-ui/react'

const EDGE_FADE = '2.5rem'

const edgeMask = (left: boolean, right: boolean) =>
  `linear-gradient(to right, ${left ? 'transparent' : 'black'} 0, black ${EDGE_FADE}, black calc(100% - ${EDGE_FADE}), ${right ? 'transparent' : 'black'} 100%)`

// Shared horizontal rail: the scrollbar stays hidden until the rail is hovered,
// and each edge fades when content continues past it. Masking (rather than a
// background-colored overlay) keeps the fade correct over the homepage's hover
// backdrop swaps.
export default function ScrollRail({ children, css, onScroll, ...rest }: FlexProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  })

  const mask = edgeMask(edges.left, edges.right)

  return (
    <Flex
      ref={ref}
      overflowX='auto'
      onScroll={(e) => {
        update()
        onScroll?.(e)
      }}
      css={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'transparent transparent',
        '&::-webkit-scrollbar': { height: '6px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'transparent',
          borderRadius: '9999px',
          transition: 'background-color 0.25s ease'
        },
        '&:hover': { scrollbarColor: 'var(--chakra-colors-gray-500) transparent' },
        '&:hover::-webkit-scrollbar-thumb': { backgroundColor: 'var(--chakra-colors-gray-500)' },
        maskImage: mask,
        WebkitMaskImage: mask,
        transition: '-webkit-mask-image 0.3s ease',
        ...css
      }}
      {...rest}
    >
      {children}
    </Flex>
  )
}
