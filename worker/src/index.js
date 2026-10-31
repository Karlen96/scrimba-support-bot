// Scrimba support bot — the chain from lesson 08 (lessons/lessons/08-chat-memory.js), running in a worker.
// POST { question, history: ["question", "answer", …] } → { answer }
// The browser keeps the memory and sends it with every question; the worker is stateless.
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const standaloneQuestionPrompt = PromptTemplate.fromTemplate(`Given some conversation history (if any) and a question, convert the question to a standalone question.
conversation history: {conv_history}
question: {question}
standalone question:`);

const answerPrompt = PromptTemplate.fromTemplate(`You are a helpful and enthusiastic support bot who can answer a given question about Scrimba based on the context provided and the conversation history. Try to find the answer in the context. If the answer is not given in the context, find the answer in the conversation history if possible. If you really don't know the answer, say "I'm sorry, I don't know the answer to that." And direct the questioner to email help@scrimba.com. Don't try to make up an answer. Always speak as if you were chatting to a friend.
context: {context}
conversation history: {conv_history}
question: {question}
answer: `);

const combineDocuments = (docs) => docs.map((doc) => doc.pageContent).join("\n\n");

const formatConvHistory = (messages) =>
  messages.map((message, i) => (i % 2 === 0 ? `Human: ${message}` : `AI: ${message}`)).join("\n");

// Keys are only available inside fetch (env), so the chain is built per request — it's cheap
function buildChain(env) {
  // Route OpenAI calls through Cloudflare AI Gateway (logging, caching, rate limiting)
  const configuration = { baseURL: "https://gateway.ai.cloudflare.com/v1/b10456f5ff9d1cdc90dbc450fe4aa0d9/stock-predictions/openai" };
  const llm = new ChatOpenAI({ apiKey: env.OPENAI_API_KEY, model: "gpt-4o-mini", temperature: 0, configuration });
  const embeddings = new OpenAIEmbeddings({ apiKey: env.OPENAI_API_KEY, model: "text-embedding-3-small", configuration });
  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: createClient(env.SUPABASE_URL, env.SUPABASE_API_KEY),
    tableName: "langchain_documents",
    queryName: "match_langchain_documents",
  });
  const retriever = vectorStore.asRetriever();

  const standaloneQuestionChain = standaloneQuestionPrompt.pipe(llm).pipe(new StringOutputParser());
  const retrieverChain = RunnableSequence.from([
    (prevResult) => prevResult.standalone_question,
    retriever,
    combineDocuments,
  ]);
  const answerChain = answerPrompt.pipe(llm).pipe(new StringOutputParser());

  return RunnableSequence.from([
    { standalone_question: standaloneQuestionChain, original_input: new RunnablePassthrough() },
    {
      context: retrieverChain,
      question: ({ original_input }) => original_input.question,
      conv_history: ({ original_input }) => original_input.conv_history,
    },
    answerChain,
  ]);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);

    try {
      const { question, history = [] } = await request.json();
      if (typeof question !== "string" || !question.trim()) return json({ error: "Empty question" }, 400);
      // The last 20 messages are plenty and keep the prompt from bloating
      const conv_history = formatConvHistory(history.slice(-20).map(String));
      const answer = await buildChain(env).invoke({ question: question.trim(), conv_history });
      return json({ answer });
    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500);
    }
  },
};
