import CategoryPage, { categoryServerSideProps } from '../../components/CategoryPage'

export const getServerSideProps = categoryServerSideProps('movie')

export default CategoryPage
