import OrgPage, { orgServerSideProps } from '../../components/OrgPage'

export const getServerSideProps = orgServerSideProps('company')

export default OrgPage
