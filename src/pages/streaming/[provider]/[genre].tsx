import ProviderGenrePage, { providerGenreServerSideProps } from '../../../components/ProviderGenrePage'

export const getServerSideProps = providerGenreServerSideProps('movie')

export default ProviderGenrePage
