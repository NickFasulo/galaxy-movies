import type { EditorialSection } from './curatedLists'

export interface ListEditorial {
  sections: EditorialSection[]
  gridHeading?: string
}

// Hand-written prose overlaid on discover/similar lists — a title, tagline and
// TMDB grid alone reads thin enough that Google sits at "Discovered - currently
// not indexed". Sections render between the AI intro and the movie grid, so
// generated 'similar' lists keep their dynamic picks while gaining unique copy.
// Slugs must match curatedLists keys or generated 'content:lists' hash fields.
export const listEditorials: Record<string, ListEditorial> = {
  'cozy-night-in': {
    gridHeading: 'The cozy canon',
    sections: [
      {
        heading: 'What makes a movie cozy',
        paragraphs: [
          'Cozy is a formula before it is a genre: low stakes, a warm palette, and endings that land soft. The picks here favor comedy, family and romance titles that run under two hours, because a cozy watch should never feel like homework. Nothing on this list will leave you staring at the ceiling wondering about humanity.',
          'The sweet spot is a film you have either seen a dozen times or wish you had. Rewatch value matters more than novelty — a familiar favorite lowers the barrier to actually pressing play, which is the whole point of the exercise.'
        ]
      }
    ]
  },
  'quick-watch-under-90': {
    gridHeading: 'The sub-90 picks',
    sections: [
      {
        heading: 'Short does not mean slight',
        paragraphs: [
          'Ninety minutes is not a limitation — it is an editing philosophy. The films here skip the second-act sprawl: no wheel-spinning subplots, no third climax, just a premise executed cleanly and out the door before it overstays. Some of the tightest storytelling in film lives in this bracket because there is nowhere to hide a weak scene.',
          'These are ideal for weeknights when a three-hour commitment is off the table but a sitcom episode feels like settling. High rating floor, short runtime — the list is built to be finished, not abandoned.'
        ]
      }
    ]
  },
  'date-night-picks': {
    gridHeading: 'Date-night shortlist',
    sections: [
      {
        heading: 'Built for two people with different tastes',
        paragraphs: [
          'The failure mode of date night is forty minutes of scrolling before giving up entirely. These picks lean romance and comedy because those genres forgive half-attention — you can talk over them a little, which is sort of the point — but they are rated high enough that neither of you is merely tolerating the evening.',
          'Crowd-pleasers get a bad reputation they have not earned. A movie both people enjoy beats a masterpiece one person endures, so the bar here is broad appeal with real craft underneath.'
        ]
      }
    ]
  },
  'family-movie-night': {
    gridHeading: 'The family shelf',
    sections: [
      {
        heading: 'Kids entertained, adults awake',
        paragraphs: [
          'The real test of a family movie is whether the adults can sit through it too. Animation and family titles dominate this list, filtered for the ones that pack jokes over the kids\' heads and enough craft to hold a grown-up\'s attention — the Pixar-and-Ghibli standard, not the straight-to-streaming babysitter tier.',
          'Watch for the ones the kids will want to see again next week. That is the difference between a movie night and a tradition.'
        ]
      }
    ]
  },
  'underrated-90s-gems': {
    gridHeading: 'The overlooked shelf',
    sections: [
      {
        heading: 'Great films the decade forgot',
        paragraphs: [
          'The 90s produced a strange class of movie: critically loved, modestly seen, and buried ever since under the decade\'s blockbusters. This list caps the vote count on purpose — anything with blockbuster-scale attention is excluded, so what remains are well-reviewed titles most people simply never got around to.',
          'That makes this the highest-discovery list on the site: genuinely good films you are unlikely to have already watched. If you have seen everything, start here.'
        ]
      }
    ]
  },
  'heist-movies': {
    gridHeading: 'The scores',
    sections: [
      {
        heading: 'The genre\'s durable pleasure',
        paragraphs: [
          'Heist movies run on a loop that never wears out: assemble the crew, explain the plan, watch the plan go wrong. The fun is in the competence — people who are very good at very illegal things improvising when the vault, the alarm or one of their own turns out to be a problem.',
          'The picks span the slick ensemble caper and the gritty one-last-job variety. If the plan went smoothly, it would not be a movie — every title here earns its complications.'
        ]
      }
    ]
  },
  'ai-and-machines': {
    gridHeading: 'The AI picks',
    sections: [
      {
        heading: 'Movies that saw it coming',
        paragraphs: [
          'AI movies age differently than other sci-fi: what read as fantasy in the 80s now plays like a documentary pitch. The genre splits roughly in two — machines that want to be human and machines that decide humans are the obstacle — and the best entries on this list work both sides of that line.',
          'The recurring question is not really about technology. It is whether consciousness made of silicon would owe us anything, or we it. The films below answer it very differently.'
        ]
      }
    ]
  },
  'movies-like-inception': {
    gridHeading: 'The recommendations',
    sections: [
      {
        heading: 'If the dream logic is what hooked you',
        paragraphs: [
          'Inception\'s trick was making a heist film run on metaphysics: nested realities, rules you have to learn mid-action, and an ending that trusts the audience to argue about it. The picks share pieces of that — puzzle-box structures, unreliable reality, sci-fi premises treated as physics problems rather than window dressing.',
          'Fair warning that nothing fully replicates it, because the scale was the point. But if what you want is another film that makes you rewatch to understand rather than just rewatch for fun, this shelf delivers.'
        ]
      }
    ]
  },
  'movies-like-interstellar': {
    gridHeading: 'The recommendations',
    sections: [
      {
        heading: 'Big physics, bigger feelings',
        paragraphs: [
          'Interstellar worked because the astrophysics was the delivery mechanism, not the payload — the payload was a father missing his kids grow up on a video feed. The films here chase the same combination: real scientific ideas (relativity, first contact, survival math) in service of an emotional core that has nothing to do with science.',
          'Expect a bias toward space and time-bending rather than pure spectacle. The common thread is ambition — each of these wants to leave you a little awed, a little wrecked, and reading the Wikipedia article afterward.'
        ]
      }
    ]
  },
  'movies-like-parasite': {
    gridHeading: 'The recommendations',
    sections: [
      {
        heading: 'Genre is the weapon',
        paragraphs: [
          'Parasite\'s genius was refusing to pick a lane: comedy for an hour, thriller by the halfway mark, horror by the end, satire throughout. The films here share that shapeshifter DNA — stories that use genre conventions to smuggle in something sharper, usually about who has money and who does not.',
          'Several are Korean, which is not a coincidence: Bong Joon-ho, Park Chan-wook and their cohort spent two decades perfecting the tonal whiplash Parasite brought mainstream. The rest pull the same trick from other directions — dark comedy curdling into something else entirely.'
        ]
      }
    ]
  },
  'movies-like-the-dark-knight': {
    gridHeading: 'The recommendations',
    sections: [
      {
        heading: 'Crime sagas wearing a cape',
        paragraphs: [
          'The Dark Knight was a Michael Mann crime epic that happened to feature a man in a bat suit — that is why it outlived its genre. The picks lean toward films with the same architecture: an obsessive protagonist, a destabilizing antagonist, a city under pressure, and moral lines that blur as the stakes climb.',
          'Not all of them are superhero movies — most are not, because the appeal was never the costume. If what you want is that specific tension of a principled lead facing an enemy who does not play by any rules, start anywhere on this list.'
        ]
      }
    ]
  },
  'movies-like-fight-club': {
    gridHeading: 'The recommendations',
    sections: [
      {
        heading: 'Unreliable narrators and cracked identities',
        paragraphs: [
          'Fight Club taught a generation to distrust the voice telling them the story. The films here share its signature moves — narrators who lie to you or themselves, twist structures that recontextualize the first act, and protagonists whose real enemy turns out to be internal.',
          'There is also the anti-consumerist streak, though not every pick shares it. What unites them is the rewatch mechanic: the second viewing is a different film because you finally know what the first one was doing.'
        ]
      }
    ]
  },
  'movies-like-gone-girl': {
    gridHeading: 'The recommendations',
    sections: [
      {
        heading: 'Marriage as a crime scene',
        paragraphs: [
          'Gone Girl weaponized the domestic thriller: the missing-wife mystery turned inside out, narrators who cannot be trusted, and a marriage rendered as psychological warfare. The picks orbit the same territory — missing persons, unreliable testimony, and relationships that look very different from the inside.',
          'The other shared trait is ruthlessness. These stories do not let anyone stay sympathetic for long, which is exactly what makes them impossible to pause.'
        ]
      }
    ]
  }
}
