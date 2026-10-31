const workerUrl = import.meta.env.VITE_SCRIMBA_WORKER_URL || 'https://scrimba-bot-worker.mkarlen96.workers.dev'

const form = document.getElementById('form')
const input = document.getElementById('user-input')
const submitBtn = document.getElementById('submit-btn')
const conversation = document.getElementById('conversation')
const suggestions = document.getElementById('suggestions')

// Memory, as in the "Setting up the memory" lesson: ['question', 'answer', 'question', …].
// Lives in the browser and is sent to the worker with every question; "New chat" clears it.
let convHistory = []

function addBubble(text, className) {
    const bubble = document.createElement('div')
    bubble.className = `bubble ${className}`
    bubble.textContent = text
    conversation.appendChild(bubble)
    conversation.scrollTop = conversation.scrollHeight
    return bubble
}

async function progressConversation(question) {
    addBubble(question, 'human')
    const typing = addBubble('Thinking…', 'ai typing')
    submitBtn.disabled = true
    suggestions.hidden = true

    try {
        const res = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, history: convHistory }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        typing.className = 'bubble ai'
        typing.textContent = data.answer
        convHistory.push(question, data.answer)
    } catch (err) {
        typing.className = 'bubble error'
        typing.textContent = `Something went wrong: ${err.message}`
    } finally {
        submitBtn.disabled = false
        input.focus()
    }
}

form.addEventListener('submit', (e) => {
    e.preventDefault()
    const question = input.value.trim()
    if (!question || submitBtn.disabled) return
    input.value = ''
    progressConversation(question)
})

suggestions.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && !submitBtn.disabled) progressConversation(e.target.textContent)
})

document.getElementById('clear-btn').addEventListener('click', () => {
    convHistory = []
    conversation.replaceChildren()
    addBubble('How can I help you with Scrimba today?', 'ai')
    suggestions.hidden = false
})
