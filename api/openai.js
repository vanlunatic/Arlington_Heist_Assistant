export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow all origins
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "POST") {
    const { userMessage } = req.body;

    const apiKey = process.env.OPENAI_API_KEY; // Use environment variable
    const url = "https://api.openai.com/v1/chat/completions";
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    const data = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Assistant ID: asst_wWTufktSKJh9mjZbfVBpZYlD.",
        },
        { role: "user", content: userMessage },
      ],
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      const responseData = await response.json();
      res.status(200).json({ result: responseData.choices[0].message.content });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Error fetching data." });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
