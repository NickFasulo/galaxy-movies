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
  ScaleFade,
  Spinner,
  HStack
} from '@chakra-ui/react'
import { ChatIcon, CloseIcon } from '@chakra-ui/icons'
import { TbMessageX } from 'react-icons/tb'
import { buildTasteProfile } from '../utils/userData'
import type { ResolvedMention } from '../utils/movieSearch'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderMessageContent(content: string, links: ResolvedMention[] | undefined) {
  if (!links || links.length === 0) {
    return content
  }

  const pattern = new RegExp(`(${links.map((link) => escapeRegExp(link.match)).join('|')})`, 'g')
  const parts = content.split(pattern)

  return parts.map((part, index) => {
    const link = links.find((l) => l.match === part)
    if (!link) return part

    return (
      <Link
        key={index}
        as={NextLink}
        href={link.mediaType === 'tv' ? `/tv/${link.movieId}` : `/movies/${link.movieId}`}
        color="blue.300"
        fontWeight="semibold"
        _hover={{ textDecoration: 'underline' }}
      >
        {part}
      </Link>
    )
  })
}

export default function ChatWidget() {
  const { isOpen, onToggle, onClose } = useDisclosure()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageLinks, setMessageLinks] = useState<Record<number, ResolvedMention[]>>({})
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
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

  useEffect(() => {
    scrollToBottom()
  }, [messages, isStreaming])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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
        throw Object.assign(new Error(errorData.error || 'Failed to get response'), { status: response.status })
      }

      if (!response.body) throw new Error('Empty response body')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const aiMessage: ChatMessage = { role: 'assistant', content: '' }
      const assistantIndex = messages.length + 1

      setMessages(prev => [...prev, aiMessage])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              setIsStreaming(false)
              break
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
        }
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
      const error = caught as Error & { status?: number }
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
  }, [inputValue, messages, isLoading, sessionId])

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

  return (
    <>
      <Box
        position="fixed"
        bottom="4rem"
        right="6"
        zIndex={1000}
      >
        <ScaleFade in={isOpen} unmountOnExit>
          <Box
            bg="#1f252b"
            borderRadius="xl"
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
                <ChatIcon />
                <Text fontWeight="bold">Galaxy Bot</Text>
              </Flex>
              <HStack spacing="2">
                <IconButton
                  icon={<TbMessageX size="18" />}
                  size="sm"
                  variant="ghost"
                  color="white"
                  _hover={{ bg: 'whiteAlpha.200' }}
                  onClick={handleClearChat}
                  isDisabled={messages.length === 0}
                  aria-label="Clear chat"
                  title="Clear chat"
                />
                <IconButton
                  icon={<CloseIcon />}
                  size="sm"
                  variant="ghost"
                  color="white"
                  _hover={{ bg: 'whiteAlpha.200' }}
                  onClick={onClose}
                  aria-label="Close chat"
                />
              </HStack>
            </Flex>

            <Box
              flex="1"
              overflowY="auto"
              p="4"
              bg="#14181c"
            >
              {messages.length === 0 && (
                <VStack spacing="4" align="stretch" mt="4">
                  <Text color="whiteAlpha.900" textAlign="center" fontSize="sm">
                    👋 Hi! I&apos;m your movie and TV show assistant. What are you looking for?
                  </Text>
                  <VStack spacing="2" align="stretch">
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

              <VStack spacing="3" align="stretch">
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

            <Flex p="3" bg="#1f252b" borderTop="1px" borderColor="whiteAlpha.200">
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
                border='1px solid'
                borderColor='whiteAlpha.300'
                _hover={{ bg: '#2a3138' }}
                size="sm"
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputValue.trim()}
              >
                Send
              </Button>
            </Flex>
          </Box>
        </ScaleFade>

        {!isOpen && (
          <IconButton
            icon={<ChatIcon />}
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
            aria-label="Open chat"
          />
        )}
      </Box>
    </>
  )
}