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
        next_action_date: process.env.ZOHO_FIELD_NEXT_ACTION_DATE || 'Next_Action_Date',
        call_transcript: process.env.ZOHO_FIELD_CALL_TRANSCRIPT || 'Call_Transcript'
    };
}

async function updateLeadAnalysis(leadId, callStatus, analysis, transcript) {
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
    if (fields.call_transcript && transcript) fieldValues[fields.call_transcript] = transcript;

    const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
    try {
        await axios.put(`${apiDomain}/crm/v3/Leads/${leadId}`, {
            data: [fieldValues]
        }, {
            headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (err) {
        // If Call_Transcript doesn't exist in Zoho yet, retry without it
        if (fieldValues[fields.call_transcript]) {
            delete fieldValues[fields.call_transcript];
            await axios.put(`${apiDomain}/crm/v3/Leads/${leadId}`, {
                data: [fieldValues]
            }, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } else {
            throw err;
        }
    }
}

async function addCallNote(leadId, transcript, callStatus, analysis, callId) {
    const token = await getAccessToken();
    const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
    const noteContent = [
        `=== RETELL CALL DETAILS ===`,
        `Call ID: ${callId || 'unknown'}`,
        `Status: ${callStatus}`,
        `Summary: ${analysis.call_summary || 'N/A'}`,
        `Outcome: ${analysis.outcome || 'N/A'}`,
        `Interest: ${analysis.interest_level || 'N/A'}`,
        '',
        '=== FULL TRANSCRIPT ===',
        transcript || '(No transcript recorded)'
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