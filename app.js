const STORAGE_KEY = 'skiny-ai.chats.v1';
const KEY_STORAGE = 'skiny-ai.api-key';
const MODEL_STORAGE = 'skiny-ai.model';
const SYSTEM_PROMPT = 'You are Skiny AI, a helpful, intelligent, and friendly assistant. Answer clearly and accurately. Match the user’s language. Be concise unless the user asks for detail. If you are unsure, say so.';

const $ = (selector) => document.querySelector(selector);
const welcome = $('#welcome');
const conversation = $('#conversation');
const input = $('#messageInput');
const form = $('#chatForm');
const sendButton = $('#sendButton');
let chats = loadChats();
let activeChatId = null;
let busy = false;
let recognition = null;

function loadChats() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveChats() { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function activeChat() { return chats.find((chat) => chat.id === activeChatId); }
function escapeHTML(text) { return String(text).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function renderText(text) {
  const safe = escapeHTML(text);
  return safe.split(/```/).map((part, index) => {
    if (index % 2) return `<pre><code>${part.replace(/^\w+\n/, '')}</code></pre>`;
    return part
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }).join('');
}
function renderMessages() {
  const chat = activeChat();
  const messages = chat?.messages || [];
  welcome.hidden = messages.length > 0;
  conversation.innerHTML = messages.map((message, index) => `
    <article class="message ${message.role === 'user' ? 'user-message' : 'assistant-message'}">
      ${message.role === 'assistant' ? '<div class="assistant-avatar" aria-hidden="true">✳</div>' : ''}
      <div class="message-content">${renderText(message.content)}${message.pending ? '<span class="typing-indicator"><i></i><i></i><i></i></span>' : ''}${message.error ? '<button class="retry-button" data-retry="' + index + '">Try again</button>' : ''}</div>
    </article>`).join('');
  conversation.querySelectorAll('[data-retry]').forEach((button) => button.addEventListener('click', retryLast));
  conversation.scrollTop = conversation.scrollHeight;
  requestAnimationFrame(() => { conversation.scrollTop = conversation.scrollHeight; });
  renderHistory();
}
function renderHistory() {
  const list = $('#historyList');
  list.innerHTML = chats.length ? chats.slice().reverse().map((chat) => `
    <div class="history-item ${chat.id === activeChatId ? 'selected' : ''}">
      <button class="history-select" data-chat="${escapeHTML(chat.id)}">${escapeHTML(chat.title || 'New chat')}</button>
      <button class="history-delete" data-delete="${escapeHTML(chat.id)}" aria-label="Delete chat">×</button>
    </div>`).join('') : '<p class="empty-history">Your conversations will appear here.</p>';
  list.querySelectorAll('[data-chat]').forEach((button) => button.addEventListener('click', () => { activeChatId = button.dataset.chat; renderMessages(); closeDrawer(); }));
  list.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => {
    chats = chats.filter((chat) => chat.id !== button.dataset.delete);
    if (activeChatId === button.dataset.delete) activeChatId = null;
    saveChats(); renderMessages();
  }));
}
function startNewChat() { activeChatId = null; renderMessages(); input.focus(); closeDrawer(); }
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3200);
}
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerBackdrop').classList.add('visible'); $('#drawer').setAttribute('aria-hidden', 'false'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerBackdrop').classList.remove('visible'); $('#drawer').setAttribute('aria-hidden', 'true'); }
function openSettings() {
  $('#apiKey').value = localStorage.getItem(KEY_STORAGE) || '';
  $('#modelInput').value = localStorage.getItem(MODEL_STORAGE) || 'gpt-4o-mini';
  $('#modalBackdrop').classList.add('visible'); $('#apiKey').focus();
}
function closeSettings() { $('#modalBackdrop').classList.remove('visible'); }
function resizeInput() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; sendButton.disabled = !input.value.trim() || busy; }
function makeTitle(text) { return text.trim().replace(/\s+/g, ' ').slice(0, 42) || 'New chat'; }

async function sendMessage(text) {
  const value = text.trim();
  if (!value || busy) return;
  if (!activeChat()) {
    const chat = { id: makeId(), title: makeTitle(value), messages: [], updatedAt: Date.now() };
    chats.push(chat); activeChatId = chat.id;
  }
  const chat = activeChat();
  chat.messages.push({ role: 'user', content: value });
  const assistantMessage = { role: 'assistant', content: '', pending: true };
  chat.messages.push(assistantMessage); chat.updatedAt = Date.now();
  input.value = ''; resizeInput(); busy = true; sendButton.disabled = true; sendButton.classList.add('loading');
  saveChats(); renderMessages();
  const apiKey = localStorage.getItem(KEY_STORAGE);
  if (!apiKey) {
    await demoReply(value, assistantMessage, chat);
    return;
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: localStorage.getItem(MODEL_STORAGE) || 'gpt-4o-mini', stream: true, messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chat.messages.filter((message) => !message.pending).slice(-20).map(({ role, content }) => ({ role, content }))
      ] })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Request failed (${response.status}). Check your API key and model.`);
    }
    await readStream(response, assistantMessage, chat);
    assistantMessage.pending = false;
    if (!assistantMessage.content) assistantMessage.content = 'I didn’t receive a response. Please try again.';
  } catch (error) {
    assistantMessage.pending = false; assistantMessage.error = true;
    assistantMessage.content = `I couldn’t reach the AI service: ${error.message}`;
    showToast('Could not get a response. Check your connection and settings.');
  } finally {
    busy = false; sendButton.classList.remove('loading'); saveChats(); renderMessages(); resizeInput(); input.focus();
  }
}
async function readStream(response, message, chat) {
  if (!response.body) throw new Error('Streaming is not supported by this browser.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop() || '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const payload = JSON.parse(data);
        message.content += payload.choices?.[0]?.delta?.content || '';
      } catch { /* Ignore incomplete SSE events. */ }
    }
    message.pending = true; saveChats(); renderMessages();
  }
}
async function demoReply(prompt, message, chat) {
  await new Promise((resolve) => setTimeout(resolve, 550));
  const sample = `I’m ready to help with **${prompt.length > 90 ? `${prompt.slice(0, 87)}…` : prompt}**.\n\nThis is demo mode, so I can’t generate a real AI answer yet. Add your OpenAI API key in **Settings** to enable live, streaming replies.\n\nYour chats are saved locally on this device.`;
  for (let i = 0; i < sample.length; i += 5) {
    message.content = sample.slice(0, i + 5); renderMessages();
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  message.pending = false; busy = false; sendButton.classList.remove('loading'); saveChats(); renderMessages(); resizeInput(); input.focus();
}
function retryLast() {
  const chat = activeChat();
  if (!chat || busy) return;
  const failed = chat.messages.pop();
  const previous = chat.messages[chat.messages.length - 1];
  if (!previous || previous.role !== 'user') { chat.messages.push(failed); return; }
  const userText = previous.content;
  chat.messages.pop(); saveChats(); renderMessages(); sendMessage(userText);
}

form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('input', resizeInput);
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
$('#menuButton').addEventListener('click', openDrawer);
$('#closeDrawer').addEventListener('click', closeDrawer);
$('#drawerBackdrop').addEventListener('click', closeDrawer);
$('#newChatButton').addEventListener('click', startNewChat);
$('#settingsButton').addEventListener('click', openSettings);
$('#brandButton').addEventListener('click', openSettings);
$('#drawerSettings').addEventListener('click', () => { closeDrawer(); openSettings(); });
$('#closeSettings').addEventListener('click', closeSettings);
$('#modalBackdrop').addEventListener('click', (event) => { if (event.target === $('#modalBackdrop')) closeSettings(); });
$('#saveSettings').addEventListener('click', () => {
  const key = $('#apiKey').value.trim(); const model = $('#modelInput').value.trim() || 'gpt-4o-mini';
  if (key) localStorage.setItem(KEY_STORAGE, key); else localStorage.removeItem(KEY_STORAGE);
  localStorage.setItem(MODEL_STORAGE, model); closeSettings();
  showToast(key ? 'Settings saved. Live AI is ready.' : 'Settings saved. Demo mode is active.');
});
$('#clearKey').addEventListener('click', () => { $('#apiKey').value = ''; localStorage.removeItem(KEY_STORAGE); showToast('API key removed from this browser.'); });
$('#attachButton').addEventListener('click', () => showToast('File and image attachments are coming soon.'));
$('#micButton').addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast('Voice input is not supported in this browser.'); return; }
  if (recognition) { recognition.stop(); return; }
  recognition = new SpeechRecognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = true;
  recognition.onresult = (event) => { input.value = Array.from(event.results).map((result) => result[0].transcript).join(''); resizeInput(); };
  recognition.onerror = () => showToast('Could not hear that. Please try again.');
  recognition.onend = () => { recognition = null; $('#micButton').classList.remove('recording'); };
  recognition.start(); $('#micButton').classList.add('recording');
});
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.prompt; resizeInput(); form.requestSubmit(); }));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeDrawer(); closeSettings(); } });
renderMessages(); resizeInput();
