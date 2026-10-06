import OrgPage, { orgServerSideProps } from '../../components/OrgPage'

export const getServerSideProps = orgServerSideProps('network')

export default OrgPage
