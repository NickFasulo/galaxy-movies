import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang='en'>
      <Head>
        {/* Inlined so the font faces + stack exist in the first HTML — otherwise dev-mode CSS/JS delivery lets body paint in the UA default font first (a flicker font-display can't prevent). */}
        <style dangerouslySetInnerHTML={{ __html: `
          @font-face{font-family:'Inter';src:url('/fonts/inter-var-latin.woff2') format('woff2');font-weight:100 900;font-display:optional}
          @font-face{font-family:'Inter Fallback';src:local('Arial');size-adjust:107%;ascent-override:90%;descent-override:22.5%;line-gap-override:0%}
          @font-face{font-family:'SpaceRanger';src:url('/fonts/SpaceRangerLaserItalic-J7an.otf') format('opentype');font-display:optional}
          html,body{font-family:'Inter','Inter Fallback',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
        `}} />
        <meta name='theme-color' content='#14181c' />
        <link rel='manifest' href='/manifest.json' />
        <link rel='preconnect' href='https://image.tmdb.org' />
        <link rel='dns-prefetch' href='https://api.themoviedb.org' />
        <link rel='preload' href='/fonts/inter-var-latin.woff2' as='font' type='font/woff2' crossOrigin='anonymous' />
        <link rel='preload' href='/fonts/SpaceRangerLaserItalic-J7an.otf' as='font' type='font/opentype' crossOrigin='anonymous' />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
