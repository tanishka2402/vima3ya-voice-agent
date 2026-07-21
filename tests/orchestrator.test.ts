import path from 'path';
import { MenuService } from '../src/menuService';
import { Orchestrator } from '../src/orchestrator';
import { Tools } from '../src/tools';
import { OrderState } from '../src/types';

const menuPath = path.join(__dirname, '..', 'data', 'menu.json');

function freshOrchestrator() {
  return new Orchestrator(new MenuService(menuPath));
}

describe('Order state updates (tools layer)', () => {
  test('addToOrder correctly updates quantities and running total', () => {
    const menu = new MenuService(menuPath);
    const tools = new Tools(menu);
    let state: OrderState = { lines: [] };

    const first = tools.addToOrder(state, 'fries', 2);
    state = first.state;
    expect(first.result.success).toBe(true);
    expect(state.lines).toEqual([{ itemId: 'fries', name: 'French Fries', quantity: 2, unitPrice: 140 }]);

    // Adding the same item again should increment quantity, not create a duplicate line
    const second = tools.addToOrder(state, 'fries', 1);
    state = second.state;
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].quantity).toBe(3);

    const summary = tools.getOrderSummary(state);
    expect(summary.data?.total).toBe(3 * 140);
  });

  test('modifyOrder removes a line entirely on "remove"', () => {
    const menu = new MenuService(menuPath);
    const tools = new Tools(menu);
    let state: OrderState = { lines: [] };
    state = tools.addToOrder(state, 'coke', 1).state;

    const result = tools.modifyOrder(state, 'coke', 'remove');
    expect(result.result.success).toBe(true);
    expect(result.state.lines).toHaveLength(0);
  });
});

describe('Unavailable item handling', () => {
  test('ordering an out-of-stock item does not add it to the order and offers an alternative', () => {
    const orchestrator = freshOrchestrator();
    const turn = orchestrator.processTurn("I'd like the mutton rogan josh");

    expect(turn.responseText.toLowerCase()).toContain('out of stock');
    expect(turn.responseText).toMatch(/would you like .+ instead/i);
    expect(orchestrator.getState().lines).toHaveLength(0);
  });

  test('the suggested alternative is a real, available menu item (no hallucination)', () => {
    const menu = new MenuService(menuPath);
    const brownie = menu.getById('chocolate-brownie')!;
    const alt = menu.suggestAlternative(brownie);
    expect(alt).toBeDefined();
    expect(alt!.available).toBe(true);
    expect(alt!.category).toBe(brownie.category);
  });
});

describe('Ambiguous / corrected intent resolution', () => {
  test('"make it two" resolves quantity against the last mentioned item, not a guess', () => {
    const orchestrator = freshOrchestrator();
    orchestrator.processTurn("I'll have the paneer tikka");
    const turn = orchestrator.processTurn('actually make it two');

    expect(turn.responseText).toMatch(/updated paneer tikka to 2/i);
    const line = orchestrator.getState().lines.find((l) => l.itemId === 'paneer-tikka');
    expect(line?.quantity).toBe(2);
  });

  test('a later correction in the same utterance takes priority over the earlier request', () => {
    const orchestrator = freshOrchestrator();
    const turn = orchestrator.processTurn('actually cancel the fries, add a coke instead');

    // No fries were ever ordered, so cancelling reports nothing-to-remove...
    expect(turn.responseText).toMatch(/not currently in the order/i);
    // ...but the coke correction still lands and is reflected in state.
    const cokeLine = orchestrator.getState().lines.find((l) => l.itemId === 'coke');
    expect(cokeLine?.quantity).toBe(1);
  });

  test('"remove that" uses the last mentioned item via pronoun resolution', () => {
    const orchestrator = freshOrchestrator();
    orchestrator.processTurn('add a mango lassi');
    const turn = orchestrator.processTurn('actually remove that');

    expect(turn.responseText.toLowerCase()).toContain('removed mango lassi');
    expect(orchestrator.getState().lines).toHaveLength(0);
  });
});

describe('Menu grounding', () => {
  test('spice/vegan questions are answered strictly from menu data', () => {
    const orchestrator = freshOrchestrator();
    const spicyTurn = orchestrator.processTurn('is the tikka masala spicy?');
    expect(spicyTurn.responseText).toBe('Tikka Masala is spicy.');

    const veganTurn = orchestrator.processTurn('do you have anything vegan?');
    const menu = new MenuService(menuPath);
    const veganNames = menu.getAvailable().filter((i) => i.tags.vegan).map((i) => i.name);
    for (const name of veganNames) {
      expect(veganTurn.responseText).toContain(name);
    }
  });

  test('a compound multi-item order adds each item with the correct quantity', () => {
    const orchestrator = freshOrchestrator();
    orchestrator.processTurn("I'll have the tikka masala and two fries");
    const state = orchestrator.getState();

    const tikka = state.lines.find((l) => l.itemId === 'tikka-masala');
    const fries = state.lines.find((l) => l.itemId === 'fries');
    expect(tikka?.quantity).toBe(1);
    expect(fries?.quantity).toBe(2);
  });
});
