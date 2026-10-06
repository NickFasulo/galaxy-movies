import TitleDetailPage, { titleDetailServerSideProps } from '../../components/TitleDetailPage'

export const getServerSideProps = titleDetailServerSideProps('tv')

export default TitleDetailPage
