import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import type { CopilotThread } from '@shared/types'

// ============================================================
// Thread Window Manager
// Each Copilot conversation runs in its own popup window
// ============================================================

interface ThreadWindow {
  id: string
  window: BrowserWindow
  sessionId: string
  taskId: string | null
  title: string
  createdAt: string
}

const threadWindows = new Map<string, ThreadWindow>()

// Get main window reference (set by main index.ts)
let mainWindowRef: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindowRef = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindowRef
}

// Create a new thread window
export function createThreadWindow(options: {
  taskId?: string | null
  title?: string
  sessionId?: string
}): CopilotThread {
  const threadId = uuid()
  const sessionId = options.sessionId || `thread-${threadId}`
  const title = options.title || 'New Thread'
  const taskId = options.taskId ?? null

  // Calculate position - offset from main window or stack thread windows
  const mainBounds = mainWindowRef?.getBounds()
  const existingCount = threadWindows.size
  const offsetX = 50 + (existingCount * 30)
  const offsetY = 50 + (existingCount * 30)

  const win = new BrowserWindow({
    width: 500,
    height: 700,
    x: mainBounds ? mainBounds.x + mainBounds.width + 20 + offsetX : 100 + offsetX,
    y: mainBounds ? mainBounds.y + offsetY : 100 + offsetY,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { color: '#fafafa', symbolColor: '#1a1a1a', height: 40 } : undefined,
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
    backgroundColor: '#fafafa',
    parent: mainWindowRef || undefined,
    webPreferences: {
      preload: join(__dirname, '../../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      additionalArguments: [
        `--thread-id=${threadId}`,
        `--session-id=${sessionId}`,
        `--task-id=${taskId || ''}`,
        `--thread-title=${encodeURIComponent(title)}`
      ]
    }
  })

  // Load renderer with thread mode query param
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?thread=${threadId}`)
  } else {
    win.loadFile(join(__dirname, '../../renderer/index.html'), {
      query: { thread: threadId }
    })
  }

  const thread: ThreadWindow = {
    id: threadId,
    window: win,
    sessionId,
    taskId,
    title,
    createdAt: new Date().toISOString()
  }

  threadWindows.set(threadId, thread)

  // Save thread to DB for persistence
  saveThreadToDb(thread)

  // Notify main window about new thread
  mainWindowRef?.webContents.send('aide:event', {
    type: 'thread:created',
    thread: getThreadInfo(thread)
  })

  // Handle window close
  win.on('closed', () => {
    threadWindows.delete(threadId)
    mainWindowRef?.webContents.send('aide:event', {
      type: 'thread:closed',
      threadId
    })
  })

  // Handle title updates from thread window
  win.on('page-title-updated', (_, newTitle) => {
    thread.title = newTitle
    mainWindowRef?.webContents.send('aide:event', {
      type: 'thread:updated',
      thread: getThreadInfo(thread)
    })
  })

  console.log(`[Threads] Created thread window: ${threadId} (${title})`)

  return getThreadInfo(thread)
}

// Get thread info for IPC
function getThreadInfo(thread: ThreadWindow): CopilotThread {
  return {
    id: thread.id,
    sessionId: thread.sessionId,
    taskId: thread.taskId,
    title: thread.title,
    createdAt: thread.createdAt,
    isActive: !thread.window.isDestroyed() && thread.window.isFocused()
  }
}

// Save thread to DB
function saveThreadToDb(thread: ThreadWindow): void {
  try {
    const db = getDb()
    db.prepare(`
      INSERT OR REPLACE INTO copilot_threads (id, session_id, task_id, title, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(thread.id, thread.sessionId, thread.taskId, thread.title, thread.createdAt)
  } catch (err) {
    console.error('[Threads] Failed to save thread:', err)
  }
}

// List all active thread windows
export function listThreads(): CopilotThread[] {
  return Array.from(threadWindows.values())
    .filter(t => !t.window.isDestroyed())
    .map(getThreadInfo)
}

// Focus a thread window
export function focusThread(threadId: string): boolean {
  const thread = threadWindows.get(threadId)
  if (thread && !thread.window.isDestroyed()) {
    thread.window.focus()
    return true
  }
  return false
}

// Close a thread window
export function closeThread(threadId: string): boolean {
  const thread = threadWindows.get(threadId)
  if (thread && !thread.window.isDestroyed()) {
    thread.window.close()
    return true
  }
  return false
}

// Update thread title
export function updateThreadTitle(threadId: string, title: string): void {
  const thread = threadWindows.get(threadId)
  if (thread) {
    thread.title = title
    thread.window.setTitle(title)
    mainWindowRef?.webContents.send('aide:event', {
      type: 'thread:updated',
      thread: getThreadInfo(thread)
    })
  }
}

// Get thread window by ID
export function getThreadWindow(threadId: string): BrowserWindow | null {
  const thread = threadWindows.get(threadId)
  return thread && !thread.window.isDestroyed() ? thread.window : null
}

// Broadcast event to all thread windows
export function broadcastToThreads(event: { type: string; [key: string]: unknown }): void {
  for (const thread of threadWindows.values()) {
    if (!thread.window.isDestroyed()) {
      thread.window.webContents.send('aide:event', event)
    }
  }
}

// Close all thread windows
export function closeAllThreads(): void {
  for (const thread of threadWindows.values()) {
    if (!thread.window.isDestroyed()) {
      thread.window.close()
    }
  }
  threadWindows.clear()
}

// Get thread context for a specific thread (called from thread window)
export function getThreadContext(threadId: string): { threadId: string; sessionId: string; taskId: string | null; title: string } | null {
  const thread = threadWindows.get(threadId)
  if (!thread) return null
  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    taskId: thread.taskId,
    title: thread.title
  }
}
