import React, { useState } from 'react';

function ChatComponent() {
  const [userMessage, setUserMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);

  async function sendMessage(message) {
    // Retrieve stored threadId, if any
    const storedThreadId = localStorage.getItem('threadId');

    // Send the message along with the threadId (if available) to your API
    const response = await fetch('/api/your-handler-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: message, threadId: storedThreadId }),
    });

    const data = await response.json();

    // If no threadId was stored, save the one returned from the API
    if (!storedThreadId && data.threadId) {
      localStorage.setItem('threadId', data.threadId);
    }

    // Update your chat history with both the user and assistant messages
    setChatHistory(prevHistory => [
      ...prevHistory,
      { role: 'user', message },
      { role: 'assistant', message: data.result }
    ]);
  }

  return (
    <div>
      <div>
        {chatHistory.map((chat, index) => (
          <p key={index}>
            <strong>{chat.role}:</strong> {chat.message}
          </p>
        ))}
      </div>
      <input
        type="text"
        value={userMessage}
        onChange={e => setUserMessage(e.target.value)}
        placeholder="Type your message..."
      />
      <button onClick={() => {
        sendMessage(userMessage);
        setUserMessage('');
      }}>
        Send
      </button>
    </div>
  );
}

export default ChatComponent;
