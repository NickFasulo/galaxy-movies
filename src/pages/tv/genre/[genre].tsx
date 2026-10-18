import GenrePage, { genreServerSideProps } from '../../../features/catalog/components/GenrePage'

export const getServerSideProps = genreServerSideProps('tv')

export default GenrePage
