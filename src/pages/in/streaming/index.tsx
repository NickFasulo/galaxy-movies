export function getServerSideProps() {
  return { redirect: { destination: '/streaming-in-india', permanent: true } }
}

export default function InStreamingIndex() {
  return null
}
