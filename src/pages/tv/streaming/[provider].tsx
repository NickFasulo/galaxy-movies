import ProviderPage, { providerServerSideProps } from '../../../features/catalog/components/ProviderPage'

export const getServerSideProps = providerServerSideProps('tv')

export default ProviderPage
