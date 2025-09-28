import { Mistral } from "@mistralai/mistralai";
import { createLanguageModel, LanguageModelV1 } from "ai";

// Hardcoded Mistral API key
const MISTRAL_API_KEY = "E59RGCbtwmo5ANpiZTeL8lpOzJF2fEkc";

export const mistral = (modelId: string = "mistral-medium-2505"): LanguageModelV1 => {
  const client = new Mistral({ apiKey: MISTRAL_API_KEY });

  return createLanguageModel({
    modelId,
    provider: "mistral",
    
    async doGenerate({ prompt, tools, toolChoice, maxTokens, temperature }) {
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

      const mistralTools = tools ? Object.values(tools).map((tool) => ({
        type: "function",
        function: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name: (tool as any).function?.name || (tool as any).name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          description: (tool as any).function?.description || (tool as any).description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parameters: (tool as any).function?.parameters || (tool as any).parameters
        }
      })) : undefined;

      try {
        const response = await client.chat.complete({
          model: modelId,
          messages,
          tools: mistralTools,
          toolChoice: toolChoice === "auto" ? "auto" : undefined,
          maxTokens,
          temperature
        });

        const choice = response.choices?.[0];
        if (!choice) {
          throw new Error("No response from Mistral");
        }

        const text = choice.message?.content || "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolCalls = choice.message?.toolCalls?.map((tc: any) => ({
          toolCallType: "function" as const,
          toolCallId: tc.id,
          toolName: tc.function?.name,
          args: JSON.parse(tc.function?.arguments || "{}")
        })) || [];

        return {
          text,
          toolCalls,
          finishReason: choice.finishReason === "stop" ? "stop" : choice.finishReason,
          usage: {
            promptTokens: response.usage?.promptTokens || 0,
            completionTokens: response.usage?.completionTokens || 0,
          }
        };
      } catch (error) {
        throw new Error(`Mistral API error: ${error}`);
      }
    },

    async doStream({ prompt, tools, toolChoice, maxTokens, temperature }) {
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

      const mistralTools = tools ? Object.values(tools).map((tool) => ({
        type: "function",
        function: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name: (tool as any).function?.name || (tool as any).name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          description: (tool as any).function?.description || (tool as any).description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parameters: (tool as any).function?.parameters || (tool as any).parameters
        }
      })) : undefined;

      try {
        const stream = await client.chat.stream({
          model: modelId,
          messages,
          tools: mistralTools,
          toolChoice: toolChoice === "auto" ? "auto" : undefined,
          maxTokens,
          temperature
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
              
              if (delta?.toolCalls) {
                for (const toolCall of delta.toolCalls) {
                  if (toolCall.function?.name) {
                    yield {
                      type: "tool-call-delta" as const,
                      toolCallType: "function" as const,
                      toolCallId: toolCall.id || `call_${Date.now()}`,
                      toolName: toolCall.function.name,
                      argsTextDelta: toolCall.function.arguments || "",
                    };
                  }
                }
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
  });
};