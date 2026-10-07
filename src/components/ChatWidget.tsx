import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
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
import { buildTasteProfile } from '../utils/userData'
import type { ResolvedMention } from '../utils/movieSearch'
import { LuMessageCircle, LuX } from 'react-icons/lu';

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
      <Link
        key={index}
        color="blue.300"
        fontWeight="semibold"
        _hover={{ textDecoration: 'underline' }}
        asChild><NextLink
          href={link.mediaType === 'tv' ? `/tv/${link.movieId}` : `/movies/${link.movieId}`}>
          {part}
        </NextLink></Link>
    );
  });
}

export default function ChatWidget() {
  const { open, onToggle, onClose } = useDisclosure()
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

    fetch('/api/aiStatus')
      .then((r) => r.json())
      .then((d) => setAiAvailable(d.available !== false))
      .catch(() => setAiAvailable(true))
  }, [])

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
          tasteProfile: buildTasteProfile()
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
        console.error('Error sending message:', error)
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
    }
  }, [inputValue, messages, isLoading, sessionId, onClose])

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
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
  }

  if (!aiAvailable) return null

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
            bg="#1f252b"
            borderRadius="lg"
            boxShadow="2xl"
            width={{ base: '90vw', md: '400px' }}
            height={{ base: '60vh', md: '500px' }}
            display="flex"
            flexDirection="column"
            overflow="hidden"
            borderWidth="1px"
            borderColor="whiteAlpha.200"
          >
            <Flex
              justify="space-between"
              align="center"
              p="4"
              bg="linear-gradient(135deg, #001e2e 0%, #003366 100%)"
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
              bg="#14181c"
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
                        bg='#1f252b'
                        color='white'
                        borderColor='whiteAlpha.300'
                        _hover={{ bg: '#2a3138' }}
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
                    bg={message.role === 'user' ? 'blue.500' : '#2a3138'}
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
                  </Box>
                ))}
                {isStreaming && (
                  <Box
                    bg="#2a3138"
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

            <Flex p="3" bg="#1f252b" borderTop="1px solid var(--chakra-colors-white-alpha-200)">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about movies or shows..."
                mr="2"
                disabled={isLoading}
                size="sm"
                bg="#14181c"
                color="white"
                borderColor="whiteAlpha.300"
                _placeholder={{ color: 'gray.400' }}
              />
              <Button
                bg='#1f252b'
                color='white'
                border='1px solid var(--chakra-colors-white-alpha-300)'
                _hover={{ bg: '#2a3138' }}
                size="sm"
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputValue.trim()}
              >
                Send
              </Button>
            </Flex>
          </Box>
        </Presence>

        {!open && (
          <IconButton
            onClick={onToggle}
            size="lg"
            borderRadius="full"
            bg="linear-gradient(135deg, #001e2e 0%, #003366 100%)"
            color="white"
            _hover={{
              bg: 'linear-gradient(135deg, #003366 0%, #001e2e 100%)',
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