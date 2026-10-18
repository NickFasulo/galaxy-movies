import CategoryPage, { categoryServerSideProps } from '../../../features/catalog/components/CategoryPage'

export const getServerSideProps = categoryServerSideProps('tv')

export default CategoryPage
