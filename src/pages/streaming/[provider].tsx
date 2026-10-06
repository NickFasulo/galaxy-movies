import ProviderPage, { providerServerSideProps } from '../../components/ProviderPage'

export const getServerSideProps = providerServerSideProps('movie')

export default ProviderPage
