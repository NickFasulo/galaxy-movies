import ProviderGenrePage, { providerGenreServerSideProps } from '../../../../features/catalog/components/ProviderGenrePage'

export const getServerSideProps = providerGenreServerSideProps('tv')

export default ProviderGenrePage
