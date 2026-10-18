import TitleDetailPage, { titleDetailServerSideProps } from '../../features/catalog/components/TitleDetailPage'

export const getServerSideProps = titleDetailServerSideProps('tv')

export default TitleDetailPage
