const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./zohoAuth');
const { addLog, updateLead } = require('./activityLog');
const { updateLeadStatus, consumeLeadTrigger, uncheckTrigger } = require('./zohoLeadUpdater');

const CALLED_LEADS_FILE = path.join(__dirname, '../called_leads.json');
const TRIGGER_FIELD = process.env.ZOHO_FIELD_CALL_TRIGGER || 'Automation';
const TRIGGER_VALUE = true;
const IN_PROGRESS_VALUE = process.env.ZOHO_CALL_IN_PROGRESS_VALUE || 'Call In Progress';
const COMPLETED_VALUE = process.env.ZOHO_CALL_COMPLETED_VALUE || 'Call Completed';
const FAILED_VALUE = process.env.ZOHO_CALL_FAILED_VALUE || 'Call Failed';
let pollingTimer = null;
let pollingStartTime = new Date();

// Helper to read processed leads
function getProcessedLeads() {
    try {
        if (!fs.existsSync(CALLED_LEADS_FILE)) {
            fs.writeFileSync(CALLED_LEADS_FILE, JSON.stringify([]));
        }
        const data = fs.readFileSync(CALLED_LEADS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading called_leads.json:", err);
        return [];
    }
}

// Helper to save processed lead
function markLeadAsProcessed(leadId) {
    try {
        const leads = getProcessedLeads();
        if (!leads.includes(leadId)) {
            leads.push(leadId);
            fs.writeFileSync(CALLED_LEADS_FILE, JSON.stringify(leads, null, 2));
        }
    } catch (err) {
        console.error("Error writing called_leads.json:", err);
    }
}

function clearProcessedLeads() {
    try {
        fs.writeFileSync(CALLED_LEADS_FILE, JSON.stringify([]));
        addLog("Reset processed leads list.");
        return true;
    } catch (err) {
        console.error("Error clearing called_leads.json:", err);
        return false;
    }
}

function formatE164(phone) {
    let cleaned = String(phone || '').trim().replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
        cleaned = `+${cleaned}`;
    }
    return cleaned;
}

