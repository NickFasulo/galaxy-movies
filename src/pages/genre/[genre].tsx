import GenrePage, { genreServerSideProps } from '../../components/GenrePage'

export const getServerSideProps = genreServerSideProps('movie')

export default GenrePage
