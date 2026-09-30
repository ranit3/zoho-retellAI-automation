const axios = require('axios');
const { getAccessToken } = require('./zohoAuth');

function getFieldMap() {
    return {
        call_status: process.env.ZOHO_FIELD_CALL_STATUS || 'Call_Status',
        right_person: process.env.ZOHO_FIELD_RIGHT_PERSON || 'Right_Person',
        interest_level: process.env.ZOHO_FIELD_INTEREST_LEVEL || 'Interest_Level',
        outcome: process.env.ZOHO_FIELD_OUTCOME || 'Outcome',
        objection_reason: process.env.ZOHO_FIELD_OBJECTION_REASON || null,
        call_summary: process.env.ZOHO_FIELD_CALL_SUMMARY || 'Call_Summary',
        next_action_date: process.env.ZOHO_FIELD_NEXT_ACTION_DATE || 'Next_Action_Date'
    };
}

async function updateLeadAnalysis(leadId, callStatus, analysis) {
    const token = await getAccessToken();
    const fields = getFieldMap();
    const fieldValues = {
        [fields.call_status]: callStatus,
        [fields.right_person]: analysis.right_person,
        [fields.interest_level]: analysis.interest_level,
        [fields.outcome]: analysis.outcome,
        [fields.call_summary]: analysis.call_summary,
        [fields.next_action_date]: analysis.next_action_date
    };
    if (fields.objection_reason) fieldValues[fields.objection_reason] = analysis.objection_reason;

    const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
    await axios.put(`${apiDomain}/crm/v3/Leads/${leadId}`, {
        data: [fieldValues]
    }, {
        headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
        }
    });
}

async function addCallNote(leadId, transcript, callStatus, analysis, callId) {
    const token = await getAccessToken();
    const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
    const noteContent = [
        `Retell Call ID: ${callId || 'unknown'}`,
        `Call Status: ${callStatus}`,
        '',
        'AI Analysis:',
        JSON.stringify(analysis, null, 2),
        '',
        'Transcript:',
        transcript
    ].join('\n');

    await axios.post(`${apiDomain}/crm/v3/Notes`, {
        data: [{
            Parent_Id: leadId,
            se_module: 'Leads',
            Note_Title: 'Retell AI Call Analysis',
            Note_Content: noteContent
        }]
    }, {
        headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
        }
    });
}

async function updateLeadStatus(leadId, status) {
    const token = await getAccessToken();
    const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
    const statusField = process.env.ZOHO_FIELD_LEAD_STATUS || 'Lead_Status';
    await axios.put(`${apiDomain}/crm/v3/Leads/${leadId}`, {
        data: [{
            [statusField]: status
        }]
    }, {
        headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
        }
    });
}

module.exports = {
    updateLeadAnalysis,
    addCallNote,
    updateLeadStatus
};