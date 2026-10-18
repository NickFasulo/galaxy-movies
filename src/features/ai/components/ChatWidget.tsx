import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from 'react'
import NextLink from 'next/link'
import {
  Box,
  IconButton,
  Flex,
  Input,
  Text,
  VStack,
  Button,
  Link,
  useDisclosure,
  Spinner,
  HStack,
  Presence
} from '@chakra-ui/react'
import { TbMessageX } from 'react-icons/tb'
import { buildTasteProfile } from '../../../lib/userData'
import { getAlertsCredentials } from '../../alerts/alertsSync'
import type { ResolvedMention } from '../movieSearch'
import { getProviderIds } from '../../catalog/tmdb'
import { useUserData } from '../../alerts/hooks/useUserData'
import { useProviderCatalog } from '../../catalog/hooks/useProviderCatalog'
import WatchlistButton from '../../alerts/components/WatchlistButton'
import CardProviderIcons from '../../catalog/components/CardProviderIcons'
import type { WatchProvider } from '../../../types/tmdb'
import { LuMessageCircle, LuX } from 'react-icons/lu';

const INTRO_STORAGE_KEY = 'gm.chat.seen.v1'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderMessageContent(content: string, links: ResolvedMention[] | undefined) {
  if (!links || links.length === 0) {
    return content
  }

  const escaped = links.map((link) => escapeRegExp(link.match)).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts = content.split(pattern)

  return parts.map((part, index) => {
    const link = links.find((l) => l.match === part)
    if (!link) return part

    return (
      <Box as='span' key={index}>
        <Link
          color="blue.300"
          fontWeight="semibold"
          _hover={{ textDecoration: 'underline' }}
          asChild><NextLink
            href={link.mediaType === 'tv' ? `/tv/${link.movieId}` : `/movies/${link.movieId}`}>
            {part}
          </NextLink></Link>
        <WatchlistButton
          movie={{ id: link.movieId, mediaType: link.mediaType === 'tv' ? 'tv' : 'movie', title: link.title, release_date: link.releaseDate || link.year, poster_path: link.poster_path }}
          size='2xs'
          ml={1}
          variant='ghost'
        />
      </Box>
    );
  });
}

// Provider logos for titles linkified in an assistant reply — reuses the
// watchProviders endpoint's LRU/budgets and the shared catalog for logos.
function MessageProviders({ links }: { links: ResolvedMention[] }) {
  const { services } = useUserData()
  const catalog = useProviderCatalog(services.region)
  const [providersByKey, setProvidersByKey] = useState<Record<string, number[]>>({})
  const myProviderIds = useMemo(() => new Set(
    services.providers.flatMap((key) => getProviderIds(key, services.region))
  ), [services])
  const linksKey = links.map((l) => `${l.mediaType}:${l.movieId}`).join(',')

  useEffect(() => {
    if (myProviderIds.size === 0 || links.length === 0) return
    let cancelled = false
    const byType: Record<string, number[]> = {}
    for (const link of links) {
      const type = link.mediaType === 'tv' ? 'tv' : 'movie'
      byType[type] = byType[type] || []
      byType[type].push(link.movieId)
    }
    Promise.all(Object.entries(byType).map(async ([type, ids]) => {
      const resp = await fetch(`/api/watchProviders?region=${services.region}&ids=${ids.join(',')}&type=${type}`)
      if (!resp.ok) return
      const data = await resp.json()
      if (cancelled) return
      setProvidersByKey((prev) => {
        const next = { ...prev }
        for (const [id, providerIds] of Object.entries(data?.results || {})) {
          next[`${type}:${id}`] = providerIds as number[]
        }
        return next
      })
    })).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- linksKey is the stable serialization of links
  }, [linksKey, services.region, myProviderIds.size])

  const rows = links
    .map((link) => {
      const ids = providersByKey[`${link.mediaType}:${link.movieId}`] || []
      const providers = ids
        .map((id) => catalog?.get(id))
        .filter((p): p is WatchProvider => Boolean(p))
      return providers.length ? { link, providers } : null
    })
    .filter((row): row is { link: ResolvedMention; providers: WatchProvider[] } => Boolean(row))

  if (rows.length === 0) return null

  return (
    <HStack gap={2} mt={2} flexWrap='wrap'>
      {rows.map(({ link, providers }) => (
        <Flex key={`${link.mediaType}:${link.movieId}`} align='center' gap={1}>
          <Text fontSize='2xs' color='gray.400' lineClamp={1} maxW='9rem'>{link.title}</Text>
          <CardProviderIcons providers={providers} myProviderIds={myProviderIds} />
        </Flex>
      ))}
    </HStack>
  )
}

