require('dotenv').config();
const express = require('express');
const path = require('path');
const retellRoutes = require('./routes/retell');
const { startPolling, stopPolling, pauseAllActiveCalls, isPolling, clearProcessedLeads } = require('./services/zohoPolling');
const { events, getSnapshot } = require('./services/activityLog');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/webhooks/retell', retellRoutes);

app.get('/api/version', (req, res) => {
  res.json({ version: '1.0.6', features: ['customer_name', 'company_name', 'call_transcript', 'pause_calls'] });
});

app.get('/api/control/status', (req, res) => {
  res.json({ running: isPolling() });
});

app.get('/api/activity', (req, res) => {
  res.json(getSnapshot(isPolling()));
});

app.get('/api/activity/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(getSnapshot(isPolling()))}\n\n`);

  const sendUpdate = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  events.on('update', sendUpdate);
  req.on('close', () => events.off('update', sendUpdate));
});

app.post('/api/control/start', async (req, res) => {
  const started = await startPolling();
  res.status(started ? 200 : 500).json({ running: isPolling(), started });
});

app.post('/api/control/stop', async (req, res) => {
  stopPolling();
  const pauseResult = await pauseAllActiveCalls();
  res.json({ running: false, paused: pauseResult.count || 0 });
});

app.post('/api/control/pause', async (req, res) => {
  const result = await pauseAllActiveCalls();
  res.json({ running: isPolling(), paused: result.count || 0, success: result.success });
});

app.post('/api/control/reset', (req, res) => {
  clearProcessedLeads();
  res.json({ success: true });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (process.env.CONTROL_MODE !== 'true') {
    startPolling().catch((error) => console.error('Automatic Zoho setup failed:', error.message));
  }
});

module.exports = server;
