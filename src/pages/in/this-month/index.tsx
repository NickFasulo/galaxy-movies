import ThisMonthIndex, { thisMonthIndexServerSideProps } from '../../this-month/index'

export const getServerSideProps = thisMonthIndexServerSideProps('IN')

export default ThisMonthIndex
