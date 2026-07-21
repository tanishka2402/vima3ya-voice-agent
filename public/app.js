const chatEl = document.getElementById('chat');
const composerEl = document.getElementById('composer');
const inputEl = document.getElementById('input');
const quickbarEl = document.getElementById('quickbar');
const ticketLinesEl = document.getElementById('ticketLines');
const ticketTotalEl = document.getElementById('ticketTotal');
const ticketMetaEl = document.getElementById('ticketMeta');
const resetBtn = document.getElementById('resetBtn');

let sessionId = localStorage.getItem('vima3ya-session') || null;
let prevLineKey = new Map(); // itemId -> "qty" snapshot, to know what changed for the print-in animation
let sending = false;

function addBubble(text, speaker, alert = false) {
  const row = document.createElement('div');
  row.className = `bubble-row bubble-row--${speaker}` + (alert ? ' bubble-row--alert' : '');

  const label = document.createElement('div');
  label.className = 'bubble-label';
  label.textContent = speaker === 'user' ? 'You' : 'Steward';
  row.appendChild(label);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  row.appendChild(bubble);

  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
  return row;
}

function addTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'bubble-row bubble-row--agent';
  row.id = 'typingRow';
  const bubble = document.createElement('div');
  bubble.className = 'bubble typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function removeTypingIndicator() {
  const row = document.getElementById('typingRow');
  if (row) row.remove();
}

function renderTicket(order) {
  const { lines, total } = order;
  ticketTotalEl.textContent = `\u20B9${total}`;

  if (!lines || lines.length === 0) {
    ticketLinesEl.innerHTML = '<p class="ticket__empty">No items yet — order something to start the ticket.</p>';
    prevLineKey = new Map();
    return;
  }

  ticketLinesEl.innerHTML = '';
  const nextLineKey = new Map();

  for (const line of lines) {
    const key = `${line.quantity}`;
    const isNewOrChanged = prevLineKey.get(line.itemId) !== key;
    nextLineKey.set(line.itemId, key);

    const row = document.createElement('div');
    row.className = 'ticket-line' + (isNewOrChanged ? ' ticket-line--new' : '');

    const qty = document.createElement('span');
    qty.className = 'ticket-line__qty';
    qty.textContent = `${line.quantity}x`;

    const name = document.createElement('span');
    name.className = 'ticket-line__name';
    name.textContent = line.name.toUpperCase();

    const leader = document.createElement('span');
    leader.className = 'ticket-line__leader';

    const price = document.createElement('span');
    price.className = 'ticket-line__price';
    price.textContent = `\u20B9${line.quantity * line.unitPrice}`;

    row.append(qty, name, leader, price);
    ticketLinesEl.appendChild(row);
  }

  prevLineKey = nextLineKey;
}

async function sendMessage(text) {
  if (!text.trim() || sending) return;
  sending = true;
  inputEl.value = '';

  addBubble(text, 'user');
  addTypingIndicator();

  try {
    const res = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sessionId }),
    });
    const data = await res.json();

    if (data.sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem('vima3ya-session', sessionId);
    }

    removeTypingIndicator();

    const isAlert = /out of stock|sorry/i.test(data.responseText);
    addBubble(data.responseText, 'agent', isAlert);
    renderTicket(data.order);
  } catch (err) {
    removeTypingIndicator();
    addBubble("Sorry, I'm having trouble reaching the kitchen right now. Please try again.", 'agent', true);
    console.error(err);
  } finally {
    sending = false;
  }
}

composerEl.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

quickbarEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  sendMessage(btn.dataset.text);
});

resetBtn.addEventListener('click', async () => {
  await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  chatEl.innerHTML = '';
  prevLineKey = new Map();
  renderTicket({ lines: [], total: 0 });
  ticketMetaEl.textContent = `TABLE 04 · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  greet();
});

function greet() {
  addBubble(
    "Welcome! I'm your steward for today - happy to help you order. What can I get started for you?",
    'agent'
  );
}

ticketMetaEl.textContent = `TABLE 04 · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
greet();
