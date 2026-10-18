import OrgPage, { orgServerSideProps } from '../../features/catalog/components/OrgPage'

export const getServerSideProps = orgServerSideProps('company')

export default OrgPage
