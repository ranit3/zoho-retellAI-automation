# Zoho Retell AI Automation

An automated calling assistant for sales teams. It finds the Zoho leads marked for a call, has a Retell AI voice agent speak with them, and records the important results back in Zoho CRM.

## What Problem It Solves

Sales teams often lose potential customers because new enquiries are not contacted quickly, every conversation is not documented, and follow-up actions are easy to miss. This system gives each selected lead a timely first conversation and turns that conversation into organized CRM data for the team.

## Who Gets Called

The Retell AI voice agent calls people already saved as **Leads in Zoho CRM**. These may be website enquiries, campaign responses, or other prospective customers who need an initial qualification or follow-up call. A lead is called only when the `Automation` checkbox is checked in Zoho.

The calls are intended to understand the lead's needs, answer common questions, check their interest and suitability, identify their motivation or objections, and agree on the next step such as a meeting, email, callback, or stopping follow-up.

The browser app lets an operator start and stop processing, view every lead and its current status, and monitor live activity logs.

## How It Works

```text
Selected Zoho lead with Automation checked
        |
        v
The system finds the lead and starts a Retell AI call
        |
        v
The voice agent speaks with the prospective customer
        |
        v
Agentic AI processes the conversation transcript
        |
        v
Intent, motivation, outcome, next action, and dates are extracted
        |
        v
Zoho Lead fields and Note are updated
        |
        v
Lead Status and Call Status reflect the result
```

Leads with `Automation` unchecked remain visible in the dashboard but are not called.

## Features

- Fetches all Zoho Leads every 10 seconds.
- Uses the `Automation` checkbox as the only call trigger.
- Initiates Retell AI voice-agent calls for eligible leads.
- Receives and processes call transcripts through agentic AI.
- Extracts motivation, intent, qualification, outcome, required action, and follow-up dates.
- Shows all fetched leads, including leads that do not need a call.
- Masks phone numbers in the dashboard and activity logs.
- Provides live activity updates through Server-Sent Events.
- Stores AI analysis in configured Zoho Lead fields.
- Adds the transcript and analysis as a Zoho Lead Note.
- Includes a Windows `.bat` launcher for non-technical operators.
- Keeps secrets in `.env`, which is excluded from Git.

## Requirements

- Node.js 18 or newer
- A Zoho CRM account with Leads access
- A Zoho OAuth Self Client
- A Retell account and configured voice agent
- An AI provider API key for transcript analysis

## Quick Start

```powershell
npm install
Copy-Item .env.example .env
notepad .env
npm run check:zoho
npm run app
```

Then open:

```text
http://localhost:3001
```

You can also double-click `start-zoho.bat` on Windows.

Press **Start system** in the dashboard to begin polling. In control-app mode, polling is stopped until the button is pressed.

## Environment Configuration

Copy `.env.example` to `.env` and replace every `replace_with_...` value.

Important Zoho settings:

```env
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_API_DOMAIN=https://www.zohoapis.in
ZOHO_FIELD_CALL_TRIGGER=Automation
ZOHO_FIELD_LEAD_STATUS=Lead_Status
ZOHO_FIELD_CALL_STATUS=Call_Status
```

Never commit `.env`. It contains credentials and is already listed in `.gitignore`.

## Zoho Lead Fields

The `Leads` module should contain these fields with the matching API names:

| Label | API name | Suggested type | Purpose |
| --- | --- | --- | --- |
| Automation | `Automation` | Checkbox | Checked means the lead may be called |
| Lead Status | `Lead_Status` | Picklist | Workflow state such as `Call In Progress` |
| Call Status | `Call_Status` | Picklist | Result such as `Connected` or `No Answer` |
| Lead Score | `Lead_Score` | Number | AI score from 1 to 5 |
| Right Person | `Right_Person` | Picklist | `Yes` or `No` |
| Interest Level | `Interest_Level` | Picklist | `High`, `Medium`, `Low`, or `None` |
| Outcome | `Outcome` | Picklist | Conversation outcome |
| Call Summary | `Call_Summary` | Multi-line text | AI-generated summary |
| Next Action | `Next_Action` | Picklist | Recommended follow-up |
| Next Action Date | `Next_Action_Date` | Date | Recommended follow-up date |
| Objection Reason | `Objection_Reason` | Picklist | Optional objection classification |

Recommended `Lead_Status` values:

```text
Call In Progress
Call Completed
Call Failed
```

Recommended `Call_Status` values:

```text
Connected
No Answer
Voicemail
Failed
```

The actual API names in Zoho must match the configuration. Zoho labels and API names are not always identical, so verify them in the field details.

## Zoho OAuth Permissions

The OAuth Self Client needs access to:

```text
ZohoCRM.modules.leads.READ
ZohoCRM.modules.leads.UPDATE
ZohoCRM.modules.notes.CREATE
ZohoCRM.settings.fields.READ
```

The application reads Leads, updates Lead fields, creates transcript Notes, and verifies the configured field metadata. It does not need field-creation permission.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run app` | Start the control app and open the browser dashboard |
| `npm start` | Start the server with polling enabled automatically |
| `npm run check:zoho` | Verify Zoho authentication, fields, and Lead access |
| `npm run check:integration` | Test the configured Zoho and AI integration without modifying a Lead |
| `npm run test:ai` | Run the AI analysis test |
| `npm run demo` | Run the local development flow |
| `npm run demo:zoho` | Run the Zoho integration development flow |

## HTTP Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Browser control dashboard |
| `GET` | `/api/control/status` | Current polling state |
| `POST` | `/api/control/start` | Start polling |
| `POST` | `/api/control/stop` | Stop polling |
| `GET` | `/api/activity` | Current lead and log snapshot |
| `GET` | `/api/activity/stream` | Live Server-Sent Events stream |
| `POST` | `/api/webhooks/retell` | Receive Retell call events |

## Project Structure

```text
app.js                         Opens the control dashboard in the browser
server.js                      Express server and control endpoints
public/index.html               Browser dashboard
routes/retell.js                Retell webhook processing
services/zohoPolling.js         Lead polling, trigger checks, and call dispatch
services/zohoLeadUpdater.js     Zoho field and Note updates
services/zohoAuth.js            Zoho OAuth token refresh
services/aiAnalysis.js          Transcript analysis and normalization
services/activityLog.js         Live lead and log state
scripts/                        Setup, integration, demo, and test scripts
start-zoho.bat                  Windows launcher
.env.example                    Safe configuration template
```

## Security Notes

- Do not commit `.env`, OAuth tokens, API keys, or client secrets.
- Rotate any credential that has appeared in a public repository, issue, log, screenshot, or chat.
- Phone numbers are masked in the dashboard and activity logs, but Zoho and the call provider still receive the real value internally.
- The local dashboard has no authentication. Run it on a trusted machine and do not expose port `3001` directly to the internet.
