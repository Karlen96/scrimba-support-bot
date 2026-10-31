-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> Run.
-- Based on the Supabase integration SQL from the LangChain docs, with custom names
-- (langchain_documents / match_langchain_documents) so it does not clash with other tables.

create extension if not exists vector;

-- Exactly the columns SupabaseVectorStore.addVectors writes: content, metadata, embedding
create table if not exists langchain_documents (
  id bigserial primary key,
  content text,            -- Document.pageContent (text chunk)
  metadata jsonb,          -- Document.metadata (e.g. loc: { lines: { from, to } } from the splitter)
  embedding vector(1536)   -- text-embedding-3-small
);

-- Only the secret (service_role) key used by the worker and the seed script can read/write
alter table langchain_documents enable row level security;

-- Signature expected by LangChain: rpc(queryName, { query_embedding, match_count, filter })
-- returning content, metadata, similarity. Plain top-k by cosine distance (<=>).
create or replace function match_langchain_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  embedding jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    (embedding::text)::jsonb as embedding,
    1 - (langchain_documents.embedding <=> query_embedding) as similarity
  from langchain_documents
  where metadata @> filter
  order by langchain_documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
