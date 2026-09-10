const express = require('express');
const { analyzeTranscript, createEmptyAnalysis } = require('../services/aiAnalysis');
const { updateLeadAnalysis, addCallNote, updateLeadStatus } = require('../services/zohoLeadUpdater');
const { addLog, updateLead } = require('../services/activityLog');
const router = express.Router();

function getCallStatus(event, call) {
    const providerStatus = String(call?.call_status || call?.status || '').toLowerCase();
    const statusMap = {
        connected: 'Connected',
        answered: 'Connected',
        ended: 'Connected',
        'no answer': 'No Answer',
        no_answer: 'No Answer',
        voicemail: 'Voicemail',
        failed: 'Failed',
        error: 'Failed'
    };
    if (statusMap[providerStatus]) {
        return statusMap[providerStatus];
    }
    return call?.transcript ? 'Connected' : (event === 'call_ended' ? 'No Answer' : 'Failed');
}

router.post('/', async (req, res) => {
    try {
        const { event, call } = req.body;
        addLog(`Received ${event || 'unknown'} event from Retell.`);

        if (event !== 'call_analyzed' && event !== 'call_ended') {
            return res.status(200).send("Event ignored");
        }

        const transcript = call?.transcript || '';
        const leadId = call?.metadata?.zoho_lead_id;
        if (!leadId) {
            addLog("Retell event has no lead ID, so it was skipped.", 'warning');
            return res.status(200).send("Missing lead data");
        }

        const callStatus = getCallStatus(event, call);
        updateLead(leadId, { status: callStatus });
        const analysis = transcript
            ? await analyzeTranscript(transcript, callStatus)
            : createEmptyAnalysis(callStatus);
        await updateLeadAnalysis(leadId, callStatus, analysis);
        await addCallNote(leadId, transcript, callStatus, analysis, call?.call_id || call?.id);
        await updateLeadStatus(leadId, callStatus === 'Connected'
            ? (process.env.ZOHO_CALL_COMPLETED_VALUE || 'Call Completed')
            : (process.env.ZOHO_CALL_FAILED_VALUE || 'Call Failed'));

        addLog(`Zoho lead ${leadId} updated with call analysis.`);
        updateLead(leadId, { status: callStatus === 'Connected'
            ? (process.env.ZOHO_CALL_COMPLETED_VALUE || 'Call Completed')
            : (process.env.ZOHO_CALL_FAILED_VALUE || 'Call Failed') });

        res.status(200).send("Webhook received");
    } catch (error) {
        addLog(`Webhook processing error: ${error.response?.data || error.message}`, 'error');
        res.status(500).send("Internal server error");
    }
});

module.exports = router;
