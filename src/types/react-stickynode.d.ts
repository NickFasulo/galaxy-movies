declare module 'react-stickynode' {
  import type { ComponentType, ReactNode } from 'react'

  type StickyProps = {
    children: ReactNode
    innerActiveClass?: string
    [key: string]: unknown
  }

  const Sticky: ComponentType<StickyProps>
  export default Sticky
}
