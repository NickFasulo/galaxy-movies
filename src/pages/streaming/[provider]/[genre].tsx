import ProviderGenrePage, { providerGenreServerSideProps } from '../../../features/catalog/components/ProviderGenrePage'

export const getServerSideProps = providerGenreServerSideProps('movie')

export default ProviderGenrePage
