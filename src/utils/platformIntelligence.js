import { streamingProviders } from './tmdb'

export class PlatformIntelligence {
  constructor() {
    this.userRegion = 'US'
    this.userSubscriptions = new Set()
    this.providerAvailability = new Map()
    this.loadUserPreferences()
  }

  loadUserPreferences() {
    if (typeof window !== 'undefined') {
      const savedRegion = localStorage.getItem('userRegion')
      if (savedRegion) {
        this.userRegion = savedRegion
      }

      const savedSubs = localStorage.getItem('userSubscriptions')
      if (savedSubs) {
        try {
          this.userSubscriptions = new Set(JSON.parse(savedSubs))
        } catch (e) {
          console.error('Error loading subscriptions:', e)
        }
      }
    }
  }

  saveUserPreferences() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('userRegion', this.userRegion)
      localStorage.setItem('userSubscriptions', JSON.stringify(Array.from(this.userSubscriptions)))
    }
  }

  setUserRegion(region) {
    this.userRegion = region
    this.saveUserPreferences()
  }

  addSubscription(provider) {
    this.userSubscriptions.add(provider)
    this.saveUserPreferences()
  }

  removeSubscription(provider) {
    this.userSubscriptions.delete(provider)
    this.saveUserPreferences()
  }

  hasSubscription(provider) {
    return this.userSubscriptions.has(provider)
  }

  async checkMovieAvailability(movieId) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch provider data')
      }

      const data = await response.json()
      const regionalData = data.results?.[this.userRegion] || data.results?.US || {}
      
      this.providerAvailability.set(movieId, regionalData)
      return regionalData
    } catch (error) {
      console.error('Error checking movie availability:', error)
      return {}
    }
  }

  getAvailableProviders(movieId) {
    const availability = this.providerAvailability.get(movieId)
    if (!availability) return []

    const providers = []
    
    if (availability.flatrate) {
      providers.push(...availability.flatrate.map(p => ({
        ...p,
        type: 'subscription'
      })))
    }

    if (availability.buy) {
      providers.push(...availability.buy.map(p => ({
        ...p,
        type: 'purchase'
      })))
    }

    if (availability.rent) {
      providers.push(...availability.rent.map(p => ({
        ...p,
        type: 'rental'
      })))
    }

    if (availability.free) {
      providers.push(...availability.free.map(p => ({
        ...p,
        type: 'free'
      })))
    }

    return providers
  }

  filterMoviesBySubscription(movies) {
    if (this.userSubscriptions.size === 0) {
      return movies
    }

    return movies.filter(movie => {
      const availability = this.providerAvailability.get(movie.id)
      if (!availability) return true

      const flatrateProviders = availability.flatrate || []
      return flatrateProviders.some(provider => 
        this.userSubscriptions.has(provider.provider_name.toLowerCase())
      )
    })
  }

  getSubscriptionCostEstimate(providers) {
    const knownCosts = {
      'netflix': 15.49,
      'amazon prime video': 14.99,
      'hulu': 14.99,
      'disney plus': 10.99,
      'apple tv': 9.99,
      'max': 15.99,
      'peacock': 5.99,
      'paramount plus': 11.99
    }

    let totalCost = 0
    const newSubscriptions = []

    providers.forEach(provider => {
      const providerName = provider.provider_name.toLowerCase()
      if (!this.userSubscriptions.has(providerName)) {
        const cost = knownCosts[providerName] || 12.99
        totalCost += cost
        newSubscriptions.push({ name: provider.provider_name, cost })
      }
    })

    return {
      totalCost,
      newSubscriptions,
      monthlySavings: this.calculateSavings(newSubscriptions)
    }
  }

  calculateSavings(newSubscriptions) {
    if (newSubscriptions.length === 0) return 0

    const totalNewCost = newSubscriptions.reduce((sum, sub) => sum + sub.cost, 0)
    const currentMonthlyCost = this.getCurrentSubscriptionCost()

    return currentMonthlyCost - totalNewCost
  }

  getCurrentSubscriptionCost() {
    const knownCosts = {
      'netflix': 15.49,
      'amazon prime video': 14.99,
      'hulu': 14.99,
      'disney plus': 10.99,
      'apple tv': 9.99,
      'max': 15.99,
      'peacock': 5.99,
      'paramount plus': 11.99
    }

    let totalCost = 0
    this.userSubscriptions.forEach(provider => {
      totalCost += knownCosts[provider] || 12.99
    })

    return totalCost
  }

  getOptimalViewingOption(movieId) {
    const providers = this.getAvailableProviders(movieId)
    if (providers.length === 0) return null

    const priority = ['subscription', 'free', 'rental', 'purchase']
    
    providers.sort((a, b) => {
      const priorityA = priority.indexOf(a.type)
      const priorityB = priority.indexOf(b.type)
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      const aHasSub = this.hasSubscription(a.provider_name.toLowerCase())
      const bHasSub = this.hasSubscription(b.provider_name.toLowerCase())
      
      if (aHasSub && !bHasSub) return -1
      if (!aHasSub && bHasSub) return 1
      
      return 0
    })

    return providers[0]
  }

  async batchCheckAvailability(movieIds) {
    const promises = movieIds.map(id => this.checkMovieAvailability(id))
    const results = await Promise.allSettled(promises)
    
    return results.map((result, index) => ({
      movieId: movieIds[index],
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null
    }))
  }

  getRegionalRecommendations(movies, targetRegion = null) {
    const region = targetRegion || this.userRegion
    
    return movies.filter(movie => {
      const availability = this.providerAvailability.get(movie.id)
      if (!availability) return true

      const regionalData = availability[region] || availability.US
      return regionalData && (regionalData.flatrate?.length > 0 || 
                               regionalData.free?.length > 0)
    })
  }

  getPlatformSummary(movieId) {
    const providers = this.getAvailableProviders(movieId)
    const summary = {
      total: providers.length,
      subscription: 0,
      purchase: 0,
      rental: 0,
      free: 0,
      hasSubscription: false,
      optimalOption: null
    }

    providers.forEach(provider => {
      summary[provider.type]++
      if (provider.type === 'subscription' && 
          this.hasSubscription(provider.provider_name.toLowerCase())) {
        summary.hasSubscription = true
      }
    })

    summary.optimalOption = this.getOptimalViewingOption(movieId)
    return summary
  }

  generatePlatformPrompt(movieId) {
    const summary = this.getPlatformSummary(movieId)
    const optimal = summary.optimalOption

    let prompt = ''
    
    if (summary.hasSubscription) {
      prompt += `This movie is available on your existing subscriptions (${optimal.provider_name}). `
    } else if (summary.subscription > 0) {
      prompt += `This movie requires a subscription to ${optimal.provider_name}. `
    } else if (summary.free > 0) {
      prompt += `This movie is available for free on ${optimal.provider_name}. `
    } else if (summary.rental > 0) {
      prompt += `This movie is available for rental on ${optimal.provider_name}. `
    } else if (summary.purchase > 0) {
      prompt += `This movie is available for purchase on ${optimal.provider_name}. `
    } else {
      prompt += 'This movie may not be currently available on major streaming platforms in your region. '
    }

    const costInfo = this.getSubscriptionCostEstimate([optimal])
    if (costInfo.newSubscriptions.length > 0) {
      prompt += `Adding this would cost approximately $${costInfo.totalCost.toFixed(2)}/month. `
    }

    return prompt
  }

  detectRegionFromHeaders(headers) {
    const cloudflareCountry = headers['cf-ipcountry']
    const vercelCountry = headers['x-vercel-ip-country']
    
    return cloudflareCountry || vercelCountry || 'US'
  }

  async syncWithCloudflareRegion(headers) {
    const detectedRegion = this.detectRegionFromHeaders(headers)
    if (detectedRegion && detectedRegion !== this.userRegion) {
      this.setUserRegion(detectedRegion)
    }
  }
}

