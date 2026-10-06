import CategoryPage, { categoryServerSideProps } from '../../../components/CategoryPage'

export const getServerSideProps = categoryServerSideProps('tv')

export default CategoryPage
