import NextLink from 'next/link'
import { Box, Flex, Link, Menu, Portal } from '@chakra-ui/react';
import NavMenu, { menuItemProps } from './NavMenu'
import { LuChevronDown } from 'react-icons/lu';

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
          <Link _hover={{ textDecoration: 'none' }} asChild><NextLink href='/'>
              <Box
                display='inline-block'
                bg='#001e2e'
                color='white'
                fontFamily="'SpaceRanger', Roboto, Arial, sans-serif"
                fontSize='lg'
                px={3}
                py={1}
                borderRadius='0.5rem'
                transform='skewX(-15deg)'
              >
                <Box as='span' display='inline-block' transform='skewX(15deg)'>
                  Galaxy Movies
                </Box>
              </Box>
            </NextLink></Link>
        )}
        <Flex display={{ base: 'none', md: 'flex' }} align='center' gap={5} fontSize='sm' color='whiteAlpha.900'>
          <Menu.Root>
            <Menu.Trigger asChild><Box
                as='button'
                color='whiteAlpha.900'
                display='inline-flex'
                alignItems='center'
                gap={1}
                _hover={{ textDecoration: 'underline' }}>Explore <LuChevronDown />
              </Box></Menu.Trigger>
            <Portal><Menu.Positioner><Menu.Content>
                  <Menu.Item {...menuItemProps} value='item-0' asChild><NextLink href='/streaming'>Streaming</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-1' asChild><NextLink href='/tv'>TV Shows</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-2' asChild><NextLink href='/lists'>Lists</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-3' asChild><NextLink href='/collections'>Collections</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-4' asChild><NextLink href='/free'>Free to Watch</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-5' asChild><NextLink href='/new-on-streaming'>New Releases</NextLink></Menu.Item>
                </Menu.Content></Menu.Positioner></Portal>
          </Menu.Root>
          <Link color='whiteAlpha.900' _hover={{ textDecoration: 'underline' }} asChild><NextLink href='/watchlist'>My List
                      </NextLink></Link>
          <Link color='whiteAlpha.900' _hover={{ textDecoration: 'underline' }} asChild><NextLink href='/about'>About
                      </NextLink></Link>
        </Flex>
        <Box display={{ base: 'block', md: 'none' }}>
          <NavMenu />
        </Box>
      </Flex>
    </Box>
  );
}
