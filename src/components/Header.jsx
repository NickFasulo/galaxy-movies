import NextLink from 'next/link'
import { Box, Flex, Link, Menu, MenuButton, MenuItem, MenuList } from '@chakra-ui/react'
import { ChevronDownIcon } from '@chakra-ui/icons'

// Rendered once, site-wide, from _app.jsx.
// The brand logo is omitted on the homepage, which already has its own large
// version of it as the page's h1. Nav text color is conditional on the page's
// background (isDark, for the full-bleed dark movie/person/company pages) —
// the logo itself always carries its own navy/white box, so it doesn't need it.
export default function Header({ isHome = false, isDark = false }) {
  const textColor = isDark ? 'whiteAlpha.900' : 'gray.700'
  // Header renders outside the page's own Box, so "transparent" would reveal
  // <body>'s white background rather than a dark page's actual color — match
  // it explicitly instead.
  const bg = isDark ? '#14181c' : 'transparent'

  return (
    <Box as='header' bg={bg}>
      <Flex maxW='70rem' mx='auto' px={6} py={2} align='center' justify={isHome ? 'flex-end' : 'space-between'}>
        {!isHome && (
          <Link as={NextLink} href='/' _hover={{ textDecoration: 'none' }}>
            <Box
              display='inline-block'
              bg='#001e2e'
              color='white'
              fontFamily="'SpaceRanger', Roboto, Arial, sans-serif"
              fontSize='lg'
              px={3}
              py={1}
              borderRadius='8px'
              transform='skewX(-15deg)'
            >
              <Box as='span' display='inline-block' transform='skewX(15deg)'>
                Galaxy Movies
              </Box>
            </Box>
          </Link>
        )}
        <Flex align='center' gap={5} fontSize='sm' color={textColor}>
          <Menu>
            <MenuButton color={textColor} _hover={{ textDecoration: 'underline' }}>
              Explore <ChevronDownIcon />
            </MenuButton>
            <MenuList minW='10rem'>
              <MenuItem as={NextLink} href='/streaming'>Streaming</MenuItem>
              <MenuItem as={NextLink} href='/lists'>Lists</MenuItem>
              <MenuItem as={NextLink} href='/new-on-streaming'>New Releases</MenuItem>
            </MenuList>
          </Menu>
          <Link as={NextLink} href='/about' color={textColor} _hover={{ textDecoration: 'underline' }}>
            About
          </Link>
        </Flex>
      </Flex>
    </Box>
  )
}
