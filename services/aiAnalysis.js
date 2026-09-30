const axios = require('axios');

const ALLOWED_VALUES = {
    interest_level: ['High', 'Medium', 'Low', 'None'],
    outcome: ['Meeting', 'Email', 'Callback', 'Not Interested', 'Wrong Person', 'Voicemail']
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

function getCalendarContext(refDate = new Date()) {
    const todayStr = refDate.toISOString().split('T')[0];
    const dayOfWeek = refDate.toLocaleDateString('en-US', { weekday: 'long' });
    const tomorrow = new Date(refDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    return { todayStr, dayOfWeek, tomorrowStr };
}

function buildPrompt(transcript, callStatus) {
    const { todayStr, dayOfWeek, tomorrowStr } = getCalendarContext();

    return `Analyze this sales call transcript and return JSON only. Do not use markdown.

Call status from the telephony provider: ${callStatus}

Current Calendar Context:
- Today's date is: ${todayStr} (${dayOfWeek})
- Tomorrow's date is: ${tomorrowStr}

Allowed values:
- interest_level: High, Medium, Low, or None
- outcome: Meeting, Email, Callback, Not Interested, Wrong Person, or Voicemail
- objection_reason: Already have agency, No time, or Not priority; otherwise null
- next_action_date: YYYY-MM-DD or null

Rules:
- If the call reached an answering machine, voicemail, automated greeting, or asks to leave a message, set outcome to Voicemail and interest_level to None.
- For next_action_date: If a meeting, callback, or follow-up date was scheduled or agreed upon (e.g. "tomorrow", "Friday", "next Monday", "in 2 days", or a specific date), calculate the exact calendar date formatted strictly as YYYY-MM-DD based on today's date (${todayStr}, ${dayOfWeek}).
  Example: If today is ${todayStr} and they agree to meet "tomorrow", next_action_date MUST be "${tomorrowStr}".
- If no specific follow-up date was agreed upon, return null.
- summary must contain 2 to 4 sentences.
- Do not decide call_status from the transcript; use the supplied telephony status.

Return exactly this shape:
{
  "interest_level": "High",
  "outcome": "Meeting",
  "objection_reason": null,
  "call_summary": "",
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

function calculateTargetDate(text, baseDate = new Date()) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // 1. "day after tomorrow"
    if (/\bday after tomorrow\b/i.test(lower)) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 2);
        return d.toISOString().split('T')[0];
    }

    // 2. "tomorrow"
    if (/\btomorrow\b/i.test(lower)) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }

    // 3. "in X days"
    const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/i);
    if (inDaysMatch) {
        const days = parseInt(inDaysMatch[1], 10);
        const d = new Date(baseDate);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    // 4. Days of week: Monday ... Sunday
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < daysOfWeek.length; i++) {
        const dayName = daysOfWeek[i];
        const regex = new RegExp(`\\b(this\\s+|next\\s+)?${dayName}\\b`, 'i');
        const match = lower.match(regex);
        if (match) {
            const currentDay = baseDate.getDay();
            let diff = i - currentDay;
            if (diff <= 0) diff += 7;
            const d = new Date(baseDate);
            d.setDate(d.getDate() + diff);
            return d.toISOString().split('T')[0];
        }
    }

    // 5. Month and Day (e.g. October 5th or 5th of October)
    const monthNames = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
        may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
        oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };
    const m1 = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
    if (m1) {
        const month = monthNames[m1[1].toLowerCase()];
        const day = parseInt(m1[2], 10);
        const d = new Date(baseDate.getFullYear(), month, day);
        if (d < baseDate) d.setFullYear(baseDate.getFullYear() + 1);
        return d.toISOString().split('T')[0];
    }

    return null;
}

function normalizeDate(value, transcript, summary, baseDate = new Date()) {
    // 1. Direct valid YYYY-MM-DD
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        const parsed = new Date(`${value.trim()}T00:00:00Z`);
        if (!Number.isNaN(parsed.getTime())) {
            return value.trim();
        }
    }

    // 2. Value is relative text like "tomorrow" or "Friday"
    if (typeof value === 'string' && value.trim()) {
        const fromVal = calculateTargetDate(value, baseDate);
        if (fromVal) return fromVal;
    }

    // 3. Fallback: inspect summary and transcript for date cues
    const text = `${summary || ''} \n ${transcript || ''}`;
    return calculateTargetDate(text, baseDate);
}

function applyBusinessRules(result, callStatus, transcript = '') {
    const summary = typeof result.call_summary === 'string' ? result.call_summary.trim() : '';
    const normalized = {
        interest_level: normalizeChoice(result.interest_level, ALLOWED_VALUES.interest_level),
        outcome: normalizeChoice(result.outcome, ALLOWED_VALUES.outcome),
        objection_reason: ['Already have agency', 'No time', 'Not priority'].includes(result.objection_reason)
            ? result.objection_reason
            : null,
        call_summary: summary,
        next_action_date: normalizeDate(result.next_action_date, transcript, summary)
    };

    if (callStatus === 'Voicemail' || normalized.outcome === 'Voicemail') {
        normalized.outcome = 'Voicemail';
        normalized.interest_level = 'None';
        if (!normalized.call_summary) {
            normalized.call_summary = 'Call reached voicemail or automated answering system.';
        }
    } else if (normalized.outcome === 'Not Interested') {
        normalized.interest_level = 'None';
    }

    return normalized;
}

function createEmptyAnalysis(callStatus) {
    return applyBusinessRules({}, callStatus, '');
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

    return applyBusinessRules(parseModelJson(content), callStatus, transcript);
}

module.exports = {
    analyzeTranscript,
    createEmptyAnalysis
};