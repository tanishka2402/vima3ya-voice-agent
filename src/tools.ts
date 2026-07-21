import { MenuService } from './menuService';
import { MenuItem, OrderState, ToolResult, OrderLine } from './types';

/**
 * Tools are pure functions: (state, args) -> { newState, result }.
 * Nothing here does NLU, string parsing, or response generation - that keeps
 * this layer trivially unit-testable and swappable for a real backend later
 * (e.g. replace the OrderState mutation with a REST call to a POS system
 * without touching orchestrator.ts).
 */
export class Tools {
  constructor(private menu: MenuService) {}

  checkAvailability(itemId: string): ToolResult<{ item: MenuItem }> {
    const item = this.menu.getById(itemId);
    if (!item) {
      return { success: false, message: `No such menu item: ${itemId}` };
    }
    if (!item.available) {
      return { success: false, message: `${item.name} is currently out of stock.`, data: { item } };
    }
    return {
      success: true,
      message: item.limitedQuantity
        ? `${item.name} is available, but in limited quantity.`
        : `${item.name} is available.`,
      data: { item },
    };
  }

  addToOrder(
    state: OrderState,
    itemId: string,
    quantity: number
  ): { state: OrderState; result: ToolResult<{ line: OrderLine }> } {
    const item = this.menu.getById(itemId);
    if (!item) {
      return { state, result: { success: false, message: `No such menu item: ${itemId}` } };
    }
    if (!item.available) {
      return {
        state,
        result: { success: false, message: `${item.name} is out of stock and cannot be added.` },
      };
    }
    if (quantity <= 0) {
      return { state, result: { success: false, message: `Quantity must be positive.` } };
    }

    const lines = [...state.lines];
    const existingIdx = lines.findIndex((l) => l.itemId === itemId);
    if (existingIdx >= 0) {
      lines[existingIdx] = { ...lines[existingIdx], quantity: lines[existingIdx].quantity + quantity };
    } else {
      lines.push({ itemId, name: item.name, quantity, unitPrice: item.price });
    }

    const newState: OrderState = { ...state, lines, lastMentionedItemId: itemId };
    const resultingLine = lines.find((l) => l.itemId === itemId)!;
    return {
      state: newState,
      result: {
        success: true,
        message: `Added ${quantity} x ${item.name} to the order.`,
        data: { line: resultingLine },
      },
    };
  }

  /**
   * change: positive number = increase quantity by that much
   *         negative number = decrease quantity by that much
   *         'remove' = remove the line entirely
   *         { setQuantity: n } = set to an absolute quantity
   */
  modifyOrder(
    state: OrderState,
    itemId: string,
    change: number | 'remove' | { setQuantity: number }
  ): { state: OrderState; result: ToolResult<{ line?: OrderLine }> } {
    const lines = [...state.lines];
    const idx = lines.findIndex((l) => l.itemId === itemId);
    const item = this.menu.getById(itemId);
    const name = item?.name ?? itemId;

    if (idx < 0) {
      return {
        state,
        result: { success: false, message: `${name} is not currently in the order.` },
      };
    }

    if (change === 'remove') {
      const [removed] = lines.splice(idx, 1);
      return {
        state: { ...state, lines, lastMentionedItemId: itemId },
        result: { success: true, message: `Removed ${removed.name} from the order.` },
      };
    }

    if (typeof change === 'object' && 'setQuantity' in change) {
      if (change.setQuantity <= 0) {
        const [removed] = lines.splice(idx, 1);
        return {
          state: { ...state, lines, lastMentionedItemId: itemId },
          result: { success: true, message: `Removed ${removed.name} from the order.` },
        };
      }
      lines[idx] = { ...lines[idx], quantity: change.setQuantity };
      return {
        state: { ...state, lines, lastMentionedItemId: itemId },
        result: {
          success: true,
          message: `Updated ${name} to ${change.setQuantity}.`,
          data: { line: lines[idx] },
        },
      };
    }

    // numeric delta
    const newQty = lines[idx].quantity + change;
    if (newQty <= 0) {
      const [removed] = lines.splice(idx, 1);
      return {
        state: { ...state, lines, lastMentionedItemId: itemId },
        result: { success: true, message: `Removed ${removed.name} from the order.` },
      };
    }
    lines[idx] = { ...lines[idx], quantity: newQty };
    return {
      state: { ...state, lines, lastMentionedItemId: itemId },
      result: {
        success: true,
        message: `Updated ${name} to ${newQty}.`,
        data: { line: lines[idx] },
      },
    };
  }

  getOrderSummary(state: OrderState): ToolResult<{ lines: OrderLine[]; total: number }> {
    const total = state.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    if (state.lines.length === 0) {
      return { success: true, message: 'The order is currently empty.', data: { lines: [], total: 0 } };
    }
    const summary = state.lines
      .map((l) => `${l.quantity} x ${l.name} (₹${l.unitPrice * l.quantity})`)
      .join(', ');
    return {
      success: true,
      message: `Order so far: ${summary}. Total: ₹${total}.`,
      data: { lines: state.lines, total },
    };
  }
}
