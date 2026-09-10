require('dotenv').config();

const axios = require('axios');
const { getAccessToken } = require('../services/zohoAuth');
const { analyzeTranscript } = require('../services/aiAnalysis');

const sampleTranscript = `
Agent: Hello, am I speaking with the person responsible for marketing?
Customer: Yes. We currently have an agency, but the results have not been consistent.
Agent: Would you be open to a meeting next week to discuss another approach?
Customer: Yes, please send me the details by email and book a meeting for Friday.
`;

function getHeaders(token) {
    return { Authorization: `Zoho-oauthtoken ${token}` };
}

function getConfiguredFields() {
    return {
        Call_Status: process.env.ZOHO_FIELD_CALL_STATUS,
        Lead_Score: process.env.ZOHO_FIELD_LEAD_SCORE,
        Right_Person: process.env.ZOHO_FIELD_RIGHT_PERSON,
        Interest_Level: process.env.ZOHO_FIELD_INTEREST_LEVEL,
        Outcome: process.env.ZOHO_FIELD_OUTCOME,
        Call_Summary: process.env.ZOHO_FIELD_CALL_SUMMARY,
        Next_Action: process.env.ZOHO_FIELD_NEXT_ACTION,
        Next_Action_Date: process.env.ZOHO_FIELD_NEXT_ACTION_DATE,
        Objection_Reason: process.env.ZOHO_FIELD_OBJECTION_REASON || '(not configured; optional)'
    };
}

async function run() {
    const apiDomain = process.env.ZOHO_API_DOMAIN;
    const token = await getAccessToken();
    console.log(`\n[1/4] Zoho authentication: OK (${apiDomain})`);

    const fieldsResponse = await axios.get(`${apiDomain}/crm/v3/settings/fields`, {
        params: { module: 'Leads' },
        headers: getHeaders(token)
    });
    const apiNames = new Set((fieldsResponse.data?.fields || []).map((field) => field.api_name));
    const configuredFields = getConfiguredFields();
    const fieldChecks = Object.entries(configuredFields).map(([label, apiName]) => ({
        field: label,
        apiName,
        available: apiName.startsWith('(') || apiNames.has(apiName)
    }));
    console.log('[2/4] Zoho Leads field mapping:');
    console.table(fieldChecks);

    const missingRequired = fieldChecks.filter((field) => !field.available && field.field !== 'Objection_Reason');
    if (missingRequired.length) {
        throw new Error(`Missing Zoho field API names: ${missingRequired.map((field) => field.apiName).join(', ')}`);
    }

    const leadsResponse = await axios.get(`${apiDomain}/crm/v3/Leads`, {
        params: { per_page: 1, fields: 'id,First_Name,Last_Name,Phone,Mobile' },
        headers: getHeaders(token)
    });
    const lead = leadsResponse.data?.data?.[0];
    if (!lead) throw new Error('Zoho Leads read succeeded, but no sample lead was found');
    console.log(`[3/4] Zoho Leads read: OK (sample lead ${lead.id}; no lead modified)`);

    const analysis = await analyzeTranscript(sampleTranscript.trim(), 'Connected');
    console.log('[4/4] OpenRouter analysis: OK');
    console.log('\nGenerated analysis that would be sent to Zoho:');
    console.log(JSON.stringify({
        [configuredFields.Call_Status]: 'Connected',
        [configuredFields.Lead_Score]: analysis.lead_score,
        [configuredFields.Right_Person]: analysis.right_person,
        [configuredFields.Interest_Level]: analysis.interest_level,
        [configuredFields.Outcome]: analysis.outcome,
        ...(process.env.ZOHO_FIELD_OBJECTION_REASON
            ? { [process.env.ZOHO_FIELD_OBJECTION_REASON]: analysis.objection_reason }
            : {}),
        [configuredFields.Call_Summary]: analysis.call_summary,
        [configuredFields.Next_Action]: analysis.next_action,
        [configuredFields.Next_Action_Date]: analysis.next_action_date
    }, null, 2));
    console.log('\nIntegration check complete. Zoho was not modified.');
}

run().catch((error) => {
    console.error(`\nIntegration check failed: ${error.response?.data?.message || error.message}`);
    process.exitCode = 1;
});