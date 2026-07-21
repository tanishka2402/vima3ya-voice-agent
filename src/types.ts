export type Category = 'starter' | 'main' | 'drink' | 'dessert';

export interface MenuItemTags {
  spicy?: boolean;
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  aliases: string[];
  category: Category;
  price: number;
  description: string;
  available: boolean;
  limitedQuantity?: boolean;
  tags: MenuItemTags;
}

export interface OrderLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderState {
  lines: OrderLine[];
  /** Item most recently referenced in conversation - used to resolve pronouns like "it" / "that" / "make it two" */
  lastMentionedItemId?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export type IntentType =
  | 'greeting'
  | 'list_menu'
  | 'recommend'
  | 'ask_info'
  | 'add_item'
  | 'set_quantity'
  | 'remove_item'
  | 'get_summary'
  | 'confirm'
  | 'unknown';

/** A single resolved instruction extracted from (possibly compound) user input. */
export interface ParsedClause {
  rawText: string;
  intent: IntentType;
  /** Resolved menu item id, if the clause refers to one */
  itemId?: string;
  /** Raw text fragment the item was matched from, kept for logging/debugging */
  itemMatchText?: string;
  quantity?: number;
  /** For ask_info clauses: which attribute is being asked about */
  infoTopic?: 'spicy' | 'vegan' | 'vegetarian' | 'glutenFree' | 'price' | 'general';
  /** True if the clause used a pronoun ("it"/"that") to refer to an item */
  usedPronoun?: boolean;
}

export interface ToolCallLog {
  name: string;
  args: unknown;
  result: ToolResult;
}

export interface AgentTurn {
  userText: string;
  clauses: ParsedClause[];
  toolCalls: ToolCallLog[];
  responseText: string;
}
