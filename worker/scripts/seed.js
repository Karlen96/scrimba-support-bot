// Splits data/scrimba-info.txt into chunks, embeds them and stores them in Supabase (langchain_documents).
// Usage: npm run seed  (reads keys from .dev.vars; run supabase/setup.sql first)
import { readFile } from "node:fs/promises";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";

const TABLE_NAME = "langchain_documents";

const text = await readFile(new URL("../data/scrimba-info.txt", import.meta.url), "utf8");
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
const docs = await splitter.createDocuments([text]);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
// Must be the same embedding model the worker uses for queries
const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_API_KEY, model: "text-embedding-3-small" });

// Re-seeding replaces the old rows instead of duplicating them
const { error } = await supabase.from(TABLE_NAME).delete().gte("id", 0);
if (error) throw new Error(`${error.message} — did you run supabase/setup.sql?`);

await SupabaseVectorStore.fromDocuments(docs, embeddings, { client: supabase, tableName: TABLE_NAME });
console.log(`Inserted ${docs.length} chunks into ${TABLE_NAME}`);
