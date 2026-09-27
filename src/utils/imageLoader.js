export default function imageLoader({ src, width, quality }) {
  if (!src.startsWith('/')) {
    return src
  }

  let tmdbSize = 'w500'
  
  if (width <= 92) {
    tmdbSize = 'w92'
  } else if (width <= 154) {
    tmdbSize = 'w154'
  } else if (width <= 185) {
    tmdbSize = 'w185'
  } else if (width <= 342) {
    tmdbSize = 'w342'
  } else if (width <= 500) {
    tmdbSize = 'w500'
  } else if (width <= 780) {
    tmdbSize = 'w780'
  } else if (width <= 1280) {
    tmdbSize = 'w1280'
  } else {
    tmdbSize = 'original'
  }

  return `https://image.tmdb.org/t/p/${tmdbSize}${src}`
}
