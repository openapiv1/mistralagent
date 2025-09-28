import { Mistral } from "@mistralai/mistralai";
import { customProvider } from "ai";

// Hardcoded Mistral API key
const MISTRAL_API_KEY = "E59RGCbtwmo5ANpiZTeL8lpOzJF2fEkc";

export const mistralProvider = customProvider({
  languageModels: {
    "mistral-medium-2505": async (options) => {
      const client = new Mistral({ apiKey: MISTRAL_API_KEY });
      
      return {
        specificationVersion: "v1",
        provider: "mistral",
        modelId: "mistral-medium-2505",
        
        doGenerate: async (options) => {
          const { prompt, mode, ...settings } = options;
          
          const messages = prompt.messages.map((msg) => {
            if (msg.role === "system") {
              return { role: "system", content: msg.content };
            }
            if (msg.role === "user") {
              return { role: "user", content: msg.content };
            }
            if (msg.role === "assistant") {
              return { role: "assistant", content: msg.content };
            }
            return msg;
          });

          try {
            const response = await client.chat.complete({
              model: "mistral-medium-2505",
              messages,
              ...settings
            });

            const choice = response.choices?.[0];
            if (!choice) {
              throw new Error("No response from Mistral");
            }

            return {
              text: choice.message?.content || "",
              usage: {
                promptTokens: response.usage?.promptTokens || 0,
                completionTokens: response.usage?.completionTokens || 0,
              },
              finishReason: choice.finishReason === "stop" ? "stop" : choice.finishReason,
            };
          } catch (error) {
            throw new Error(`Mistral API error: ${error}`);
          }
        },

        doStream: async (options) => {
          const { prompt } = options;
          
          const messages = prompt.messages.map((msg) => {
            if (msg.role === "system") {
              return { role: "system", content: msg.content };
            }
            if (msg.role === "user") {
              return { role: "user", content: msg.content };
            }
            if (msg.role === "assistant") {
              return { role: "assistant", content: msg.content };
            }
            return msg;
          });

          try {
            const stream = await client.chat.stream({
              model: "mistral-medium-2505",
              messages,
            });

            return {
              stream: (async function* () {
                for await (const chunk of stream) {
                  const delta = chunk.data?.choices?.[0]?.delta;
                  if (delta?.content) {
                    yield {
                      type: "text-delta" as const,
                      textDelta: delta.content,
                    };
                  }
                  
                  if (chunk.data?.choices?.[0]?.finishReason) {
                    yield {
                      type: "finish" as const,
                      finishReason: chunk.data.choices[0].finishReason === "stop" ? "stop" : chunk.data.choices[0].finishReason,
                      usage: {
                        promptTokens: chunk.data.usage?.promptTokens || 0,
                        completionTokens: chunk.data.usage?.completionTokens || 0,
                      }
                    };
                  }
                }
              })(),
            };
          } catch (error) {
            throw new Error(`Mistral streaming error: ${error}`);
          }
        }
      };
    }
  }
});

export const mistral = (modelId: string = "mistral-medium-2505") => mistralProvider(modelId);