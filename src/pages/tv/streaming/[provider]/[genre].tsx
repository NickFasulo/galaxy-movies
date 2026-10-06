import ProviderGenrePage, { providerGenreServerSideProps } from '../../../../components/ProviderGenrePage'

export const getServerSideProps = providerGenreServerSideProps('tv')

export default ProviderGenrePage
