import CategoryPage, { categoryServerSideProps } from '../../features/catalog/components/CategoryPage'

export const getServerSideProps = categoryServerSideProps('movie')

export default CategoryPage
