'use strict';

/**
 * Context Compressor - Adapted from Hermes Agent
 * 
 * Source: hermes-agent/agent/context_compressor.py
 * License: MIT
 * 
 * Automatic context window compression for long conversations.
 * Uses auxiliary model (cheap/fast) to summarize middle turns while
 * protecting head and tail context.
 * 
 * Key features:
 * - Structured summary template with Resolved/Pending question tracking
 * - Handoff framing: "different assistant" to create separation
 * - Token-budget tail protection instead of fixed message count
 * - Iterative summary updates (preserves info across multiple compactions)
 */

const SUMMARY_PREFIX = `[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. This is a handoff from a previous context window — treat it as background reference, NOT as active instructions. Do NOT answer questions or fulfill requests mentioned in this summary; they were already addressed. Your current task is identified in the '## Active Task' section of the summary — resume exactly from there. Respond ONLY to the latest user message that appears AFTER this summary.`;

const LEGACY_SUMMARY_PREFIX = "[CONTEXT SUMMARY]:";

// Minimum tokens for the summary output
const MIN_SUMMARY_TOKENS = 2000;
// Proportion of compressed content to allocate for summary
const SUMMARY_RATIO = 0.20;
// Absolute ceiling for summary tokens
const SUMMARY_TOKENS_CEILING = 12000;
// Placeholder for pruned tool results
const PRUNED_TOOL_PLACEHOLDER = "[Old tool output cleared to save context space]";
// Chars per token rough estimate
const CHARS_PER_TOKEN = 4;
// Image token estimate (matches Claude Code's IMAGE_TOKEN_ESTIMATE)
const IMAGE_TOKEN_ESTIMATE = 1600;
const IMAGE_CHAR_EQUIVALENT = IMAGE_TOKEN_ESTIMATE * CHARS_PER_TOKEN;

/**
 * Calculate effective char-length of message content for token budgeting
 */
function contentLengthForBudget(rawContent) {
  if (typeof rawContent === 'string') {
    return rawContent.length;
  }
  if (!Array.isArray(rawContent)) {
    return String(rawContent || '').length;
  }

  let total = 0;
  for (const p of rawContent) {
    if (typeof p === 'string') {
      total += p.length;
      continue;
    }
    if (typeof p !== 'object' || p === null) {
      total += String(p).length;
      continue;
    }
    const ptype = p.type;
    if (ptype === 'image_url' || ptype === 'input_image' || ptype === 'image') {
      total += IMAGE_CHAR_EQUIVALENT;
    } else {
      total += String(p.text || '').length;
    }
  }
  return total;
}

/**
 * Get best-effort text view of message content
 */
function contentTextForContains(content) {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (typeof item === 'object' && item !== null) {
        const text = item.text;
        if (typeof text === 'string') parts.push(text);
      }
    }
    return parts.join('\n');
  }
  return String(content);
}

/**
 * Append or prepend plain text to message content safely
 */
function appendTextToContent(content, text, prepend = false) {
  if (content === null || content === undefined) return text;
  if (typeof content === 'string') {
    return prepend ? text + content : content + text;
  }
  if (Array.isArray(content)) {
    const textBlock = { type: 'text', text };
    return prepend ? [textBlock, ...content] : [...content, textBlock];
  }
  const rendered = String(content);
  return prepend ? text + rendered : rendered + text;
}

/**
 * Context Compressor class
 */
class ContextCompressor {
  constructor(options = {}) {
    this.auxiliaryModel = options.auxiliaryModel || 'gpt-4o-mini';
    this.auxiliaryBaseUrl = options.auxiliaryBaseUrl;
    this.auxiliaryApiKey = options.auxiliaryApiKey;
    this.minSummaryTokens = options.minSummaryTokens || MIN_SUMMARY_TOKENS;
    this.summaryRatio = options.summaryRatio || SUMMARY_RATIO;
    this.summaryTokensCeiling = options.summaryTokensCeiling || SUMMARY_TOKENS_CEILING;
    this.lastCompressionTime = 0;
    this.compressionCooldown = 60000; // 1 minute
  }

