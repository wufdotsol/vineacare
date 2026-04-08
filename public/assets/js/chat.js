import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

// Initialize Firebase (Reuse from auth.js)
const firebaseConfig = {
  apiKey: "AIzaSyAqj6QGAKb0HzD43N5t4mDd0Bpn0q3QDGo",
  authDomain: "vineacare.firebaseapp.com",
  projectId: "vineacare",
  storageBucket: "vineacare.firebasestorage.app",
  messagingSenderId: "300769963613",
  appId: "1:300769963613:web:61691056ab2c318ecca7b4"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const functions = getFunctions(app);

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

// Update this to match your actual deployed Genkit flow / Cloud Function name
const chatWithVineaCareAI = httpsCallable(functions, "chatWithVineaCareAI");

document.addEventListener("DOMContentLoaded", () => {
  const chatFab = document.getElementById("chat-fab");
  const chatWindow = document.getElementById("chat-window");
  const closeChat = document.getElementById("close-chat");
  const sendChat = document.getElementById("send-chat");
  const chatInput = document.getElementById("chat-input");
  const chatBody = document.getElementById("chat-body");

  // Toggle Chat Window
  chatFab.addEventListener("click", () => {
    chatWindow.classList.toggle("d-none");
    if (!chatWindow.classList.contains("d-none")) {
      chatInput.focus();
    }
  });

  closeChat.addEventListener("click", () => {
    chatWindow.classList.add("d-none");
  });

  function addMessage(text, isAI) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `chat-message ${isAI ? "ai-message" : "user-message"}`;
    msgDiv.innerText = text;
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function extractPageContext() {
    // Extract vital context sections text directly from the DOM
    const aboutSection = document.getElementById("about")?.innerText || "";
    const servicesSection = document.getElementById("services")?.innerText || "";
    const whyUsSection = document.getElementById("why-us")?.innerText || "";
    const contactSection = document.getElementById("contact")?.innerText || "";
    
    return `
      ABOUT: ${aboutSection.slice(0, 500)}...
      SERVICES: ${servicesSection.slice(0, 500)}...
      WHY US: ${whyUsSection.slice(0, 500)}...
      CONTACT: ${contactSection.slice(0, 500)}...
    `.trim();
  }

  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Add user message to UI
    addMessage(text, false);
    chatInput.value = "";

    // Show typing indicator
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "chat-message ai-message typing-indicator";
    typingIndicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    chatBody.appendChild(typingIndicator);
    chatBody.scrollTop = chatBody.scrollHeight;

    const contextData = extractPageContext();

    try {
      // Call Firebase Genkit Function
      const result = await chatWithVineaCareAI({ 
        message: text,
        context: contextData
      });
      
      const responseText = result.data.reply || result.data || "I couldn't generate a response. Please try again.";
      
      // Remove typing indicator and show AI response
      chatBody.removeChild(typingIndicator);
      addMessage(responseText, true);
    } catch (error) {
      console.error("Error communicating with Genkit AI:", error);
      chatBody.removeChild(typingIndicator);
      addMessage("Sorry, I encountered an error. Please try again later.", true);
    }
  }

  sendChat.addEventListener("click", handleSend);

  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  });
});
