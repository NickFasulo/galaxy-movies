# Code Optimization & Performance Rules
- **Tree-shaking & Bloat:** Identify and remove dead code, unused dependencies, and redundant utilities.
- **Lighthouse Performance:** Enforce dynamic imports (React.lazy/Next.js dynamic) for heavy components below the fold.
- **Core Web Vitals:** Ensure images use explicit dimensions and priority loading for LCP elements.
- **Bundle Size:** Replace heavy third-party libraries (e.g., moment.js, lodash) with native JS equivalents where possible.
- **State & Renders:** Prevent unnecessary re-renders using React.memo, useMemo, or structural state isolation.