import LeavingProvider, { leavingProviderServerSideProps } from '../../leaving/[provider]'

export const getServerSideProps = leavingProviderServerSideProps('IN')

export default LeavingProvider
