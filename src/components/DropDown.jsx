import { Menu, MenuButton, MenuList, MenuItem, Button } from '@chakra-ui/react'
import { ChevronDownIcon } from '@chakra-ui/icons'
import removeUnderscores from '../utils/removeUnderscores'

export default function DropDown({ category, changeCategory }) {
  return (
    <Menu>
      <MenuButton as={Button} rightIcon={<ChevronDownIcon />} minWidth='8.9rem'>
        {removeUnderscores(category)}
      </MenuButton>
      <MenuList zIndex={2000} position='relative' pointerEvents='auto'>
        <MenuItem onClick={() => changeCategory('popular')}>Popular</MenuItem>
        <MenuItem onClick={() => changeCategory('top_rated')}>Top Rated</MenuItem>
        <MenuItem onClick={() => changeCategory('now_playing')}>Now Playing</MenuItem>
        <MenuItem onClick={() => changeCategory('upcoming')}>Upcoming</MenuItem>
      </MenuList>
    </Menu>
  )
}
