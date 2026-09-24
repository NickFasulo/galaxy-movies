# Galaxy Movies

[![Live Demo](https://img.shields.io/badge/Live%20Demo-galaxymovies.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://www.galaxymovies.app/)

**Galaxy Movies** is an ultra-fast, mobile-friendly film discovery platform designed for movie lovers who want a zero-clutter interface to find where to watch movies and get instant AI-generated synopses.

---

## ✨ Features

- **⚡ Instant Search & Discovery:** Browse thousands of trending films and explore cast networks at warp speed with sub-100ms transitions.
- **📺 Where to Watch:** Check exact streaming platform availability for any movie with a single click.
- **🤖 AI Synopses:** Get quick, objective film summaries generated via the OpenAI API before deciding what to watch.
- **🌌 Dynamic Edge OG Cards:** Generates high-resolution social share cards dynamically using `@vercel/og` on Vercel Edge Runtime.

---

## 🛠️ Tech Stack & Architecture

- **Framework:** [Next.js](https://nextjs.org/) (Pages Router)
- **Runtime:** [Vercel Edge Runtime](https://vercel.com/edge) & `@vercel/og`
- **State & Caching:** [React Query](https://tanstack.com/query)
- **UI Components:** [Chakra UI](https://chakra-ui.com/)
- **CI/CD & Quality:** [Lighthouse CI](https://github.com/google/lighthouse-ci)
- **APIs:** [TMDB API](https://www.themoviedb.org/documentation/api) & [OpenAI API](https://openai.com/)