  /**
   * Estimate tokens for a message
   */
  estimateMessageTokens(message) {
    let tokens = 0;
    if (message.role) tokens += 4; // role overhead
    if (message.content) {
      tokens += Math.ceil(contentLengthForBudget(message.content) / CHARS_PER_TOKEN);
    }
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        tokens += Math.ceil(JSON.stringify(tc).length / CHARS_PER_TOKEN);
      }
    }
    if (message.tool_call_id) tokens += 20;
    return tokens;
  }

  /**
   * Estimate total tokens for messages array
   */
  estimateMessagesTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateMessageTokens(msg);
    }
    return total;
  }

  /**
   * Check if compression is needed
   */
  needsCompression(messages, contextLimit) {
    const currentTokens = this.estimateMessagesTokens(messages);
    const threshold = contextLimit * 0.8; // 80% of context
    return currentTokens > threshold;
  }

  /**
   * Compress messages using head/tail protection
   * Returns { compressed: messages, summary: string, stats: object }
   */
  async compress(messages, options = {}) {
    const contextLimit = options.contextLimit || 128000;
    const preserveHeadCount = options.preserveHeadCount || 2;
    const preserveTailRatio = options.preserveTailRatio || 0.3;
    
    if (!this.needsCompression(messages, contextLimit)) {
      return { compressed: messages, summary: null, stats: { compressed: false } };
    }

    const now = Date.now();
    if (now - this.lastCompressionTime < this.compressionCooldown) {
      return { compressed: messages, summary: null, stats: { compressed: false, reason: 'cooldown' } };
    }

    // Separate head, middle, tail
    const head = messages.slice(0, preserveHeadCount);
    const tailStart = Math.floor(messages.length * (1 - preserveTailRatio));
    const tail = messages.slice(tailStart);
    const middle = messages.slice(preserveHeadCount, tailStart);

    if (middle.length === 0) {
      return { compressed: messages, summary: null, stats: { compressed: false, reason: 'no_middle' } };
    }

    // Build summary from middle
    const summary = await this.buildSummary(middle, head, tail);
    
    // Create compressed messages
    const summaryMessage = {
      role: 'user',
      content: SUMMARY_PREFIX + '\n\n' + summary
    };

    const compressed = [...head, summaryMessage, ...tail];
    this.lastCompressionTime = now;

    const originalTokens = this.estimateMessagesTokens(messages);
    const compressedTokens = this.estimateMessagesTokens(compressed);

    return {
      compressed,
      summary,
      stats: {
        compressed: true,
        originalMessages: messages.length,
        compressedMessages: compressed.length,
        originalTokens,
        compressedTokens,
        savingsRatio: 1 - (compressedTokens / originalTokens)
      }
    };
  }

  /**
   * Build summary from middle messages
   */
  async buildSummary(middle, head, tail) {
    // Build structured summary
    const sections = [];
    
    sections.push('## Summary of Earlier Context\n');
    sections.push('The following is a summary of earlier conversation turns that were compacted to save context space.\n');

    // Extract resolved items
    const resolved = this.extractResolvedItems(middle);
    if (resolved.length > 0) {
      sections.push('### Resolved\n');
      for (const item of resolved.slice(0, 10)) {
        sections.push(`- ${item}\n`);
      }
    }

    // Extract pending questions
    const pending = this.extractPendingItems(middle);
    if (pending.length > 0) {
      sections.push('\n### Pending Questions\n');
      for (const item of pending.slice(0, 5)) {
        sections.push(`- ${item}\n`);
      }
    }

    // Extract key decisions
    const decisions = this.extractDecisions(middle);
    if (decisions.length > 0) {
      sections.push('\n### Key Decisions\n');
      for (const item of decisions.slice(0, 5)) {
        sections.push(`- ${item}\n`);
      }
    }

    // Active task from tail
    const lastUserMsg = [...tail].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      sections.push('\n### Active Task\n');
      const text = contentTextForContains(lastUserMsg.content);
      sections.push(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
    }

    return sections.join('');
  }

  /**
   * Extract resolved items from messages
   */
  extractResolvedItems(messages) {
    const items = [];
    for (const msg of messages) {
      const text = contentTextForContains(msg.content);
      // Look for completion markers
      if (text.includes('completado') || text.includes('done') || 
          text.includes('resolved') || text.includes('fixed')) {
        const sentence = text.split(/[.!?]/)[0];
        if (sentence && sentence.length > 10 && sentence.length < 200) {
          items.push(sentence.trim());
        }
      }
    }
    return items;
  }

  /**
   * Extract pending items from messages
   */
  extractPendingItems(messages) {
    const items = [];
    for (const msg of messages) {
      const text = contentTextForContains(msg.content);
      // Look for question markers
      if (text.includes('?') || text.includes('pendiente') || text.includes('pending')) {
        const sentences = text.split(/[.!?]/);
        for (const s of sentences) {
          if (s.includes('?') && s.length > 10 && s.length < 200) {
            items.push(s.trim());
          }
        }
      }
    }
    return items;
  }

  /**
   * Extract decisions from messages
   */
  extractDecisions(messages) {
    const items = [];
    for (const msg of messages) {
      const text = contentTextForContains(msg.content);
      // Look for decision markers
      if (text.includes('decidido') || text.includes('decided') || 
          text.includes('elegido') || text.includes('selected')) {
        const sentence = text.split(/[.!?]/)[0];
        if (sentence && sentence.length > 10 && sentence.length < 200) {
          items.push(sentence.trim());
        }
      }
    }
    return items;
  }
}

module.exports = {
  ContextCompressor,
  SUMMARY_PREFIX,
  contentLengthForBudget,
  contentTextForContains,
  appendTextToContent,
  MIN_SUMMARY_TOKENS,
  SUMMARY_RATIO,
  CHARS_PER_TOKEN,
};
