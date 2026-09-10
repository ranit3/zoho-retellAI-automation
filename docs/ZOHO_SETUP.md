# Zoho CRM Setup

This guide describes the Zoho-side configuration required by the integration.

## 1. Create the Lead Fields

In Zoho CRM, open **Setup > Customization > Modules and Fields > Leads** and add or verify the fields listed below. Always confirm the API name in the field details.

| Label | API name | Type |
| --- | --- | --- |
| Automation | `Automation` | Checkbox |
| Lead Status | `Lead_Status` | Picklist |
| Call Status | `Call_Status` | Picklist |
| Lead Score | `Lead_Score` | Number |
| Right Person | `Right_Person` | Picklist |
| Interest Level | `Interest_Level` | Picklist |
| Outcome | `Outcome` | Picklist |
| Call Summary | `Call_Summary` | Multi-line text |
| Next Action | `Next_Action` | Picklist |
| Next Action Date | `Next_Action_Date` | Date |
| Objection Reason | `Objection_Reason` | Picklist, optional |

## 2. Add Picklist Values

`Lead_Status`:

```text
Call In Progress
Call Completed
Call Failed
```

`Call_Status`:

```text
Connected
No Answer
Voicemail
Failed
```

`Right_Person`:

```text
Yes
No
```

`Interest_Level`:

```text
High
Medium
Low
None
```

`Outcome`:

```text
Meeting
Email
Callback
Not Interested
Wrong Person
```

`Next_Action`:

```text
Book Meeting
Send Email
Call Back
Follow Up
Stop
```

`Objection_Reason`, if enabled:

```text
Already have agency
No time
Not priority
```

## 3. Configure OAuth

Create a Zoho OAuth Self Client in the India data center and grant:

```text
ZohoCRM.modules.leads.READ
ZohoCRM.modules.leads.UPDATE
ZohoCRM.modules.notes.CREATE
ZohoCRM.settings.fields.READ
```

Put the resulting client ID, client secret, and refresh token only in the local `.env` file.

## 4. Verify

From the project directory:

```powershell
npm run check:zoho
```

The check reads field metadata and a sample Lead. It does not modify Leads.

## 5. Trigger a Test Call

1. Create or select a Lead with a valid Phone or Mobile value.
2. Check the `Automation` checkbox.
3. Start the local app.
4. Press **Start system**.
5. Watch the lead move through the dashboard.

The expected workflow is:

```text
Automation checked
-> Queued
-> Call In Progress
-> Call Completed
```

The Retell voice agent conducts the call, the transcript is processed by the agentic AI analysis pipeline, and the resulting motivation, intent, outcome, next action, and dates are written back to Zoho.
