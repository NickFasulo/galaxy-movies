import TrailerPage, { trailerServerSideProps } from '../../../features/catalog/components/TrailerPage'

export const getServerSideProps = trailerServerSideProps('movie')

export default TrailerPage
