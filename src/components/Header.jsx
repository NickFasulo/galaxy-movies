import NextLink from 'next/link'
import { Box, Flex, IconButton, Link, Menu, MenuButton, MenuItem, MenuList } from '@chakra-ui/react'
import { ChevronDownIcon, HamburgerIcon } from '@chakra-ui/icons'

const menuItemProps = {
  bg: 'transparent',
  _hover: { bg: '#2a3138' },
  _focus: { bg: '#2a3138' }
}

// isHome: hide the logo (the homepage's h1 already is the logo)
export default function Header({ isHome = false, isDark = false }) {
  return (
    <Box
      as='header'
      bg='transparent'
      // absolute on backdrop pages so it overlays the image, not pushes it down;
      // relative on home so it stays above the page's top backdrop band
      position={isDark ? (isHome ? 'relative' : 'absolute') : 'static'}
      top={0}
      left={0}
      right={0}
      zIndex={isDark ? 30 : undefined}
    >
      <Flex maxW='70rem' mx='auto' px={6} py={4} minH='4.25rem' align='center' justify={isHome ? 'flex-end' : 'space-between'}>
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
        <Flex display={{ base: 'none', md: 'flex' }} align='center' gap={5} fontSize='sm' color='whiteAlpha.900'>
          <Menu>
            <MenuButton color='whiteAlpha.900' _hover={{ textDecoration: 'underline' }}>
              Explore <ChevronDownIcon />
            </MenuButton>
            <MenuList minW='10rem' bg='#1f252b' borderColor='whiteAlpha.200' color='white'>
              <MenuItem as={NextLink} href='/streaming' {...menuItemProps}>Streaming</MenuItem>
              <MenuItem as={NextLink} href='/lists' {...menuItemProps}>Lists</MenuItem>
              <MenuItem as={NextLink} href='/new-on-streaming' {...menuItemProps}>New Releases</MenuItem>
            </MenuList>
          </Menu>
          <Link as={NextLink} href='/watchlist' color='whiteAlpha.900' _hover={{ textDecoration: 'underline' }}>
            My List
          </Link>
          <Link as={NextLink} href='/about' color='whiteAlpha.900' _hover={{ textDecoration: 'underline' }}>
            About
          </Link>
        </Flex>
        <Box display={{ base: 'block', md: 'none' }}>
          <Menu>
            <MenuButton
              as={IconButton}
              aria-label='Open menu'
              icon={<HamburgerIcon />}
              variant='ghost'
              color='white'
              _hover={{ bg: 'whiteAlpha.200' }}
              _active={{ bg: 'whiteAlpha.300' }}
            />
            <MenuList minW='10rem' bg='#1f252b' borderColor='whiteAlpha.200' color='white'>
              <MenuItem as={NextLink} href='/streaming' {...menuItemProps}>Streaming</MenuItem>
              <MenuItem as={NextLink} href='/lists' {...menuItemProps}>Lists</MenuItem>
              <MenuItem as={NextLink} href='/new-on-streaming' {...menuItemProps}>New Releases</MenuItem>
              <MenuItem as={NextLink} href='/watchlist' {...menuItemProps}>My List</MenuItem>
              <MenuItem as={NextLink} href='/about' {...menuItemProps}>About</MenuItem>
            </MenuList>
          </Menu>
        </Box>
      </Flex>
    </Box>
  )
}
