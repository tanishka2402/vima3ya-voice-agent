import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { MenuService } from './menuService';
import { Orchestrator } from './orchestrator';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const menu = new MenuService();
const sessions = new Map<string, Orchestrator>();

function getSession(id: string | undefined): { id: string; orchestrator: Orchestrator } {
  const sessionId = id && sessions.has(id) ? id : crypto.randomUUID();
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new Orchestrator(menu));
  }
  return { id: sessionId, orchestrator: sessions.get(sessionId)! };
}

app.get('/api/menu', (_req, res) => {
  res.json({ items: menu.getAll() });
});

app.post('/api/message', (req, res) => {
  const { text, sessionId } = req.body as { text?: string; sessionId?: string };
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing "text" in request body.' });
    return;
  }

  const { id, orchestrator } = getSession(sessionId);
  const turn = orchestrator.processTurn(text);
  const state = orchestrator.getState();
  const total = state.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  res.json({
    sessionId: id,
    responseText: turn.responseText,
    toolCalls: turn.toolCalls.map((t) => t.name),
    order: { lines: state.lines, total },
  });
});

app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  const id = sessionId ?? crypto.randomUUID();
  sessions.set(id, new Orchestrator(menu));
  res.json({ sessionId: id });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(PORT, () => {
  console.log(`Steward agent web UI running at http://localhost:${PORT}`);
});
