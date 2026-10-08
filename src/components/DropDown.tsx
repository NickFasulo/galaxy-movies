import { Menu, Button, Portal } from '@chakra-ui/react';
import removeUnderscores from '../utils/removeUnderscores'
import { menuItemProps } from './NavMenu'
import { LuChevronDown } from 'react-icons/lu';

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
    <Menu.Root>
      <Menu.Trigger asChild><Button
          w='fit-content'
          bg='surface.raised'
          color='white'
          border='1px solid var(--chakra-colors-border-subtle)'
          _hover={{ bg: 'surface.overlay' }}
          _active={{ bg: 'surface.overlay' }}>
          {currentLabel}
          <LuChevronDown /></Button></Menu.Trigger>
      <Portal><Menu.Positioner><Menu.Content>
            <Menu.ItemGroup><Menu.ItemGroupLabel>Feeds</Menu.ItemGroupLabel>
              <Menu.Item
                onSelect={() => changeCategory('popular')}
                {...menuItemProps}
                value='item-0'>Popular</Menu.Item>
              <Menu.Item
                onSelect={() => changeCategory('top_rated')}
                {...menuItemProps}
                value='item-1'>Top Rated</Menu.Item>
              <Menu.Item
                onSelect={() => changeCategory('now_playing')}
                {...menuItemProps}
                value='item-2'>Now Playing</Menu.Item>
              <Menu.Item
                onSelect={() => changeCategory('upcoming')}
                {...menuItemProps}
                value='item-3'>Upcoming</Menu.Item>
              <Menu.Item
                onSelect={() => changeCategory('trending')}
                {...menuItemProps}
                value='item-4'>Trending</Menu.Item>
              <Menu.Item
                onSelect={() => changeCategory('tv')}
                {...menuItemProps}
                value='item-5'>TV Shows</Menu.Item>
            </Menu.ItemGroup>
            <Menu.Separator borderColor='border.subtle' />
            <Menu.ItemGroup><Menu.ItemGroupLabel>Genres</Menu.ItemGroupLabel>
              {GENRES.map((genre) => (
                <Menu.Item
                  key={genre.value}
                  onSelect={() => changeCategory(genre.value)}
                  {...menuItemProps}
                  value='item-6'>
                  {genre.label}
                </Menu.Item>
              ))}
            </Menu.ItemGroup>
          </Menu.Content></Menu.Positioner></Portal>
    </Menu.Root>
  );
}