const axios = require('axios');

const ALLOWED_VALUES = {
    right_person: ['Yes', 'No'],
    interest_level: ['High', 'Medium', 'Low', 'None'],
    outcome: ['Meeting', 'Email', 'Callback', 'Not Interested', 'Wrong Person'],
    next_action: ['Book Meeting', 'Send Email', 'Call Back', 'Follow Up', 'Stop']
};

function getModelConfig() {
    const provider = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
    const defaultUrl = provider === 'deepinfra'
        ? 'https://api.deepinfra.com/v1/openai/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';

    return {
        apiKey: process.env.AI_API_KEY,
        model: process.env.AI_MODEL,
        url: process.env.AI_API_URL || defaultUrl
    };
}

function buildPrompt(transcript, callStatus) {
    return `Analyze this sales call transcript and return JSON only. Do not use markdown.

Call status from the telephony provider: ${callStatus}

Allowed values:
- lead_score: integer 1, 2, 3, 4, or 5
- right_person: Yes or No
- interest_level: High, Medium, Low, or None
- outcome: Meeting, Email, Callback, Not Interested, or Wrong Person
- objection_reason: Already have agency, No time, or Not priority; otherwise null
- next_action: Book Meeting, Send Email, Call Back, Follow Up, or Stop
- next_action_date: YYYY-MM-DD or null

Rules:
- Use only information supported by the transcript.
- Use null when information is missing or unclear.
- summary must contain 2 to 4 sentences.
- Do not decide call_status from the transcript; use the supplied telephony status.

Return exactly this shape:
{
  "lead_score": 1,
  "right_person": "Yes",
  "interest_level": "High",
  "outcome": "Meeting",
  "objection_reason": null,
  "call_summary": "",
  "next_action": "Follow Up",
  "next_action_date": null
}

Transcript:
${transcript}`;
}

function parseModelJson(content) {
    const withoutCodeFence = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(withoutCodeFence);
}

function normalizeChoice(value, allowedValues) {
    return allowedValues.includes(value) ? value : null;
}

function normalizeDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : value;
}

function applyBusinessRules(result, callStatus) {
    const normalized = {
        lead_score: Number.isInteger(result.lead_score) && result.lead_score >= 1 && result.lead_score <= 5
            ? result.lead_score
            : null,
        right_person: normalizeChoice(result.right_person, ALLOWED_VALUES.right_person),
        interest_level: normalizeChoice(result.interest_level, ALLOWED_VALUES.interest_level),
        outcome: normalizeChoice(result.outcome, ALLOWED_VALUES.outcome),
        objection_reason: ['Already have agency', 'No time', 'Not priority'].includes(result.objection_reason)
            ? result.objection_reason
            : null,
        call_summary: typeof result.call_summary === 'string' ? result.call_summary.trim() : '',
        next_action: normalizeChoice(result.next_action, ALLOWED_VALUES.next_action),
        next_action_date: normalizeDate(result.next_action_date)
    };

    if (callStatus === 'No Answer' || callStatus === 'Failed') normalized.next_action = 'Call Back';
    if (callStatus === 'Voicemail') normalized.next_action = 'Follow Up';
    if (normalized.outcome === 'Wrong Person') {
        normalized.right_person = 'No';
        normalized.next_action = 'Stop';
    }
    if (normalized.outcome === 'Not Interested') {
        normalized.interest_level = 'None';
        normalized.next_action = 'Stop';
    }

    return normalized;
}

function createEmptyAnalysis(callStatus) {
    return applyBusinessRules({}, callStatus);
}

async function analyzeTranscript(transcript, callStatus) {
    const config = getModelConfig();
    if (!config.apiKey || !config.model) {
        throw new Error('AI_API_KEY and AI_MODEL must be configured before transcript analysis');
    }

    const response = await axios.post(config.url, {
        model: config.model,
        temperature: 0,
        messages: [
            { role: 'system', content: 'You are a careful CRM call analyst.' },
            { role: 'user', content: buildPrompt(transcript, callStatus) }
        ]
    }, {
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI provider returned no message content');

    return applyBusinessRules(parseModelJson(content), callStatus);
}

module.exports = {
    analyzeTranscript,
    createEmptyAnalysis
};