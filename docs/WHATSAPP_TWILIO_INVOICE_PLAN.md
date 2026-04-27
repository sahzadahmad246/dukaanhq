# Twilio WhatsApp Invoice Setup Checklist

This is the exact outside-dashboard setup needed before we implement WhatsApp invoice sending in DukaanHQ.

Your intended flow:

```text
User selects Auto Send Invoice / Both
-> app generates invoice PDF
-> app uploads PDF to Cloudinary
-> app sends business-initiated WhatsApp template message
-> customer receives the PDF attachment on WhatsApp
```

Because the customer will not message us first, this is a business-initiated WhatsApp message. That means we must use an approved WhatsApp template with media/document support.

## Short Answer About Your Real Number

Yes, your real WhatsApp number must be approved/onboarded as a WhatsApp sender.

Important rules:

- The number must be connected to a WhatsApp Business Account through Twilio/Meta.
- The display name must be approved.
- The phone number must be verified by OTP during setup.
- If the number is already being used in the normal WhatsApp or WhatsApp Business app, you usually must remove/migrate it before using it with the WhatsApp Business Platform.
- After approval, Twilio gives you a sender like:

```env
TWILIO_WHATSAPP_FROM=whatsapp:+91XXXXXXXXXX
```

## Final Env Vars We Need

Always required:

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_INVOICE_TEMPLATE_SID=
```

Sender configuration: use one of these.

If Twilio made you create a Messaging Service, use this:

```env
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

If you are sending directly from the approved WhatsApp sender without Messaging Service, use this:

```env
TWILIO_WHATSAPP_FROM=whatsapp:+91XXXXXXXXXX
```

Preferred for your current Twilio setup:

```env
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Do not add this for now:

```env
TWILIO_WEBHOOK_AUTH_TOKEN=
```

## Dashboard Links

Use these links while setting up:

- Twilio Console: https://console.twilio.com/
- Twilio WhatsApp Senders: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
- Twilio Content Template Builder: https://console.twilio.com/us1/develop/sms/content-template-builder
- Twilio Account Info / Credentials: https://console.twilio.com/us1/account/keys-credentials/api-keys
- Meta Business Settings: https://business.facebook.com/settings
- Meta Security Center: https://business.facebook.com/settings/security
- Meta WhatsApp Manager: https://business.facebook.com/wa/manage
- Meta Business Info: https://business.facebook.com/settings/info

If a Twilio URL redirects you, open Twilio Console first and then search the left menu for the same page name.

## Step 1: Prepare Meta Business

Open:

```text
https://business.facebook.com/settings
```

Do this:

1. Select the correct Business Portfolio.
2. Go to `Business Info`.
3. Confirm business legal name, address, website, phone, and email are correct.
4. Go to `People` and confirm your account has full admin access.
5. Go to `Security Center`.
6. Start or complete business verification if Meta asks for it.

Useful direct links:

```text
https://business.facebook.com/settings/info
https://business.facebook.com/settings/security
```

Keep ready:

- Business legal name.
- Business address.
- Business website.
- Business documents if Meta asks.
- Admin access to the business.

## Step 2: Prepare The Real WhatsApp Number

Before onboarding, confirm:

1. You can receive OTP on this number by SMS or voice call.
2. The number is not locked inside the normal WhatsApp app setup.
3. The number is not already connected to another WhatsApp Business Platform provider.
4. You know the exact business display name you want customers to see.

Display name example:

```text
DukaanHQ
```

or your store name:

```text
Shahzad Electronics
```

The display name should match your real business/website/brand. Meta can reject unclear names.

## Step 3: Connect WhatsApp Sender In Twilio

Open:

```text
https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
```

Do this:

1. Click `Create new sender` or `New WhatsApp Sender`.
2. Choose the option to connect/register a WhatsApp sender.
3. Continue with Facebook / Meta.
4. Select your Meta Business Portfolio.
5. Select or create a WhatsApp Business Account.
6. Enter the real phone number you want to use.
7. Enter the business display name.
8. Choose business category.
9. Verify the phone number with OTP.
10. Accept/confirm Twilio permissions.
11. Finish setup and wait for Twilio/Meta approval.

After approval, Twilio should show the sender as active/approved.

If sending directly from this sender, copy the sender value into env:

```env
TWILIO_WHATSAPP_FROM=whatsapp:+91XXXXXXXXXX
```

If the sender is attached to a Messaging Service, copy the Messaging Service SID instead:

```env
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Step 4: Get Twilio Account SID And Auth Token

Open:

```text
https://console.twilio.com/
```

