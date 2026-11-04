import ProviderPage, { providerServerSideProps } from '../../../features/catalog/components/ProviderPage'

export const getServerSideProps = providerServerSideProps('movie', { region: 'IN' })

export default ProviderPage
