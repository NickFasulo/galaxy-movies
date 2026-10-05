import NextLink from 'next/link'
import { IconButton, Menu, MenuButton, MenuItem, MenuList } from '@chakra-ui/react'
import { HamburgerIcon } from '@chakra-ui/icons'

export const menuItemProps = {
  bg: 'transparent',
  _hover: { bg: '#2a3138' },
  _focus: { bg: '#2a3138' }
}

export default function NavMenu() {
  return (
    <Menu placement='bottom-end'>
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
        <MenuItem as={NextLink} href='/tv' {...menuItemProps}>TV Shows</MenuItem>
        <MenuItem as={NextLink} href='/lists' {...menuItemProps}>Lists</MenuItem>
        <MenuItem as={NextLink} href='/collections' {...menuItemProps}>Collections</MenuItem>
        <MenuItem as={NextLink} href='/free' {...menuItemProps}>Free to Watch</MenuItem>
        <MenuItem as={NextLink} href='/new-on-streaming' {...menuItemProps}>New Releases</MenuItem>
        <MenuItem as={NextLink} href='/watchlist' {...menuItemProps}>My List</MenuItem>
        <MenuItem as={NextLink} href='/about' {...menuItemProps}>About</MenuItem>
      </MenuList>
    </Menu>
  )
}