Do this:

1. Open the Account Dashboard.
2. Find `Account SID`.
3. Find `Auth Token`.
4. Copy both into env.

Env:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

If you cannot see Auth Token on the dashboard, check:

```text
https://console.twilio.com/us1/account/keys-credentials/api-keys
```

## Step 5: Create WhatsApp Invoice Template

Open:

```text
https://console.twilio.com/us1/develop/sms/content-template-builder
```

Create a new template.

Recommended values:

```text
Template name:
invoice_pdf_notification

Category:
Utility

Language:
English

Message body:
Hi {{1}}, your invoice {{2}} from {{3}} is attached. Thank you for shopping with us.
```

Variables:

```text
{{1}} = customer name
{{2}} = invoice number
{{3}} = shop name
{{4}} = invoice PDF URL
```

Media/Header:

```text
Type: Document / Media
Media URL: {{4}}
Sample value for {{4}}: a public Cloudinary raw invoice PDF URL
```

Use a public sample PDF URL as the sample value while submitting for approval. It can be any valid public PDF sample from your app/Cloudinary.

Best option:

```text
Use a sample invoice PDF uploaded to your own Cloudinary raw folder.
```

Avoid random public PDF sample URLs if Twilio rejects them. Some servers return headers like:

```text
Content-Type: application/pdf; qs=0.001
```

Twilio may reject that for templates. The sample PDF URL should return a clean PDF content type, ideally:

```text
Content-Type: application/pdf
```

You can test it with:

```bash
curl -I "https://your-public-sample-invoice.pdf"
```

Important:

- Since we are sending a PDF, choose document/media template.
- Do not create a plain text-only template.
- Submit it for WhatsApp approval.
- Wait until status is approved.

After approval, copy the Content SID.

It usually starts with:

```text
HX...
```

Env:

```env
TWILIO_WHATSAPP_INVOICE_TEMPLATE_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Important: do not keep the media URL hardcoded to one invoice PDF. The app sends the current invoice PDF URL as variable `{{4}}`, so the approved template must allow `{{4}}` in the media URL field.

## Step 6: Confirm Cloudinary PDF URL Works

Our app already uploads invoice PDFs to Cloudinary.

Expected URL style:

```text
https://res.cloudinary.com/<cloud_name>/raw/upload/v123/dukaanhq_invoices/invoice-<invoice-id>.pdf
```

Before connecting Twilio, test one generated invoice PDF:

1. Copy `invoice_pdf_url` from database.
2. Open it in incognito browser.
3. Confirm PDF opens without login.
4. Confirm URL ends with `.pdf` or downloads as PDF.

Twilio must be able to fetch this URL publicly.

## Step 7: Give These Values To Codex For Implementation

Once setup is done, provide:

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_INVOICE_TEMPLATE_SID=HX...
```

Plus one sender value:

```env
TWILIO_MESSAGING_SERVICE_SID=MG...
```

or:

```env
TWILIO_WHATSAPP_FROM=whatsapp:+91...
```

Also confirm:

```text
1. WhatsApp sender status is approved/active in Twilio.
2. Template status is approved.
3. Cloudinary invoice PDF URL opens publicly.
4. Customer mobile numbers are saved in Indian format or E.164 format.
```

## What We Will Build After You Have Keys

We will add:

1. Twilio SDK.
2. Server helper to send WhatsApp invoice template.
3. Call it right after Cloudinary PDF upload.
4. Toast message:

```text
Invoice saved and WhatsApp sent.
```

or:

```text
Invoice saved, but WhatsApp sending failed.
```

No webhook.
No inbound replies.
No status callback for now.

## Simple Testing Flow

1. Add env vars.
2. Create invoice with `Auto Send Invoice`.
3. Confirm PDF uploads to Cloudinary.
4. Confirm WhatsApp message arrives with PDF.
5. Create invoice with `Both`.
6. Confirm WhatsApp arrives and clean PDF downloads.
7. Edit invoice and use `Auto Send Invoice`.
8. Confirm updated PDF is sent again.

## Official Docs

- Twilio WhatsApp Docs: https://www.twilio.com/docs/whatsapp
- Twilio WhatsApp Senders / Self Sign-up: https://www.twilio.com/docs/whatsapp/self-sign-up
- Twilio WhatsApp Templates: https://www.twilio.com/docs/sms/whatsapp/tutorial/send-whatsapp-notification-messages-templates
- Twilio Content Templates: https://www.twilio.com/docs/content
- Twilio Media Template: https://www.twilio.com/docs/content/twilio-media
- Meta WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp
