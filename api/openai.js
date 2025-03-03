export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method !== "POST") {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Extract request data
  const { userMessage, threadId: clientThreadId } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.YOUR_ASSISTANT_ID;

  // Check API Credentials
  if (!apiKey || !assistantId) {
    console.error("Missing OpenAI API Key or Assistant ID.");
    return res.status(500).json({ error: "Server Misconfiguration: API credentials missing." });
  }

  try {
    let currentThreadId = clientThreadId || null;

    // 🔹 Create a new thread if it doesn't exist
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
        const errorText = await threadRes.text();
        console.error("OpenAI Thread Creation Error:", errorText);
        return res.status(500).json({ error: `OpenAI Thread Error: ${errorText}` });
      }

      const threadData = await threadRes.json();
      currentThreadId = threadData.id;
    }

    // 🔹 Send user message to OpenAI
    await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ role: "user", content: userMessage }),
    });

    // 🔹 Run the Assistant
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
      const errorText = await runRes.text();
      console.error("OpenAI Run Error:", errorText);
      return res.status(500).json({ error: `Run Error: ${errorText}` });
    }

    const { id: runId } = await runRes.json();
    
    // 🔹 Wait for the Assistant's response
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 6; // Reduced to prevent timeouts
    const delayMs = 2500;  // Increased delay for better efficiency

    while (!isCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));

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
      console.log(`🔄 Polling Attempt ${attempts + 1}:`, runStatusData.status);

      if (runStatusData.status === "completed" || runStatusData.status === "succeeded") {
        isCompleted = true;
        break;
      } else if (runStatusData.status === "failed" || runStatusData.status === "expired") {
        console.error("Assistant failed or expired:", runStatusData);
        return res.status(500).json({ error: "Assistant run failed or expired." });
      }

      attempts++;
    }

    if (!isCompleted) {
      return res.status(500).json({ error: "Timeout: Assistant response took too long." });
    }

    // 🔹 Retrieve Assistant Response
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    if (!messagesRes.ok) {
      const errorText = await messagesRes.text();
      console.error("OpenAI Message Fetch Error:", errorText);
      return res.status(500).json({ error: `Message Fetch Error: ${errorText}` });
    }

    const messagesData = await messagesRes.json();
    let assistantMessage = "No response received.";

    for (let msg of messagesData.data.reverse()) {
      if (msg.role === "assistant") {
        assistantMessage = msg.content?.[0]?.text?.value || msg.content || "No response.";
        break;
      }
    }

    return res.status(200).json({ result: assistantMessage, threadId: currentThreadId });
  } catch (error) {
    console.error("❌ Unexpected Server Error:", error);
    return res.status(500).json({ error: "Unexpected server error. Please try again later." });
  }
}
