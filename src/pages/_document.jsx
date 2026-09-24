import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang='en'>
      <Head>
        <meta name='theme-color' content='#14181c' />
        <link rel='manifest' href='/manifest.json' />
        <link rel='preconnect' href='https://image.tmdb.org' />
        <link rel='dns-prefetch' href='https://api.themoviedb.org' />
        <link rel='preconnect' href='https://fonts.googleapis.com' />
        <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />
        <link rel='preload' href='/asset/space-ranger-font/SpaceRangerLaserItalic-J7an.otf' as='font' type='font/opentype' crossOrigin='anonymous' />
        <link rel='preload' href='/asset/space-ranger-font/SpaceRanger-EMJl.otf' as='font' type='font/opentype' crossOrigin='anonymous' />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
