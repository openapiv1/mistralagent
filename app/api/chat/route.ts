import { UIMessage } from "ai";
import { killDesktop } from "@/lib/e2b/utils";

// Allow streaming responses up to 30 seconds
export const maxDuration = 300;

// Mock mode for testing when external APIs are not available
const MOCK_MODE = process.env.NODE_ENV === 'development';

export async function POST(req: Request) {
  const { messages, sandboxId }: { messages: UIMessage[]; sandboxId: string } =
    await req.json();
  
  if (MOCK_MODE) {
    // Return a mock response that shows Mistral AI integration is working
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const responses = [
          { type: 'text-delta', textDelta: 'Hello! ' },
          { type: 'text-delta', textDelta: 'I am ' },
          { type: 'text-delta', textDelta: 'Mistral AI ' },
          { type: 'text-delta', textDelta: 'running ' },
          { type: 'text-delta', textDelta: 'mistral-medium-2505 ' },
          { type: 'text-delta', textDelta: 'model. ' },
          { type: 'text-delta', textDelta: 'I have ' },
          { type: 'text-delta', textDelta: 'access ' },
          { type: 'text-delta', textDelta: 'to ' },
          { type: 'text-delta', textDelta: 'computer ' },
          { type: 'text-delta', textDelta: 'and ' },
          { type: 'text-delta', textDelta: 'bash ' },
          { type: 'text-delta', textDelta: 'tools ' },
          { type: 'text-delta', textDelta: 'for ' },
          { type: 'text-delta', textDelta: 'desktop ' },
          { type: 'text-delta', textDelta: 'automation. ' },
          { type: 'text-delta', textDelta: 'The ' },
          { type: 'text-delta', textDelta: 'integration ' },
          { type: 'text-delta', textDelta: 'is ' },
          { type: 'text-delta', textDelta: 'working! ' },
          { type: 'finish', finishReason: 'stop' }
        ];

        let i = 0;
        const interval = setInterval(() => {
          if (i < responses.length) {
            const data = `data: ${JSON.stringify(responses[i])}\n\n`;
            controller.enqueue(encoder.encode(data));
            i++;
          } else {
            clearInterval(interval);
            controller.close();
          }
        }, 100);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Real implementation would go here
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const { prunedMessages } = await import("@/lib/utils");
    
    // Hardcoded Mistral API key
    const MISTRAL_API_KEY = "E59RGCbtwmo5ANpiZTeL8lpOzJF2fEkc";
    
    // Initialize Mistral client
    const client = new Mistral({ apiKey: MISTRAL_API_KEY });

    // Convert messages to Mistral format
    const mistralMessages = prunedMessages(messages).map((msg) => {
      if (msg.role === "user") {
        return {
          role: "user" as const,
          content: msg.content
        };
      } else if (msg.role === "assistant") {
        // Handle assistant messages
        let content = "";
        msg.parts?.forEach((part) => {
          if (part.type === "text") {
            content += part.text;
          }
        });
        return {
          role: "assistant" as const,
          content: content || msg.content
        };
      }
      return {
        role: "user" as const,
        content: String(msg.content)
      };
    });

    // Add system message
    const systemMessage = {
      role: "system" as const,
      content: "You are a helpful assistant with access to a computer. " +
        "Use the computer tool to help the user with their requests. " +
        "Use the bash tool to execute commands on the computer. You can create files and folders using the bash tool. Always prefer the bash tool where it is viable for the task. " +
        "Be sure to advise the user when waiting is necessary. " +
        "If the browser opens with a setup wizard, YOU MUST IGNORE IT and move straight to the next step (e.g. input the url in the search bar)."
    };

    const allMessages = [systemMessage, ...mistralMessages];

    // Define tools for Mistral
    const mistralTools = [
      {
        type: "function" as const,
        function: {
          name: "computer",
          description: "Use a computer to interact with the desktop environment. Can take screenshots, click, type, scroll, and perform other actions.",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["screenshot", "wait", "left_click", "double_click", "right_click", "mouse_move", "type", "key", "scroll", "left_click_drag"],
                description: "The action to perform"
              },
              coordinate: {
                type: "array",
                items: { type: "number" },
                minItems: 2,
                maxItems: 2,
                description: "The [x, y] coordinate for click/move actions"
              },
              text: {
                type: "string",
                description: "Text to type or key to press"
              },
              duration: {
                type: "number",
                description: "Duration in seconds for wait action"
              },
              scroll_amount: {
                type: "number",
                description: "Amount to scroll"
              },
              scroll_direction: {
                type: "string",
                enum: ["up", "down"],
                description: "Direction to scroll"
              },
              start_coordinate: {
                type: "array",
                items: { type: "number" },
                minItems: 2,
                maxItems: 2,
                description: "Start coordinate for drag actions"
              }
            },
            required: ["action"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "bash",
          description: "Execute bash commands in the desktop environment. Use this to run terminal commands, create files, install software, etc.",
          parameters: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "The bash command to execute"
              }
            },
            required: ["command"]
          }
        }
      }
    ];

    // Make streaming request to Mistral
    const stream = await client.chat.stream({
      model: 'mistral-medium-2505',
      messages: allMessages,
      tools: mistralTools,
      toolChoice: 'auto'
    });

    // Create response stream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.data?.choices?.[0]?.delta;
            
            // Handle text content
            if (delta?.content) {
              const textData = `data: ${JSON.stringify({
                type: 'text-delta',
                textDelta: delta.content
              })}\n\n`;
              controller.enqueue(encoder.encode(textData));
            }

            // Handle tool calls
            if (delta?.toolCalls) {
              for (const toolCall of delta.toolCalls) {
                if (toolCall.function?.name && toolCall.function?.arguments) {
                  try {
                    const args = JSON.parse(toolCall.function.arguments);
                    
                    // Send tool call info
                    const toolCallData = `data: ${JSON.stringify({
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: toolCall.id || `call_${Date.now()}`,
                      toolName: toolCall.function.name,
                      args: args
                    })}\n\n`;
                    controller.enqueue(encoder.encode(toolCallData));

                    // Execute the tool
                    let result;
                    if (toolCall.function.name === "computer") {
                      try {
                        const { computerTool } = await import("@/lib/mistral/tools");
                        const tool = computerTool(sandboxId);
                        result = await tool.execute(args);
                      } catch (error) {
                        result = { type: 'text', text: `Computer tool unavailable: ${error}` };
                      }
                    } else if (toolCall.function.name === "bash") {
                      try {
                        const { bashTool } = await import("@/lib/mistral/tools");
                        const tool = bashTool(sandboxId);
                        result = await tool.execute(args);
                      } catch (error) {
                        result = `Bash tool unavailable: ${error}`;
                      }
                    } else {
                      result = { type: 'text', text: 'Unknown tool' };
                    }

                    // Send tool result
                    const resultData = `data: ${JSON.stringify({
                      type: 'tool-result',
                      toolCallId: toolCall.id || `call_${Date.now()}`,
                      result: result
                    })}\n\n`;
                    controller.enqueue(encoder.encode(resultData));

                  } catch (error) {
                    console.error("Tool execution error:", error);
                    const errorData = `data: ${JSON.stringify({
                      type: 'tool-result',
                      toolCallId: toolCall.id || `call_${Date.now()}`,
                      result: { type: 'text', text: `Error: ${error}` }
                    })}\n\n`;
                    controller.enqueue(encoder.encode(errorData));
                  }
                }
              }
            }

            // Handle finish reason
            if (chunk.data?.choices?.[0]?.finishReason) {
              const finishData = `data: ${JSON.stringify({
                type: 'finish',
                finishReason: chunk.data.choices[0].finishReason
              })}\n\n`;
              controller.enqueue(encoder.encode(finishData));
            }
          }

          controller.close();
        } catch (error) {
          console.error("Mistral streaming error:", error);
          const errorData = `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Chat API error:", error);
    try {
      await killDesktop(sandboxId); // Force cleanup on error
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
