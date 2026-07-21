import { MenuService } from './menuService';
import { NLU } from './nlu';
import { Tools } from './tools';
import { AgentTurn, OrderState, ParsedClause, ToolCallLog } from './types';

/**
 * Orchestrator owns:
 *  - the session's OrderState (memory across turns)
 *  - routing each parsed clause to the right tool call
 *  - composing a final, grounded response string
 *
 * It does NOT do string parsing (that's nlu.ts) or menu lookups directly
 * (that's menuService.ts) or order mutation logic (that's tools.ts). This
 * separation is what makes each piece independently unit-testable.
 */
export class Orchestrator {
  private state: OrderState = { lines: [] };
  private nlu: NLU;
  private tools: Tools;

  constructor(private menu: MenuService) {
    this.nlu = new NLU(menu);
    this.tools = new Tools(menu);
  }

  getState(): OrderState {
    return this.state;
  }

  processTurn(userText: string): AgentTurn {
    const clauses = this.nlu.parse(userText, this.state);
    const toolCalls: ToolCallLog[] = [];
    const responseParts: string[] = [];
    // Turn-level intents (no item scope) should only ever fire once per turn,
    // even if the clause splitter produces more than one clause carrying them
    // (e.g. "That's all, confirm my order" both read as "confirm").
    const turnLevelIntents = new Set(['greeting', 'list_menu', 'recommend', 'get_summary', 'confirm']);
    const alreadyHandled = new Set<string>();

    for (const clause of clauses) {
      if (turnLevelIntents.has(clause.intent)) {
        if (alreadyHandled.has(clause.intent)) continue;
        alreadyHandled.add(clause.intent);
      }
      const response = this.handleClause(clause, toolCalls);
      if (response) responseParts.push(response);
    }

    if (responseParts.length === 0) {
      responseParts.push(
        "Sorry, I didn't catch what you'd like. Could you rephrase, or ask what's on the menu?"
      );
    }

    return {
      userText,
      clauses,
      toolCalls,
      responseText: responseParts.join(' '),
    };
  }

  private handleClause(clause: ParsedClause, toolCalls: ToolCallLog[]): string {
    switch (clause.intent) {
      case 'greeting':
        return "Welcome! I'm your steward for today - happy to help you order. What can I get started for you?";

      case 'list_menu': {
        const items = this.menu.getAvailable();
        const byCategory = ['starter', 'main', 'drink', 'dessert'] as const;
        const parts = byCategory.map((cat) => {
          const names = items.filter((i) => i.category === cat).map((i) => i.name);
          return `${cat}s: ${names.join(', ')}`;
        });
        return `Here's what we have available - ${parts.join('; ')}.`;
      }

      case 'recommend': {
        const picks = this.menu.getAvailable().slice(0, 3).map((i) => i.name);
        return `A few things I'd recommend: ${picks.join(', ')}. Would you like to hear more about any of these, or shall I add one?`;
      }

      case 'ask_info': {
        if (!clause.itemId) {
          // General topic question with no specific item, e.g. "anything vegan?"
          if (clause.infoTopic && clause.infoTopic !== 'general' && clause.infoTopic !== 'price') {
            const matches = this.menu
              .getAvailable()
              .filter((i) => i.tags[clause.infoTopic as keyof typeof i.tags]);
            const label = clause.infoTopic === 'glutenFree' ? 'gluten-free' : clause.infoTopic;
            return matches.length > 0
              ? `Yes - ${matches.map((i) => i.name).join(', ')} ${matches.length > 1 ? 'are' : 'is'} ${label}.`
              : `I'm afraid we don't have any ${label} options available right now.`;
          }
          return "Could you tell me which item you're asking about?";
        }
        const item = this.menu.getById(clause.itemId)!;
        switch (clause.infoTopic) {
          case 'spicy':
            return `${item.name} is ${item.tags.spicy ? '' : 'not '}spicy.`;
          case 'vegan':
            return `${item.name} is ${item.tags.vegan ? '' : 'not '}vegan.`;
          case 'vegetarian':
            return `${item.name} is ${item.tags.vegetarian ? '' : 'not '}vegetarian.`;
          case 'glutenFree':
            return `${item.name} is ${item.tags.glutenFree ? '' : 'not '}gluten-free.`;
          case 'price':
            return `${item.name} is ₹${item.price}.`;
          default:
            return `${item.name}: ${item.description} It's priced at ₹${item.price}.`;
        }
      }

      case 'add_item': {
        if (!clause.itemId) {
          return "I couldn't find that item on the menu. Could you tell me the name again, or ask what's available?";
        }
        const item = this.menu.getById(clause.itemId)!;
        const availability = this.tools.checkAvailability(clause.itemId);
        toolCalls.push({ name: 'checkAvailability', args: { itemId: clause.itemId }, result: availability });

        if (!availability.success) {
          const alt = this.menu.suggestAlternative(item);
          this.state.lastMentionedItemId = item.id;
          return alt
            ? `I'm sorry, ${item.name} is currently out of stock. Would you like ${alt.name} instead? It's ₹${alt.price}.`
            : `I'm sorry, ${item.name} is currently out of stock, and I don't have a similar alternative right now.`;
        }

        const qty = clause.quantity ?? 1;
        const { state, result } = this.tools.addToOrder(this.state, clause.itemId, qty);
        toolCalls.push({ name: 'addToOrder', args: { itemId: clause.itemId, quantity: qty }, result });
        this.state = state;

        const limitedNote = item.limitedQuantity ? ' Just a heads-up, that one is in limited supply today.' : '';
        return `${result.message}${limitedNote}`;
      }

      case 'set_quantity': {
        const targetId = clause.itemId ?? this.state.lastMentionedItemId;
        if (!targetId) {
          return "Sure - just to confirm, which item's quantity should I change?";
        }
        if (clause.quantity === undefined) {
          return "How many would you like?";
        }
        const { state, result } = this.tools.modifyOrder(this.state, targetId, {
          setQuantity: clause.quantity,
        });
        toolCalls.push({
          name: 'modifyOrder',
          args: { itemId: targetId, change: { setQuantity: clause.quantity } },
          result,
        });
        this.state = state;
        return result.message;
      }

      case 'remove_item': {
        const targetId = clause.itemId ?? this.state.lastMentionedItemId;
        if (!targetId) {
          return "Sure - which item would you like me to remove?";
        }
        const { state, result } = this.tools.modifyOrder(this.state, targetId, 'remove');
        toolCalls.push({ name: 'modifyOrder', args: { itemId: targetId, change: 'remove' }, result });
        this.state = state;
        return result.message;
      }

      case 'get_summary': {
        const result = this.tools.getOrderSummary(this.state);
        toolCalls.push({ name: 'getOrderSummary', args: {}, result });
        return result.message;
      }

      case 'confirm': {
        const result = this.tools.getOrderSummary(this.state);
        toolCalls.push({ name: 'getOrderSummary', args: {}, result });
        return `Great, confirming your order. ${result.message} I'll send that to the kitchen now.`;
      }

      case 'unknown':
      default:
        return "Sorry, I didn't quite catch that - could you rephrase?";
    }
  }
}
