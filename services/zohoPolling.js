const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./zohoAuth');
const { addLog, updateLead } = require('./activityLog');
const { updateLeadStatus } = require('./zohoLeadUpdater');

const CALLED_LEADS_FILE = path.join(__dirname, '../called_leads.json');
const TRIGGER_FIELD = process.env.ZOHO_FIELD_CALL_TRIGGER || 'Automation';
const TRIGGER_VALUE = true;
const IN_PROGRESS_VALUE = process.env.ZOHO_CALL_IN_PROGRESS_VALUE || 'Call In Progress';
const COMPLETED_VALUE = process.env.ZOHO_CALL_COMPLETED_VALUE || 'Call Completed';
const FAILED_VALUE = process.env.ZOHO_CALL_FAILED_VALUE || 'Call Failed';
let pollingTimer = null;

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

// Function to call Retell AI
async function callRetellAI(lead) {
    const phone = lead.Phone || lead.Mobile;
    const name = `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() || 'Customer';

    try {
        if (!phone) {
            const message = `Lead ${lead.id} has no phone number. Skipping.`;
            addLog(message, 'warning');
            updateLead(lead.id, { name, phone: 'No phone', status: 'Skipped' });
            await updateLeadStatus(lead.id, FAILED_VALUE);
            markLeadAsProcessed(lead.id);
            return;
        }

        addLog(`Initiating call to ${name} (${maskPhone(phone)})...`);
        updateLead(lead.id, { name, phone: maskPhone(phone), status: 'In progress' });
        await updateLeadStatus(lead.id, IN_PROGRESS_VALUE);

        // FORCE DEMO MODE FOR THE LOOM VIDEO
        addLog(`[DEMO MODE] Simulating call to ${name}...`);
        markLeadAsProcessed(lead.id);
        
        // Simulate a 10 second phone call, then trigger our own webhook with a fake transcript
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
        
    } catch (error) {
        addLog(`Error calling ${name}: ${error.response?.data || error.message}`, 'error');
        updateLead(lead.id, { name, phone: maskPhone(phone), status: 'Failed' });
        updateLeadStatus(lead.id, FAILED_VALUE).catch(() => {});
        markLeadAsProcessed(lead.id);
    }
}

// Main polling function
async function pollRecentLeads() {
    try {
        // console.log("Polling Zoho CRM for new leads...");
        const zohoToken = await getAccessToken();

        const leads = await fetchAllLeads(zohoToken);
        if (!leads || leads.length === 0) return;

        const processedLeads = getProcessedLeads();

        for (const lead of leads) {
            const name = nameForLead(lead);
            const needsCall = isTriggerChecked(lead[TRIGGER_FIELD]);
            const baseLead = {
                name,
                phone: maskPhone(lead.Phone || lead.Mobile || 'No phone'),
                needsCall,
                triggerValue: lead[TRIGGER_FIELD] === true,
                zohoStatus: lead[TRIGGER_FIELD] || 'Not set'
            };

            if (!needsCall) {
                updateLead(lead.id, { ...baseLead, status: 'Not needed' });
                continue;
            }

            if (!processedLeads.includes(lead.id)) {
                addLog(`Call trigger found for ${name}. Adding to call list.`);
                updateLead(lead.id, { ...baseLead, status: 'Queued' });
                await callRetellAI(lead);
            } else {
                updateLead(lead.id, { ...baseLead, status: COMPLETED_VALUE });
            }
        }
    } catch (error) {
        addLog(`Zoho polling error: ${error.response?.data || error.message}`, 'error');
    }
}

async function startPolling() {
    if (pollingTimer) {
        return false;
    }

    addLog(`Started polling Zoho CRM. Trigger: ${TRIGGER_FIELD} = ${TRIGGER_VALUE}.`);
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
    let page = 1;
    const fields = `id,First_Name,Last_Name,Phone,Mobile,${TRIGGER_FIELD}`;

    while (true) {
        const response = await axios.get(`${process.env.ZOHO_API_DOMAIN}/crm/v3/Leads`, {
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
    isPolling
};
