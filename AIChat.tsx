import React, { useState, useRef, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"

interface Message {
    role: "user" | "assistant" | "system"
    content: string
}

interface AIChatProps {
    // API Configuration
    mode: "testing" | "production"
    apiKey: string
    cloudflareWorkerUrl: string
    model: string
    systemInstructions: string

    // Lead Generation
    requireEmail: boolean
    emailPlaceholder: string
    emailSubmitText: string

    // UI Customization
    width: number
    height: number
    backgroundColor: string
    chatBackgroundColor: string
    userMessageColor: string
    assistantMessageColor: string
    userTextColor: string
    assistantTextColor: string
    inputBackgroundColor: string
    inputTextColor: string
    inputPlaceholder: string
    sendButtonColor: string
    sendButtonTextColor: string
    sendButtonText: string
    borderRadius: number
    messageBorderRadius: number
    fontSize: number
    fontFamily: string
    padding: number
    messageSpacing: number

    // Header
    showHeader: boolean
    headerText: string
    headerBackgroundColor: string
    headerTextColor: string
    headerFontSize: number
}

export default function AIChat(props: Partial<AIChatProps>) {
    const {
        mode = "production",
        apiKey = "",
        cloudflareWorkerUrl = "",
        model = "gpt-4o-mini",
        systemInstructions = "You are a helpful assistant.",

        requireEmail = true,
        emailPlaceholder = "Enter your email to start chatting",
        emailSubmitText = "Start Chat",

        width = 400,
        height = 600,
        backgroundColor = "#f5f5f5",
        chatBackgroundColor = "#ffffff",
        userMessageColor = "#007AFF",
        assistantMessageColor = "#E5E5EA",
        userTextColor = "#ffffff",
        assistantTextColor = "#000000",
        inputBackgroundColor = "#ffffff",
        inputTextColor = "#000000",
        inputPlaceholder = "Type your message...",
        sendButtonColor = "#007AFF",
        sendButtonTextColor = "#ffffff",
        sendButtonText = "Send",
        borderRadius = 16,
        messageBorderRadius = 18,
        fontSize = 14,
        fontFamily = "system-ui, -apple-system, sans-serif",
        padding = 16,
        messageSpacing = 12,

        showHeader = true,
        headerText = "AI Assistant",
        headerBackgroundColor = "#007AFF",
        headerTextColor = "#ffffff",
        headerFontSize = 18,
    } = props

    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [email, setEmail] = useState("")
    const [hasProvidedEmail, setHasProvidedEmail] = useState(false)
    const [error, setError] = useState("")
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const chatContainerRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const validateEmail = (email: string) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return re.test(email)
    }

    const handleEmailSubmit = () => {
        if (!validateEmail(email)) {
            setError("Please enter a valid email address")
            return
        }
        setError("")
        setHasProvidedEmail(true)

        // Send email to your backend/webhook for lead capture
        // You can customize this endpoint
        if (cloudflareWorkerUrl) {
            fetch(`${cloudflareWorkerUrl}/capture-lead`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, timestamp: new Date().toISOString() }),
            }).catch(err => console.error("Lead capture failed:", err))
        }
    }

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return

        const userMessage: Message = {
            role: "user",
            content: input.trim(),
        }

        setMessages(prev => [...prev, userMessage])
        setInput("")
        setIsLoading(true)
        setError("")

        try {
            const endpoint = mode === "testing"
                ? "https://api.openai.com/v1/chat/completions"
                : cloudflareWorkerUrl

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            }

            if (mode === "testing" && apiKey) {
                headers["Authorization"] = `Bearer ${apiKey}`
            }

            const body = {
                model,
                messages: [
                    { role: "system", content: systemInstructions },
                    ...messages.map(m => ({ role: m.role, content: m.content })),
                    { role: "user", content: userMessage.content },
                ],
                email: requireEmail ? email : undefined,
            }

            const response = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            })

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()
            const assistantMessage: Message = {
                role: "assistant",
                content: data.choices?.[0]?.message?.content || data.message || "Sorry, I couldn't process that.",
            }

            setMessages(prev => [...prev, assistantMessage])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send message")
            console.error("Chat error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            if (!hasProvidedEmail && requireEmail) {
                handleEmailSubmit()
            } else {
                sendMessage()
            }
        }
    }

    // Email collection view
    if (requireEmail && !hasProvidedEmail) {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor,
                    borderRadius,
                    overflow: "hidden",
                    fontFamily,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding,
                }}
            >
                <div
                    style={{
                        backgroundColor: chatBackgroundColor,
                        borderRadius: messageBorderRadius,
                        padding: padding * 1.5,
                        maxWidth: "80%",
                        textAlign: "center",
                    }}
                >
                    <h3
                        style={{
                            margin: `0 0 ${padding}px 0`,
                            fontSize: headerFontSize,
                            color: inputTextColor,
                        }}
                    >
                        {headerText}
                    </h3>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={emailPlaceholder}
                        style={{
                            width: "100%",
                            padding: padding * 0.75,
                            fontSize,
                            fontFamily,
                            backgroundColor: inputBackgroundColor,
                            color: inputTextColor,
                            border: `1px solid ${assistantMessageColor}`,
                            borderRadius: borderRadius / 2,
                            outline: "none",
                            marginBottom: padding,
                            boxSizing: "border-box",
                        }}
                    />
                    {error && (
                        <div
                            style={{
                                color: "#ff3b30",
                                fontSize: fontSize * 0.9,
                                marginBottom: padding * 0.5,
                            }}
                        >
                            {error}
                        </div>
                    )}
                    <button
                        onClick={handleEmailSubmit}
                        style={{
                            width: "100%",
                            padding: padding * 0.75,
                            fontSize,
                            fontFamily,
                            fontWeight: 600,
                            backgroundColor: sendButtonColor,
                            color: sendButtonTextColor,
                            border: "none",
                            borderRadius: borderRadius / 2,
                            cursor: "pointer",
                        }}
                    >
                        {emailSubmitText}
                    </button>
                </div>
            </div>
        )
    }

    // Main chat view
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                backgroundColor,
                borderRadius,
                overflow: "hidden",
                fontFamily,
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Header */}
            {showHeader && (
                <div
                    style={{
                        backgroundColor: headerBackgroundColor,
                        color: headerTextColor,
                        padding: padding * 0.75,
                        fontSize: headerFontSize,
                        fontWeight: 600,
                        textAlign: "center",
                        borderTopLeftRadius: borderRadius,
                        borderTopRightRadius: borderRadius,
                    }}
                >
                    {headerText}
                </div>
            )}

            {/* Messages */}
            <div
                ref={chatContainerRef}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding,
                    backgroundColor: chatBackgroundColor,
                    display: "flex",
                    flexDirection: "column",
                    gap: messageSpacing,
                }}
            >
                {messages.length === 0 && (
                    <div
                        style={{
                            textAlign: "center",
                            color: assistantTextColor,
                            opacity: 0.5,
                            padding: padding * 2,
                            fontSize,
                        }}
                    >
                        Start a conversation...
                    </div>
                )}

                {messages.map((message, index) => (
                    <div
                        key={index}
                        style={{
                            display: "flex",
                            justifyContent: message.role === "user" ? "flex-end" : "flex-start",
                        }}
                    >
                        <div
                            style={{
                                maxWidth: "75%",
                                padding: padding * 0.75,
                                borderRadius: messageBorderRadius,
                                backgroundColor:
                                    message.role === "user" ? userMessageColor : assistantMessageColor,
                                color: message.role === "user" ? userTextColor : assistantTextColor,
                                fontSize,
                                lineHeight: 1.5,
                                wordWrap: "break-word",
                            }}
                        >
                            {message.content}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-start",
                        }}
                    >
                        <div
                            style={{
                                padding: padding * 0.75,
                                borderRadius: messageBorderRadius,
                                backgroundColor: assistantMessageColor,
                                color: assistantTextColor,
                                fontSize,
                            }}
                        >
                            Thinking...
                        </div>
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            padding: padding * 0.75,
                            borderRadius: messageBorderRadius,
                            backgroundColor: "#ff3b30",
                            color: "#ffffff",
                            fontSize: fontSize * 0.9,
                            textAlign: "center",
                        }}
                    >
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
                style={{
                    padding,
                    backgroundColor: chatBackgroundColor,
                    borderTop: `1px solid ${assistantMessageColor}`,
                    display: "flex",
                    gap: padding * 0.5,
                }}
            >
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={inputPlaceholder}
                    disabled={isLoading}
                    style={{
                        flex: 1,
                        padding: padding * 0.75,
                        fontSize,
                        fontFamily,
                        backgroundColor: inputBackgroundColor,
                        color: inputTextColor,
                        border: `1px solid ${assistantMessageColor}`,
                        borderRadius: borderRadius / 2,
                        outline: "none",
                    }}
                />
                <button
                    onClick={sendMessage}
                    disabled={isLoading || !input.trim()}
                    style={{
                        padding: `${padding * 0.75}px ${padding * 1.5}px`,
                        fontSize,
                        fontFamily,
                        fontWeight: 600,
                        backgroundColor: sendButtonColor,
                        color: sendButtonTextColor,
                        border: "none",
                        borderRadius: borderRadius / 2,
                        cursor: isLoading ? "not-allowed" : "pointer",
                        opacity: isLoading ? 0.6 : 1,
                    }}
                >
                    {sendButtonText}
                </button>
            </div>
        </div>
    )
}

