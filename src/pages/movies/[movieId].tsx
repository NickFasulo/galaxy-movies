import TitleDetailPage, { titleDetailServerSideProps } from '../../features/catalog/components/TitleDetailPage'

export const getServerSideProps = titleDetailServerSideProps('movie')

export default TitleDetailPage
