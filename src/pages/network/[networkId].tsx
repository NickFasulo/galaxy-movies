import OrgPage, { orgServerSideProps } from '../../features/catalog/components/OrgPage'

export const getServerSideProps = orgServerSideProps('network')

export default OrgPage
