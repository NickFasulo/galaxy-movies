import NextLink from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Box, Flex, IconButton, Link, Menu, Portal } from '@chakra-ui/react';
import NavMenu, { menuItemProps } from './NavMenu'
import { SearchInput } from './SearchBar'
import Wordmark from './Wordmark'
import { LuChevronDown, LuSearch, LuX } from 'react-icons/lu';

// Full-width slide-down row on mobile — the expandable-search pattern: the
// icon expands an input inline instead of routing home first, and submit
// lands on /search?q=… same as the desktop form.
function MobileSearchBar({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [term, setTerm] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = term.trim()
    if (!q) return
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <Box
      as='form'
      onSubmit={submit}
      display={{ base: 'flex', md: 'none' }}
      alignItems='center'
      gap={1}
      px={4}
      pb={3}
      bg='surface.canvas'
    >
      <SearchInput
        ref={inputRef}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        aria-label='Search'
        enterKeyHint='search'
        flex='1'
      />
      <IconButton
        type='submit'
        aria-label='Submit search'
        variant='ghost'
        size='lg'
        color='whiteAlpha.800'
        data-umami-event='header-search'
        _hover={{ bg: 'whiteAlpha.200' }}><LuSearch /></IconButton>
      <IconButton
        aria-label='Close search'
        variant='ghost'
        size='lg'
        color='whiteAlpha.800'
        onClick={onClose}
        _hover={{ bg: 'whiteAlpha.200' }}><LuX /></IconButton>
    </Box>
  )
}

// Every non-home page gets a search affordance — a visitor who landed on the
// wrong title otherwise has no way to find the right one without going home.
function HeaderSearch({ onMobileSearchOpen }: { onMobileSearchOpen: () => void }) {
  const router = useRouter()
  const [term, setTerm] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = term.trim()
    if (!q) return
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <>
      <Box as='form' onSubmit={submit} display={{ base: 'none', md: 'flex' }} alignItems='center'>
        <SearchInput
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder='Search...'
          size='sm'
          w='9rem'
        />
        <IconButton
          type='submit'
          aria-label='Search'
          variant='ghost'
          size='sm'
          color='whiteAlpha.800'
          data-umami-event='header-search'
          _hover={{ bg: 'whiteAlpha.200' }}><LuSearch /></IconButton>
      </Box>
      <IconButton
        aria-label='Search'
        variant='ghost'
        size='lg'
        display={{ base: 'inline-flex', md: 'none' }}
        color='whiteAlpha.800'
        onClick={onMobileSearchOpen}
        _hover={{ bg: 'whiteAlpha.200' }}><LuSearch /></IconButton>
    </>
  )
}

// isHome: hide the logo (the homepage's h1 already is the logo).
// hideSearch: the search page has its own input — a second one in the header
// would duplicate the affordance on the same screen.
export default function Header({ isHome = false, isDark = false, hideSearch = false }) {
  const router = useRouter()
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  useEffect(() => {
    const close = () => setMobileSearchOpen(false)
    router.events.on('routeChangeStart', close)
    return () => router.events.off('routeChangeStart', close)
  }, [router])

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
          <Link _hover={{ opacity: 0.8 }} transition='opacity 0.15s' asChild><NextLink href='/' aria-label='Galaxy Movies home'>
              <Wordmark fontSize='xl' />
            </NextLink></Link>
        )}
        <Flex align='center' gap={{ base: 1, md: 3 }}>
          {!isHome && !hideSearch && <HeaderSearch onMobileSearchOpen={() => setMobileSearchOpen(true)} />}
          <Flex display={{ base: 'none', md: 'flex' }} align='center' gap={5} fontSize='sm' fontWeight='medium' color='whiteAlpha.800'>
          <Menu.Root>
            <Menu.Trigger asChild><Box
                as='button'
                color='whiteAlpha.800'
                display='inline-flex'
                alignItems='center'
                gap={1}
                cursor='pointer'
                transition='color 0.15s'
                _hover={{ color: 'white' }}>Explore <LuChevronDown />
              </Box></Menu.Trigger>
            <Portal><Menu.Positioner><Menu.Content>
                  <Menu.Item {...menuItemProps} value='item-0' asChild><NextLink href='/streaming'>Streaming</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-1' asChild><NextLink href='/tv'>TV Shows</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-2' asChild><NextLink href='/genre'>Genres</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-3' asChild><NextLink href='/browse'>Browse</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-4' asChild><NextLink href='/lists'>Lists</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-5' asChild><NextLink href='/collections'>Collections</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-6' asChild><NextLink href='/free'>Free to Watch</NextLink></Menu.Item>
                  <Menu.Item {...menuItemProps} value='item-7' asChild><NextLink href='/new-on-streaming'>New Releases</NextLink></Menu.Item>
                </Menu.Content></Menu.Positioner></Portal>
          </Menu.Root>
          <Link color='whiteAlpha.800' transition='color 0.15s' _hover={{ color: 'white' }} asChild><NextLink href='/watchlist'>My List
                      </NextLink></Link>
          <Link color='whiteAlpha.800' transition='color 0.15s' _hover={{ color: 'white' }} asChild><NextLink href='/plus'>Plus
                      </NextLink></Link>
          <Link color='whiteAlpha.800' transition='color 0.15s' _hover={{ color: 'white' }} asChild><NextLink href='/about'>About
                      </NextLink></Link>
          </Flex>
          <Box display={{ base: 'block', md: 'none' }}>
            <NavMenu />
          </Box>
        </Flex>
      </Flex>
      {!isHome && !hideSearch && mobileSearchOpen && (
        <MobileSearchBar onClose={() => setMobileSearchOpen(false)} />
      )}
    </Box>
  );
}
