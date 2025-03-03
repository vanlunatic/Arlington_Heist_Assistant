export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method !== "POST") {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { userMessage, threadId: clientThreadId } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.YOUR_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    console.error("❌ Missing OpenAI API Key or Assistant ID.");
    return res.status(500).json({ error: "Server Misconfiguration: API credentials missing." });
  }

  try {
    let currentThreadId = clientThreadId || null;

    // 🔹 Step 1: Create a new thread if needed
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
        console.error("❌ Thread Creation Error:", await threadRes.text());
        return res.status(500).json({ error: "Failed to create thread with OpenAI." });
      }

      const threadData = await threadRes.json();
      currentThreadId = threadData.id;
    }

    // 🔹 Step 2: Send user message to OpenAI
    const messageRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ role: "user", content: userMessage }),
    });

    if (!messageRes.ok) {
      console.error("❌ Message Error:", await messageRes.text());
      return res.status(500).json({ error: "Failed to send message to OpenAI." });
    }

    // 🔹 Step 3: Run the Assistant
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
      console.error("❌ Run Error:", await runRes.text());
      return res.status(500).json({ error: "Failed to run assistant." });
    }

    const { id: runId } = await runRes.json();

    // 🔹 Step 4: Poll for Assistant Response
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 6;
    const delayMs = 3000;

    while (!isCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));

      const checkRunRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });

      const runStatusData = await checkRunRes.json();
      console.log(`🔄 Attempt ${attempts + 1}:`, runStatusData.status);

      if (runStatusData.status === "completed" || runStatusData.status === "succeeded") {
        isCompleted = true;
        break;
      } else if (["failed", "expired"].includes(runStatusData.status)) {
        console.error("❌ Assistant Run Failed:", runStatusData);
        return res.status(500).json({ error: "Assistant run failed or expired." });
      }

      attempts++;
    }

    if (!isCompleted) {
      return res.status(500).json({ error: "Timeout: Assistant response took too long." });
    }

    // 🔹 Step 5: Retrieve the Latest Assistant Response
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    if (!messagesRes.ok) {
      console.error("❌ Message Fetch Error:", await messagesRes.text());
      return res.status(500).json({ error: "Failed to fetch messages." });
    }

    const messagesData = await messagesRes.json();
    let assistantMessage = "No response received.";

    // 🔥 Fix: Ensure we get the most recent AI response
    const assistantReplies = messagesData.data
      .filter(msg => msg.role === "assistant")
      .map(msg => msg.content?.[0]?.text?.value)
      .filter(Boolean);

    if (assistantReplies.length > 0) {
      assistantMessage = assistantReplies.pop(); // Get the most recent assistant message
    }

    return res.status(200).json({ result: assistantMessage, threadId: currentThreadId });
  } catch (error) {
    console.error("❌ Unexpected Server Error:", error);
    return res.status(500).json({ error: "Unexpected server error. Please try again later." });
  }
}