export function createPlatformFilter(recommendations, platformIntelligence) {
  return {
    async filterBySubscription(movies) {
      return platformIntelligence.filterMoviesBySubscription(movies)
    },

    async filterByRegion(movies, region) {
      return platformIntelligence.getRegionalRecommendations(movies, region)
    },

    async enrichWithPlatformData(movies) {
      const movieIds = movies.map(m => m.id)
      const availabilityData = await platformIntelligence.batchCheckAvailability(movieIds)
      
      return movies.map((movie, index) => ({
        ...movie,
        platformData: availabilityData[index]?.data || null,
        platformSummary: availabilityData[index]?.success ? 
          platformIntelligence.getPlatformSummary(movie.id) : null
      }))
    },

    sortByAvailability(movies) {
      return movies.sort((a, b) => {
        const aHasSub = a.platformSummary?.hasSubscription ? 1 : 0
        const bHasSub = b.platformSummary?.hasSubscription ? 1 : 0
        return bHasSub - aHasSub
      })
    }
  }
}

export const platformHints = {
  netflix: 'Great for original content and binge-worthy series',
  'amazon prime video': 'Includes Prime originals and rental options',
  hulu: 'Strong on current TV shows and next-day streaming',
  'disney plus': 'Perfect for family-friendly content and Disney classics',
  'apple tv': 'High-quality originals and Apple exclusives',
  max: 'HBO content plus Warner Bros library',
  peacock: 'NBCUniversal content and live sports',
  'paramount plus': 'CBS content and Paramount films'
}