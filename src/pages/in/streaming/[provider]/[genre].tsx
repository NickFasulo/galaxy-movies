import ProviderGenrePage, { providerGenreServerSideProps } from '../../../../features/catalog/components/ProviderGenrePage'

export const getServerSideProps = providerGenreServerSideProps('movie', { region: 'IN' })

export default ProviderGenrePage
