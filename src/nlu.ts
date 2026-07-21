import { MenuService } from './menuService';
import { OrderState, ParsedClause, IntentType } from './types';

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  a: 1,
  an: 1,
  couple: 2,
};

/** Finds a quantity token anywhere in a short text window. */
function extractQuantity(text: string): number | undefined {
  const digitMatch = text.match(/\b(\d+)\b/);
  if (digitMatch) return parseInt(digitMatch[1], 10);
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return num;
  }
  return undefined;
}

/** Finds the quantity token nearest to (and before) a given index in text. */
function extractQuantityNear(text: string, index: number): number | undefined {
  const windowStart = Math.max(0, index - 20);
  const window = text.slice(windowStart, index);
  return extractQuantity(window);
}

function usesPronoun(text: string): boolean {
  return /\b(it|that|those|them|same)\b/.test(text);
}

const REMOVE_KEYWORDS = /\b(cancel|remove|take off|no more|don't want|scrap|drop)\b/;
const ADD_KEYWORDS = /\b(add|order|i'?ll have|i want|give me|get me|bring me|can i get|i'?d like)\b/;
const SET_QTY_KEYWORDS = /\b(make it|change it to|change that to|set it to|actually make it)\b/;
const SUMMARY_KEYWORDS = /\b(summary|total|what do i have|what's my order|how much do i owe)\b/;
const LIST_MENU_KEYWORDS = /\b(what do you have|what's available|what's on the menu|show me the menu|what can i order|menu please)\b/;
const RECOMMEND_KEYWORDS = /\b(recommend|suggest|what's good|what do you suggest)\b/;
const GREETING_KEYWORDS = /^\s*(hi|hello|hey)\b/;
const CONFIRM_KEYWORDS = /\b(that'?s all|that'?s it|nothing else|we'?re done|checkout|finalize|confirm)\b/;

const TOPIC_PATTERNS: { topic: NonNullable<ParsedClause['infoTopic']>; re: RegExp }[] = [
  { topic: 'spicy', re: /\bspic(y|iness)\b/ },
  { topic: 'vegan', re: /\bvegan\b/ },
  { topic: 'vegetarian', re: /\bvegetarian\b/ },
  { topic: 'glutenFree', re: /gluten/ },
  { topic: 'price', re: /\b(price|cost)\b/ },
];

function detectTopic(text: string): ParsedClause['infoTopic'] | undefined {
  for (const { topic, re } of TOPIC_PATTERNS) {
    if (re.test(text)) return topic;
  }
  return undefined;
}

const QUESTION_MARKERS = /\?|\b(is|are|does|do you have|anything|what's in|contains?)\b/;

/**
 * Splits a raw utterance into independent instruction clauses. We split on
 * commas and on " and " / " but " ONLY when the following words look like a
 * new instruction (contain their own action keyword), so item conjunctions
 * like "fries and coke" inside a single add-instruction are NOT split apart -
 * that case is instead handled by multi-item extraction within one clause.
 *
 * This is a deliberate, documented heuristic (see README "tradeoffs") -
 * it covers the compound-correction case in the brief
 * ("actually cancel the fries, add a coke instead") without a full parser.
 */
function splitClauses(text: string): string[] {
  const actionRe = /\b(add|order|cancel|remove|make it|change|give me|i want|i'll have|i'd like)\b/i;
  const parts = text.split(/,/).flatMap((chunk) => {
    const subParts = chunk.split(/\b(?:and|but)\b/i);
    if (subParts.length === 1) return [chunk];
    const result: string[] = [subParts[0]];
    for (let i = 1; i < subParts.length; i++) {
      if (actionRe.test(subParts[i])) {
        result.push(subParts[i]);
      } else {
        result[result.length - 1] += ' and ' + subParts[i];
      }
    }
    return result;
  });
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

export class NLU {
  constructor(private menu: MenuService) {}

  parse(rawText: string, session: OrderState): ParsedClause[] {
    const clauseTexts = splitClauses(rawText.toLowerCase());
    const clauses: ParsedClause[] = [];
    // Track "last mentioned" as we walk left-to-right so a correction later
    // in the SAME utterance can refer to an item mentioned earlier in that
    // same utterance, not just in previous turns.
    let runningLastItemId = session.lastMentionedItemId;

    for (const clauseText of clauseTexts) {
      const produced = this.parseClause(clauseText, runningLastItemId);
      for (const clause of produced) {
        if (clause.itemId) runningLastItemId = clause.itemId;
        clauses.push(clause);
      }
    }
    return clauses;
  }

  /** A single clause of raw text can expand into multiple ParsedClauses (multi-item add). */
  private parseClause(text: string, lastMentionedItemId?: string): ParsedClause[] {
    // --- turn-level intents that don't need item resolution ---
    if (GREETING_KEYWORDS.test(text)) return [this.base(text, 'greeting')];
    if (SUMMARY_KEYWORDS.test(text)) return [this.base(text, 'get_summary')];
    if (CONFIRM_KEYWORDS.test(text)) return [this.base(text, 'confirm')];
    if (LIST_MENU_KEYWORDS.test(text)) return [this.base(text, 'list_menu')];
    if (RECOMMEND_KEYWORDS.test(text)) return [this.base(text, 'recommend')];

    // --- item-affecting intents ---
    if (REMOVE_KEYWORDS.test(text)) {
      const match = this.menu.findInText(text);
      const pronoun = usesPronoun(text);
      return [
        {
          rawText: text,
          intent: 'remove_item',
          itemId: match?.item.id ?? (pronoun ? lastMentionedItemId : undefined),
          itemMatchText: match?.matchedText,
          usedPronoun: pronoun,
        },
      ];
    }

    if (SET_QTY_KEYWORDS.test(text)) {
      const match = this.menu.findInText(text);
      const pronoun = usesPronoun(text);
      return [
        {
          rawText: text,
          intent: 'set_quantity',
          itemId: match?.item.id ?? (pronoun ? lastMentionedItemId : undefined),
          itemMatchText: match?.matchedText,
          quantity: extractQuantity(text),
          usedPronoun: pronoun,
        },
      ];
    }

    const allMatches = this.menu.findAllInText(text);
    const hasAddKeyword = ADD_KEYWORDS.test(text);
    const topic = detectTopic(text);
    const looksLikeQuestion = QUESTION_MARKERS.test(text);

    // Topic question about a specific item ("is the tikka masala spicy?")
    if (looksLikeQuestion && topic && allMatches.length > 0) {
      return allMatches.map((m) => ({
        rawText: text,
        intent: 'ask_info' as IntentType,
        itemId: m.item.id,
        itemMatchText: m.matchedText,
        infoTopic: topic,
      }));
    }

    // General topic question, no specific item ("do you have anything vegan?")
    if (looksLikeQuestion && topic && allMatches.length === 0) {
      return [{ rawText: text, intent: 'ask_info', infoTopic: topic }];
    }

    // Ordering: explicit add keyword, or bare item mention(s) with a quantity, or bare single item mention
    if ((hasAddKeyword || allMatches.length > 0) && !looksLikeQuestion) {
      if (allMatches.length === 0) {
        // Add keyword present but no known item matched at all
        return [{ rawText: text, intent: 'add_item' }];
      }
      return allMatches.map((m) => ({
        rawText: text,
        intent: 'add_item' as IntentType,
        itemId: m.item.id,
        itemMatchText: m.matchedText,
        quantity: extractQuantityNear(text, m.index) ?? 1,
      }));
    }

    // Fallback: general question about an item with no clear topic ("what is the paneer tikka?")
    if (looksLikeQuestion && allMatches.length > 0) {
      return allMatches.map((m) => ({
        rawText: text,
        intent: 'ask_info' as IntentType,
        itemId: m.item.id,
        itemMatchText: m.matchedText,
        infoTopic: 'general' as const,
      }));
    }

    return [this.base(text, 'unknown')];
  }

  private base(text: string, intent: IntentType): ParsedClause {
    return { rawText: text, intent };
  }
}
