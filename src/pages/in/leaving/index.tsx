import LeavingIndex, { leavingIndexServerSideProps } from '../../leaving/index'

export const getServerSideProps = leavingIndexServerSideProps('IN')

export default LeavingIndex