// Framer Property Controls
addPropertyControls(AIChat, {
    // API Configuration Section
    mode: {
        type: ControlType.Enum,
        title: "Mode",
        options: ["testing", "production"],
        defaultValue: "production",
        displaySegmentedControl: true,
    },
    apiKey: {
        type: ControlType.String,
        title: "API Key",
        description: "OpenAI API key (for testing mode)",
        placeholder: "sk-...",
        hidden: (props) => props.mode !== "testing",
    },
    cloudflareWorkerUrl: {
        type: ControlType.String,
        title: "Worker URL",
        description: "Cloudflare Worker proxy URL",
        placeholder: "https://your-worker.workers.dev",
        hidden: (props) => props.mode !== "production",
    },
    model: {
        type: ControlType.Enum,
        title: "Model",
        options: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        defaultValue: "gpt-4o-mini",
    },
    systemInstructions: {
        type: ControlType.String,
        title: "Instructions",
        description: "System instructions for the AI",
        defaultValue: "You are a helpful assistant.",
        displayTextArea: true,
    },

    // Lead Generation Section
    requireEmail: {
        type: ControlType.Boolean,
        title: "Require Email",
        defaultValue: true,
    },
    emailPlaceholder: {
        type: ControlType.String,
        title: "Email Placeholder",
        defaultValue: "Enter your email to start chatting",
        hidden: (props) => !props.requireEmail,
    },
    emailSubmitText: {
        type: ControlType.String,
        title: "Email Button Text",
        defaultValue: "Start Chat",
        hidden: (props) => !props.requireEmail,
    },

    // Layout Section
    width: {
        type: ControlType.Number,
        title: "Width",
        defaultValue: 400,
        min: 200,
        max: 1000,
        step: 10,
    },
    height: {
        type: ControlType.Number,
        title: "Height",
        defaultValue: 600,
        min: 300,
        max: 1000,
        step: 10,
    },

    // Colors Section
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#f5f5f5",
    },
    chatBackgroundColor: {
        type: ControlType.Color,
        title: "Chat Background",
        defaultValue: "#ffffff",
    },
    userMessageColor: {
        type: ControlType.Color,
        title: "User Message",
        defaultValue: "#007AFF",
    },
    assistantMessageColor: {
        type: ControlType.Color,
        title: "Assistant Message",
        defaultValue: "#E5E5EA",
    },
    userTextColor: {
        type: ControlType.Color,
        title: "User Text",
        defaultValue: "#ffffff",
    },
    assistantTextColor: {
        type: ControlType.Color,
        title: "Assistant Text",
        defaultValue: "#000000",
    },
    inputBackgroundColor: {
        type: ControlType.Color,
        title: "Input Background",
        defaultValue: "#ffffff",
    },
    inputTextColor: {
        type: ControlType.Color,
        title: "Input Text",
        defaultValue: "#000000",
    },
    sendButtonColor: {
        type: ControlType.Color,
        title: "Send Button",
        defaultValue: "#007AFF",
    },
    sendButtonTextColor: {
        type: ControlType.Color,
        title: "Button Text",
        defaultValue: "#ffffff",
    },

    // Header Section
    showHeader: {
        type: ControlType.Boolean,
        title: "Show Header",
        defaultValue: true,
    },
    headerText: {
        type: ControlType.String,
        title: "Header Text",
        defaultValue: "AI Assistant",
        hidden: (props) => !props.showHeader,
    },
    headerBackgroundColor: {
        type: ControlType.Color,
        title: "Header Background",
        defaultValue: "#007AFF",
        hidden: (props) => !props.showHeader,
    },
    headerTextColor: {
        type: ControlType.Color,
        title: "Header Text Color",
        defaultValue: "#ffffff",
        hidden: (props) => !props.showHeader,
    },
    headerFontSize: {
        type: ControlType.Number,
        title: "Header Font Size",
        defaultValue: 18,
        min: 12,
        max: 32,
        hidden: (props) => !props.showHeader,
    },

    // Typography Section
    fontSize: {
        type: ControlType.Number,
        title: "Font Size",
        defaultValue: 14,
        min: 10,
        max: 24,
    },
    fontFamily: {
        type: ControlType.String,
        title: "Font Family",
        defaultValue: "system-ui, -apple-system, sans-serif",
    },

    // Spacing Section
    borderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        defaultValue: 16,
        min: 0,
        max: 32,
    },
    messageBorderRadius: {
        type: ControlType.Number,
        title: "Message Radius",
        defaultValue: 18,
        min: 0,
        max: 32,
    },
    padding: {
        type: ControlType.Number,
        title: "Padding",
        defaultValue: 16,
        min: 8,
        max: 32,
    },
    messageSpacing: {
        type: ControlType.Number,
        title: "Message Spacing",
        defaultValue: 12,
        min: 4,
        max: 24,
    },

    // Text Inputs Section
    inputPlaceholder: {
        type: ControlType.String,
        title: "Input Placeholder",
        defaultValue: "Type your message...",
    },
    sendButtonText: {
        type: ControlType.String,
        title: "Send Button Text",
        defaultValue: "Send",
    },
})
