"use client";

import { type FormEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";

// The assistant's question with its choices, and a box for the User's own answer. Answers go out through onAnswer.
export function QuestionCard({ question, choices, disabled, onAnswer }: { question: string; choices: string[]; disabled: boolean; onAnswer: (text: string) => void }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const answer = text.trim();

  function send(e: FormEvent) {
    e.preventDefault();
    if (!answer || disabled) return;
    setText("");
    onAnswer(answer);
  }

  return (
    <section aria-label="Question from Chat" className="grid gap-3 rounded-[14px] border border-border p-3">
      <p className="font-medium">{question}</p>
      {choices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {choices.map((choice, i) => (
            <Button key={i} variant="outline" disabled={disabled} onClick={() => onAnswer(choice)}>
              {choice}
            </Button>
          ))}
        </div>
      )}
      <form className="grid gap-2" onSubmit={send}>
        <label htmlFor={inputId} className="text-sm">
          Or write your own answer
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button type="submit" disabled={!answer || disabled}>
            Send answer
          </Button>
        </div>
      </form>
    </section>
  );
}