export default function ChatWidget() {
  const { open, onOpen, onClose } = useDisclosure()
  const { services } = useUserData()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageLinks, setMessageLinks] = useState<Record<number, ResolvedMention[]>>({})
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const sessionStartTimeRef = useRef<number | null>(null)
  const messageCountRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyLoadedRef = useRef(false)
  const chatSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const linksRef = useRef<Record<number, ResolvedMention[]>>({})

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { linksRef.current = messageLinks }, [messageLinks])

  // Plus-only endpoint — a 403 just means the feature stays local-only.
  const scheduleHistoryPush = useCallback(() => {
    const creds = getAlertsCredentials()
    if (!creds) return
    if (chatSyncTimerRef.current) clearTimeout(chatSyncTimerRef.current)
    chatSyncTimerRef.current = setTimeout(async () => {
      chatSyncTimerRef.current = null
      try {
        const resp = await fetch('/api/chat-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: creds.email,
            key: creds.key,
            messages: messagesRef.current.slice(-30),
            links: linksRef.current
          })
        })
        const data = await resp.json().catch(() => null)
        if (resp.ok && typeof data?.updatedAt === 'number') {
          try { sessionStorage.setItem('chatHistoryUpdatedAt', String(data.updatedAt)) } catch {}
        }
      } catch {}
    }, 4000)
  }, [])

  const hydrateHistory = useCallback(async () => {
    const creds = getAlertsCredentials()
    if (!creds) return
    try {
      const resp = await fetch(
        `/api/chat-history?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`
      )
      if (!resp.ok) return
      const data = await resp.json().catch(() => null)
      const history = data?.history
      if (!history || !Array.isArray(history.messages)) return
      const localTs = Number(sessionStorage.getItem('chatHistoryUpdatedAt') || 0)
      if (typeof history.updatedAt === 'number' && history.updatedAt <= localTs) return
      setMessages(history.messages)
      if (history.links && typeof history.links === 'object') setMessageLinks(history.links)
      try { sessionStorage.setItem('chatHistoryUpdatedAt', String(history.updatedAt || Date.now())) } catch {}
    } catch {}
  }, [])

  const quickActions = [
    { label: 'What should I watch tonight?', query: 'What should I watch tonight?' },
    { label: 'Comedy recommendations', query: 'Suggest some good comedy movies' },
    { label: 'Recent releases', query: 'What are the best recent movies?' }
  ]

  useEffect(() => {
    const savedMessages = sessionStorage.getItem('chatMessages')
    if (savedMessages) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time sessionStorage hydrate; a lazy initializer would mismatch SSR HTML
        setMessages(JSON.parse(savedMessages))
      } catch (e) {
        console.error('Error loading saved messages:', e)
      }
    }

    const savedLinks = sessionStorage.getItem('chatMessageLinks')
    if (savedLinks) {
      try {
        setMessageLinks(JSON.parse(savedLinks))
      } catch (e) {
        console.error('Error loading saved message links:', e)
      }
    }

    const savedSessionId = sessionStorage.getItem('chatSessionId')
    if (savedSessionId) {
      setSessionId(savedSessionId)
    }

    sessionStartTimeRef.current = Date.now()

    if (!localStorage.getItem(INTRO_STORAGE_KEY)) {
      introTimerRef.current = setTimeout(() => setShowIntro(true), 3000)
    }

    return () => {
      if (introTimerRef.current) clearTimeout(introTimerRef.current)
    }
  }, [])

  const dismissIntro = useCallback(() => {
    if (introTimerRef.current) {
      clearTimeout(introTimerRef.current)
      introTimerRef.current = null
    }
    setShowIntro(false)
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, '1')
    } catch {}
  }, [])

  useEffect(() => {
    if (!showIntro) return
    const t = setTimeout(dismissIntro, 14000)
    return () => clearTimeout(t)
  }, [showIntro, dismissIntro])

  // aiStatus is only checked on first open so pageviews that never touch the
  // widget don't pay a function invocation + Redis read.
  const handleOpen = async () => {
    dismissIntro()
    if (!historyLoadedRef.current) {
      historyLoadedRef.current = true
      void hydrateHistory()
    }
    if (aiAvailable === null) {
      try {
        const r = await fetch('/api/aiStatus')
        const d = await r.json()
        if (d.available === false) {
          setAiAvailable(false)
          return
        }
        setAiAvailable(true)
      } catch {}
    }
    onOpen()
  }

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem('chatMessages', JSON.stringify(messages))
    }
  }, [messages])

  useEffect(() => {
    if (Object.keys(messageLinks).length > 0) {
      sessionStorage.setItem('chatMessageLinks', JSON.stringify(messageLinks))
    }
  }, [messageLinks])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isStreaming])

  const handleSendMessage = useCallback(async (messageText = inputValue) => {
    if (!messageText.trim() || isLoading) return

    const userMessage: ChatMessage = { role: 'user', content: messageText.trim() }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)
    setIsStreaming(true)
    messageCountRef.current += 1

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          tasteProfile: buildTasteProfile(),
          serviceKeys: services.providers,
          region: services.region,
          alerts: getAlertsCredentials()
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw Object.assign(new Error(errorData.error || 'Failed to get response'), { status: response.status, code: errorData.code })
      }

      if (!response.body) throw new Error('Empty response body')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const aiMessage: ChatMessage = { role: 'assistant', content: '' }
      const assistantIndex = messages.length + 1
      let sseBuffer = ''

      const handleSseData = (data: string) => {
        if (data === '[DONE]') {
          setIsStreaming(false)
          return
        }
        if (data === '[ERROR]') {
          throw new Error('Stream error occurred')
        }

        try {
          const parsed = JSON.parse(data)
          if (parsed.content) {
            aiMessage.content += parsed.content
            setMessages(prev => {
              const newMessages = [...prev]
              newMessages[newMessages.length - 1] = aiMessage
              return newMessages
            })
          }
          if (parsed.links && parsed.links.length > 0) {
            setMessageLinks(prev => ({ ...prev, [assistantIndex]: parsed.links }))
          }
        } catch (e) {
          console.error('Error parsing stream data:', e)
        }
      }

      setMessages(prev => [...prev, aiMessage])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // A chunk can split an SSE line anywhere; carry the partial tail so
        // the one-shot links event isn't dropped on a boundary.
        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            handleSseData(line.slice(6))
          }
        }
      }

      const tail = sseBuffer.trim()
      if (tail.startsWith('data: ')) {
        handleSseData(tail.slice(6))
      }

      if (!sessionId && messageCountRef.current >= 2) {
        try {
          const response = await fetch('/api/chatAnalytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'track_session',
              data: {
                messageCount: messageCountRef.current,
                duration: sessionStartTimeRef.current ? Date.now() - sessionStartTimeRef.current : 0
              }
            })
          })
          
          if (response.ok) {
            const { sessionId: newSessionId } = await response.json()
            setSessionId(newSessionId)
            sessionStorage.setItem('chatSessionId', newSessionId)
          }
        } catch (error) {
          console.error('Error tracking session:', error)
        }
      }

    } catch (caught) {
      const error = caught as Error & { status?: number; code?: string }
      if (error.status === 503 && error.code === 'ai_unavailable') {
        setAiAvailable(false)
        onClose()
        return
      }
      if (error.name === 'AbortError') {
        console.log('Request was aborted')
      } else {
        // An Error object in console.error surfaces in the Next.js dev error
        // overlay even though we recover — expected HTTP errors log as warn.
        if (error.status) console.warn(`Chat request failed (${error.status}): ${error.message}`)
        else console.error('Error sending message:', error)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: error.status === 429
            ? "You've reached the hourly chat limit. Please come back later for more recommendations."
            : 'Sorry, I encountered an error. Please try again.'
        }])
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      abortControllerRef.current = null
      scheduleHistoryPush()
    }
  }, [inputValue, messages, isLoading, sessionId, onClose, services, scheduleHistoryPush])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }



  const handleQuickAction = (query: string) => {
    handleSendMessage(query)
  }

  const handleClearChat = () => {
    abortControllerRef.current?.abort()
    setMessages([])
    setMessageLinks({})
    setInputValue('')
    setIsLoading(false)
    setIsStreaming(false)
    messageCountRef.current = 0
    sessionStorage.removeItem('chatMessages')
    sessionStorage.removeItem('chatMessageLinks')
    scheduleHistoryPush()
  }

  if (aiAvailable === false) return null

  return (
    <>
      <Box
        position="fixed"
        bottom="4rem"
        right="6"
        zIndex={1000}
      >
        <Presence
          present={open}
          unmountOnExit
          animationStyle={{
            _open: 'scale-fade-in',
            _closed: 'scale-fade-out'
          }}
          animationDuration='moderate'>
          <Box
            bg='surface.raised'
            borderRadius="lg"
            boxShadow="2xl"
            width={{ base: '90vw', md: '400px' }}
            height={{ base: '60vh', md: '500px' }}
            display="flex"
            flexDirection="column"
            overflow="hidden"
            borderWidth="1px"
            borderColor="border.subtle"
          >
            <Flex
              justify="space-between"
              align="center"
              p="4"
              bg="linear-gradient(135deg, var(--chakra-colors-surface-deep) 0%, #003366 100%)"
              color="white"
            >
              <Flex align="center" gap="2">
                <LuMessageCircle />
                <Text fontWeight="bold">Galaxy Bot</Text>
              </Flex>
              <HStack gap="2">
                <IconButton
                  size="sm"
                  variant="ghost"
                  color="white"
                  _hover={{ bg: 'whiteAlpha.200' }}
                  onClick={handleClearChat}
                  disabled={messages.length === 0}
                  aria-label="Clear chat"
                  title="Clear chat"><TbMessageX size="18" /></IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  color="white"
                  _hover={{ bg: 'whiteAlpha.200' }}
                  onClick={onClose}
                  aria-label="Close chat"><LuX /></IconButton>
              </HStack>
            </Flex>

            <Box
              flex="1"
              overflowY="auto"
              p="4"
              bg='surface.canvas'
            >
              {messages.length === 0 && (
                <VStack gap="4" align="stretch" mt="4">
                  <Text color="whiteAlpha.900" textAlign="center" fontSize="sm">
                    👋 Hi! I&apos;m your movie and TV show assistant. What are you looking for?
                  </Text>
                  <VStack gap="2" align="stretch">
                    {quickActions.map((action, index) => (
                      <Button
                        key={index}
                        size="sm"
                        variant="outline"
                        bg='surface.raised'
                        color='white'
                        borderColor='border.subtle'
                        _hover={{ bg: 'surface.overlay' }}
                        onClick={() => handleQuickAction(action.query)}
                        textAlign="left"
                        justifyContent="flex-start"
                      >
                        {action.label}
                      </Button>
                    ))}
                  </VStack>
                </VStack>
              )}

              <VStack gap="3" align="stretch">
                {messages.map((message, index) => (
                  <Box
                    key={index}
                    bg={message.role === 'user' ? 'brand.accent' : 'surface.overlay'}
                    color='white'
                    p="3"
                    borderRadius="lg"
                    maxWidth="85%"
                    alignSelf={message.role === 'user' ? 'flex-end' : 'flex-start'}
                    boxShadow="sm"
                  >
                    <Text fontSize="sm" whiteSpace="pre-wrap">
                      {renderMessageContent(message.content, messageLinks[index])}
                    </Text>
                    {message.role === 'assistant' && messageLinks[index]?.length ? (
                      <MessageProviders links={messageLinks[index]} />
                    ) : null}
                  </Box>
                ))}
                {isStreaming && (
                  <Box
                    bg='surface.overlay'
                    color="white"
                    p="3"
                    borderRadius="lg"
                    maxWidth="85%"
                    alignSelf="flex-start"
                    boxShadow="sm"
                  >
                    <Spinner size="sm" mr="2" />
                    <Text fontSize="sm" display="inline">Thinking...</Text>
                  </Box>
                )}
                <div ref={messagesEndRef} />
              </VStack>
            </Box>

            <Flex p="3" bg='surface.raised' borderTop="1px solid var(--chakra-colors-border-subtle)">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about movies or shows..."
                mr="2"
                disabled={isLoading}
                size="sm"
                fontSize={{ base: '16px', md: 'sm' }}
                bg='surface.canvas'
                color="white"
                borderColor='border.subtle'
                _placeholder={{ color: 'gray.400' }}
              />
              <Button
                bg='surface.raised'
                color='white'
                border='1px solid var(--chakra-colors-border-subtle)'
                _hover={{ bg: 'surface.overlay' }}
                size="sm"
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputValue.trim()}
              >
                Send
              </Button>
            </Flex>
          </Box>
        </Presence>

        <Presence
          present={!open && showIntro}
          unmountOnExit
          animationStyle={{
            _open: 'scale-fade-in',
            _closed: 'scale-fade-out'
          }}
          animationDuration='moderate'
          transformOrigin='bottom right'>
          <Box
            position='absolute'
            bottom='calc(100% + 0.75rem)'
            right='0'
            width='230px'
            bg='surface.raised'
            border='1px solid'
            borderColor='border.subtle'
            borderRadius='lg'
            boxShadow='xl'
            p='3'
            cursor='pointer'
            onClick={handleOpen}>
            <Flex justify='space-between' align='flex-start' gap='2'>
              <Text fontSize='sm' color='whiteAlpha.900' lineHeight='short'>
                <Text as='span' fontWeight='bold' color='white'>Ask Galaxy Bot</Text>
                {' '}for movie &amp; TV picks based on what you&apos;re in the mood for.
              </Text>
              <IconButton
                size='xs'
                variant='ghost'
                color='whiteAlpha.700'
                _hover={{ color: 'white', bg: 'whiteAlpha.200' }}
                onClick={(e) => { e.stopPropagation(); dismissIntro() }}
                aria-label='Dismiss'
                mt='-1'
                mr='-1'><LuX /></IconButton>
            </Flex>
            <Box
              position='absolute'
              bottom='-6px'
              right='18px'
              width='12px'
              height='12px'
              bg='surface.raised'
              borderRight='1px solid'
              borderBottom='1px solid'
              borderColor='border.subtle'
              transform='rotate(45deg)'
            />
          </Box>
        </Presence>

        {!open && (
          <IconButton
            onClick={handleOpen}
            size="lg"
            borderRadius="full"
            bg="linear-gradient(135deg, var(--chakra-colors-surface-deep) 0%, #003366 100%)"
            color="white"
            _hover={{
              bg: 'linear-gradient(135deg, #003366 0%, var(--chakra-colors-surface-deep) 100%)',
              transform: 'scale(1.1)'
            }}
            _active={{
              transform: 'scale(0.95)'
            }}
            boxShadow="lg"
            aria-label="Open chat"><LuMessageCircle /></IconButton>
        )}
      </Box>
    </>
  );
}