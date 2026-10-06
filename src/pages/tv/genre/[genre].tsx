import GenrePage, { genreServerSideProps } from '../../../components/GenrePage'

export const getServerSideProps = genreServerSideProps('tv')

export default GenrePage
