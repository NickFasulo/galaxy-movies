export default function removeUnderscores(value: string): string {
  const fragments = value.split('_')

  return fragments
    .map(fragment => {
      if (!fragment) return fragment
      return fragment.charAt(0).toUpperCase() + fragment.slice(1)
    })
    .join(' ')
}
