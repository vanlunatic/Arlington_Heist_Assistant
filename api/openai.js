export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method !== "POST") {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Extract user input and threadId from request
  const { userMessage, threadId: clientThreadId } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.YOUR_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    return res.status(500).json({ error: "Missing API credentials" });
  }

  try {
    let currentThreadId = clientThreadId || null; // Use existing thread if available

    // ✅ Create new thread if one doesn't exist
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

    // ✅ Send user message to the thread
    await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ role: "user", content: userMessage }),
    });

    // ✅ Start assistant response
    const runRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ assistant_id: assistantId }),
    });

    if (!runRes.ok) {
      return res.status(500).json({ error: `Run Error: ${await runRes.text()}` });
    }

    const { id: runId } = await runRes.json();

    // ✅ Optimized polling for assistant completion (up to 15 attempts with 2s delay)
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 15; // Increase attempts
    const delayMs = 2000; // Increase delay to 2s

    while (!isCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs)); // Delay

      const checkRunRes = await fetch(
        `https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "OpenAI-Beta": "assistants=v2",
          },
        }
      );

      const runStatusData = await checkRunRes.json();

      if (runStatusData.status === "completed" || runStatusData.status === "succeeded") {
        isCompleted = true;
        break;
      } else if (runStatusData.status === "failed") {
        return res.status(500).json({ error: "Assistant run failed." });
      }
      attempts++;
    }

    if (!isCompleted) {
      return res.status(500).json({ error: "Timeout waiting for assistant response." });
    }

    // ✅ Retrieve assistant response
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
    let assistantMessage = "No response received.";

    // ✅ Get the latest assistant message
    for (let msg of messagesData.data.reverse()) {
      if (msg.role === "assistant") {
        assistantMessage = msg.content?.[0]?.text?.value || msg.content || "No response.";
        break;
      }
    }

    // ✅ Return the assistant response with threadId for persistence
    return res.status(200).json({ result: assistantMessage, threadId: currentThreadId });
  } catch (error) {
    console.error("Unexpected Error:", error);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}
