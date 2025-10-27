# Quick Setup Guide for Customers

This is a simplified guide for customers who purchase this component.

## Step 1: Add Component to Framer (2 minutes)

1. Open your Framer project
2. Go to **Insert** → **Code** (or press `C`)
3. Copy the entire contents of `AIChat.tsx`
4. Paste it into the code editor
5. Click "Save"
6. The component will appear in your components panel

## Step 2: Get Your OpenAI API Key (3 minutes)

1. Go to https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)
5. Add $5-10 credit to your OpenAI account at https://platform.openai.com/settings/organization/billing/overview

## Step 3: Test in Framer (2 minutes)

1. Drag the AI Chat component onto your canvas
2. In the right sidebar, find **Mode** and select "testing"
3. Paste your API key into the **API Key** field
4. Click "Preview" in the top right
5. Try chatting with the AI!

## Step 4: Customize the Look (5 minutes)

Use the Framer sidebar to customize:

### Quick Wins:
- **Header Text**: Change "AI Assistant" to your brand name
- **Colors**: Click the color pickers to match your brand
- **Model**: Try "gpt-4o" for better responses (costs more)
- **Instructions**: Set the AI's personality and role

### Example Instructions:
```
You are a helpful customer service assistant for [Your Company].
Be friendly, professional, and answer questions about our products.
If you don't know something, offer to connect them with a human.
```

## Step 5: Set Up Production (15 minutes)

**Important**: Never deploy with your API key visible! Use Cloudflare Workers instead.

### Install Wrangler:
```bash
npm install -g wrangler
```

### Deploy Worker:
```bash
# Login to Cloudflare
wrangler login

# Add your API key securely
wrangler secret put OPENAI_API_KEY
# (paste your OpenAI key when prompted)

# Deploy
wrangler deploy
```

### Configure Framer:
1. Copy the Worker URL from the terminal (e.g., `https://ai-chat-proxy.your-username.workers.dev`)
2. In Framer, change **Mode** to "production"
3. Paste the Worker URL into **Worker URL**
4. Publish your site!

## Step 6: Collect Leads (Optional, 5 minutes)

The component automatically collects emails before chat starts.

### Option A: Zapier Integration (Easiest)
1. Create a Zapier webhook
2. In terminal: `wrangler secret put WEBHOOK_URL`
3. Paste your Zapier webhook URL
4. Redeploy: `wrangler deploy`
5. Leads will flow into Zapier → connect to any app!

### Option B: Google Sheets
1. Create a Google Apps Script webhook
2. Follow same steps as Zapier

### Option C: Email Notifications
Add this to `cloudflare-worker.js` in the `handleLeadCapture` function:

```javascript
// Send email via SendGrid, Mailgun, etc.
await fetch('YOUR_EMAIL_API_URL', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer YOUR_KEY' },
    body: JSON.stringify({
        to: 'you@yourdomain.com',
        subject: 'New AI Chat Lead',
        text: `New lead: ${email}`
    })
})
```

## Customization Ideas

### E-commerce Store:
```
Instructions: "You are a shopping assistant. Help customers find products,
answer questions about shipping, returns, and sizing. Be enthusiastic and helpful."

Header Text: "Shopping Assistant"
Colors: Match your brand colors
```

### SaaS Product:
```
Instructions: "You are a product expert for [Your SaaS]. Help users understand
features, pricing, and how to get started. Offer demos for interested users."

Header Text: "Product Assistant"
Require Email: true (for lead gen)
```

### Real Estate:
```
Instructions: "You are a real estate assistant. Help potential buyers and renters
find properties, schedule viewings, and answer questions about neighborhoods."

Header Text: "Property Assistant"
Model: gpt-4o (better for complex queries)
```

### Professional Services:
```
Instructions: "You are a consultant assistant. Understand client needs,
explain our services, and help schedule discovery calls."

Header Text: "Let's Talk"
```

## Troubleshooting

### "API key not configured"
- Check that you ran `wrangler secret put OPENAI_API_KEY`
- Verify you deployed after adding the secret

### Chat not responding
- Check OpenAI account has credits
- Try switching to gpt-3.5-turbo (cheaper, faster)
- Check browser console for errors (F12)

### Styling issues
- Try adjusting Border Radius and Padding
- Check that colors have good contrast
- Test on mobile and desktop

## Getting Help

- Check the full README.md for advanced features
- OpenAI API docs: https://platform.openai.com/docs
- Cloudflare Workers docs: https://developers.cloudflare.com/workers

## Cost Estimates

### OpenAI API:
- GPT-4o-mini: ~$0.40 per 1,000 messages (recommended)
- GPT-4o: ~$10 per 1,000 messages (premium)

### Cloudflare Workers:
- First 100,000 requests/day: **FREE**
- More than enough for most sites!

### Typical Usage:
- 100 visitors/day × 5 messages each = 500 messages/day
- Cost with GPT-4o-mini: ~$6/month
- Cloudflare: $0/month (under free tier)

**Total: ~$6/month for a fully functional AI chat!**

## Next Steps

1. Test thoroughly before launching
2. Monitor costs in OpenAI dashboard
3. Collect feedback and adjust instructions
4. Consider adding more advanced features (see README.md)

Enjoy your AI chat component!
