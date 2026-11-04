import ThisMonthProvider, { thisMonthProviderServerSideProps } from '../../this-month/[provider]'

export const getServerSideProps = thisMonthProviderServerSideProps('IN')

export default ThisMonthProvider
