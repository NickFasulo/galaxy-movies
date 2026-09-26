import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Box,
  IconButton,
  Flex,
  Input,
  Text,
  VStack,
  HStack,
  Badge,
  Button,
  useDisclosure,
  ScaleFade,
  Spinner,
  Tooltip,
  Link
} from '@chakra-ui/react'
import { ChatIcon, CloseIcon, SmallCloseIcon, StarIcon } from '@chakra-ui/icons'

export default function ChatWidget() {
  const router = useRouter()
  const { isOpen, onToggle, onClose } = useDisclosure()
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isGroupMode, setIsGroupMode] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const sessionStartTimeRef = useRef(null)
  const messageCountRef = useRef(0)
  const featuresUsedRef = useRef([])
  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)

  const quickActions = [
    { label: 'What should I watch tonight?', query: 'What should I watch tonight?' },
    { label: 'Comedy recommendations', query: 'Suggest some good comedy movies' },
    { label: 'Recent releases', query: 'What are the best recent movies?' },
    { label: 'Group decision help', query: 'Help us decide what to watch for a group' }
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
    scrollToBottom()
  }, [messages, isStreaming])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const processContentWithLinks = useCallback((content) => {
    if (!content) return content

    const moviePattern = /"([^"]+)"\s*\((\d{4})\)|"([^"]+)"/g
    
    return content.replace(moviePattern, (match, titleWithYear, year, titleOnly) => {
      const title = titleWithYear || titleOnly
      return `__MOVIE_LINK__${title}__${year || ''}__`
    })
  }, [])

  const renderContentWithLinks = useCallback((content) => {
    if (!content) return content

    const parts = content.split('__MOVIE_LINK__')
    const renderedParts = []
    
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const [title, year] = parts[i].split('__')
        renderedParts.push(
          <Link
            key={`movie-${i}`}
            href={`/?search=${encodeURIComponent(title)}`}
            color="blue.500"
            fontWeight="bold"
            textDecoration="underline"
            onClick={(e) => {
              e.preventDefault()
              router.push(`/?search=${encodeURIComponent(title)}`)
            }}
          >
            "{title}"{year && ` (${year})`}
          </Link>
        )
      } else {
        renderedParts.push(parts[i])
      }
    }
    
    return renderedParts
  }, [router])

  const handleSendMessage = useCallback(async (messageText = inputValue) => {
    if (!messageText.trim() || isLoading) return

    const userMessage = { role: 'user', content: messageText.trim() }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)
    setIsStreaming(true)
    messageCountRef.current += 1

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get response')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let aiMessage = { role: 'assistant', content: '' }

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
            } catch (e) {
              console.error('Error parsing stream data:', e)
            }
          }
        }
      }

      const processedContent = processContentWithLinks(aiMessage.content)
      setMessages(prev => {
        const newMessages = [...prev]
        newMessages[newMessages.length - 1] = { ...aiMessage, content: processedContent }
        return newMessages
      })

      if (!sessionId && messageCountRef.current >= 2) {
        try {
          const response = await fetch('/api/chatAnalytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'track_session',
              data: {
                messageCount: messageCountRef.current,
                duration: sessionStartTimeRef.current ? Date.now() - sessionStartTimeRef.current : 0,
                featuresUsed: featuresUsedRef.current
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

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted')
      } else {
        console.error('Error sending message:', error)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.'
        }])
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [inputValue, messages, isLoading, processContentWithLinks])

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleClearChat = () => {
    setMessages([])
    sessionStorage.removeItem('chatMessages')
    sessionStartTimeRef.current = Date.now()
    messageCountRef.current = 0
    featuresUsedRef.current = []
  }

  const handleQuickAction = (query) => {
    handleSendMessage(query)
  }

  return (
    <>
      <Box
        position="fixed"
        bottom="6"
        right="6"
        zIndex={1000}
      >
        <ScaleFade in={isOpen} unmountOnExit>
          <Box
            bg="white"
            borderRadius="xl"
            boxShadow="2xl"
            width={{ base: '90vw', md: '400px' }}
            height={{ base: '60vh', md: '500px' }}
            display="flex"
            flexDirection="column"
            overflow="hidden"
            borderWidth="1px"
            borderColor="gray.200"
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
                <Text fontWeight="bold">Galaxy Movie Assistant</Text>
                {isGroupMode && (
                  <Badge colorScheme="purple" size="sm">Group Mode</Badge>
                )}
              </Flex>
              <HStack spacing="2">
                <Tooltip label="Clear chat">
                  <IconButton
                    icon={<SmallCloseIcon />}
                    size="sm"
                    variant="ghost"
                    color="white"
                    _hover={{ bg: 'whiteAlpha.200' }}
                    onClick={handleClearChat}
                    aria-label="Clear chat"
                  />
                </Tooltip>
                <Tooltip label="Toggle group mode">
                  <IconButton
                    icon={<StarIcon />}
                    size="sm"
                    variant="ghost"
                    color={isGroupMode ? "yellow.300" : "white"}
                    _hover={{ bg: 'whiteAlpha.200' }}
                    onClick={() => {
                      setIsGroupMode(!isGroupMode)
                      if (!isGroupMode && !featuresUsedRef.current.includes('group_mode')) {
                        featuresUsedRef.current.push('group_mode')
                      }
                    }}
                    aria-label="Toggle group mode"
                  />
                </Tooltip>
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
              bg="gray.50"
            >
              {messages.length === 0 && (
                <VStack spacing="4" align="stretch" mt="4">
                  <Text color="gray.600" textAlign="center" fontSize="sm">
                    👋 Hi! I'm your Galaxy Movie Assistant. I can help you:
                  </Text>
                  <VStack spacing="2" align="stretch">
                    {quickActions.map((action, index) => (
                      <Button
                        key={index}
                        size="sm"
                        variant="outline"
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
                    bg={message.role === 'user' ? 'blue.500' : 'white'}
                    color={message.role === 'user' ? 'white' : 'gray.800'}
                    p="3"
                    borderRadius="lg"
                    maxWidth="85%"
                    alignSelf={message.role === 'user' ? 'flex-end' : 'flex-start'}
                    boxShadow="sm"
                  >
                    <Text fontSize="sm" whiteSpace="pre-wrap">
                      {message.role === 'assistant' ? renderContentWithLinks(message.content) : message.content}
                    </Text>
                  </Box>
                ))}
                {isStreaming && (
                  <Box
                    bg="white"
                    color="gray.800"
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

            <Flex p="3" bg="white" borderTop="1px" borderColor="gray.200">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about movies..."
                mr="2"
                disabled={isLoading}
                size="sm"
              />
              <Button
                colorScheme="blue"
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