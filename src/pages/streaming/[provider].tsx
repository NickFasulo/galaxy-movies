import ProviderPage, { providerServerSideProps } from '../../features/catalog/components/ProviderPage'

export const getServerSideProps = providerServerSideProps('movie')

export default ProviderPage
