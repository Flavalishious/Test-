# AI Chat Component for Framer

A fully customizable AI chat component for Framer that integrates with OpenAI's API, includes built-in lead generation, and supports secure production deployment via Cloudflare Workers.

## Features

- **Dual Mode Support**: Testing mode with direct API key input, and production mode with Cloudflare Worker proxy
- **Lead Generation**: Built-in email capture before chat starts
- **Fully Customizable**: Every aspect of the UI is customizable through Framer's sidebar
- **Multiple AI Models**: Support for GPT-4o, GPT-4o-mini, GPT-4-turbo, and GPT-3.5-turbo
- **Custom Instructions**: Set system prompts to customize AI behavior
- **Secure**: API keys protected in production via Cloudflare Workers
- **Beautiful UI**: Modern, responsive design with customizable colors, fonts, and spacing

## Installation in Framer

### Method 1: Copy & Paste (Recommended for selling)

1. Copy the entire contents of `AIChat.tsx`
2. In your Framer project, create a new Code Component (Insert → Code)
3. Paste the code
4. The component will appear in your components panel

### Method 2: Import as Package

1. In Framer, go to Assets → Code
2. Click "Add Code File"
3. Select "From File" and upload `AIChat.tsx`

## Quick Start Guide

### Testing Mode (Development)

1. Add the AI Chat component to your Framer canvas
2. In the sidebar, set **Mode** to "testing"
3. Enter your OpenAI API key in the **API Key** field
   - Get your API key from: https://platform.openai.com/api-keys
4. Customize the appearance and behavior using the sidebar controls
5. Preview your site to test the chat

**Note**: Never deploy to production with your API key exposed!

### Production Mode (Secure Deployment)

For production, you'll use a Cloudflare Worker as a secure proxy:

#### Step 1: Deploy Cloudflare Worker

