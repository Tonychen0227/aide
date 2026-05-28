import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowUp, X, Paperclip, Copy, CheckCheck, Square, MessageSquarePlus } from 'lucide-react'
import type { ChatMessage, CopilotThread } from '@shared/types'

interface Attachment {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
}

interface ThreadContext {
  threadId: string
  sessionId: string
  taskId: string | null
  title: string
}

/**
 * ThreadChat is the main component rendered in thread popup windows.
 * It provides a chat interface for a specific Copilot thread.
 */
export function ThreadChat() {
  const [context, setContext] = useState<ThreadContext | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load thread context on mount
  useEffect(() => {
    window.aide.threads.getContext().then((ctx) => {
      if (ctx) {
        setContext(ctx)
        // Load chat history for this thread's task if available
        if (ctx.taskId) {
          window.aide.chat.getHistory(ctx.taskId).then(setMessages)
        }
      }
    })
  }, [])

  // Subscribe to events
  useEffect(() => {
    const unsubscribe = window.aideEvents.on((event) => {
      if (event.type === 'chat:message' && context?.taskId) {
        setMessages(prev => [...prev, event.message])
      } else if (event.type === 'chat:stream' && context?.taskId) {
        setStreamingContent(prev => prev + event.delta)
        setIsStreaming(true)
      } else if (event.type === 'chat:stream-end') {
        setIsStreaming(false)
        setStreamingContent('')
      } else if (event.type === 'thread:updated' && event.thread.id === context?.threadId) {
        setContext(prev => prev ? { ...prev, title: event.thread.title } : null)
      }
    })
    return unsubscribe
  }, [context])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming || !context) return
    
    const toSend = attachments.length > 0
      ? attachments.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }))
      : undefined
    
    window.aide.chat.send(trimmed, context.taskId || null, toSend)
    setInput('')
    setAttachments([])
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [input, isStreaming, context, attachments])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments(prev => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: reader.result as string
        }])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      const dt = new DataTransfer()
      files.forEach(f => dt.items.add(f))
      handleFileSelect(dt.files)
    }
  }, [handleFileSelect])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const handleClose = () => {
    if (context) {
      window.aide.threads.close(context.threadId)
    }
  }

  const handleStopStream = () => {
    window.aide.chat.stopStream()
  }

  if (!context) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-0 text-text-tertiary">
        <div className="animate-pulse">Loading thread...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      {/* Header with drag region */}
      <header className="shrink-0">
        <div className="h-[52px] flex items-center justify-between px-4 drag-region">
          <div className="flex items-center gap-2 no-drag">
            <MessageSquarePlus size={16} className="text-accent" />
            <span className="text-[13px] font-medium text-text-secondary truncate max-w-[200px]">
              {context.title}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors no-drag"
            title="Close Thread"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="h-px bg-edge" />
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-12 text-text-tertiary text-[14px]">
              <MessageSquarePlus size={32} className="mx-auto mb-3 opacity-40" />
              <p>Start a new conversation in this thread</p>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isStreaming && (
            <div className="flex gap-3 anim-fade-up">
              <AgentAvatar />
              <div className="flex-1 min-w-0 pt-0.5">
                {streamingContent ? (
                  <div className="text-[14px] leading-[1.7] text-text-secondary prose prose-sm max-w-none">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                ) : (
                  <TypingIndicator />
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0">
        <div className="max-w-2xl mx-auto px-6 py-3 pb-4">
          {/* Attachment preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map(a => (
                <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-1 border border-edge rounded-lg text-[12px] text-text-secondary">
                  {a.type.startsWith('image/') ? (
                    <img src={a.dataUrl} className="w-5 h-5 rounded object-cover" alt="" />
                  ) : (
                    <Paperclip size={12} className="text-text-tertiary" />
                  )}
                  <span className="max-w-[120px] truncate">{a.name}</span>
                  <button onClick={() => removeAttachment(a.id)} className="text-text-tertiary hover:text-text-primary ml-0.5">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Composer box */}
          <div className="bg-surface-1 rounded-2xl border border-edge transition-all focus-within:border-accent/40 focus-within:shadow-[0_0_0_3px_var(--color-accent-subtle)]">
            <div className="px-4 pt-3 pb-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Send a message..."
                className="w-full bg-transparent text-[14px] text-text-primary placeholder:text-text-tertiary resize-none outline-none max-h-40 leading-[1.6]"
                rows={1}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 160) + 'px'
                }}
              />
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors"
                  title="Attach file"
                >
                  <Paperclip size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <button
                    onClick={handleStopStream}
                    className="w-8 h-8 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                    title="Stop"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition-all"
                    title="Send"
                  >
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// === Sub-components ===

function AgentAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
      <span className="text-[11px] font-semibold text-accent">A</span>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end anim-fade-up">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-accent text-white text-[14px] leading-[1.6]">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 anim-fade-up group">
      <AgentAvatar />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="text-[14px] leading-[1.7] text-text-secondary prose prose-sm max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors"
            title="Copy"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ThreadChat
