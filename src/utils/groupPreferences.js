export class GroupPreferenceManager {
  constructor() {
    this.profiles = new Map()
    this.groupId = null
  }

  initializeGroup(groupId) {
    this.groupId = groupId
    this.profiles.clear()
    this.loadFromStorage()
  }

  addGroupMember(memberId, preferences = {}) {
    if (!this.groupId) {
      throw new Error('Group not initialized')
    }

    const profile = {
      id: memberId,
      preferences: {
        genres: preferences.genres || [],
        actors: preferences.actors || [],
        directors: preferences.directors || [],
        minRating: preferences.minRating || 0,
        maxRating: preferences.maxRating || 10,
        mood: preferences.mood || 'neutral',
        ...preferences
      },
      weight: preferences.weight || 1.0,
      joinedAt: Date.now()
    }

    this.profiles.set(memberId, profile)
    this.saveToStorage()
    return profile
  }

  removeGroupMember(memberId) {
    this.profiles.delete(memberId)
    this.saveToStorage()
  }

  updateMemberPreferences(memberId, preferences) {
    const profile = this.profiles.get(memberId)
    if (profile) {
      profile.preferences = { ...profile.preferences, ...preferences }
      this.saveToStorage()
      return profile
    }
    return null
  }

  aggregatePreferences() {
    const members = Array.from(this.profiles.values())
    if (members.length === 0) return null

    const aggregated = {
      genres: this.aggregateGenres(members),
      actors: this.aggregateActors(members),
      directors: this.aggregateDirectors(members),
      ratingRange: this.aggregateRatingRange(members),
      mood: this.aggregateMood(members),
      memberCount: members.length
    }

    return aggregated
  }

  aggregateGenres(members) {
    const genreCounts = new Map()
    
    members.forEach(member => {
      const weight = member.weight || 1.0
      member.preferences.genres.forEach(genre => {
        const current = genreCounts.get(genre) || 0
        genreCounts.set(genre, current + weight)
      })
    })

    return Array.from(genreCounts.entries())
      .map(([genre, score]) => ({ genre, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => item.genre)
  }

  aggregateActors(members) {
    const actorCounts = new Map()
    
    members.forEach(member => {
      const weight = member.weight || 1.0
      member.preferences.actors.forEach(actor => {
        const current = actorCounts.get(actor) || 0
        actorCounts.set(actor, current + weight)
      })
    })

    return Array.from(actorCounts.entries())
      .map(([actor, score]) => ({ actor, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.actor)
  }

  aggregateDirectors(members) {
    const directorCounts = new Map()
    
    members.forEach(member => {
      const weight = member.weight || 1.0
      member.preferences.directors.forEach(director => {
        const current = directorCounts.get(director) || 0
        directorCounts.set(director, current + weight)
      })
    })

    return Array.from(directorCounts.entries())
      .map(([director, score]) => ({ director, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(item => item.director)
  }

  aggregateRatingRange(members) {
    let minRating = 10
    let maxRating = 0

    members.forEach(member => {
      minRating = Math.min(minRating, member.preferences.minRating || 0)
      maxRating = Math.max(maxRating, member.preferences.maxRating || 10)
    })

    return { min: minRating, max: maxRating }
  }

  aggregateMood(members) {
    const moodCounts = new Map()
    
    members.forEach(member => {
      const weight = member.weight || 1.0
      const mood = member.preferences.mood || 'neutral'
      const current = moodCounts.get(mood) || 0
      moodCounts.set(mood, current + weight)
    })

    const topMood = Array.from(moodCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]

    return topMood ? topMood[0] : 'neutral'
  }

  calculateCompatibilityScore(movie, memberPreferences) {
    let score = 0
    let factors = 0

    if (movie.genres && memberPreferences.genres.length > 0) {
      const genreMatch = movie.genres.some(g => 
        memberPreferences.genres.includes(g.name)
      )
      if (genreMatch) {
        score += 0.3
      }
      factors++
    }

    if (movie.vote_average && memberPreferences.minRating) {
      if (movie.vote_average >= memberPreferences.minRating) {
        score += 0.2
      }
      factors++
    }

    if (movie.vote_average && memberPreferences.maxRating) {
      if (movie.vote_average <= memberPreferences.maxRating) {
        score += 0.1
      }
      factors++
    }

    return factors > 0 ? score / factors : 0
  }

  calculateGroupCompatibility(movie) {
    const members = Array.from(this.profiles.values())
    if (members.length === 0) return 0

    let totalScore = 0
    members.forEach(member => {
      totalScore += this.calculateCompatibilityScore(movie, member.preferences)
    })

    return totalScore / members.length
  }

  findCompromiseRecommendations(movies, topN = 5) {
    const scoredMovies = movies.map(movie => ({
      movie,
      score: this.calculateGroupCompatibility(movie)
    }))

    return scoredMovies
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(item => item.movie)
  }

  getConsensusLevel() {
    const members = Array.from(this.profiles.values())
    if (members.length < 2) return 1.0

    const aggregated = this.aggregatePreferences()
    if (!aggregated) return 0

    let totalAgreement = 0
    let agreementFactors = 0

    if (aggregated.genres.length > 0) {
      const genreAgreement = members.filter(member => 
        member.preferences.genres.some(g => aggregated.genres.includes(g))
      ).length / members.length
      totalAgreement += genreAgreement
      agreementFactors++
    }

    if (aggregated.ratingRange.max - aggregated.ratingRange.min < 3) {
      totalAgreement += 0.8
      agreementFactors++
    }

    return agreementFactors > 0 ? totalAgreement / agreementFactors : 0
  }

  saveToStorage() {
    if (typeof window !== 'undefined' && this.groupId) {
      const data = {
        groupId: this.groupId,
        profiles: Array.from(this.profiles.entries())
      }
      sessionStorage.setItem(`group_${this.groupId}`, JSON.stringify(data))
    }
  }

  loadFromStorage() {
    if (typeof window !== 'undefined' && this.groupId) {
      const saved = sessionStorage.getItem(`group_${this.groupId}`)
      if (saved) {
        try {
          const data = JSON.parse(saved)
          this.profiles = new Map(data.profiles)
        } catch (e) {
          console.error('Error loading group data:', e)
        }
      }
    }
  }

  clearGroup() {
    if (this.groupId && typeof window !== 'undefined') {
      sessionStorage.removeItem(`group_${this.groupId}`)
    }
    this.groupId = null
    this.profiles.clear()
  }
}

export function createVotingSystem(movies) {
  const votes = new Map()
  
  movies.forEach(movie => {
    votes.set(movie.id, {
      movie,
      upvotes: 0,
      downvotes: 0,
      voters: new Set()
    })
  })

  return {
    vote(movieId, memberId, voteType) {
      const votingData = votes.get(movieId)
      if (!votingData) return false

      if (votingData.voters.has(memberId)) {
        return false // Already voted
      }

      votingData.voters.add(memberId)
      if (voteType === 'up') {
        votingData.upvotes++
      } else if (voteType === 'down') {
        votingData.downvotes++
      }

      return true
    },

    getResults() {
      return Array.from(votes.values())
        .map(data => ({
          movie: data.movie,
          score: data.upvotes - data.downvotes,
          upvotes: data.upvotes,
          downvotes: data.downvotes,
          totalVotes: data.upvotes + data.downvotes
        }))
        .sort((a, b) => b.score - a.score)
    },

    getConsensus(movieId) {
      const votingData = votes.get(movieId)
      if (!votingData || votingData.totalVotes === 0) return 0

      return votingData.upvotes / (votingData.upvotes + votingData.downvotes)
    }
  }
}

export function generateGroupPrompt(groupPreferences) {
  if (!groupPreferences) return ''

  const { genres, actors, directors, ratingRange, mood, memberCount } = groupPreferences

  let prompt = `We're a group of ${memberCount} people looking for a movie to watch together. `

  if (genres.length > 0) {
    prompt += `We generally enjoy ${genres.join(', ')} movies. `
  }

  if (actors.length > 0) {
    prompt += `Some of us like movies with ${actors.join(', ')}. `
  }

  if (directors.length > 0) {
    prompt += `We're interested in films by ${directors.join(', ')}. `
  }

  if (ratingRange.min > 0 || ratingRange.max < 10) {
    prompt += `We're looking for movies rated between ${ratingRange.min} and ${ratingRange.max}. `
  }

  if (mood !== 'neutral') {
    prompt += `We're in the mood for something ${mood}. `
  }

  prompt += 'Please suggest movies that would work well for our group, considering these preferences.'

  return prompt
}