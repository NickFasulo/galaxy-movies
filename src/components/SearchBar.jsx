import { useCallback } from 'react'
import { Flex, Input, Box } from '@chakra-ui/react'
import Sticky from 'react-stickynode'
import DropDown from './DropDown'

export default function SearchBar({
  category,
  changeCategory,
  searchInput,
  setSearchInput
}) {
  const isSearchActive = searchInput.trim().length > 0

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
    <Sticky innerActiveClass='sticky-header-active'>
      <div>
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
      </div>
    </Sticky>
  )
}