import NextLink from 'next/link'
import { IconButton, Menu, Portal } from '@chakra-ui/react';
import { LuMenu } from 'react-icons/lu';

export const menuItemProps = {
  bg: 'transparent',
  cursor: 'pointer',
  _hover: { bg: 'surface.overlay' },
  _focus: { bg: 'surface.overlay' }
}

export default function NavMenu() {
  return (
    <Menu.Root positioning={{
      placement: 'bottom-end'
    }}>
      <Menu.Trigger asChild><IconButton
          aria-label='Open menu'
          variant='ghost'
          color='white'
          _hover={{ bg: 'whiteAlpha.200' }}
          _active={{ bg: 'whiteAlpha.200' }}><LuMenu /></IconButton></Menu.Trigger>
      <Portal><Menu.Positioner><Menu.Content>
            <Menu.Item {...menuItemProps} value='item-0' asChild><NextLink href='/streaming'>Streaming</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-1' asChild><NextLink href='/tv'>TV Shows</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-2' asChild><NextLink href='/lists'>Lists</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-3' asChild><NextLink href='/collections'>Collections</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-4' asChild><NextLink href='/free'>Free to Watch</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-5' asChild><NextLink href='/new-on-streaming'>New Releases</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-6' asChild><NextLink href='/watchlist'>My List</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-7' asChild><NextLink href='/plus'>Plus</NextLink></Menu.Item>
            <Menu.Item {...menuItemProps} value='item-8' asChild><NextLink href='/about'>About</NextLink></Menu.Item>
          </Menu.Content></Menu.Positioner></Portal>
    </Menu.Root>
  );
}
