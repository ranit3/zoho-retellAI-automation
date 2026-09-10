const axios = require('axios');
const { getAccessToken } = require('./zohoAuth');

const MODULE = 'Leads';

function getHeaders(token) {
    return {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
    };
}

async function ensureCallTriggerField() {
    const apiDomain = process.env.ZOHO_API_DOMAIN;
    const apiName = process.env.ZOHO_FIELD_CALL_TRIGGER || 'Automation';
    const token = await getAccessToken();
    const headers = getHeaders(token);

    const fieldsResponse = await axios.get(`${apiDomain}/crm/v3/settings/fields`, {
        params: { module: MODULE },
        headers
    });
    const fields = fieldsResponse.data?.fields || [];
    const existingField = fields.find((field) => field.api_name === apiName);

    if (existingField) {
        return existingField;
    }

    throw new Error(`Zoho Leads field ${apiName} was not found. Create it as a checkbox field.`);
}

module.exports = {
    ensureCallTriggerField
};