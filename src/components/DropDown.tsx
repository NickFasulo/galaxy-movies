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

const CATEGORY_LABELS: Record<string, string> = {
  popular: 'Popular',
  top_rated: 'Top Rated',
  now_playing: 'Now Playing',
  upcoming: 'Upcoming',
  trending: 'Trending',
  tv: 'TV Shows',
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

export default function DropDown({ category, changeCategory }: { category: string; changeCategory: (category: string) => void }) {
  const currentLabel = CATEGORY_LABELS[category] || removeUnderscores(category)

  return (
    <Menu>
      <MenuButton as={Button} rightIcon={<ChevronDownIcon />} minWidth='8.9rem' bg='#1f252b' color='white' _hover={{ bg: '#2a3138' }} _active={{ bg: '#2a3138' }}>
        {currentLabel}
      </MenuButton>
      <MenuList maxH='20rem' overflowY='auto' bg='#1f252b' borderColor='whiteAlpha.200' color='white'>
        <MenuGroup title='Feeds'>
          <MenuItem onClick={() => changeCategory('popular')} bg='transparent' _hover={{ bg: '#2a3138' }} _focus={{ bg: '#2a3138' }}>Popular</MenuItem>
          <MenuItem onClick={() => changeCategory('top_rated')} bg='transparent' _hover={{ bg: '#2a3138' }} _focus={{ bg: '#2a3138' }}>Top Rated</MenuItem>
          <MenuItem onClick={() => changeCategory('now_playing')} bg='transparent' _hover={{ bg: '#2a3138' }} _focus={{ bg: '#2a3138' }}>Now Playing</MenuItem>
          <MenuItem onClick={() => changeCategory('upcoming')} bg='transparent' _hover={{ bg: '#2a3138' }} _focus={{ bg: '#2a3138' }}>Upcoming</MenuItem>
          <MenuItem onClick={() => changeCategory('trending')} bg='transparent' _hover={{ bg: '#2a3138' }} _focus={{ bg: '#2a3138' }}>Trending</MenuItem>
          <MenuItem onClick={() => changeCategory('tv')} bg='transparent' _hover={{ bg: '#2a3138' }} _focus={{ bg: '#2a3138' }}>TV Shows</MenuItem>
        </MenuGroup>
        <MenuDivider borderColor='whiteAlpha.200' />
        <MenuGroup title='Genres'>
          {GENRES.map((genre) => (
            <MenuItem key={genre.value} onClick={() => changeCategory(genre.value)} bg='transparent' _hover={{ bg: '#2a3138' }} _focus={{ bg: '#2a3138' }}>
              {genre.label}
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuList>
    </Menu>
  )
}