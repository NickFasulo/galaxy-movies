import GenrePage, { genreServerSideProps } from '../../features/catalog/components/GenrePage'

export const getServerSideProps = genreServerSideProps('movie')

export default GenrePage
