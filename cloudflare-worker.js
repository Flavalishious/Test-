/**
 * Cloudflare Worker Proxy for AI Chat Component
 *
 * This worker acts as a secure proxy between your Framer site and the OpenAI API,
 * protecting your API key and adding additional functionality like lead capture.
 *
 * Setup:
 * 1. Create a new Cloudflare Worker
 * 2. Add your OpenAI API key as a secret: wrangler secret put OPENAI_API_KEY
 * 3. Set up a D1 database for lead storage (optional)
 * 4. Deploy: wrangler deploy
 */

// CORS headers for Framer site
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Change to your Framer domain in production
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders,
            })
        }

        const url = new URL(request.url)

        // Lead capture endpoint
        if (url.pathname === '/capture-lead' && request.method === 'POST') {
            return handleLeadCapture(request, env)
        }

        // Main chat endpoint
        if (request.method === 'POST') {
            return handleChatRequest(request, env)
        }

        return new Response('Method not allowed', { status: 405 })
    },
}

async function handleLeadCapture(request, env) {
    try {
        const { email, timestamp } = await request.json()

        // Validate email
        if (!email || !email.includes('@')) {
            return new Response(JSON.stringify({ error: 'Invalid email' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Store lead in D1 database (if configured)
        if (env.DB) {
            await env.DB.prepare(
                'INSERT INTO leads (email, timestamp, created_at) VALUES (?, ?, ?)'
            )
                .bind(email, timestamp, new Date().toISOString())
                .run()
        }

        // Optional: Send to external webhook (Zapier, Make.com, etc.)
        if (env.WEBHOOK_URL) {
            await fetch(env.WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, timestamp, source: 'ai-chat' }),
            })
        }

        // Optional: Add to email marketing service
        // Example: Mailchimp, ConvertKit, etc.

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('Lead capture error:', error)
        return new Response(JSON.stringify({ error: 'Failed to capture lead' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
}

async function handleChatRequest(request, env) {
    try {
        const { model, messages, email } = await request.json()

        // Validate API key is configured
        if (!env.OPENAI_API_KEY) {
            return new Response(JSON.stringify({ error: 'API key not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Optional: Log conversation for analytics
        if (env.DB && email) {
            const userMessage = messages[messages.length - 1]?.content || ''
            await env.DB.prepare(
                'INSERT INTO conversations (email, message, model, created_at) VALUES (?, ?, ?, ?)'
            )
                .bind(email, userMessage, model, new Date().toISOString())
                .run()
                .catch(err => console.error('DB error:', err))
        }

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: model || 'gpt-4o-mini',
                messages,
                temperature: 0.7,
                max_tokens: 1000,
            }),
        })

        if (!response.ok) {
            const errorData = await response.text()
            console.error('OpenAI API error:', errorData)
            return new Response(
                JSON.stringify({ error: 'Failed to get AI response' }),
                {
                    status: response.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        const data = await response.json()

        // Return response to client
        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('Chat error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }
}
