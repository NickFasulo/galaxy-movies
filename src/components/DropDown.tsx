import { Menu, MenuButton, MenuList, MenuItem, Button } from '@chakra-ui/react'
import { ChevronDownIcon } from '@chakra-ui/icons'

import type { MovieCategory } from '../types/movie'
import removeUnderscores from '../utils/removeUnderscores'

type DropDownProps = {
  category: MovieCategory | string
  changeCategory: (category: MovieCategory) => void
}

export default function DropDown({ category, changeCategory }: DropDownProps): JSX.Element {
  return (
    <Menu>
      <MenuButton as={Button} rightIcon={<ChevronDownIcon />} minWidth='8.9rem'>
        {removeUnderscores(category)}
      </MenuButton>
      <MenuList>
        <MenuItem onClick={() => changeCategory('popular')}>Popular</MenuItem>
        <MenuItem onClick={() => changeCategory('top_rated')}>Top Rated</MenuItem>
        <MenuItem onClick={() => changeCategory('now_playing')}>Now Playing</MenuItem>
        <MenuItem onClick={() => changeCategory('upcoming')}>Upcoming</MenuItem>
      </MenuList>
    </Menu>
  )
}
