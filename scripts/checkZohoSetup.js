require('dotenv').config();

const axios = require('axios');
const { getAccessToken } = require('../services/zohoAuth');
const { ensureCallTriggerField } = require('../services/zohoSetup');

function requiredEnvironment(name) {
    if (!process.env[name]) throw new Error(`${name} is missing from .env`);
    return process.env[name];
}

function getHeaders(token) {
    return { Authorization: `Zoho-oauthtoken ${token}` };
}

async function checkZohoSetup() {
    const apiDomain = requiredEnvironment('ZOHO_API_DOMAIN');
    const token = await getAccessToken();

    console.log(`Connected to Zoho API domain: ${apiDomain}`);

    const fieldsResponse = await axios.get(`${apiDomain}/crm/v3/settings/fields`, {
        params: { module: 'Leads' },
        headers: getHeaders(token)
    });

    const fields = fieldsResponse.data?.fields || [];
    const customFields = fields.filter((field) => field.custom === true || field.system_mandatory === false);
    console.log('\nLeads fields found. Use the API Name column in .env:');
    console.table(customFields.map((field) => ({
        label: field.field_label,
        apiName: field.api_name,
        dataType: field.data_type,
        custom: field.custom
    })));

    const triggerField = await ensureCallTriggerField();
    console.log(`\nAutomation field ready: ${triggerField.api_name || process.env.ZOHO_FIELD_CALL_TRIGGER || 'Lead_Status'}`);

    const leadsResponse = await axios.get(`${apiDomain}/crm/v3/Leads`, {
        params: { per_page: 1, fields: 'id,First_Name,Last_Name,Phone,Mobile' },
        headers: getHeaders(token)
    });
    const lead = leadsResponse.data?.data?.[0];
    console.log(`\nLeads read permission: OK${lead ? ` (sample lead ID: ${lead.id})` : ' (no leads found)'}`);
    console.log('Zoho setup check completed. Automation field was verified; no lead was modified.');
}

checkZohoSetup().catch((error) => {
    const details = error.response?.data || error.message;
    console.error('Zoho setup check failed:', details);
    process.exitCode = 1;
});