import { useCallback, useEffect, useState, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Flex, Input, Box, IconButton } from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'
import DropDown from './DropDown'
import NavMenu from './NavMenu'

export default function SearchBar({
  category,
  changeCategory,
  searchInput,
  setSearchInput
}) {
  const isSearchActive = searchInput.trim().length > 0
  const [isSticky, setIsSticky] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const headerRef = useRef(null)
  const inputRef = useRef(null)
  const [headerTop, setHeaderTop] = useState(0)
  const isCollapsed = isSticky && !isExpanded && !isSearchActive

  useEffect(() => {
    if (!isSticky) setIsExpanded(false)
  }, [isSticky])

  useEffect(() => {
    if (headerRef.current) {
      setHeaderTop(headerRef.current.getBoundingClientRect().top + window.scrollY)
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > headerTop)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [headerTop])

  const handleCategoryChange = useCallback(
    selectedCategory => {
      changeCategory(selectedCategory)
      sessionStorage.removeItem('homeSearchInput')
    },
    [changeCategory]
  )

  const handleExpand = () => {
    flushSync(() => setIsExpanded(true))
    inputRef.current?.focus()
  }

  const handleInputChange = e => {
    const value = e.target.value
    setSearchInput(value)
    if (value === '') {
      sessionStorage.removeItem('homeSearchInput')
    }
  }

  return (
    <Box
      ref={headerRef}
      position='sticky'
      top={0}
      zIndex={20}
      background={isSticky ? '#14181c' : 'transparent'}
      borderBottom={isSticky ? '1px solid' : 'none'}
      borderColor='whiteAlpha.200'
      transition='background 0.2s ease-in-out, border-bottom 0.2s ease-in-out'
    >
      <Flex justify='center' align='center' width='100%'>
        <Flex
          justify='center'
          align='center'
          width={{ base: '90%', md: '50rem' }}
          padding='0.75rem'
        >
          <IconButton
            aria-label='Search'
            icon={<SearchIcon />}
            onClick={handleExpand}
            variant='ghost'
            color='white'
            display={{ base: isCollapsed ? 'inline-flex' : 'none', md: 'none' }}
            _hover={{ bg: 'whiteAlpha.200' }}
            _active={{ bg: 'whiteAlpha.300' }}
          />
          <Input
            ref={inputRef}
            value={searchInput}
            onChange={handleInputChange}
            onBlur={() => !isSearchActive && setIsExpanded(false)}
            placeholder='Search movies & shows...'
            background='#1f252b'
            color='white'
            borderColor='whiteAlpha.300'
            _placeholder={{ color: 'gray.400' }}
            flex='1'
            display={{ base: isCollapsed ? 'none' : 'block', md: 'block' }}
          />
          <Box
            maxWidth={isSearchActive ? '0px' : '200px'}
            opacity={isSearchActive ? 0 : 1}
            pointerEvents={isSearchActive ? 'none' : 'auto'}
            marginLeft={isSearchActive ? '0px' : { base: isCollapsed ? 'auto' : '0.75rem', md: '0.75rem' }}
            transition='all 0.3s ease-in-out'
            overflow='hidden'
            whiteSpace='nowrap'
            display={{ base: isSticky && isExpanded ? 'none' : 'block', md: 'block' }}
          >
            <DropDown
              category={category}
              changeCategory={handleCategoryChange}
            />
          </Box>
          <Box
            maxWidth={isSticky ? '48px' : '0px'}
            opacity={isSticky ? 1 : 0}
            pointerEvents={isSticky ? 'auto' : 'none'}
            marginLeft={isSticky ? { base: isCollapsed ? 'auto' : '0.5rem', md: '0.5rem' } : '0px'}
            transition='all 0.3s ease-in-out'
            overflow={isSticky ? 'visible' : 'hidden'}
          >
            <NavMenu />
          </Box>
        </Flex>
      </Flex>
    </Box>
  )
}
