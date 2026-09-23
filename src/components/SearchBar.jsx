import { useCallback, useEffect, useState, useRef } from 'react'
import { Flex, Input, Box } from '@chakra-ui/react'
import DropDown from './DropDown'

export default function SearchBar({
  category,
  changeCategory,
  searchInput,
  setSearchInput
}) {
  const isSearchActive = searchInput.trim().length > 0
  const [isSticky, setIsSticky] = useState(false)
  const headerRef = useRef(null)
  const [headerTop, setHeaderTop] = useState(0)

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
      background={isSticky ? 'white' : 'transparent'}
      borderBottom={isSticky ? '1px solid' : 'none'}
      borderColor='gray.200'
      transition='background 0.2s ease-in-out, border-bottom 0.2s ease-in-out'
    >
      <Flex justify='center' align='center' width='100%'>
        <Flex
          justify='center'
          align='center'
          width={{ base: '90%', md: '50rem' }}
          padding='0.75rem'
          overflow='hidden'
        >
          <Input
            value={searchInput}
            onChange={handleInputChange}
            placeholder='Search movies...'
            background='white'
            flex='1'
          />
          <Box
            maxWidth={isSearchActive ? '0px' : '200px'}
            opacity={isSearchActive ? 0 : 1}
            pointerEvents={isSearchActive ? 'none' : 'auto'}
            marginLeft={isSearchActive ? '0px' : '0.75rem'}
            transition='all 0.3s ease-in-out'
            overflow='hidden'
            whiteSpace='nowrap'
          >
            <DropDown
              category={category}
              changeCategory={handleCategoryChange}
            />
          </Box>
        </Flex>
      </Flex>
    </Box>
  )
}
