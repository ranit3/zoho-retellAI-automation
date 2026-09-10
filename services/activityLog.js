const { EventEmitter } = require('events');

const events = new EventEmitter();
const logs = [];
const leads = new Map();
const MAX_LOGS = 100;
const MAX_LEADS = 5000;

function publish(type, data) {
    const event = { type, ...data, timestamp: new Date().toISOString() };
    if (type === 'log') {
        logs.unshift(event);
        logs.splice(MAX_LOGS);
    }
    events.emit('update', event);
    return event;
}

function addLog(message, level = 'info') {
    console.log(message);
    return publish('log', { message, level });
}

function updateLead(leadId, data) {
    const previous = leads.get(leadId) || { id: leadId };
    const lead = { ...previous, ...data, updatedAt: new Date().toISOString() };
    leads.delete(leadId);
    leads.set(leadId, lead);
    while (leads.size > MAX_LEADS) {
        leads.delete(leads.keys().next().value);
    }
    publish('lead', { lead });
    return lead;
}

function getSnapshot(running) {
    return { type: 'snapshot', running, logs, leads: [...leads.values()].reverse() };
}

module.exports = {
    events,
    addLog,
    updateLead,
    getSnapshot
};