1. Install Wrangler CLI (Cloudflare's deployment tool):
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Add your OpenAI API key as a secret:
   ```bash
   wrangler secret put OPENAI_API_KEY
   ```
   Then paste your OpenAI API key when prompted

4. Deploy the worker:
   ```bash
   wrangler deploy
   ```

5. Copy the worker URL (e.g., `https://ai-chat-proxy.your-username.workers.dev`)

#### Step 2: Configure Framer Component

1. In Framer, set **Mode** to "production"
2. Paste your Cloudflare Worker URL in the **Worker URL** field
3. Publish your Framer site

## Customization Options

### API Configuration

| Property | Description | Default |
|----------|-------------|---------|
| Mode | Testing (API key) or Production (Worker) | production |
| API Key | OpenAI API key for testing | - |
| Worker URL | Cloudflare Worker URL for production | - |
| Model | AI model to use | gpt-4o-mini |
| Instructions | System prompt for AI behavior | "You are a helpful assistant." |

### Lead Generation

| Property | Description | Default |
|----------|-------------|---------|
| Require Email | Collect email before chat | true |
| Email Placeholder | Placeholder text for email input | "Enter your email..." |
| Email Button Text | Submit button text | "Start Chat" |

### Colors

- Background Color
- Chat Background Color
- User Message Color
- Assistant Message Color
- User Text Color
- Assistant Text Color
- Input Background Color
- Input Text Color
- Send Button Color
- Button Text Color
- Header Background Color
- Header Text Color

### Typography

| Property | Description | Default |
|----------|-------------|---------|
| Font Size | Base font size | 14px |
| Font Family | Font family for all text | system-ui |
| Header Font Size | Header text size | 18px |

### Layout & Spacing

| Property | Description | Default |
|----------|-------------|---------|
| Width | Component width | 400px |
| Height | Component height | 600px |
| Border Radius | Container border radius | 16px |
| Message Radius | Message bubble radius | 18px |
| Padding | Internal padding | 16px |
| Message Spacing | Space between messages | 12px |

### Header

| Property | Description | Default |
|----------|-------------|---------|
| Show Header | Display header bar | true |
| Header Text | Header title text | "AI Assistant" |

### Input & Buttons

| Property | Description | Default |
|----------|-------------|---------|
| Input Placeholder | Placeholder for message input | "Type your message..." |
| Send Button Text | Send button label | "Send" |

## Lead Generation Setup

The component automatically captures email addresses before starting the chat. Leads are sent to your Cloudflare Worker at the `/capture-lead` endpoint.

### Integrating with Your CRM

Edit `cloudflare-worker.js` to add your integration:

#### Option 1: Webhook Integration (Zapier, Make.com, etc.)

```javascript
// Add this environment variable
wrangler secret put WEBHOOK_URL

// The worker will automatically POST to your webhook:
// { email: "user@example.com", timestamp: "2024-01-01T00:00:00Z", source: "ai-chat" }
```

#### Option 2: Database Storage (D1)

Uncomment the D1 configuration in `wrangler.toml` and run:

```bash
# Create database
wrangler d1 create ai-chat-leads

# Create tables
wrangler d1 execute ai-chat-leads --command "CREATE TABLE leads (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, timestamp TEXT, created_at TEXT);"
```

#### Option 3: Email Marketing (Mailchimp, ConvertKit, etc.)

Add your email marketing API integration in the `handleLeadCapture` function:

```javascript
// Example: Mailchimp
await fetch('https://YOUR_DC.api.mailchimp.com/3.0/lists/YOUR_LIST_ID/members', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${env.MAILCHIMP_API_KEY}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        tags: ['ai-chat']
    })
})
```

## Advanced Configuration

### Custom AI Models

To add more AI models:

1. Open `AIChat.tsx`
2. Find the `model` property control
3. Add your model to the options array:

```typescript
model: {
    type: ControlType.Enum,
    title: "Model",
    options: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "your-custom-model"],
    defaultValue: "gpt-4o-mini",
}
```

### Rate Limiting

Add rate limiting to your Cloudflare Worker:

```javascript
// In cloudflare-worker.js
const rateLimiter = new Map()

async function checkRateLimit(email) {
    const now = Date.now()
    const userRequests = rateLimiter.get(email) || []
    const recentRequests = userRequests.filter(time => now - time < 60000) // 1 minute

    if (recentRequests.length >= 10) { // Max 10 requests per minute
        return false
    }

    recentRequests.push(now)
    rateLimiter.set(email, recentRequests)
    return true
}
```

### CORS Configuration

For production, restrict CORS to your Framer domain:

```javascript
// In cloudflare-worker.js
const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://your-site.framer.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}
```

## Pricing Considerations

### OpenAI API Costs

- GPT-4o-mini: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- GPT-4o: ~$5 per 1M input tokens, ~$15 per 1M output tokens
- Average chat message: ~500 tokens (input + output)

**Example**: 1,000 messages with GPT-4o-mini ≈ $0.40

### Cloudflare Workers

- First 100,000 requests/day: Free
- Additional requests: $0.50 per million

### Recommended Pricing

When selling this component, consider:

- One-time purchase: $29-$79
- Include setup guide and support
- Offer customization services
- Provide Cloudflare Worker deployment assistance

## Troubleshooting

### "API key not configured" error

- In testing mode: Check that your API key is entered correctly
- In production mode: Ensure you've run `wrangler secret put OPENAI_API_KEY`

### "Failed to send message" error

- Check your internet connection
- Verify the Cloudflare Worker URL is correct
- Check Cloudflare Worker logs: `wrangler tail`

### Email validation not working

- Ensure the email contains an @ symbol
- Check browser console for errors

### Messages not appearing

- Check browser console for errors
- Verify the API response format in Network tab
- Ensure the model name is correct

## Support & Updates

### Updating the Worker

After making changes to `cloudflare-worker.js`:

```bash
wrangler deploy
```

### Monitoring Usage

View Cloudflare Worker analytics:
```bash
wrangler tail
```

Or in the Cloudflare dashboard: Workers → Your Worker → Metrics

## License

MIT License - Feel free to use this component in your projects and sell it to clients.

## Credits

Built for the Framer community. For support, please open an issue on GitHub.

---

**Note**: This component requires an OpenAI API key to function. Users are responsible for their own API usage and costs.

---

## Also in this repo: Site Timesheets

[`timesheet-app/`](timesheet-app/) is a separate, mobile-friendly app where site crew
enter their hours and job numbers, written straight into the office's Excel
timesheet tracker. See its [README](timesheet-app/README.md).
