require('dotenv').config();

const { analyzeTranscript } = require('../services/aiAnalysis');

const sampleTranscript = `
Agent: Hello, am I speaking with Priya?
Customer: Yes, this is Priya. I handle our marketing decisions.
Agent: We help businesses improve their lead generation through digital marketing.
Customer: We already have an agency, but the results have been inconsistent.
Agent: Would you be open to a short meeting so we can understand your goals and show you our approach?
Customer: Yes, next Thursday afternoon would work. Please send me an email with the details as well.
Agent: Great, I will send the information and arrange the meeting for next Thursday.
`;

async function run() {
    console.log('Running sample transcript analysis with OpenRouter...');
    const analysis = await analyzeTranscript(sampleTranscript.trim(), 'Connected');
    console.log(JSON.stringify(analysis, null, 2));
    console.log('\nZoho was not contacted. This test only exercises the AI analysis and validation layer.');
}

run().catch((error) => {
    console.error(`AI test failed: ${error.response?.data?.error?.message || error.message}`);
    process.exitCode = 1;
});