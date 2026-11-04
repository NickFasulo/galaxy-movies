import NewOnProvider, { newOnProviderServerSideProps } from '../../new-on-streaming/[provider]'

export const getServerSideProps = newOnProviderServerSideProps('IN')

export default NewOnProvider
