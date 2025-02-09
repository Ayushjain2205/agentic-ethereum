"use client";

import { useState, useRef, useEffect } from "react";
import { Message } from "./message";
import { ChatInput } from "./chat-input";
import { VoiceInterface } from "./voice-interface";
import { useMode } from "@/contexts/ModeContext";
import { modeConfigs } from "@/lib/mode-config";
import { useToast } from "@/hooks/use-toast";
import { type ModeType } from "@/lib/colors";

interface ChatMessage {
  id: number;
  content: string;
  isUser: boolean;
}

export function ChatInterface() {
  const { activeMode, activeColor, activeLighterColor } = useMode();
  const { toast } = useToast();
  const [messagesByMode, setMessagesByMode] = useState<
    Record<ModeType, ChatMessage[]>
  >(() => {
    // Initialize with welcome messages for each mode
    const initialMessages: Record<ModeType, ChatMessage[]> = {} as Record<
      ModeType,
      ChatMessage[]
    >;
    Object.keys(modeConfigs).forEach((mode) => {
      initialMessages[mode as ModeType] = [
        {
          id: Date.now() + Math.random(),
          content: modeConfigs[mode].welcomeMessage,
          isUser: false,
        },
      ];
    });
    return initialMessages;
  });

  const [isCallMode, setIsCallMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMode = useRef<ModeType>(activeMode);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messagesByMode[activeMode]]);

  // Handle mode changes
  useEffect(() => {
    if (previousMode.current !== activeMode) {
      previousMode.current = activeMode;
      scrollToBottom();
    }
  }, [activeMode]);

  const handleSendMessage = async (content: string) => {
    // Add user message immediately
    setMessagesByMode((prev) => ({
      ...prev,
      [activeMode]: [
        ...prev[activeMode],
        { id: Date.now(), content, isUser: true },
      ],
    }));
    setIsLoading(true);
    setIsStreaming(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          mode: activeMode,
          history: messagesByMode[activeMode].map((msg) => ({
            role: msg.isUser ? "user" : "assistant",
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      // Create a new message for the assistant's response
      const responseMessageId = Date.now();
      setMessagesByMode((prev) => ({
        ...prev,
        [activeMode]: [
          ...prev[activeMode],
          { id: responseMessageId, content: "", isUser: false },
        ],
      }));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let isFirstChunk = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        accumulatedContent += text;

        if (isFirstChunk) {
          setIsLoading(false);
          setIsStreaming(true);
          isFirstChunk = false;
        }

        // Update the last message with accumulated content
        setMessagesByMode((prev) => ({
          ...prev,
          [activeMode]: prev[activeMode].map((msg) =>
            msg.id === responseMessageId
              ? { ...msg, content: accumulatedContent }
              : msg
          ),
        }));
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const toggleCallMode = () => {
    setIsCallMode(!isCallMode);
  };

  return (
    <div
      className="flex-1 flex flex-col h-[calc(100vh-64px)]"
      style={{ backgroundColor: activeLighterColor }}
    >
      {isCallMode ? (
        <VoiceInterface onEndCall={toggleCallMode} />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messagesByMode[activeMode].map((message) => (
              <Message
                key={message.id}
                content={message.content}
                isUser={message.isUser}
                activeColor={activeColor}
              />
            ))}
            {isLoading && !isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] p-3 bg-white border-2 border-black rounded-lg shadow-brutal">
                  <p className="text-base text-gray-500">
                    <span className="typing-dots"></span>
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <ChatInput
            onSend={handleSendMessage}
            onCallStart={toggleCallMode}
            isLoading={isLoading || isStreaming}
          />
        </>
      )}
    </div>
  );
}
