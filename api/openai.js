export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method !== "POST") {
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { userMessage, threadId: clientThreadId } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.OPENAI_ASSISTANT_ID;

    if (!apiKey || !assistantId) {
        return res.status(500).json({ error: "Missing API credentials" });
    }

    try {
        let currentThreadId = clientThreadId || null;

        if (!currentThreadId) {
            const threadRes = await fetch("https://api.openai.com/v1/threads", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2",
                },
            });

            if (!threadRes.ok) {
                return res.status(500).json({ error: `OpenAI Error: ${await threadRes.text()}` });
            }

            const threadData = await threadRes.json();
            currentThreadId = threadData.id;
        }

        await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
            },
            body: JSON.stringify({ role: "user", content: userMessage }),
        });

        const messagesRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
            },
        });

        if (!messagesRes.ok) {
            return res.status(500).json({ error: `Message Fetch Error: ${await messagesRes.text()}` });
        }

        const messagesData = await messagesRes.json();
        let assistantMessage = messagesData.data?.find(msg => msg.role === "assistant")?.content?.[0]?.text?.value || "No response.";

        return res.status(200).json({ result: assistantMessage, threadId: currentThreadId });
    } catch (error) {
        console.error("Unexpected Error:", error);
        return res.status(500).json({ error: "Unexpected server error." });
    }
}
