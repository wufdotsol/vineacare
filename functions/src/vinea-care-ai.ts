import {genkit, z} from "genkit";
import {googleAI} from "@genkit-ai/google-genai";
import {onCallGenkit} from "firebase-functions/https";

// The plugin automatically uses process.env.GEMINI_API_KEY if not provided
const ai = genkit({
  plugins: [
    googleAI(),
  ],
});

const vineaCareAIFlow = ai.defineFlow({
  name: "vineaCareAIFlow",
  inputSchema: z.object({
    message: z.string(),
    context: z.string(),
  }),
  outputSchema: z.string(),
}, async (input) => {
  const prompt = `You are a helpful and professional customer support
    assistant for Vinea Care Ltd., a care agency.
    Use the following context from our website to answer the user's
    question accurately. If the context doesn't contain the answer,
    politely say you don't know and direct them to contact us via
    phone (+44 7551 851185) or email admin@vineacare.com. Keep your
    answers concise and professional.
    
    WEBSITE CONTEXT:
    ${input.context}
    
    USER QUESTION:
    ${input.message}
    
    YOUR ANSWER:`;

  const response = await ai.generate({
    model: "googleai/gemini-2.5-flash",
    prompt: prompt,
    config: {
      temperature: 0.5,
    },
  });

  return response.text;
}
);

export const chatWithVineaCareAI = onCallGenkit({
  // Bypassing Secrets Manager to avoid billing requirement
}, vineaCareAIFlow);
