require('dotenv').config();

const readline = require('readline');
const { analyzeTranscript } = require('../services/aiAnalysis');

const demoLead = {
    id: 'DEMO-LEAD-001',
    name: 'Demo Customer',
    phone: '+91 90000 00000'
};

function askForTranscript() {
    const terminal = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });

    console.log('Paste the call transcript below. Type END on a new line when finished.');
    const lines = [];

    return new Promise((resolve) => {
        terminal.on('line', (line) => {
            if (line.trim().toUpperCase() === 'END') {
                terminal.close();
                resolve(lines.join('\n').trim());
                return;
            }
            lines.push(line);
        });
    });
}

async function runDemo() {
    console.log('\n=== Zoho + Retell + AI Analysis Demo ===\n');
    console.log(`[1/5] New lead detected in Zoho: ${demoLead.id}`);
    console.log(`      Name: ${demoLead.name}`);
    console.log(`      Phone: ${demoLead.phone}`);
    console.log(`[2/5] Simulating Retell call to ${demoLead.name}...`);
    console.log('[3/5] Simulated call connected.');

    const transcript = await askForTranscript();
    if (!transcript) throw new Error('No transcript was entered');

    console.log('\n[4/5] Transcript received from simulated Retell call:');
    console.log('----- transcript -----');
    console.log(transcript);
    console.log('----------------------');
    console.log('[5/5] Sending transcript to OpenRouter for analysis...\n');

    const analysis = await analyzeTranscript(transcript, 'Connected');
    console.log('=== AI ANALYSIS JSON ===');
    console.log(JSON.stringify(analysis, null, 2));
    console.log('\nDemo complete. Zoho was not contacted and no fields were updated.');
}

runDemo().catch((error) => {
    console.error(`\nDemo failed: ${error.response?.data?.error?.message || error.message}`);
    process.exitCode = 1;
});