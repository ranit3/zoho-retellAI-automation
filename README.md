# Zoho Retell AI Automation

A local Node.js integration that watches Zoho CRM Leads, uses an `Automation` checkbox as the call trigger, sends eligible leads through a Retell call workflow, analyzes the conversation with an AI provider, and writes the result back to Zoho CRM.

The project includes a small browser control app so an operator can start and stop polling, see every lead and its current workflow state, and watch live activity logs.

## Current Status

The repository currently runs in **demo call mode**. When a lead is selected, the integration simulates the call and sends a realistic sample transcript to the local Retell webhook after 10 seconds. This exercises the Zoho update and AI analysis pipeline without placing a real phone call.

The call boundary is isolated in `services/zohoPolling.js`, so a real Retell outbound-call implementation can replace the demo block later.

## How It Works

```text
Zoho Lead with Automation checked
        |
        v
Zoho polling service finds the lead
        |
        v
Lead Status -> Call In Progress
        |
        v
Demo call or Retell outbound call
        |
        v
Retell webhook receives transcript
        |
        v
AI analyzes the transcript
        |
        v
Zoho Lead fields and Note are updated
        |
        v
Lead Status -> Call Completed or Call Failed
```

Leads with `Automation` unchecked remain visible in the dashboard but are not called.

## Features

- Polls all Zoho Leads every 10 seconds.
- Uses the `Automation` checkbox as the only call trigger.
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
- A Retell account if replacing demo mode with real calls
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
| `npm run demo` | Run the local demo flow |
| `npm run demo:zoho` | Run the Zoho demo flow |

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

## Development Notes

The demo transcript is intentionally realistic enough to exercise qualification, interest, outcome, and next-action analysis. It is not a real outbound phone call. Replace the demo section in `services/zohoPolling.js` with the Retell outbound-call API when moving to production, and handle provider webhooks through `/api/webhooks/retell`.