// Function to call Retell AI
async function callRetellAI(lead) {
    const rawPhone = lead.Phone || lead.Mobile;
    const name = `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() || 'there';
    const company = (lead.Company || '').trim() || 'your company';

    try {
        if (!rawPhone) {
            const message = `Lead ${lead.id} has no phone number. Skipping.`;
            addLog(message, 'warning');
            updateLead(lead.id, { name, phone: 'No phone', status: 'Skipped' });
            await updateLeadStatus(lead.id, FAILED_VALUE);
            markLeadAsProcessed(lead.id);
            return;
        }

        const phone = formatE164(rawPhone);

        addLog(`Initiating call to ${name} at ${company} (${maskPhone(phone)})...`);
        updateLead(lead.id, { name, phone: maskPhone(phone), status: 'In progress' });

        // Check if explicitly configured for Demo Mode
        if (process.env.DEMO_MODE === 'true') {
            addLog(`[DEMO MODE] Simulating call to ${name}...`);
            markLeadAsProcessed(lead.id);

            // Simulate a 10 second phone call, then trigger webhook with fake transcript
            setTimeout(async () => {
                try {
                    addLog(`[DEMO MODE] Call ended for ${name}. Saving result to Zoho...`);
                    await axios.post(`http://localhost:${process.env.PORT || 3000}/api/webhooks/retell`, {
                        event: 'call_ended',
                        call: {
                            call_status: 'ended',
                            call_id: `demo-${lead.id}-${Date.now()}`,
                            transcript: `Agent: Hello, may I speak with ${name}?\nCustomer: Speaking. Who is calling?\nAgent: This is Maya from BrightPath Solutions. I am calling because you recently enquired about improving your customer outreach. Is now still a good time for two minutes?\nCustomer: Yes, I have a couple of minutes.\nAgent: Thank you. How are you currently handling follow-up with new enquiries?\nCustomer: Mostly manually. We try to call people back, but some leads do not get contacted quickly enough.\nAgent: That is exactly what we help with. We can automatically contact new enquiries, qualify their interest, and send the conversation summary to your team. What would you most like to improve?\nCustomer: Faster follow-up would be the main thing. We would also want the team to know which leads are genuinely interested.\nAgent: Understood. If we could show you a short example and the reporting, would you be open to a meeting this week?\nCustomer: Yes, Thursday afternoon would work.\nAgent: Great. I will arrange a follow-up for Thursday afternoon and send a summary by email. Thank you for your time, ${name}.\nCustomer: Thank you. I will look out for it.`,
                            metadata: {
                                zoho_lead_id: lead.id
                            }
                        }
                    });
                } catch (e) {
                    addLog(`Failed to save ${name}'s result: ${e.message}`, 'error');
                    updateLead(lead.id, { status: 'Failed' });
                    await updateLeadStatus(lead.id, FAILED_VALUE).catch(() => {});
                }
            }, 10000);
            return;
        }

        // Live Retell AI API Call
        if (!process.env.RETELL_API_KEY || !process.env.RETELL_AGENT_ID || !process.env.RETELL_PHONE_NUMBER) {
            throw new Error('Retell environment variables (RETELL_API_KEY, RETELL_AGENT_ID, RETELL_PHONE_NUMBER) are not fully configured');
        }

        const retellResponse = await axios.post(
            'https://api.retellai.com/v2/create-phone-call',
            {
                from_number: process.env.RETELL_PHONE_NUMBER,
                to_number: phone,
                override_agent_id: process.env.RETELL_AGENT_ID,
                metadata: {
                    zoho_lead_id: lead.id
                },
                retell_llm_dynamic_variables: {
                    customer_name: name,
                    company_name: company
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const callId = retellResponse.data?.call_id || 'unknown';
        addLog(`Retell call successfully dispatched for ${name} (Call ID: ${callId})`);
        markLeadAsProcessed(lead.id);

    } catch (error) {
        const errorDetails = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        addLog(`Error calling ${name}: ${errorDetails}`, 'error');
        updateLead(lead.id, { name, phone: maskPhone(rawPhone), status: 'Failed' });
        await updateLeadStatus(lead.id, FAILED_VALUE).catch(() => {});
        markLeadAsProcessed(lead.id);
    }
}

// Startup reconciliation: uncheck any stale Automation checkboxes in Zoho
async function reconcilePastLeadsOnStartup(zohoToken) {
    try {
        const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
        const statusField = process.env.ZOHO_FIELD_LEAD_STATUS || 'Lead_Status';
        const callStatusField = process.env.ZOHO_FIELD_CALL_STATUS || 'Call_Status';

        let page = 1;
        const pastLeadsToClean = [];

        while (true) {
            const response = await axios.get(`${apiDomain}/crm/v3/Leads`, {
                params: {
                    per_page: 200,
                    page,
                    fields: `id,${TRIGGER_FIELD},${statusField},${callStatusField},Modified_Time`
                },
                headers: { Authorization: `Zoho-oauthtoken ${zohoToken}` }
            });
            const records = response.data?.data || [];
            for (const record of records) {
                if (isTriggerChecked(record[TRIGGER_FIELD])) {
                    pastLeadsToClean.push({ id: record.id, [TRIGGER_FIELD]: false });
                    markLeadAsProcessed(record.id);
                }
            }
            if (records.length < 200 || !response.data?.info?.more_records) break;
            page++;
        }

        if (pastLeadsToClean.length > 0) {
            addLog(`[Startup] Found ${pastLeadsToClean.length} past leads with ${TRIGGER_FIELD}=true. Unchecking trigger so they are not re-called...`);
            for (let i = 0; i < pastLeadsToClean.length; i += 100) {
                const chunk = pastLeadsToClean.slice(i, i + 100);
                await axios.put(`${apiDomain}/crm/v3/Leads`, { data: chunk }, {
                    headers: { Authorization: `Zoho-oauthtoken ${zohoToken}` }
                });
            }
            addLog(`[Startup] Cleaned ${pastLeadsToClean.length} past leads successfully.`);
        } else {
            addLog(`[Startup] No stale leads with ${TRIGGER_FIELD}=true found.`);
        }
    } catch (err) {
        console.error('Error during startup reconciliation:', err.message);
    }
}

// Main polling function
async function pollRecentLeads() {
    try {
        const zohoToken = await getAccessToken();

        const leads = await fetchAllLeads(zohoToken);
        if (!leads || leads.length === 0) return;

        const processedLeads = getProcessedLeads();
        const statusField = process.env.ZOHO_FIELD_LEAD_STATUS || 'Lead_Status';
        const callStatusField = process.env.ZOHO_FIELD_CALL_STATUS || 'Call_Status';

        for (const lead of leads) {
            const name = nameForLead(lead);
            const needsCall = isTriggerChecked(lead[TRIGGER_FIELD]);
            const currentLeadStatus = lead[statusField];
            const currentCallStatus = lead[callStatusField];

            const isAlreadyHandled =
                currentLeadStatus === COMPLETED_VALUE ||
                currentLeadStatus === IN_PROGRESS_VALUE ||
                currentLeadStatus === FAILED_VALUE ||
                Boolean(currentCallStatus);

            const baseLead = {
                name,
                phone: maskPhone(lead.Phone || lead.Mobile || 'No phone'),
                needsCall,
                triggerValue: lead[TRIGGER_FIELD] === true,
                zohoStatus: currentLeadStatus || currentCallStatus || (needsCall ? 'Triggered' : 'Not set')
            };

            if (!needsCall) {
                updateLead(lead.id, { ...baseLead, status: 'Not needed' });
                continue;
            }

            // Check if lead was modified BEFORE this polling session started
            const modifiedTime = lead.Modified_Time ? new Date(lead.Modified_Time).getTime() : 0;
            const isPastLead = modifiedTime > 0 && modifiedTime < pollingStartTime.getTime();

            if (isPastLead) {
                // Past data from before restart - do NOT call
                if (!processedLeads.includes(lead.id)) {
                    markLeadAsProcessed(lead.id);
                }
                // Ensure Automation is turned off in Zoho
                uncheckTrigger(lead.id).catch(() => {});
                updateLead(lead.id, { ...baseLead, status: currentLeadStatus || 'Past record (Skipped)' });
                continue;
            }

            if (isAlreadyHandled) {
                if (!processedLeads.includes(lead.id)) {
                    markLeadAsProcessed(lead.id);
                }
                // If Automation is still true, turn it off in Zoho
                if (needsCall) {
                    uncheckTrigger(lead.id).catch(() => {});
                }
                updateLead(lead.id, { ...baseLead, status: currentLeadStatus || currentCallStatus || COMPLETED_VALUE });
                continue;
            }

            if (!processedLeads.includes(lead.id)) {
                addLog(`New call trigger detected for ${name}. Adding to call queue.`);
                updateLead(lead.id, { ...baseLead, status: 'Queued' });
                markLeadAsProcessed(lead.id);
                // Consume trigger in Zoho CRM immediately so it cannot be re-triggered
                await consumeLeadTrigger(lead.id, IN_PROGRESS_VALUE);
                await callRetellAI(lead);
            } else {
                updateLead(lead.id, { ...baseLead, status: currentLeadStatus || COMPLETED_VALUE });
            }
        }
    } catch (error) {
        addLog(`Zoho polling error: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`, 'error');
    }
}

async function startPolling() {
    if (pollingTimer) {
        return false;
    }

    pollingStartTime = new Date();
    addLog(`Started polling Zoho CRM. Trigger: ${TRIGGER_FIELD} = ${TRIGGER_VALUE}. Session start: ${pollingStartTime.toLocaleTimeString()}`);

    try {
        const token = await getAccessToken();
        await reconcilePastLeadsOnStartup(token);
    } catch (e) {
        console.error('Startup reconciliation error:', e.message);
    }

    pollRecentLeads();
    pollingTimer = setInterval(pollRecentLeads, 10 * 1000);
    return true;
}

function stopPolling() {
    if (!pollingTimer) {
        return false;
    }

    clearInterval(pollingTimer);
    pollingTimer = null;
    addLog("Stopped polling Zoho CRM.");
    return true;
}

async function pauseAllActiveCalls() {
    stopPolling();
    try {
        const token = await getAccessToken();
        const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
        const statusField = process.env.ZOHO_FIELD_LEAD_STATUS || 'Lead_Status';
        const callStatusField = process.env.ZOHO_FIELD_CALL_STATUS || 'Call_Status';

        let page = 1;
        const leadsToPause = [];

        while (true) {
            const response = await axios.get(`${apiDomain}/crm/v3/Leads`, {
                params: {
                    per_page: 200,
                    page,
                    fields: `id,${TRIGGER_FIELD},${statusField},${callStatusField},First_Name,Last_Name,Phone,Mobile`
                },
                headers: { Authorization: `Zoho-oauthtoken ${token}` }
            });
            const records = response.data?.data || [];
            for (const record of records) {
                const isTrigger = isTriggerChecked(record[TRIGGER_FIELD]);
                const isInProgress = record[statusField] === IN_PROGRESS_VALUE || record[callStatusField] === 'In Progress';
                if (isTrigger || isInProgress) {
                    leadsToPause.push({
                        id: record.id,
                        [statusField]: 'Call Paused',
                        [TRIGGER_FIELD]: false
                    });
                    updateLead(record.id, {
                        name: nameForLead(record),
                        phone: maskPhone(record.Phone || record.Mobile),
                        status: 'Call Paused',
                        needsCall: false,
                        triggerValue: false
                    });
                }
            }
            if (records.length < 200 || !response.data?.info?.more_records) break;
            page++;
        }

        if (leadsToPause.length > 0) {
            for (let i = 0; i < leadsToPause.length; i += 100) {
                const chunk = leadsToPause.slice(i, i + 100);
                await axios.put(`${apiDomain}/crm/v3/Leads`, { data: chunk }, {
                    headers: { Authorization: `Zoho-oauthtoken ${token}` }
                });
            }
            addLog(`Paused ${leadsToPause.length} active/queued call(s) in Zoho CRM.`);
        } else {
            addLog("No active or queued calls needed pausing.");
        }

        return { success: true, count: leadsToPause.length };
    } catch (err) {
        addLog(`Error pausing active calls: ${err.message}`, 'error');
        return { success: false, error: err.message };
    }
}

function isPolling() {
    return Boolean(pollingTimer);
}

function nameForLead(lead) {
    return `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() || `Lead ${lead.id}`;
}

function maskPhone(phone) {
    const value = String(phone || '').trim();
    if (!value || value === 'No phone') return 'No phone';
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return '****';
    return `****${digits.slice(-4)}`;
}

function isTriggerChecked(value) {
    return value === true || ['true', 'yes', '1'].includes(String(value).trim().toLowerCase());
}

async function fetchAllLeads(zohoToken) {
    const leads = [];
    const statusField = process.env.ZOHO_FIELD_LEAD_STATUS || 'Lead_Status';
    const callStatusField = process.env.ZOHO_FIELD_CALL_STATUS || 'Call_Status';
    const fields = `id,First_Name,Last_Name,Company,Phone,Mobile,${TRIGGER_FIELD},${statusField},${callStatusField},Created_Time,Modified_Time`;
    let page = 1;

    while (true) {
        const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').trim();
        const response = await axios.get(`${apiDomain}/crm/v3/Leads`, {
            params: {
                sort_order: 'desc',
                sort_by: 'Created_Time',
                per_page: 200,
                page,
                fields
            },
            headers: {
                'Authorization': `Zoho-oauthtoken ${zohoToken}`
            }
        });

        const pageLeads = response.data.data || [];
        leads.push(...pageLeads);
        if (pageLeads.length < 200 || response.data.info?.more_records !== true) break;
        page += 1;
    }

    return leads;
}

module.exports = {
    startPolling,
    stopPolling,
    pauseAllActiveCalls,
    isPolling,
    clearProcessedLeads
};
