# Sample Conversation 2

Captured verbatim from `npm run demo` (script 2). Covers: a general dietary question,
an unavailable-item request with a suggested alternative, and a mid-conversation
correction ("actually cancel the fries, add a coke instead").

| Turn | Speaker | Text |
|---|---|---|
| 1 | User | Do you have anything vegan? |
| 1 | Agent | Yes - Vegetable Spring Rolls, French Fries, Vegan Buddha Bowl, Coca-Cola, Seasonal Fruit Sorbet are vegan. |
| 2 | User | I'd like the mutton rogan josh |
| 2 | Agent | I'm sorry, Mutton Rogan Josh is currently out of stock. Would you like Tikka Masala instead? It's ₹340. |
| 2 | *Tool calls* | `checkAvailability(mutton-rogan-josh)` → fails; order NOT modified |
| 3 | User | Ok give me the vegan buddha bowl instead |
| 3 | Agent | Added 1 x Vegan Buddha Bowl to the order. |
| 3 | *Tool calls* | `checkAvailability(veg-thali)`, `addToOrder(veg-thali, 1)` |
| 4 | User | Actually cancel the fries, add a coke instead |
| 4 | Agent | French Fries is not currently in the order. Added 1 x Coca-Cola to the order. |
| 4 | *Tool calls* | `modifyOrder(fries, 'remove')` → no-op (never ordered), `checkAvailability(coke)`, `addToOrder(coke, 1)` |
| 5 | User | Remove the buddha bowl, make it two cokes |
| 5 | Agent | Removed Vegan Buddha Bowl from the order. Updated Coca-Cola to 2. |
| 5 | *Tool calls* | `modifyOrder(veg-thali, 'remove')`, `modifyOrder(coke, { setQuantity: 2 })` |
| 6 | User | That's all, confirm my order |
| 6 | Agent | Great, confirming your order. Order so far: 2 x Coca-Cola (₹160). Total: ₹160. I'll send that to the kitchen now. |
| 6 | *Tool calls* | `getOrderSummary()` |

**What this demonstrates:** the agent never hallucinates that Mutton Rogan Josh or
the never-ordered fries exist in the order - both are correctly grounded against
real state. It also resolves a compound correction within one utterance
(cancel X, add Y) and a later ambiguous quantity reference ("make it two cokes")
using the most recently added item.
