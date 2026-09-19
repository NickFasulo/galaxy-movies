import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuGroup,
  MenuDivider,
  Button
} from '@chakra-ui/react'
import { ChevronDownIcon } from '@chakra-ui/icons'
import removeUnderscores from '../utils/removeUnderscores'

const CATEGORY_LABELS = {
  popular: 'Popular',
  top_rated: 'Top Rated',
  now_playing: 'Now Playing',
  upcoming: 'Upcoming',
  action: 'Action',
  adventure: 'Adventure',
  animation: 'Animation',
  comedy: 'Comedy',
  crime: 'Crime',
  documentary: 'Documentary',
  drama: 'Drama',
  family: 'Family',
  fantasy: 'Fantasy',
  history: 'History',
  horror: 'Horror',
  music: 'Music',
  mystery: 'Mystery',
  romance: 'Romance',
  sci_fi: 'Sci-Fi',
  thriller: 'Thriller',
  war: 'War',
  western: 'Western'
}

const GENRES = [
  { label: 'Action', value: 'action' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Animation', value: 'animation' },
  { label: 'Comedy', value: 'comedy' },
  { label: 'Crime', value: 'crime' },
  { label: 'Documentary', value: 'documentary' },
  { label: 'Drama', value: 'drama' },
  { label: 'Family', value: 'family' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'History', value: 'history' },
  { label: 'Horror', value: 'horror' },
  { label: 'Music', value: 'music' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Romance', value: 'romance' },
  { label: 'Sci-Fi', value: 'sci_fi' },
  { label: 'Thriller', value: 'thriller' },
  { label: 'War', value: 'war' },
  { label: 'Western', value: 'western' }
]

export default function DropDown({ category, changeCategory }) {
  const currentLabel = CATEGORY_LABELS[category] || removeUnderscores(category)

  return (
    <Menu>
      <MenuButton as={Button} rightIcon={<ChevronDownIcon />} minWidth='8.9rem'>
        {currentLabel}
      </MenuButton>
      <MenuList maxH='20rem' overflowY='auto'>
        <MenuGroup title='Feeds'>
          <MenuItem onClick={() => changeCategory('popular')}>Popular</MenuItem>
          <MenuItem onClick={() => changeCategory('top_rated')}>Top Rated</MenuItem>
          <MenuItem onClick={() => changeCategory('now_playing')}>Now Playing</MenuItem>
          <MenuItem onClick={() => changeCategory('upcoming')}>Upcoming</MenuItem>
        </MenuGroup>
        <MenuDivider />
        <MenuGroup title='Genres'>
          {GENRES.map((genre) => (
            <MenuItem key={genre.value} onClick={() => changeCategory(genre.value)}>
              {genre.label}
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuList>
    </Menu>
  )
}