# Sample Conversation 1

Captured verbatim from `npm run demo` (script 1). Covers: menu listing, recommendation,
a menu-grounded question, ordering, a quantity correction, and an order summary.

| Turn | Speaker | Text |
|---|---|---|
| 1 | User | Hi, what's on the menu? |
| 1 | Agent | Welcome! I'm your steward for today - happy to help you order. What can I get started for you? Here's what we have available - starters: Paneer Tikka, Chicken 65, Vegetable Spring Rolls, French Fries; mains: Tikka Masala, Dal Makhani, Vegetable Biryani, Vegan Buddha Bowl; drinks: Coca-Cola, Mango Lassi, Masala Chai; desserts: Gulab Jamun, Seasonal Fruit Sorbet. |
| 2 | User | Can you recommend something? |
| 2 | Agent | A few things I'd recommend: Paneer Tikka, Chicken 65, Vegetable Spring Rolls. Would you like to hear more about any of these, or shall I add one? |
| 3 | User | Is the tikka masala spicy? |
| 3 | Agent | Tikka Masala is spicy. |
| 4 | User | I'll have the tikka masala and two fries |
| 4 | Agent | Added 1 x Tikka Masala to the order. Added 2 x French Fries to the order. |
| 4 | *Tool calls* | `checkAvailability(tikka-masala)`, `addToOrder(tikka-masala, 1)`, `checkAvailability(fries)`, `addToOrder(fries, 2)` |
| 5 | User | Actually make it three fries |
| 5 | Agent | Updated French Fries to 3. |
| 5 | *Tool calls* | `modifyOrder(fries, { setQuantity: 3 })` |
| 6 | User | Add a coke |
| 6 | Agent | Added 1 x Coca-Cola to the order. |
| 6 | *Tool calls* | `checkAvailability(coke)`, `addToOrder(coke, 1)` |
| 7 | User | What's my order so far? |
| 7 | Agent | Order so far: 1 x Tikka Masala (₹340), 3 x French Fries (₹420), 1 x Coca-Cola (₹80). Total: ₹840. |
| 7 | *Tool calls* | `getOrderSummary()` |

**What this demonstrates:** grounded menu listing (no invented dishes/prices), a
grounded spice question, a compound multi-item add in a single utterance, and an
explicit quantity correction ("make it three fries") resolved against the item
named in that same turn.
