 export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "POST") {
    const { userMessage } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.YOUR_ASSISTANT_ID;

    if (!apiKey || !assistantId) {
      return res.status(500).json({ error: "Missing API credentials" });
    }

    try {
      // 1️⃣ Create a thread
      const threadResponse = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        }
      });
      const threadData = await threadResponse.json();
      const threadId = threadData.id;

      // 2️⃣ Add user message
      await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        },
        body: JSON.stringify({ role: "user", content: userMessage })
      });

      // 3️⃣ Start assistant run
      const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        },
        body: JSON.stringify({ assistant_id: assistantId })
      });
      const runData = await runResponse.json();
      const runId = runData.id;

      // 4️⃣ Poll for completion
      let isCompleted = false;
      let attempts = 0;
      const maxAttempts = 15;
      while (!isCompleted && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 sec
        const checkRunResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
          headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "assistants=v2" }
        });
        const runStatusData = await checkRunResponse.json();

        if (runStatusData.status === "completed" || runStatusData.status === "succeeded") {
          isCompleted = true;
          break;
        } else if (runStatusData.status === "failed") {
          return res.status(500).json({ error: "Assistant run failed." });
        }
        attempts++;
      }
      if (!isCompleted) return res.status(500).json({ error: "Timeout waiting for response." });

      // 5️⃣ Retrieve assistant's reply
      const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "assistants=v2" }
      });
      const messagesData = await messagesResponse.json();

      let assistantMessage = "No response received.";
      for (let i = messagesData.data.length - 1; i >= 0; i--) {
        if (messagesData.data[i].role === "assistant") {
          if (Array.isArray(messagesData.data[i].content) && messagesData.data[i].content[0].text) {
            assistantMessage = messagesData.data[i].content[0].text.value;
          } else if (typeof messagesData.data[i].content === "string") {
            assistantMessage = messagesData.data[i].content;
          }
          break;
        }
      }

      return res.status(200).json({ result: assistantMessage });
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: "Error processing request." });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
