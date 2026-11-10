import TrailerPage, { trailerServerSideProps } from '../../../features/catalog/components/TrailerPage'

export const getServerSideProps = trailerServerSideProps('tv')

export default TrailerPage
