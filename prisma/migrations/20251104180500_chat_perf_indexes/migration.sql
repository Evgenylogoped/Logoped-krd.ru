-- Chat performance indexes
CREATE INDEX IF NOT EXISTS "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");
CREATE INDEX IF NOT EXISTS "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId","createdAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_authorId_createdAt_idx" ON "Message"("conversationId","authorId","createdAt");
CREATE INDEX IF NOT EXISTS "Message_authorId_createdAt_idx" ON "Message"("authorId","createdAt");
