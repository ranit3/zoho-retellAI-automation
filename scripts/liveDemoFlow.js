require('dotenv').config();

const axios = require('axios');
const readline = require('readline');
const { getAccessToken } = require('../services/zohoAuth');
const { analyzeTranscript } = require('../services/aiAnalysis');
const { updateLeadAnalysis, addCallNote } = require('../services/zohoLeadUpdater');

function createTerminal() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });
}

function ask(terminal, question) {
    return new Promise((resolve) => terminal.question(question, resolve));
}

function askForTranscript(terminal) {
    console.log('\nPaste the simulated Retell transcript below. Type END on a new line when finished.');
    const lines = [];

    return new Promise((resolve) => {
        const onLine = (line) => {
            if (line.trim().toUpperCase() === 'END') {
                terminal.removeListener('line', onLine);
                resolve(lines.join('\n').trim());
                return;
            }
            lines.push(line);
        };
        terminal.on('line', onLine);
    });
}

async function getNewestLead() {
    const token = await getAccessToken();
    const response = await axios.get(`${process.env.ZOHO_API_DOMAIN}/crm/v3/Leads`, {
        params: {
            sort_order: 'desc',
            sort_by: 'Created_Time',
            per_page: 1,
            fields: 'id,First_Name,Last_Name,Phone,Mobile'
        },
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    const lead = response.data?.data?.[0];
    if (!lead) throw new Error('No leads found in the Zoho Leads module');
    return lead;
}

async function runLiveDemo() {
    const terminal = createTerminal();
    try {
        console.log('\n=== Live Zoho + Retell Simulation + AI Demo ===\n');
        console.log('[1/7] Fetching the newest lead from Zoho...');
        const lead = await getNewestLead();
        const name = `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() || 'Unnamed lead';
        const phone = lead.Phone || lead.Mobile;

        console.log(`      Lead ID: ${lead.id}`);
        console.log(`      Name: ${name}`);
        console.log(`      Phone: ${phone || 'NOT FOUND'}`);
        if (!phone) throw new Error('This lead has no Phone or Mobile value. Add a number and run the demo again.');

        console.log(`[2/7] Phone number fetched: ${phone}`);
        console.log(`[3/7] Simulating Retell call to ${name}...`);
        console.log('[4/7] Simulated call connected.');

        const transcript = await askForTranscript(terminal);
        if (!transcript) throw new Error('No transcript was entered');

        console.log('\n[5/7] Sending transcript to OpenRouter...');
        const analysis = await analyzeTranscript(transcript, 'Connected');
        console.log('\n=== AI ANALYSIS JSON ===');
        console.log(JSON.stringify(analysis, null, 2));

        const confirmation = await ask(terminal, '\nUpdate this lead in Zoho and create a transcript note? Type YES to continue: ');
        if (confirmation.trim().toUpperCase() !== 'YES') {
            console.log('Update cancelled. Zoho was not modified.');
            return;
        }

        console.log('\n[6/7] Uploading AI fields to Zoho...');
        await updateLeadAnalysis(lead.id, 'Connected', analysis);
        console.log('[7/7] Creating the transcript analysis note in Zoho...');
        await addCallNote(lead.id, transcript, 'Connected', analysis, `DEMO-${Date.now()}`);

        console.log(`\nSuccess. Lead ${lead.id} was updated in Zoho.`);
    } finally {
        terminal.close();
    }
}

runLiveDemo().catch((error) => {
    console.error(`\nLive demo failed: ${error.response?.data?.message || error.message}`);
    process.exitCode = 1;
});