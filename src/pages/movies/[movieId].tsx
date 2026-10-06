import TitleDetailPage, { titleDetailServerSideProps } from '../../components/TitleDetailPage'

export const getServerSideProps = titleDetailServerSideProps('movie')

export default TitleDetailPage
